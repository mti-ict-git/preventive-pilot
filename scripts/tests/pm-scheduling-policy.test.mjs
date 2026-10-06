import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(path.join(root, "backend/package.json"));

const loadPmSchedulingPolicy = () => {
  const abs = path.join(root, "backend/src/db/pmSchedulingPolicy.ts");
  const module = { exports: {} };
  const js = ts.transpileModule(fs.readFileSync(abs, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;

  const sqlStub = {
    UniqueIdentifier: Symbol("UniqueIdentifier"),
    DateTime2: (...args) => ({ type: "DateTime2", args }),
    NVarChar: (...args) => ({ type: "NVarChar", args }),
  };

  vm.runInThisContext(`(function(require,module,exports){${js}\n})`, { filename: abs })(
    (spec) => {
      if (spec === "mssql") return sqlStub;
      if (spec === './pmActiveWorkPolicy.js') {
        const m={exports:{}};
        const source=ts.transpileModule(fs.readFileSync(path.join(root,'backend/src/db/pmActiveWorkPolicy.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
        vm.runInThisContext(`(function(require,module,exports){${source}\n})`)(()=>sqlStub,m,m.exports);
        return m.exports;
      }
      return require(spec);
    },
    module,
    module.exports,
  );

  return module.exports;
};

const {
  advancePmPlannedDueAt,
  finalizePmOccurrenceCompletion,
  findReusablePmTask,
  reconcilePmScheduleContext,
} = loadPmSchedulingPolicy();

const toKey = (value) => value.toISOString();

const createExecutor = (state) => ({
  request() {
    const inputs = {};
    return {
      input(name, _type, value) {
        inputs[name] = value;
        return this;
      },
      async query(query) {
        if (query.includes('pm-active-across-dates')) {
          const active=[...state.tasks.values()].find(t => !t.completedAt && !t.cancelledAt && ['in_progress','paused'].includes(t.status));
          return {recordset: active ? [{TaskId:active.taskId,PlannedDueAt:active.plannedDueAt,ScheduledDueAt:active.scheduledDueAt,Status:active.status,ApprovalStatus:active.approvalStatus}] : [],rowsAffected:[]};
        }
        if(query.includes('PM_AUTO_SUPERSEDED:') || query.includes('PM_AUTO_MISSED:')) return {recordset:[{Changed:0}],rowsAffected:[0]};
        if (query.includes("FROM pm.BlackoutWindows")) {
          return { recordset: [{ BlackoutEnd: null }], rowsAffected: [] };
        }

        if (query.includes("UPDATE pm.AssetPMSettings") || query.includes("UPDATE pm.FacilityPMSettings")) {
          state.savedAnchors.push({
            nextPlannedDueAt: inputs.nextPlannedDueAt,
            nextDueAt: inputs.nextDueAt,
            lastPmCompletedAt: inputs.lastPmCompletedAt ?? null,
          });
          return { recordset: [], rowsAffected: [1] };
        }

        if (query.includes("MERGE pm.PMSchedules") || query.includes("MERGE pm.FacilityPMSchedules")) {
          return { recordset: [], rowsAffected: [1] };
        }

        if (query.includes("FROM pm.PMSkippedOccurrences")) {
          const hit = state.skipped.has(toKey(inputs.plannedDueAt));
          return { recordset: hit ? [{ One: 1 }] : [], rowsAffected: [] };
        }

        if (query.includes("FROM pm.PMMissedOccurrences")) {
          const hit = state.missed.has(toKey(inputs.plannedDueAt));
          return { recordset: hit ? [{ One: 1 }] : [], rowsAffected: [] };
        }

        if (
          query.includes("FROM pm.PMTasks") &&
          query.includes("AND PlannedDueAt = @plannedDueAt") &&
          query.includes("TaskId AS TaskId")
        ) {
          const task = state.tasks.get(toKey(inputs.plannedDueAt)) ?? null;
          return {
            recordset: task
              ? [
                  {
                    TaskId: task.taskId,
                    PlannedDueAt: task.plannedDueAt,
                    ScheduledDueAt: task.scheduledDueAt,
                    Status: task.status,
                    ApprovalStatus: task.approvalStatus,
                    CancelledAt: task.cancelledAt,
                    CompletedAt: task.completedAt,
                  },
                ]
              : [],
            rowsAffected: [],
          };
        }

        if (query.includes("MERGE pm.PMMissedOccurrences")) {
          state.missed.add(toKey(inputs.plannedDueAt));
          return { recordset: [], rowsAffected: [1] };
        }

        if (query.includes("MERGE pm.PMSkippedOccurrences")) {
          state.skipped.add(toKey(inputs.plannedDueAt));
          return { recordset: [], rowsAffected: [1] };
        }

        if (query.includes("CASE WHEN PlannedDueAt <= @currentPlannedDueAt")) {
          const currentTime = inputs.currentPlannedDueAt.getTime();
          const candidates = [...state.tasks.values()]
            .filter((task) => task.completedAt === null && task.cancelledAt === null)
            .sort((left, right) => {
              const leftBucket = left.plannedDueAt.getTime() <= currentTime ? 0 : 1;
              const rightBucket = right.plannedDueAt.getTime() <= currentTime ? 0 : 1;
              if (leftBucket !== rightBucket) return leftBucket - rightBucket;
              if (left.plannedDueAt.getTime() !== right.plannedDueAt.getTime()) {
                return left.plannedDueAt.getTime() - right.plannedDueAt.getTime();
              }
              return left.createdAt.getTime() - right.createdAt.getTime();
            });
          const task = candidates[0] ?? null;
          return {
            recordset: task
              ? [
                  {
                    TaskId: task.taskId,
                    PlannedDueAt: task.plannedDueAt,
                  },
                ]
              : [],
            rowsAffected: [],
          };
        }

        throw new Error(`Unexpected query in test stub: ${query}`);
      },
    };
  },
});

test("SC-01 monthly recurrence stays anchored to the planned date", async () => {
  const context = {
    kind: "asset",
    contextId: "11111111-1111-4111-8111-111111111111",
    templateId: "22222222-2222-4222-8222-222222222222",
    intervalDays: 30,
    pmEnabled: true,
    templateIsActive: true,
    isContextActive: true,
    nextPlannedDueAt: new Date("2026-09-01T00:00:00.000Z"),
    nextDueAt: new Date("2026-09-01T00:00:00.000Z"),
    lastPmCompletedAt: null,
    categoryId: null,
    locationId: null,
    assetStatus: null,
    requiredRoleId: null,
  };
  const state = {
    savedAnchors: [],
    missed: new Set(),
    skipped: new Set(),
    tasks: new Map(),
  };

  const result = await finalizePmOccurrenceCompletion({
    executor: createExecutor(state),
    context,
    fulfilledPlannedDueAt: new Date("2026-09-01T00:00:00.000Z"),
    completedAt: new Date("2026-09-10T08:00:00.000Z"),
  });

  assert.equal(result.nextPlannedDueAt.toISOString(), "2026-10-01T00:00:00.000Z");
  assert.equal(result.nextDueAt.toISOString(), "2026-10-01T00:00:00.000Z");
  assert.equal(state.savedAnchors.length, 1);
  assert.equal(state.savedAnchors[0].lastPmCompletedAt.toISOString(), "2026-09-10T08:00:00.000Z");
});

test("SC-01 reconciliation records missed occurrences and returns one actionable current occurrence", async () => {
  const context = {
    kind: "asset",
    contextId: "11111111-1111-4111-8111-111111111111",
    templateId: "22222222-2222-4222-8222-222222222222",
    intervalDays: 30,
    pmEnabled: true,
    templateIsActive: true,
    isContextActive: true,
    nextPlannedDueAt: new Date("2026-09-01T00:00:00.000Z"),
    nextDueAt: new Date("2026-09-01T00:00:00.000Z"),
    lastPmCompletedAt: null,
    categoryId: null,
    locationId: null,
    assetStatus: null,
    requiredRoleId: null,
  };
  const state = {
    savedAnchors: [],
    missed: new Set(),
    skipped: new Set(),
    tasks: new Map(),
  };

  const occurrence = await reconcilePmScheduleContext({
    executor: createExecutor(state),
    context,
    now: new Date("2026-11-15T00:00:00.000Z"),
  });

  assert.ok(occurrence);
  assert.equal(occurrence.plannedDueAt.toISOString(), "2026-11-01T00:00:00.000Z");
  assert.equal(occurrence.scheduledDueAt.toISOString(), "2026-11-01T00:00:00.000Z");
  assert.equal(occurrence.task, null);
  assert.deepEqual([...state.missed].sort(), [
    "2026-09-01T00:00:00.000Z",
    "2026-10-01T00:00:00.000Z",
  ]);
});

test("SC-01 PM Now reuse prefers due or overdue work before a future occurrence", async () => {
  const context = {
    kind: "asset",
    contextId: "11111111-1111-4111-8111-111111111111",
    templateId: "22222222-2222-4222-8222-222222222222",
  };
  const state = {
    savedAnchors: [],
    missed: new Set(),
    skipped: new Set(),
    tasks: new Map([
      [
        "2026-09-01T00:00:00.000Z",
        {
          taskId: "due-task",
          plannedDueAt: new Date("2026-09-01T00:00:00.000Z"),
          scheduledDueAt: new Date("2026-09-01T00:00:00.000Z"),
          status: "open",
          approvalStatus: "None",
          cancelledAt: null,
          completedAt: null,
          createdAt: new Date("2026-08-25T00:00:00.000Z"),
        },
      ],
      [
        "2026-11-01T00:00:00.000Z",
        {
          taskId: "future-task",
          plannedDueAt: new Date("2026-11-01T00:00:00.000Z"),
          scheduledDueAt: new Date("2026-11-01T00:00:00.000Z"),
          status: "open",
          approvalStatus: "None",
          cancelledAt: null,
          completedAt: null,
          createdAt: new Date("2026-08-26T00:00:00.000Z"),
        },
      ],
    ]),
  };

  const reusableTask = await findReusablePmTask({
    executor: createExecutor(state),
    context,
    currentPlannedDueAt: new Date("2026-10-01T00:00:00.000Z"),
  });

  assert.ok(reusableTask);
  assert.equal(reusableTask.taskId, "due-task");
  assert.equal(reusableTask.plannedDueAt.toISOString(), "2026-09-01T00:00:00.000Z");
});

test("SC-01 keeps month-end progression aligned with SQL-like month handling", () => {
  const next = advancePmPlannedDueAt(new Date("2026-01-31T00:00:00.000Z"), 30);
  assert.equal(next.toISOString(), "2026-02-28T00:00:00.000Z");
});

for (const status of ['in_progress','paused']) {
  test(`SC-01 ${status} legacy PM Now holds future generation across different dates`, async () => {
    const nowTask={taskId:'33333333-3333-4333-8333-333333333333',plannedDueAt:new Date('2026-03-12T00:00:00Z'),scheduledDueAt:new Date('2026-03-12T00:00:00Z'),status,approvalStatus:'None',completedAt:null,cancelledAt:null,createdAt:new Date('2026-03-12T00:00:00Z')};
    const state={tasks:new Map([[toKey(nowTask.plannedDueAt),nowTask]]),savedAnchors:[],missed:new Set(),skipped:new Set()};
    const context={kind:'asset',contextId:'11111111-1111-4111-8111-111111111111',templateId:'22222222-2222-4222-8222-222222222222',intervalDays:90,pmEnabled:true,templateIsActive:true,isContextActive:true,nextPlannedDueAt:new Date('2026-07-16T00:00:00Z'),nextDueAt:new Date('2026-07-16T00:00:00Z'),lastPmCompletedAt:new Date('2026-01-16T00:00:00Z')};
    for(let n=0;n<2;n++) {
      const result=await reconcilePmScheduleContext({executor:createExecutor(state),context,now:new Date('2026-10-06T00:00:00Z')});
      assert.equal(result.task.taskId,nowTask.taskId);
      assert.equal(result.task.status,status);
    }
    assert.equal(state.savedAnchors.length,0);
    assert.equal(state.missed.size,0);
  });
}

test('SC-01 long-running execution resumes at next future cycle and preserves skipped work as missed', async()=>{
 const state={tasks:new Map(),savedAnchors:[],missed:new Set(),skipped:new Set()};
 const context={kind:'asset',contextId:'11111111-1111-4111-8111-111111111111',templateId:'22222222-2222-4222-8222-222222222222',intervalDays:90,nextPlannedDueAt:new Date('2026-04-16T00:00:00Z'),lastPmCompletedAt:null};
 const r=await finalizePmOccurrenceCompletion({executor:createExecutor(state),context,fulfilledPlannedDueAt:new Date('2026-04-16T00:00:00Z'),completedAt:new Date('2026-10-06T00:00:00Z')});
 assert.equal(r.nextPlannedDueAt.toISOString(),'2026-10-16T00:00:00.000Z');
 assert.deepEqual([...state.missed],['2026-07-16T00:00:00.000Z']);
});
