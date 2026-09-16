import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(path.join(root, 'backend/package.json'));

export const fixtureUserId = '11111111-1111-4111-8111-111111111111';
export const fixtureTaskId = '22222222-2222-4222-8222-222222222222';
export const fixtureTemplateId = '33333333-3333-4333-8333-333333333333';
export const fixtureAssetId = '44444444-4444-4444-8444-444444444444';
export const mandatoryItemId = '55555555-5555-4555-8555-555555555555';
export const passNotesItemId = '66666666-6666-4666-8666-666666666666';
export const attachmentItemId = '77777777-7777-4777-8777-777777777777';
export const inactiveItemId = '88888888-8888-4888-8888-888888888888';

const isoDate = value => new Date(value).toISOString();

const defaultTemplateItems = [
  {
    TemplateChecklistItemId: mandatoryItemId,
    SortOrder: 0,
    ItemText: 'Mandatory inspection item',
    IsMandatory: true,
    RequiresNotes: false,
    RequiresPassFail: true,
    EnableAttachment: false,
    RequiresAttachment: false,
    IsActive: true,
  },
  {
    TemplateChecklistItemId: passNotesItemId,
    SortOrder: 1,
    ItemText: 'Pass requires notes item',
    IsMandatory: false,
    RequiresNotes: true,
    RequiresPassFail: true,
    EnableAttachment: false,
    RequiresAttachment: false,
    IsActive: true,
  },
  {
    TemplateChecklistItemId: attachmentItemId,
    SortOrder: 2,
    ItemText: 'Attachment item',
    IsMandatory: false,
    RequiresNotes: false,
    RequiresPassFail: true,
    EnableAttachment: true,
    RequiresAttachment: true,
    IsActive: true,
  },
  {
    TemplateChecklistItemId: inactiveItemId,
    SortOrder: 3,
    ItemText: 'Inactive item',
    IsMandatory: false,
    RequiresNotes: false,
    RequiresPassFail: true,
    EnableAttachment: false,
    RequiresAttachment: false,
    IsActive: false,
  },
];

const createSqlStub = txEvents => {
  class Transaction {
    constructor(db) {
      this.db = db;
    }
    async begin() {
      txEvents.push('begin');
    }
    request() {
      return this.db.request();
    }
    async commit() {
      txEvents.push('commit');
    }
    async rollback() {
      txEvents.push('rollback');
    }
  }

  return {
    Transaction,
    UniqueIdentifier: Symbol('UniqueIdentifier'),
    TinyInt: Symbol('TinyInt'),
    Bit: Symbol('Bit'),
    Int: Symbol('Int'),
    MAX: 'MAX',
    NVarChar: (...args) => ({ type: 'NVarChar', args }),
    DateTime2: (...args) => ({ type: 'DateTime2', args }),
  };
};

export function createHarness() {
  const calls = [];
  const txEvents = [];
  let persistedRoles = [];
  let templateItems = defaultTemplateItems.map(item => ({ ...item }));
  let snapshotItems = [];
  let checklistEvidenceIds = [];
  let checklistEvidenceRecords = [];
  let checklistResults = [];
  let approvalStatus = 'None';
  let failMergeForItemId = null;

  const buildTaskRow = () => ({
    TaskId: fixtureTaskId,
    TaskNumber: 'PM-0001',
    MaintenanceType: 'PM',
    AssetId: fixtureAssetId,
    AssetTag: 'AST-001',
    AssetName: 'Fixture Asset',
    FacilityId: null,
    FacilityName: null,
    TemplateId: fixtureTemplateId,
    TemplateName: 'Fixture Template',
    ScheduledDueAt: isoDate('2026-09-16T08:00:00Z'),
    AssignedToUserId: fixtureUserId,
    AssignedToUsername: 'fixture',
    AssignedToDisplayName: 'Fixture User',
    AssignedToRoleId: null,
    AssignedToRoleName: null,
    Status: 'in_progress',
    Priority: 'medium',
    ApprovalStatus: approvalStatus,
    TechnicianCompletedAt: approvalStatus === 'None' ? null : isoDate('2026-09-16T09:00:00Z'),
    TechnicianCompletedByUserId: approvalStatus === 'None' ? null : fixtureUserId,
    TechnicianCompletedByUsername: approvalStatus === 'None' ? null : 'fixture',
    TechnicianCompletedByDisplayName: approvalStatus === 'None' ? null : 'Fixture User',
    SupervisorApprovedAt: null,
    SupervisorApprovedByUserId: null,
    SupervisorApprovedByUsername: null,
    SupervisorApprovedByDisplayName: null,
    SuperadminApprovedAt: null,
    SuperadminApprovedByUserId: null,
    SuperadminApprovedByUsername: null,
    SuperadminApprovedByDisplayName: null,
    RejectedAt: null,
    RejectedByUserId: null,
    RejectedByUsername: null,
    RejectedByDisplayName: null,
    RejectionReason: null,
    RevisedAt: null,
    RevisedByUserId: null,
    RevisedByUsername: null,
    RevisedByDisplayName: null,
    RevisionNote: null,
    CreatedAt: isoDate('2026-09-15T01:00:00Z'),
    StartedAt: isoDate('2026-09-16T08:15:00Z'),
    CompletedAt: null,
    CompletedByUserId: null,
    CompletedByUsername: null,
    CompletedByDisplayName: null,
    CancelledAt: null,
    CancelledByUserId: null,
    CancelledByUsername: null,
    CancelledByDisplayName: null,
    CancelledReason: null,
    ForceCompleted: false,
  });

  const db = {
    request() {
      const inputs = {};
      return {
        input(key, _type, value) {
          inputs[key] = value;
          return this;
        },
        async query(query) {
          calls.push({ query, inputs: { ...inputs } });

          if (query.includes('FROM pm.UserRoles')) {
            return { recordset: persistedRoles.map(RoleName => ({ RoleName })), rowsAffected: [] };
          }

          if (
            query.includes('FROM pm.PMTasks t') &&
            query.includes('AssignedToUserId AS AssignedToUserId') &&
            query.includes('ApprovalStatus AS ApprovalStatus') &&
            query.includes('t.TemplateId AS TemplateId') &&
            !query.includes('tpl.IntervalDays AS IntervalDays')
          ) {
            return {
              recordset: [
                {
                  AssignedToUserId: fixtureUserId,
                  AssignedToRoleName: null,
                  ApprovalStatus: approvalStatus,
                  TemplateId: fixtureTemplateId,
                },
              ],
              rowsAffected: [],
            };
          }

          if (
            query.includes('FROM pm.PMTasks t') &&
            query.includes('t.TaskNumber AS TaskNumber') &&
            query.includes('t.MaintenanceType AS MaintenanceType')
          ) {
            return { recordset: [buildTaskRow()], rowsAffected: [] };
          }

          if (
            query.includes('FROM pm.PMTasks t') &&
            query.includes('tpl.IntervalDays AS IntervalDays')
          ) {
            return {
              recordset: [
                {
                  TaskId: fixtureTaskId,
                  AssetId: fixtureAssetId,
                  TemplateId: fixtureTemplateId,
                  AssignedToUserId: fixtureUserId,
                  AssignedToRoleName: null,
                  IntervalDays: 30,
                },
              ],
              rowsAffected: [],
            };
          }

          if (
            query.includes('FROM pm.PMTemplateChecklistItems i') ||
            (query.includes('FROM pm.PMTemplates tpl') && query.includes('INNER JOIN pm.PMTemplateChecklistItems i'))
          ) {
            const rows =
              inputs.templateChecklistItemId
                ? templateItems.filter(item => item.TemplateChecklistItemId === inputs.templateChecklistItemId)
                : templateItems;
            return {
              recordset: rows.map(item => ({ SourceTemplateVersion: 7, ...item })),
              rowsAffected: [],
            };
          }

          if (query.includes('FROM pm.PMTaskChecklistResults r') && query.includes('WHERE r.TaskId = @taskId')) {
            return { recordset: checklistResults.map(item => ({ ...item })), rowsAffected: [] };
          }

          if (query.includes('FROM pm.PMTaskChecklistEvidence e')) {
            if (query.includes('e.FileName AS FileName')) {
              return {
                recordset: checklistEvidenceRecords.map(record => ({ ...record })),
                rowsAffected: [],
              };
            }
            return {
              recordset: checklistEvidenceIds.map(TemplateChecklistItemId => ({ TemplateChecklistItemId })),
              rowsAffected: [],
            };
          }

          if (query.includes('FROM pm.PMTaskEvidence e')) {
            return { recordset: [], rowsAffected: [] };
          }

          if (query.includes('FROM pm.AuditLog a')) {
            return { recordset: [], rowsAffected: [] };
          }

          if (query.includes('INSERT INTO pm.PMTaskChecklistSnapshots')) {
            if (snapshotItems.length === 0) {
              snapshotItems = templateItems.map(item => ({
                TemplateChecklistItemId: item.TemplateChecklistItemId,
                SortOrder: item.SortOrder ?? 0,
                ItemText: item.ItemText ?? `Item ${item.TemplateChecklistItemId}`,
                IsMandatory: item.IsMandatory,
                RequiresNotes: item.RequiresNotes,
                RequiresPassFail: item.RequiresPassFail,
                EnableAttachment: item.EnableAttachment,
                RequiresAttachment: item.RequiresAttachment,
                IsActive: item.IsActive,
                SourceTemplateVersion: 7,
                CapturedAt: new Date('2026-09-16T09:00:00Z'),
              }));
            }
            return { recordset: [], rowsAffected: [snapshotItems.length] };
          }

          if (query.includes('FROM pm.PMTaskChecklistSnapshots s')) {
            const rows =
              inputs.templateChecklistItemId
                ? snapshotItems.filter(item => item.TemplateChecklistItemId === inputs.templateChecklistItemId)
                : snapshotItems;
            return { recordset: rows.map(item => ({ ...item })), rowsAffected: [] };
          }

          if (query.includes('MERGE pm.PMTaskChecklistResults')) {
            if (failMergeForItemId && inputs.templateChecklistItemId === failMergeForItemId) {
              throw new Error('Fixture checklist merge failure');
            }
            const existingIndex = checklistResults.findIndex(
              item => item.TemplateChecklistItemId === inputs.templateChecklistItemId,
            );
            const nextRow = {
              TemplateChecklistItemId: inputs.templateChecklistItemId,
              TaskChecklistResultId:
                existingIndex >= 0 ? checklistResults[existingIndex].TaskChecklistResultId : `result-${inputs.templateChecklistItemId}`,
              Outcome: inputs.outcome,
              Notes: inputs.notes ?? null,
              ResultCompletedAt: inputs.completedAt ?? new Date('2026-09-16T09:00:00Z'),
              ResultCompletedByUserId: inputs.completedByUserId ?? fixtureUserId,
              ResultCompletedByUsername: 'fixture',
              ResultCompletedByDisplayName: 'Fixture User',
            };
            if (existingIndex >= 0) checklistResults[existingIndex] = nextRow;
            else checklistResults.push(nextRow);
            return { recordset: [], rowsAffected: [1] };
          }

          if (query.includes("UPDATE pm.PMTasks") && query.includes("TechnicianCompletedAt = COALESCE")) {
            return { recordset: [], rowsAffected: [1] };
          }

          if (query.includes("UPDATE pm.PMTasks") && query.includes("Status = N'completed'")) {
            return { recordset: [], rowsAffected: [1] };
          }

          if (query.includes('UPDATE pm.AssetPMSettings')) {
            return { recordset: [], rowsAffected: [1] };
          }

          if (query.includes('FROM pm.NotificationRules')) {
            return { recordset: [], rowsAffected: [] };
          }

          throw new Error(`Unexpected fixture query: ${query}`);
        },
      };
    },
  };

  const cache = new Map();
  const sql = createSqlStub(txEvents);

  function load(filename) {
    const abs = path.resolve(root, filename);
    if (abs.endsWith('/config/env.ts')) {
      return {
        env: {
          JWT_SECRET: 'tc01-isolated-test-secret-only',
          JWT_EXPIRES_IN: '1h',
          PM_NOW_IDEMPOTENCY_WINDOW_MINUTES: 15,
          EVIDENCE_STORAGE_ROOT: null,
        },
      };
    }
    if (abs.endsWith('/db/mssql.ts')) {
      return { getDb: async () => db };
    }
    if (abs.endsWith('/jobs/index.ts')) {
      return { runJobNow: async () => {} };
    }
    if (cache.has(abs)) return cache.get(abs).exports;

    const module = { exports: {} };
    cache.set(abs, module);
    const js = ts.transpileModule(fs.readFileSync(abs, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText;

    const localRequire = spec => {
      if (spec === 'mssql') return sql;
      if (spec.startsWith('.')) {
        return load(path.resolve(path.dirname(abs), spec.replace(/\.js$/, '.ts')));
      }
      return require(spec);
    };

    vm.runInThisContext(`(function(require,module,exports){${js}\n})`, { filename: abs })(
      localRequire,
      module,
      module.exports,
    );
    return module.exports;
  }

  const { tasksRouter } = load('backend/src/routes/tasks.ts');
  const { signAccessToken } = load('backend/src/auth/jwt.ts');
  const express = require('express');
  const app = express();
  app.use(express.json());
  app.use('/api/tasks', tasksRouter);

  return {
    app,
    calls,
    txEvents,
    token: roles => signAccessToken({ sub: fixtureUserId, username: 'fixture', roles }),
    reset(options = {}) {
      calls.length = 0;
      txEvents.length = 0;
      persistedRoles = options.persistedRoles ?? [];
      templateItems = (options.templateItems ?? defaultTemplateItems).map(item => ({ ...item }));
      snapshotItems = (options.snapshotItems ?? []).map(item => ({ ...item }));
      checklistEvidenceIds = [...(options.checklistEvidenceIds ?? [])];
      checklistEvidenceRecords = (options.checklistEvidenceRecords ?? []).map(record => ({ ...record }));
      checklistResults = (options.checklistResults ?? []).map(record => ({ ...record }));
      approvalStatus = options.approvalStatus ?? 'None';
      failMergeForItemId = options.failMergeForItemId ?? null;
    },
  };
}
