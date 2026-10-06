import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import ts from 'typescript';
import {
  createHarness,
  fixtureSecondUserId,
  fixtureTaskId,
  fixtureUserId,
} from './task-checklist-harness.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(path.join(root, 'backend/package.json'));

const loadPmSchedulingPolicy = () => {
  const abs = path.join(root, 'backend/src/db/pmSchedulingPolicy.ts');
  const module = { exports: {} };
  const js = ts.transpileModule(fs.readFileSync(abs, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;

  const sqlStub = {
    UniqueIdentifier: Symbol('UniqueIdentifier'),
    DateTime2: (...args) => ({ type: 'DateTime2', args }),
    NVarChar: (...args) => ({ type: 'NVarChar', args }),
  };

  vm.runInThisContext(`(function(require,module,exports){${js}\n})`, { filename: abs })(
    spec => {
      if (spec === 'mssql') return sqlStub;
      return require(spec);
    },
    module,
    module.exports,
  );

  return module.exports;
};

const { finalizePmOccurrenceCompletion } = loadPmSchedulingPolicy();

const createPolicyExecutor = state => ({
  request() {
    const inputs = {};
    return {
      input(name, _type, value) {
        inputs[name] = value;
        return this;
      },
      async query(query) {
        if (query.includes('FROM pm.BlackoutWindows')) {
          return { recordset: [{ BlackoutEnd: state.blackoutEnd }], rowsAffected: [] };
        }

        if (query.includes('UPDATE pm.AssetPMSettings') || query.includes('UPDATE pm.FacilityPMSettings')) {
          state.savedAnchors.push({
            kind: query.includes('UPDATE pm.FacilityPMSettings') ? 'facility' : 'asset',
            nextPlannedDueAt: inputs.nextPlannedDueAt,
            nextDueAt: inputs.nextDueAt,
            lastPmCompletedAt: inputs.lastPmCompletedAt ?? null,
          });
          return { recordset: [], rowsAffected: [1] };
        }

        if (query.includes('MERGE pm.PMSchedules') || query.includes('MERGE pm.FacilityPMSchedules')) {
          return { recordset: [], rowsAffected: [1] };
        }

        throw new Error(`Unexpected query in Q-04 stub: ${query}`);
      },
    };
  },
});

test('Q-04 scheduling helper keeps asset and facility finalization parity through blackout handling', async () => {
  const blackoutEnd = new Date('2026-10-20T00:00:00.000Z');
  const assetState = { blackoutEnd, savedAnchors: [] };
  const facilityState = { blackoutEnd, savedAnchors: [] };
  const sharedFields = {
    templateId: '22222222-2222-4222-8222-222222222222',
    intervalDays: 30,
    pmEnabled: true,
    templateIsActive: true,
    isContextActive: true,
    nextPlannedDueAt: new Date('2026-09-16T08:00:00.000Z'),
    nextDueAt: new Date('2026-09-16T08:00:00.000Z'),
    lastPmCompletedAt: null,
    categoryId: null,
    locationId: null,
    assetStatus: null,
    requiredRoleId: null,
  };

  const assetResult = await finalizePmOccurrenceCompletion({
    executor: createPolicyExecutor(assetState),
    context: {
      ...sharedFields,
      kind: 'asset',
      contextId: '11111111-1111-4111-8111-111111111111',
    },
    fulfilledPlannedDueAt: new Date('2026-09-16T08:00:00.000Z'),
    completedAt: new Date('2026-09-16T09:00:00.000Z'),
  });

  const facilityResult = await finalizePmOccurrenceCompletion({
    executor: createPolicyExecutor(facilityState),
    context: {
      ...sharedFields,
      kind: 'facility',
      contextId: '12121212-1212-4212-8212-121212121212',
    },
    fulfilledPlannedDueAt: new Date('2026-09-16T08:00:00.000Z'),
    completedAt: new Date('2026-09-16T09:00:00.000Z'),
  });

  assert.equal(assetResult.nextPlannedDueAt.toISOString(), '2026-10-16T08:00:00.000Z');
  assert.equal(facilityResult.nextPlannedDueAt.toISOString(), '2026-10-16T08:00:00.000Z');
  assert.equal(assetResult.nextDueAt.toISOString(), blackoutEnd.toISOString());
  assert.equal(facilityResult.nextDueAt.toISOString(), blackoutEnd.toISOString());
  assert.deepEqual(
    assetState.savedAnchors.map(write => ({
      ...write,
      nextPlannedDueAt: write.nextPlannedDueAt.toISOString(),
      nextDueAt: write.nextDueAt.toISOString(),
      lastPmCompletedAt: write.lastPmCompletedAt.toISOString(),
    })),
    [
      {
        kind: 'asset',
        nextPlannedDueAt: '2026-10-16T08:00:00.000Z',
        nextDueAt: blackoutEnd.toISOString(),
        lastPmCompletedAt: '2026-09-16T09:00:00.000Z',
      },
    ],
  );
  assert.deepEqual(
    facilityState.savedAnchors.map(write => ({
      ...write,
      nextPlannedDueAt: write.nextPlannedDueAt.toISOString(),
      nextDueAt: write.nextDueAt.toISOString(),
      lastPmCompletedAt: write.lastPmCompletedAt.toISOString(),
    })),
    [
      {
        kind: 'facility',
        nextPlannedDueAt: '2026-10-16T08:00:00.000Z',
        nextDueAt: blackoutEnd.toISOString(),
        lastPmCompletedAt: '2026-09-16T09:00:00.000Z',
      },
    ],
  );
});

test('Q-04 final approval route writes the same next anchor for asset and facility PM tasks', async t => {
  const h = createHarness();
  const server = h.app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));

  const origin = `http://127.0.0.1:${server.address().port}`;
  const approve = async contextKind => {
    h.reset({
      contextKind,
      taskStatus: 'in_progress',
      approvalStatus: 'PendingSuperadmin',
      technicianCompletedByUserId: fixtureUserId,
      nextPlannedPmDueAt: new Date('2026-09-16T08:00:00.000Z'),
      nextPmDueAt: new Date('2026-09-16T08:00:00.000Z'),
      blackoutEnd: new Date('2026-10-20T00:00:00.000Z'),
    });

    const response = await fetch(`${origin}/api/tasks/${fixtureTaskId}/approve-by-superadmin`, {
      method: 'POST',
      signal: AbortSignal.timeout(5000),
      headers: {
        authorization: `Bearer ${h.tokenFor(fixtureSecondUserId, ['Superadmin'])}`,
      },
    });
    assert.equal(response.status, 200, `${contextKind}: ${await response.text()}`);
    return h.getState();
  };

  const assetState = await approve('asset');
  const facilityState = await approve('facility');

  assert.equal(assetState.taskStatus, 'completed');
  assert.equal(assetState.approvalStatus, 'Approved');
  assert.equal(facilityState.taskStatus, 'completed');
  assert.equal(facilityState.approvalStatus, 'Approved');
  assert.equal(assetState.scheduleAnchorWrites.length, 2);
  assert.equal(facilityState.scheduleAnchorWrites.length, 2);

  const assetFinalWrite = assetState.scheduleAnchorWrites.at(-1);
  const facilityFinalWrite = facilityState.scheduleAnchorWrites.at(-1);
  assert.ok(assetFinalWrite);
  assert.ok(facilityFinalWrite);

  assert.deepEqual(
    {
      kind: assetFinalWrite.kind,
      nextPlannedDueAt: assetFinalWrite.nextPlannedDueAt.toISOString(),
      nextDueAt: assetFinalWrite.nextDueAt.toISOString(),
      lastPmCompletedAt: assetFinalWrite.lastPmCompletedAt.toISOString(),
    },
    {
      kind: 'asset',
      nextPlannedDueAt: '2026-10-16T08:00:00.000Z',
      nextDueAt: '2026-10-20T00:00:00.000Z',
      lastPmCompletedAt: '2026-09-16T09:00:00.000Z',
    },
  );

  assert.deepEqual(
    {
      kind: facilityFinalWrite.kind,
      nextPlannedDueAt: facilityFinalWrite.nextPlannedDueAt.toISOString(),
      nextDueAt: facilityFinalWrite.nextDueAt.toISOString(),
      lastPmCompletedAt: facilityFinalWrite.lastPmCompletedAt.toISOString(),
    },
    {
      kind: 'facility',
      nextPlannedDueAt: '2026-10-16T08:00:00.000Z',
      nextDueAt: '2026-10-20T00:00:00.000Z',
      lastPmCompletedAt: '2026-09-16T09:00:00.000Z',
    },
  );
});

test('late approval preserves task occurrence without advancing or rewinding a later cursor', async t => {
 const h=createHarness();const server=h.app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));const origin=`http://127.0.0.1:${server.address().port}`;
 h.reset({contextKind:'asset',approvalStatus:'PendingSuperadmin',technicianCompletedByUserId:fixtureUserId,technicianCompletedAt:new Date('2026-09-16T09:00:00Z'),nextPlannedPmDueAt:new Date('2027-03-16T08:00:00Z'),nextPmDueAt:new Date('2027-03-16T08:00:00Z')});
 const response=await fetch(`${origin}/api/tasks/${fixtureTaskId}/approve-by-superadmin`,{method:'POST',headers:{authorization:`Bearer ${h.tokenFor(fixtureSecondUserId,['Superadmin'])}`},signal:AbortSignal.timeout(5000)});
 assert.equal(response.status,200,await response.text());const writes=h.getState().scheduleAnchorWrites;assert.equal(writes.at(-1).nextPlannedDueAt.toISOString(),'2027-03-16T08:00:00.000Z');const update=h.calls.find(c=>c.query.includes('FulfilledPlannedDueAt = COALESCE'));assert.equal(update.inputs.fulfilledPlannedDueAt.toISOString(),'2026-09-16T08:00:00.000Z');
});


test('fulfilled legacy alias cannot reopen and duplicate an approved occurrence', async t => {
  const h = createHarness();
  const server = h.app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  h.reset({ taskStatus: 'cancelled', occurrenceResolved: true });
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/tasks/${fixtureTaskId}/reopen`, {
    method: 'POST', headers: { authorization: `Bearer ${h.tokenFor(fixtureSecondUserId, ['Superadmin'])}` },
    signal: AbortSignal.timeout(5000),
  });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, 'PM_OCCURRENCE_FULFILLED');
  assert.equal(h.getState().taskStatus, 'cancelled');
  assert.equal(h.calls.filter(c => c.query.includes('UPDATE pm.PMTasks')).length, 0);
});


test('reopen update atomically blocks a resolution inserted after the initial lookup', async t => {
  let resolutionReads = 0;
  const h = createHarness({ query(query) {
    if (query.includes('FROM pm.PMOccurrenceResolutions') && query.startsWith('SELECT')) {
      return { recordset: ++resolutionReads > 1 ? [{ OriginalTaskId: fixtureTaskId }] : [], rowsAffected: [] };
    }
    if (query.includes('UPDATE t') && query.includes("Status = N'open'")) {
      assert(query.includes('AND NOT EXISTS (SELECT 1 FROM pm.PMOccurrenceResolutions WITH (UPDLOCK, HOLDLOCK) WHERE OriginalTaskId = t.TaskId)'));
      return { recordset: [], rowsAffected: [0] };
    }
    return undefined;
  }});
  const server = h.app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  h.reset({ taskStatus: 'cancelled' });
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/tasks/${fixtureTaskId}/reopen`, {
    method: 'POST', headers: { authorization: `Bearer ${h.tokenFor(fixtureSecondUserId, ['Superadmin'])}` }, signal: AbortSignal.timeout(5000),
  });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, 'PM_OCCURRENCE_FULFILLED');
  assert.equal(h.getState().taskStatus, 'cancelled');
  assert(!h.calls.some(c => c.query.includes('INSERT INTO pm.AuditLog')));
});
