import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  attachmentItemId,
  createHarness,
  fixtureTaskId,
  inactiveItemId,
  mandatoryItemId,
  passNotesItemId,
} from './task-checklist-harness.mjs';

test('TC-01 router validation aligns submit and complete checklist policy', async t => {
  const h = createHarness();
  const server = h.app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));

  const base = `http://127.0.0.1:${server.address().port}/api/tasks/${fixtureTaskId}`;
  const request = (method, suffix, body, roles) =>
    fetch(base + suffix, {
      method,
      signal: AbortSignal.timeout(5000),
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${h.token(roles)}`,
      },
      body: JSON.stringify(body ?? {}),
    });

  await t.test('submit rejects Fail without notes and rolls back before writes', async () => {
    h.reset();
    const response = await request(
      'POST',
      '/submit-for-approval',
      { checklistResults: [{ templateChecklistItemId: mandatoryItemId, outcome: 2 }] },
      ['Technician'],
    );
    assert.equal(response.status, 400, await response.text());
    assert.deepEqual(h.txEvents, ['begin', 'rollback']);
    assert(!h.calls.some(call => call.query.includes('MERGE pm.PMTaskChecklistResults')));
    assert(!h.calls.some(call => call.query.includes("TechnicianCompletedAt = COALESCE")));
  });

  await t.test('submit accepts Fail with notes and commits one atomic transaction', async () => {
    h.reset();
    const response = await request(
      'POST',
      '/submit-for-approval',
      { checklistResults: [{ templateChecklistItemId: mandatoryItemId, outcome: 2, notes: 'Bearing failed check' }] },
      ['Technician'],
    );
    assert.equal(response.status, 200, await response.text());
    assert.deepEqual(h.txEvents, ['begin', 'commit']);
    assert(h.calls.some(call => call.query.includes('MERGE pm.PMTaskChecklistResults')));
    assert(h.calls.some(call => call.query.includes("TechnicianCompletedAt = COALESCE")));
  });

  await t.test('submit still requires every mandatory active item', async () => {
    h.reset();
    const response = await request(
      'POST',
      '/submit-for-approval',
      { checklistResults: [{ templateChecklistItemId: passNotesItemId, outcome: 1, notes: 'Observed' }] },
      ['Technician'],
    );
    assert.equal(response.status, 400, await response.text());
    assert(!h.calls.some(call => call.query.includes('MERGE pm.PMTaskChecklistResults')));
  });

  await t.test('submit rejects pass without notes when the template explicitly requires notes on pass', async () => {
    h.reset();
    const response = await request(
      'POST',
      '/submit-for-approval',
      {
        checklistResults: [
          { templateChecklistItemId: mandatoryItemId, outcome: 1 },
          { templateChecklistItemId: passNotesItemId, outcome: 1 },
        ],
      },
      ['Technician'],
    );
    assert.equal(response.status, 400, await response.text());
    assert(!h.calls.some(call => call.query.includes('MERGE pm.PMTaskChecklistResults')));
  });

  await t.test('submit rejects duplicate and inactive checklist item IDs', async () => {
    h.reset();
    const duplicateResponse = await request(
      'POST',
      '/submit-for-approval',
      {
        checklistResults: [
          { templateChecklistItemId: mandatoryItemId, outcome: 1 },
          { templateChecklistItemId: mandatoryItemId, outcome: 2, notes: 'duplicate' },
        ],
      },
      ['Technician'],
    );
    assert.equal(duplicateResponse.status, 400, await duplicateResponse.text());

    h.reset();
    const inactiveResponse = await request(
      'POST',
      '/submit-for-approval',
      {
        checklistResults: [
          { templateChecklistItemId: mandatoryItemId, outcome: 1 },
          { templateChecklistItemId: inactiveItemId, outcome: 1 },
        ],
      },
      ['Technician'],
    );
    assert.equal(inactiveResponse.status, 400, await inactiveResponse.text());
  });

  await t.test('complete allows mandatory pass without notes for manager completion', async () => {
    h.reset();
    const response = await request(
      'POST',
      '/complete',
      { checklistResults: [{ templateChecklistItemId: mandatoryItemId, outcome: 1 }] },
      ['Supervisor'],
    );
    assert.equal(response.status, 200, await response.text());
    assert.deepEqual(h.txEvents, ['begin', 'commit']);
    assert(h.calls.some(call => call.query.includes("UPDATE pm.PMTasks") && call.query.includes("Status = N'completed'")));
    assert(h.calls.some(call => call.query.includes('UPDATE pm.AssetPMSettings')));
  });

  await t.test('complete preserves attachment validation and rolls back if evidence is missing', async () => {
    h.reset();
    const response = await request(
      'POST',
      '/complete',
      {
        checklistResults: [
          { templateChecklistItemId: mandatoryItemId, outcome: 1 },
          { templateChecklistItemId: attachmentItemId, outcome: 1 },
        ],
      },
      ['Supervisor'],
    );
    assert.equal(response.status, 400, await response.text());
    assert.deepEqual(h.txEvents, ['begin', 'rollback']);
    assert(!h.calls.some(call => call.query.includes("UPDATE pm.PMTasks") && call.query.includes("Status = N'completed'")));
  });
});
