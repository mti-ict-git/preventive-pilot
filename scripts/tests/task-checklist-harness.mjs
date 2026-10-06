import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(path.join(root, 'backend/package.json'));

export const fixtureUserId = '11111111-1111-4111-8111-111111111111';
export const fixtureSecondUserId = '12121212-1212-4212-8212-121212121212';
export const fixtureTaskId = '22222222-2222-4222-8222-222222222222';
export const fixtureTemplateId = '33333333-3333-4333-8333-333333333333';
export const fixtureAssetId = '44444444-4444-4444-8444-444444444444';
export const fixtureFacilityId = '46464646-4646-4466-8466-464646464646';
export const fixtureTechnicianRoleId = '45454545-4545-4455-8455-454545454545';
export const mandatoryItemId = '55555555-5555-4555-8555-555555555555';
export const passNotesItemId = '66666666-6666-4666-8666-666666666666';
export const attachmentItemId = '77777777-7777-4777-8777-777777777777';
export const inactiveItemId = '88888888-8888-4888-8888-888888888888';
export const pmNowTaskId = '99999999-9999-4999-8999-999999999999';
export const fixtureWorkOrderId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const fixtureRecurringWorkOrderId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

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

export function createHarness(overrides = {}) {
  const calls = [];
  const txEvents = [];
  let persistedRoles = [];
  let occurrenceResolved = false;
  let templateItems = defaultTemplateItems.map(item => ({ ...item }));
  let snapshotItems = [];
  let checklistEvidenceIds = [];
  let checklistEvidenceRecords = [];
  let checklistResults = [];
  let approvalStatus = 'None';
  let failMergeForItemId = null;
  let taskStatus = 'in_progress';
  let rejectStartUpdate = false;
  let maintenanceType = 'PM';
  let assignedToUserId = fixtureUserId;
  let assignedToRoleId = null;
  let assignedToRoleName = null;
  let assetOperationalStatus = 'operational';
  let pmEnabled = true;
  let templateIsActive = true;
  let pmNowExistingTaskId = null;
  let taskWorkSessions = [];
  let existingFindingWorkOrderId = null;
  let replacementTaskId = null;
  let technicianCompletedByUserId = null;
  let cmDowntimeIntervals = [];
  let cmEventLog = [];
  let recurringWorkOrderId = null;
  let recurringFromTaskId = null;
  let contextKind = 'asset';
  let nextPlannedPmDueAt = new Date('2026-09-16T08:00:00Z');
  let nextPmDueAt = new Date('2026-09-16T08:00:00Z');
  let lastPmCompletedAt = null;
  let blackoutEnd = null;
  let scheduleAnchorWrites = [];

  const buildTaskRow = () => ({
    TaskId: fixtureTaskId,
    TaskNumber: 'PM-0001',
    MaintenanceType: maintenanceType,
    AssetId: contextKind === 'asset' ? fixtureAssetId : null,
    AssetTag: contextKind === 'asset' ? 'AST-001' : null,
    AssetName: contextKind === 'asset' ? 'Fixture Asset' : null,
    FacilityId: contextKind === 'facility' ? fixtureFacilityId : null,
    FacilityName: contextKind === 'facility' ? 'Fixture Facility' : null,
    TemplateId: fixtureTemplateId,
    TemplateName: 'Fixture Template',
    ScheduledDueAt: isoDate('2026-09-16T08:00:00Z'),
    AssignedToUserId: assignedToUserId,
    AssignedToUsername: 'fixture',
    AssignedToDisplayName: 'Fixture User',
    AssignedToRoleId: assignedToRoleId,
    AssignedToRoleName: assignedToRoleName,
    Status: taskStatus,
    Priority: 'medium',
    ApprovalStatus: approvalStatus,
    TechnicianCompletedAt:
      maintenanceType === 'CM'
        ? (technicianCompletedByUserId ? isoDate('2026-09-16T09:00:00Z') : null)
        : (approvalStatus === 'None' ? null : isoDate('2026-09-16T09:00:00Z')),
    TechnicianCompletedByUserId:
      maintenanceType === 'CM'
        ? technicianCompletedByUserId
        : (approvalStatus === 'None' ? null : fixtureUserId),
    TechnicianCompletedByUsername:
      maintenanceType === 'CM'
        ? (technicianCompletedByUserId ? 'fixture' : null)
        : (approvalStatus === 'None' ? null : 'fixture'),
    TechnicianCompletedByDisplayName:
      maintenanceType === 'CM'
        ? (technicianCompletedByUserId ? 'Fixture User' : null)
        : (approvalStatus === 'None' ? null : 'Fixture User'),
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
    Symptom: 'Fixture corrective symptom',
    ImpactLevel: 'high',
    FailureCategory: 'Mechanical',
    FailureCode: 'MC-01',
    ReportedAt: isoDate('2026-09-16T07:30:00Z'),
    ReportedByUserId: fixtureUserId,
    ReportedByUsername: 'fixture',
    ReportedByDisplayName: 'Fixture User',
    ReportedChannel: 'web',
    RecurringFromTaskId: recurringFromTaskId,
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
          if (overrides.query) {
            const overridden = await overrides.query(query, inputs);
            if (overridden !== undefined) return overridden;
          }
          if (query.includes("UPDATE t") && query.includes("Status = N'open'") && query.includes('AND s.DefaultTemplateId = t.TemplateId')) {
            if (!pmEnabled || !templateIsActive) return { recordset: [], rowsAffected: [0] };
            taskStatus = 'open';
            return { recordset: [], rowsAffected: [1] };
          }
          if (rejectStartUpdate && query.includes('UPDATE pm.PMTasks') && query.includes("Status = N'in_progress'")) {
            return { recordset: [], rowsAffected: [0] };
          }


          if (query.includes('FROM pm.UserRoles')) {
            return { recordset: persistedRoles.map(RoleName => ({ RoleName })), rowsAffected: [] };
          }

          if (
            query.includes('FROM pm.PMTasks t') &&
            query.includes('t.TaskId AS TaskId,') &&
            query.includes('t.PlannedDueAt AS PlannedDueAt,') &&
            query.includes('t.ApprovalStatus AS ApprovalStatus,') &&
            query.includes('t.TechnicianCompletedAt AS TechnicianCompletedAt,') &&
            query.includes('t.TechnicianCompletedByUserId AS TechnicianCompletedByUserId,') &&
            query.includes('tpl.IntervalDays AS IntervalDays')
          ) {
            return {
              recordset: [
                {
                  TaskId: fixtureTaskId,
                  AssetId: contextKind === 'asset' ? fixtureAssetId : null,
                  TemplateId: fixtureTemplateId,
                  PlannedDueAt: new Date('2026-09-16T08:00:00Z'),
                  MaintenanceType: maintenanceType,
                  ApprovalStatus: approvalStatus,
                  TechnicianCompletedAt: technicianCompletedByUserId ? new Date('2026-09-16T09:00:00Z') : null,
                  TechnicianCompletedByUserId: technicianCompletedByUserId,
                  IntervalDays: 30,
                },
              ],
              rowsAffected: [],
            };
          }

          if (
            query.includes('FROM pm.PMTasks t') &&
            query.includes('t.TaskId AS TaskId') &&
            !query.includes('t.TaskNumber AS TaskNumber') &&
            query.includes('t.TechnicianCompletedByUserId AS TechnicianCompletedByUserId') &&
            query.includes('t.MaintenanceType AS MaintenanceType')
          ) {
            return {
              recordset: [
                {
                  TaskId: fixtureTaskId,
                  Status: taskStatus,
                  AssignedToUserId: assignedToUserId,
                  AssignedToRoleName: assignedToRoleName,
                  TechnicianCompletedByUserId: technicianCompletedByUserId,
                  MaintenanceType: maintenanceType,
                },
              ],
              rowsAffected: [],
            };
          }

          if (
            query.includes('FROM pm.CMDowntimeIntervals') &&
            query.includes('WHERE TaskId = @taskId AND EndedAt IS NULL') &&
            query.includes('StartedAt AS StartedAt')
          ) {
            const openInterval = cmDowntimeIntervals
              .filter(interval => interval.EndedAt === null)
              .sort((a, b) => new Date(b.StartedAt).getTime() - new Date(a.StartedAt).getTime())[0];
            return { recordset: openInterval ? [{ ...openInterval }] : [], rowsAffected: [] };
          }

          if (
            query.includes('FROM pm.CMDowntimeIntervals') &&
            query.includes('WHERE TaskId = @taskId AND EndedAt IS NULL') &&
            query.includes('CMDowntimeIntervalId')
          ) {
            const openInterval = cmDowntimeIntervals.find(interval => interval.EndedAt === null);
            return {
              recordset: openInterval ? [{ CMDowntimeIntervalId: openInterval.CMDowntimeIntervalId }] : [],
              rowsAffected: [],
            };
          }

          if (
            query.includes('FROM pm.CMDowntimeIntervals') &&
            query.includes('WHERE TaskId = @taskId AND EndedAt IS NOT NULL') &&
            query.includes('EndedAt AS EndedAt')
          ) {
            const latestEndedInterval = cmDowntimeIntervals
              .filter(interval => interval.EndedAt !== null)
              .sort((a, b) => new Date(b.EndedAt).getTime() - new Date(a.EndedAt).getTime())[0];
            return {
              recordset: latestEndedInterval ? [{ EndedAt: latestEndedInterval.EndedAt }] : [],
              rowsAffected: [],
            };
          }

          if (
            query.includes('FROM pm.PMTasks t') &&
            query.includes('AssignedToUserId AS AssignedToUserId') &&
            query.includes('t.Status AS Status') &&
            query.includes('t.ApprovalStatus AS ApprovalStatus') &&
            !query.includes('t.TemplateId AS TemplateId') &&
            !query.includes('t.MaintenanceType AS MaintenanceType')
          ) {
            return {
              recordset: [
                {
                  Status: taskStatus,
                  ApprovalStatus: approvalStatus,
                  AssignedToUserId: assignedToUserId,
                  AssignedToRoleName: assignedToRoleName,
                },
              ],
              rowsAffected: [],
            };
          }

          if (
            query.includes('FROM pm.PMTasks t') &&
            query.includes('t.TaskId AS TaskId,') &&
            query.includes('t.AssetId AS AssetId,') &&
            query.includes('t.TemplateId AS TemplateId,') &&
            query.includes('t.TechnicianCompletedAt AS TechnicianCompletedAt,') &&
            query.includes('tpl.IntervalDays AS IntervalDays')
          ) {
            return {
              recordset: [
                {
                  TaskId: fixtureTaskId,
                  AssetId: contextKind === 'asset' ? fixtureAssetId : null,
                  TemplateId: fixtureTemplateId,
                  PlannedDueAt: new Date('2026-09-16T08:00:00Z'),
                  MaintenanceType: maintenanceType,
                  ApprovalStatus: approvalStatus,
                  TechnicianCompletedAt: technicianCompletedByUserId ? new Date('2026-09-16T09:00:00Z') : null,
                  TechnicianCompletedByUserId: technicianCompletedByUserId,
                  IntervalDays: 30,
                },
              ],
              rowsAffected: [],
            };
          }

          if (
            query.includes('FROM pm.PMTasks t') &&
            query.includes('t.ApprovalStatus AS ApprovalStatus,') &&
            query.includes('t.AssetId AS AssetId,') &&
            query.includes('t.PlannedDueAt AS PlannedDueAt,') &&
            query.includes('t.AssignedToRoleId AS AssignedToRoleId,') &&
            query.includes('t.TechnicianCompletedByUserId AS TechnicianCompletedByUserId')
          ) {
            return {
              recordset: [
                {
                  ApprovalStatus: approvalStatus,
                  MaintenanceType: maintenanceType,
                  AssetId: contextKind === 'asset' ? fixtureAssetId : null,
                  FacilityId: contextKind === 'facility' ? fixtureFacilityId : null,
                  TemplateId: fixtureTemplateId,
                  PlannedDueAt: new Date('2026-09-16T08:00:00Z'),
                  ScheduledDueAt: new Date('2026-09-16T08:00:00Z'),
                  Priority: 'medium',
                  AssignedToUserId: assignedToUserId,
                  AssignedToRoleId: assignedToRoleId,
                  TechnicianCompletedByUserId: technicianCompletedByUserId,
                },
              ],
              rowsAffected: [],
            };
          }

          if (
            query.includes('FROM pm.PMTasks t') &&
            query.includes('t.ApprovalStatus AS ApprovalStatus') &&
            query.includes('t.MaintenanceType AS MaintenanceType') &&
            query.includes('t.TechnicianCompletedByUserId AS TechnicianCompletedByUserId') &&
            !query.includes('t.AssetId AS AssetId') &&
            !query.includes('t.TemplateId AS TemplateId')
          ) {
            return {
              recordset: [
                {
                  ApprovalStatus: approvalStatus,
                  MaintenanceType: maintenanceType,
                  TechnicianCompletedByUserId: technicianCompletedByUserId,
                },
              ],
              rowsAffected: [],
            };
          }

          if (
            query.includes('FROM pm.PMTasks t') &&
            query.includes('t.ApprovalStatus AS ApprovalStatus') &&
            query.includes('t.MaintenanceType AS MaintenanceType') &&
            !query.includes('AssignedToUserId AS AssignedToUserId') &&
            !query.includes('t.AssetId AS AssetId') &&
            !query.includes('t.TemplateId AS TemplateId')
          ) {
            return {
              recordset: [
                {
                  ApprovalStatus: approvalStatus,
                  MaintenanceType: maintenanceType,
                },
              ],
              rowsAffected: [],
            };
          }

          if (
            query.includes('FROM pm.PMTasks t') &&
            query.includes('t.ApprovalStatus AS ApprovalStatus') &&
              !query.includes('AssignedToUserId AS AssignedToUserId') &&
              !query.includes('t.MaintenanceType AS MaintenanceType') &&
              !query.includes('a.AssetOperationalStatus AS AssetOperationalStatus')
          ) {
            return {
              recordset: [{ ApprovalStatus: approvalStatus }],
              rowsAffected: [],
            };
          }

          if (
            query.includes('FROM pm.PMTasks t') &&
            query.includes('AssignedToUserId AS AssignedToUserId') &&
            query.includes('ApprovalStatus AS ApprovalStatus') &&
            query.includes('t.MaintenanceType AS MaintenanceType') &&
            query.includes('t.TemplateId AS TemplateId') &&
            !query.includes('tpl.IntervalDays AS IntervalDays')
          ) {
            return {
              recordset: [
                {
                  AssignedToUserId: assignedToUserId,
                  AssignedToRoleName: assignedToRoleName,
                  ApprovalStatus: approvalStatus,
                  MaintenanceType: maintenanceType,
                  TemplateId: fixtureTemplateId,
                },
              ],
              rowsAffected: [],
            };
          }

          if (
            query.includes('FROM pm.PMTasks t') &&
            query.includes('AssignedToUserId AS AssignedToUserId') &&
            query.includes('ApprovalStatus AS ApprovalStatus') &&
            query.includes('t.TemplateId AS TemplateId') &&
            !query.includes('tpl.IntervalDays AS IntervalDays') &&
            !query.includes('t.MaintenanceType AS MaintenanceType')
          ) {
            return {
              recordset: [
                {
                  AssignedToUserId: assignedToUserId,
                  AssignedToRoleName: assignedToRoleName,
                  ApprovalStatus: approvalStatus,
                  TemplateId: fixtureTemplateId,
                },
              ],
              rowsAffected: [],
            };
          }

          if (
            query.includes('FROM pm.PMTasks t') &&
            query.includes('AssignedToUserId AS AssignedToUserId') &&
            query.includes('r.Name AS AssignedToRoleName') &&
            !query.includes('ApprovalStatus AS ApprovalStatus') &&
            !query.includes('tpl.IntervalDays AS IntervalDays')
          ) {
            return {
              recordset: [
                {
                  AssignedToUserId: assignedToUserId,
                  AssignedToRoleName: assignedToRoleName,
                },
              ],
              rowsAffected: [],
            };
          }

          if (
            query.includes('FROM pm.PMTasks') &&
            query.includes('ApprovalStatus,') &&
            query.includes('MaintenanceType') &&
            query.includes('AssignedToUserId') &&
            query.includes('AssignedToRoleId') &&
            query.includes('WHERE TaskId = @taskId') &&
            !query.includes('t.AssetId AS AssetId,')
          ) {
            return {
              recordset: [
                {
                  AssignedToUserId: assignedToUserId,
                  AssignedToRoleId: assignedToRoleId,
                  Priority: 'medium',
                  Status: taskStatus,
                  ApprovalStatus: approvalStatus,
                  MaintenanceType: maintenanceType,
                },
              ],
              rowsAffected: [],
            };
          }

          if (
            query.includes('FROM pm.PMTasks t') &&
            query.includes('t.AssetId AS AssetId,') &&
            query.includes('t.FacilityId AS FacilityId') &&
            query.includes('WHERE t.TaskId = @taskId')
          ) {
            return {
              recordset: [
                {
                  AssetId: contextKind === 'asset' ? fixtureAssetId : null,
                  FacilityId: contextKind === 'facility' ? fixtureFacilityId : null,
                },
              ],
              rowsAffected: [],
            };
          }

          if (
            query.includes('FROM pm.PMTasks t') &&
            query.includes('t.MaintenanceType AS MaintenanceType') &&
            query.includes('t.AssignedToRoleId AS AssignedToRoleId')
          ) {
            return {
              recordset: [
                {
                  MaintenanceType: maintenanceType,
                  Status: taskStatus,
                  ApprovalStatus: approvalStatus,
                  AssignedToUserId: assignedToUserId,
                  AssignedToRoleId: assignedToRoleId,
                  AssignedToRoleName: assignedToRoleName,
                },
              ],
              rowsAffected: [],
            };
          }

          if (
            query.includes('FROM pm.PMTemplates tpl') &&
            query.includes('tpl.TemplateId AS TemplateId') &&
            query.includes('tpl.IsActive AS IsActive')
          ) {
            return {
              recordset: [{ TemplateId: fixtureTemplateId, IsActive: templateIsActive ? 1 : 0 }],
              rowsAffected: [],
            };
          }

          if (
            query.includes('FROM pm.PMTasks t') &&
            query.includes('t.TaskId AS TaskId') &&
            query.includes('t.MaintenanceType AS MaintenanceType') &&
            query.includes('a.AssetOperationalStatus AS AssetOperationalStatus')
          ) {
            return {
              recordset: [
                {
                  TaskId: fixtureTaskId,
                  MaintenanceType: maintenanceType,
                  AssetId: fixtureAssetId,
                  Status: taskStatus,
                  ApprovalStatus: approvalStatus,
                  AssetOperationalStatus: assetOperationalStatus,
                },
              ],
              rowsAffected: [],
            };
          }

          if (
            query.includes('FROM pm.PMTasks t') &&
            query.includes('t.ApprovalStatus AS ApprovalStatus') &&
            query.includes('t.AssetId AS AssetId') &&
            query.includes('t.PlannedDueAt AS PlannedDueAt') &&
            !query.includes('t.TechnicianCompletedAt AS TechnicianCompletedAt') &&
            !query.includes('tpl.IntervalDays AS IntervalDays')
          ) {
            return {
              recordset: [
                {
                  ApprovalStatus: approvalStatus,
                  AssetId: fixtureAssetId,
                  FacilityId: null,
                  TemplateId: fixtureTemplateId,
                  PlannedDueAt: new Date('2026-09-16T08:00:00Z'),
                  ScheduledDueAt: new Date('2026-09-16T08:00:00Z'),
                  Priority: 'medium',
                  AssignedToUserId: assignedToUserId,
                  AssignedToRoleId: assignedToRoleId,
                  TechnicianCompletedByUserId: technicianCompletedByUserId,
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
            query.includes('tpl.IntervalDays AS IntervalDays') &&
            !query.includes('t.TechnicianCompletedAt AS TechnicianCompletedAt')
          ) {
            return {
              recordset: [
                {
                  TaskId: fixtureTaskId,
                  AssetId: fixtureAssetId,
                  TemplateId: fixtureTemplateId,
                  AssignedToUserId: assignedToUserId,
                  AssignedToRoleName: assignedToRoleName,
                  IntervalDays: 30,
                },
              ],
              rowsAffected: [],
            };
          }

          if (
            query.includes('FROM pm.Assets a') &&
            query.includes('a.AssetOperationalStatus AS AssetOperationalStatus') &&
            query.includes('s.PMEnabled AS PMEnabled') &&
            query.includes('tpl.TemplateId AS TemplateId')
          ) {
            return {
              recordset: [
                {
                  AssetId: fixtureAssetId,
                  AssetStatus: 'Ready',
                  AssetOperationalStatus: assetOperationalStatus,
                  CategoryId: null,
                  LocationId: null,
                  PMEnabled: pmEnabled,
                  DefaultTemplateId: fixtureTemplateId,
                  TemplateId: fixtureTemplateId,
                  TemplateIsActive: templateIsActive,
                  RequiredRoleId: null,
                },
              ],
              rowsAffected: [],
            };
          }

          if (
            query.includes('FROM pm.Assets a') &&
            query.includes('a.AssetId AS ContextId,') &&
            query.includes('s.NextPlannedPMDueAt AS NextPlannedPMDueAt') &&
            query.includes('t.RequiredRoleId AS RequiredRoleId')
          ) {
            if (contextKind !== 'asset') {
              return { recordset: [], rowsAffected: [] };
            }
            return {
              recordset: [
                {
                  ContextId: fixtureAssetId,
                  PMEnabled: 1,
                  TemplateId: fixtureTemplateId,
                  IntervalDays: 30,
                  TemplateIsActive: 1,
                  IsContextInactive: 0,
                  NextPlannedPMDueAt: nextPlannedPmDueAt,
                  NextPMDueAt: nextPmDueAt,
                  LastPMCompletedAt: lastPmCompletedAt,
                  CategoryId: null,
                  LocationId: null,
                  AssetStatus: 'Ready',
                  RequiredRoleId: null,
                },
              ],
              rowsAffected: [],
            };
          }

          if (
            query.includes('FROM pm.Facilities f') &&
            query.includes('f.FacilityId AS ContextId,') &&
            query.includes('s.NextPlannedPMDueAt AS NextPlannedPMDueAt') &&
            query.includes('t.RequiredRoleId AS RequiredRoleId')
          ) {
            if (contextKind !== 'facility') {
              return { recordset: [], rowsAffected: [] };
            }
            return {
              recordset: [
                {
                  ContextId: fixtureFacilityId,
                  PMEnabled: 1,
                  TemplateId: fixtureTemplateId,
                  IntervalDays: 30,
                  TemplateIsActive: 1,
                  IsContextActive: 1,
                  NextPlannedPMDueAt: nextPlannedPmDueAt,
                  NextPMDueAt: nextPmDueAt,
                  LastPMCompletedAt: lastPmCompletedAt,
                  LocationId: null,
                  RequiredRoleId: null,
                },
              ],
              rowsAffected: [],
            };
          }

          if (query.includes('FROM pm.BlackoutWindows bw')) {
            return { recordset: [{ BlackoutEnd: blackoutEnd }], rowsAffected: [] };
          }

          if (
            query.includes('FROM pm.PMSkippedOccurrences') ||
            query.includes('FROM pm.PMMissedOccurrences')
          ) {
            return { recordset: [], rowsAffected: [] };
          }

          if (
            query.includes('FROM pm.PMTasks') &&
            query.includes('PlannedDueAt AS PlannedDueAt') &&
            query.includes('ScheduledDueAt AS ScheduledDueAt') &&
            query.includes("WHERE MaintenanceType = N'PM'")
          ) {
            return { recordset: [], rowsAffected: [] };
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

          if (
            query.includes('SELECT') &&
            query.includes('TaskWorkSessionId') &&
            query.includes('FROM pm.TaskWorkSessions') &&
            query.includes('WHERE TaskId = @taskId')
          ) {
            return {
              recordset: taskWorkSessions.map((session, index) => ({
                TaskWorkSessionId: `session-${index + 1}`,
                StartedAt: session.StartedAt,
                EndedAt: session.EndedAt,
              })),
              rowsAffected: [],
            };
          }

          if (
            query.includes('FROM pm.PMTasks') &&
            query.includes('ScheduledDueAt >= dateadd(minute, -@windowMinutes, @now)')
          ) {
            return {
              recordset: pmNowExistingTaskId ? [{ TaskId: pmNowExistingTaskId }] : [],
              rowsAffected: [],
            };
          }

          if (query.includes('FROM pm.AssignmentRules')) {
            return { recordset: [], rowsAffected: [] };
          }

          if (query.includes('INSERT INTO pm.AuditLog')) {
            return { recordset: [], rowsAffected: [1] };
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

          if (
            query.includes('UPDATE t') &&
            query.includes('FROM pm.PMTasks t') &&
            query.includes('INNER JOIN pm.Assets a ON a.AssetId = t.AssetId')
          ) {
            if (assetOperationalStatus === 'broken' && taskStatus !== 'completed' && taskStatus !== 'cancelled') {
              taskStatus = 'cancelled';
              return { recordset: [{ TaskId: fixtureTaskId }], rowsAffected: [1] };
            }
            return { recordset: [], rowsAffected: [0] };
          }

          if (
            query.includes("UPDATE pm.PMTasks") &&
            query.includes("TechnicianCompletedAt = COALESCE") &&
            query.includes("ApprovalStatus = N'PendingSupervisor'")
          ) {
            approvalStatus = 'PendingSupervisor';
            technicianCompletedByUserId = inputs.userId ?? fixtureUserId;
            return { recordset: [], rowsAffected: [1] };
          }

          if (
            query.includes('UPDATE pm.PMTasks') &&
            query.includes("ApprovalStatus = N'PendingSuperadmin'") &&
            query.includes('SupervisorApprovedByUserId = @userId')
          ) {
            approvalStatus = 'PendingSuperadmin';
            return { recordset: [], rowsAffected: [1] };
          }

          if (
            query.includes('UPDATE pm.PMTasks') &&
            query.includes("ApprovalStatus = N'Approved'") &&
            query.includes("Status = N'completed'")
          ) {
            approvalStatus = 'Approved';
            taskStatus = 'completed';
            technicianCompletedByUserId = inputs.technicianUserId ?? technicianCompletedByUserId ?? fixtureUserId;
            return { recordset: [], rowsAffected: [1] };
          }

          if (query.includes("UPDATE pm.PMTasks") && query.includes("ApprovalStatus = N'Rejected'")) {
            approvalStatus = 'Rejected';
            return { recordset: [], rowsAffected: [1] };
          }

          if (
            query.includes('UPDATE pm.PMTasks') &&
            query.includes("ApprovalStatus = N'None'") &&
            !query.includes('SupervisorApprovedAt = NULL')
          ) {
            approvalStatus = 'None';
            return { recordset: [], rowsAffected: [1] };
          }

          if (
            query.includes('UPDATE pm.PMTasks') &&
            query.includes("ApprovalStatus = N'PendingSupervisor'") &&
            query.includes('SupervisorApprovedAt = NULL')
          ) {
            approvalStatus = 'PendingSupervisor';
            return { recordset: [], rowsAffected: [1] };
          }

          if (
            query.includes('UPDATE pm.PMTasks') &&
            query.includes('RevisionNote = @note') &&
            query.includes('RejectedAt = NULL')
          ) {
            return { recordset: [], rowsAffected: [1] };
          }

          if (
            query.includes('UPDATE pm.PMTasks') &&
            query.includes('AssignedToUserId = CASE WHEN @hasAssignedToUserId = 1')
          ) {
            if (inputs.hasAssignedToUserId === 1) assignedToUserId = inputs.assignedToUserId ?? null;
            if (inputs.hasAssignedToRoleId === 1) assignedToRoleId = inputs.assignedToRoleId ?? null;
            if (assignedToRoleId === null) assignedToRoleName = null;
            if (assignedToRoleId === fixtureTechnicianRoleId) assignedToRoleName = 'Technician';
            return { recordset: [], rowsAffected: [1] };
          }

          if (
            query.includes('IF EXISTS (SELECT 1 FROM pm.TaskWorkSessions WHERE TaskId = @taskId AND EndedAt IS NULL)')
          ) {
            const hasOpenSession = taskWorkSessions.some(session => session.EndedAt === null);
            if (!hasOpenSession) {
              taskWorkSessions.push({
                StartedAt: inputs.startedAt ?? new Date('2026-09-16T08:00:00Z'),
                EndedAt: null,
              });
            }
            return { recordset: [{ Created: hasOpenSession ? 0 : 1 }], rowsAffected: [hasOpenSession ? 0 : 1] };
          }

          if (
            query.includes('UPDATE pm.TaskWorkSessions') &&
            query.includes('SELECT @@ROWCOUNT AS ClosedCount')
          ) {
            const openSession = taskWorkSessions.find(session => session.EndedAt === null);
            if (openSession) {
              openSession.EndedAt = inputs.endedAt ?? new Date('2026-09-16T09:00:00Z');
              return { recordset: [{ ClosedCount: 1 }], rowsAffected: [1] };
            }
            return { recordset: [{ ClosedCount: 0 }], rowsAffected: [0] };
          }

          if (
            query.includes('UPDATE t') &&
            query.includes('SET t.AssignedToUserId = @userId') &&
            query.includes('FROM pm.PMTasks t')
          ) {
            const roleMatch = assignedToRoleName !== null && String(inputs.rolesCsv ?? '').split(',').includes(assignedToRoleName);
            if (assignedToUserId === null && assignedToRoleId !== null && roleMatch) {
              assignedToUserId = inputs.userId;
              return { recordset: [], rowsAffected: [1] };
            }
            return { recordset: [], rowsAffected: [0] };
          }

          if (query.includes("UPDATE pm.PMTasks") && query.includes("Status = N'completed'")) {
            taskStatus = 'completed';
            return { recordset: [], rowsAffected: [1] };
          }

          if (query.includes("UPDATE pm.PMTasks") && query.includes("Status = N'in_progress'")) {
            taskStatus = 'in_progress';
            return { recordset: [], rowsAffected: [1] };
          }

          if (query.includes("UPDATE pm.PMTasks") && query.includes("Status = N'paused'")) {
            taskStatus = 'paused';
            return { recordset: [], rowsAffected: [1] };
          }

          if (query.includes("UPDATE pm.PMTasks") && query.includes("Status = N'open'")) {
            taskStatus = 'open';
            return { recordset: [], rowsAffected: [1] };
          }

          if (query.includes('UPDATE pm.AssetPMSettings')) {
            nextPlannedPmDueAt = inputs.nextPlannedDueAt ?? nextPlannedPmDueAt;
            nextPmDueAt = inputs.nextDueAt ?? nextPmDueAt;
            lastPmCompletedAt = inputs.lastPmCompletedAt ?? lastPmCompletedAt;
            scheduleAnchorWrites.push({
              kind: 'asset',
              nextPlannedDueAt: inputs.nextPlannedDueAt ?? null,
              nextDueAt: inputs.nextDueAt ?? null,
              lastPmCompletedAt: inputs.lastPmCompletedAt ?? null,
            });
            return { recordset: [], rowsAffected: [1] };
          }

          if (query.includes('MERGE pm.PMSchedules WITH (HOLDLOCK) AS target')) {
            return { recordset: [], rowsAffected: [1] };
          }

          if (query.includes('UPDATE pm.FacilityPMSettings')) {
            nextPlannedPmDueAt = inputs.nextPlannedDueAt ?? nextPlannedPmDueAt;
            nextPmDueAt = inputs.nextDueAt ?? nextPmDueAt;
            lastPmCompletedAt = inputs.lastPmCompletedAt ?? lastPmCompletedAt;
            scheduleAnchorWrites.push({
              kind: 'facility',
              nextPlannedDueAt: inputs.nextPlannedDueAt ?? null,
              nextDueAt: inputs.nextDueAt ?? null,
              lastPmCompletedAt: inputs.lastPmCompletedAt ?? null,
            });
            return { recordset: [], rowsAffected: [1] };
          }

          if (query.includes('MERGE pm.FacilityPMSchedules WITH (HOLDLOCK) AS target')) {
            return { recordset: [], rowsAffected: [1] };
          }

          if (
            query.includes('INSERT INTO pm.PMTasks (') &&
            query.includes("N'PM-NOW-'")
          ) {
            return { recordset: [{ TaskId: pmNowTaskId }], rowsAffected: [1] };
          }

          if (
            query.includes('FROM pm.PMTasks t') &&
            query.includes('COALESCE(s.ItemText, i.ItemText) AS SourceItemText')
          ) {
            const matched = checklistResults.find(item => item.TemplateChecklistItemId === inputs.sourceTemplateChecklistItemId);
            return {
              recordset: [
                {
                  SourceAssetId: fixtureAssetId,
                  SourceFacilityId: null,
                  SourceTemplateId: fixtureTemplateId,
                  SourceItemText: 'Mandatory inspection item',
                  ResultOutcome: matched?.Outcome ?? null,
                  DraftOutcome: null,
                },
              ],
              rowsAffected: [],
            };
          }

          if (
            query.includes('FROM pm.PMTasks') &&
            query.includes("WHERE MaintenanceType = N'CM'") &&
            query.includes('SourceTaskId = @sourceTaskId') &&
            query.includes('SourceTemplateChecklistItemId = @sourceTemplateChecklistItemId')
          ) {
            return {
              recordset: existingFindingWorkOrderId ? [{ TaskId: existingFindingWorkOrderId }] : [],
              rowsAffected: [],
            };
          }

          if (
            query.includes('FROM pm.PMTasks') &&
            query.includes("WHERE MaintenanceType = N'PM'") &&
            query.includes('SourceTaskId = @sourceTaskId')
          ) {
            return {
              recordset: replacementTaskId ? [{ TaskId: replacementTaskId }] : [],
              rowsAffected: [],
            };
          }

          if (
            query.includes('INSERT INTO pm.PMTasks (') &&
            query.includes("N'PM-RWK-'")
          ) {
            replacementTaskId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
            return { recordset: [{ TaskId: replacementTaskId }], rowsAffected: [1] };
          }

          if (
            query.includes('INSERT INTO pm.PMTasks (') &&
            query.includes("N'WO-'")
          ) {
            if (query.includes('RecurringFromTaskId')) {
              recurringWorkOrderId = fixtureRecurringWorkOrderId;
              return { recordset: [{ TaskId: recurringWorkOrderId }], rowsAffected: [1] };
            }
            existingFindingWorkOrderId = fixtureWorkOrderId;
            return { recordset: [{ TaskId: fixtureWorkOrderId }], rowsAffected: [1] };
          }

          if (
            query.includes('SELECT TOP (1)') &&
            query.includes('TaskId, AssetId, FacilityId, TemplateId, Symptom, ImpactLevel, FailureCategory, FailureCode, Status') &&
            query.includes("WHERE TaskId = @taskId AND MaintenanceType = N'CM'")
          ) {
            return {
              recordset: [
                {
                  TaskId: fixtureTaskId,
                  AssetId: fixtureAssetId,
                  FacilityId: null,
                  TemplateId: fixtureTemplateId,
                  Symptom: 'Fixture corrective symptom',
                  ImpactLevel: 'high',
                  FailureCategory: 'Mechanical',
                  FailureCode: 'MC-01',
                  Status: taskStatus,
                },
              ],
              rowsAffected: [],
            };
          }

          if (
            query.includes('SELECT TOP (1)') &&
            query.includes('FROM pm.PMTasks') &&
            query.includes('WHERE t.TaskId = @taskId') === false &&
            query.includes('WHERE TaskId = @taskId') &&
            query.includes('Status')
          ) {
            return { recordset: [{ Status: taskStatus, MaintenanceType: maintenanceType }], rowsAffected: [] };
          }

          if (
            query.includes("UPDATE pm.PMTasks") &&
            query.includes("Status = N'pending_review'") &&
            query.includes('TechnicianCompletedAt = @completedAt')
          ) {
            taskStatus = 'pending_review';
            technicianCompletedByUserId = inputs.completedByUserId ?? fixtureUserId;
            return { recordset: [], rowsAffected: [1] };
          }

          if (
            query.includes('UPDATE pm.PMTasks') &&
            query.includes('SET DowntimeEndedAt = @endedAt') &&
            query.includes("MaintenanceType = N'CM'")
          ) {
            return { recordset: [], rowsAffected: [1] };
          }

          if (
            query.includes('UPDATE pm.PMTasks') &&
            query.includes('DowntimeStartedAt = COALESCE(DowntimeStartedAt, @startedAt)') &&
            query.includes("Status = CASE WHEN Status IN (N'pending_review', N'paused') THEN N'open' ELSE Status END")
          ) {
            if (taskStatus === 'pending_review' || taskStatus === 'paused') taskStatus = 'open';
            return { recordset: [], rowsAffected: [1] };
          }

          if (
            query.includes('UPDATE pm.CMDowntimeIntervals') &&
            query.includes('WHERE CMDowntimeIntervalId = @intervalId')
          ) {
            const interval = cmDowntimeIntervals.find(item => item.CMDowntimeIntervalId === inputs.intervalId);
            if (interval && interval.EndedAt === null) {
              interval.EndedAt = inputs.endedAt ?? new Date('2026-09-16T09:30:00Z');
              interval.EndedByUserId = inputs.endedByUserId ?? fixtureUserId;
              interval.EndReason = inputs.endReason ?? null;
              return { recordset: [], rowsAffected: [1] };
            }
            return { recordset: [], rowsAffected: [0] };
          }

          if (
            query.includes('INSERT INTO pm.CMDowntimeIntervals') &&
            query.includes('StartedReason')
          ) {
            cmDowntimeIntervals.push({
              CMDowntimeIntervalId: `cm-interval-${cmDowntimeIntervals.length + 1}`,
              StartedAt: inputs.startedAt ?? new Date('2026-09-16T07:30:00Z'),
              StartedByUserId: inputs.startedByUserId ?? fixtureUserId,
              StartedReason: inputs.startedReason ?? null,
              EndedAt: null,
              EndedByUserId: null,
              EndReason: null,
            });
            return { recordset: [], rowsAffected: [1] };
          }

          if (query.includes('INSERT INTO pm.CMTaskEvents')) {
            cmEventLog.push({
              TaskId: inputs.taskId,
              EventType: inputs.eventType,
              OccurredAt: inputs.occurredAt,
              ActorUserId: inputs.actorUserId,
              Reason: inputs.reason ?? null,
              Notes: inputs.notes ?? null,
              MetadataJson: inputs.metadataJson ?? null,
            });
            return { recordset: [], rowsAffected: [1] };
          }

          if (query.includes('FROM pm.NotificationRules')) {
            return { recordset: [], rowsAffected: [] };
          }

          if (query.includes('FROM pm.PMOccurrenceResolutions')) return { recordset: occurrenceResolved ? [{ OriginalTaskId: fixtureTaskId }] : [], rowsAffected: [] };
          throw new Error(`Unexpected fixture query: ${query}`);
        },
      };
    },
  };

  const cache = new Map();
  const sql = createSqlStub(txEvents);

  function load(filename) {
    const abs = path.resolve(root, filename);
    if (abs.replaceAll('\\', '/').endsWith('/config/env.ts')) {
      return {
        env: {
          JWT_SECRET: 'tc01-isolated-test-secret-only',
          JWT_EXPIRES_IN: '1h',
          PM_NOW_IDEMPOTENCY_WINDOW_MINUTES: 15,
          EVIDENCE_STORAGE_ROOT: null,
        },
      };
    }
    if (abs.replaceAll('\\', '/').endsWith('/db/mssql.ts')) {
      return { getDb: async () => db };
    }
    if (abs.replaceAll('\\', '/').endsWith('/jobs/index.ts')) {
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
  const { workOrdersRouter } = load('backend/src/routes/workOrders.ts');
  const { signAccessToken } = load('backend/src/auth/jwt.ts');
  const express = require('express');
  const app = express();
  app.use(express.json());
  app.use('/api/tasks', tasksRouter);
  app.use('/api/work-orders', workOrdersRouter);

  return {
    app,
    calls,
    txEvents,
    getState() {
      return {
        taskWorkSessions: taskWorkSessions.map(session => ({ ...session })),
        existingFindingWorkOrderId,
        replacementTaskId,
        approvalStatus,
        taskStatus,
        technicianCompletedByUserId,
        contextKind,
        nextPlannedPmDueAt,
        nextPmDueAt,
        lastPmCompletedAt,
        scheduleAnchorWrites: scheduleAnchorWrites.map(write => ({ ...write })),
        cmDowntimeIntervals: cmDowntimeIntervals.map(interval => ({ ...interval })),
        cmEventLog: cmEventLog.map(event => ({ ...event })),
        recurringWorkOrderId,
      };
    },
    token: roles => signAccessToken({ sub: fixtureUserId, username: 'fixture', roles }),
    tokenFor: (sub, roles) => signAccessToken({ sub, username: sub === fixtureSecondUserId ? 'fixture-2' : 'fixture', roles }),
    reset(options = {}) {
      calls.length = 0;
      txEvents.length = 0;
      persistedRoles = options.persistedRoles ?? [];
      occurrenceResolved = options.occurrenceResolved ?? false;
      templateItems = (options.templateItems ?? defaultTemplateItems).map(item => ({ ...item }));
      snapshotItems = (options.snapshotItems ?? []).map(item => ({ ...item }));
      checklistEvidenceIds = [...(options.checklistEvidenceIds ?? [])];
      checklistEvidenceRecords = (options.checklistEvidenceRecords ?? []).map(record => ({ ...record }));
      checklistResults = (options.checklistResults ?? []).map(record => ({ ...record }));
      approvalStatus = options.approvalStatus ?? 'None';
      failMergeForItemId = options.failMergeForItemId ?? null;
      taskStatus = options.taskStatus ?? 'in_progress';
      rejectStartUpdate = options.rejectStartUpdate ?? false;
      maintenanceType = options.maintenanceType ?? 'PM';
      assignedToUserId = Object.prototype.hasOwnProperty.call(options, 'assignedToUserId')
        ? options.assignedToUserId ?? null
        : fixtureUserId;
      assignedToRoleId = Object.prototype.hasOwnProperty.call(options, 'assignedToRoleId')
        ? options.assignedToRoleId ?? null
        : null;
      assignedToRoleName = Object.prototype.hasOwnProperty.call(options, 'assignedToRoleName')
        ? options.assignedToRoleName ?? null
        : null;
      assetOperationalStatus = options.assetOperationalStatus ?? 'operational';
      pmEnabled = options.pmEnabled ?? true;
      templateIsActive = options.templateIsActive ?? true;
      pmNowExistingTaskId = options.pmNowExistingTaskId ?? null;
      taskWorkSessions = (options.taskWorkSessions ?? []).map(session => ({ ...session }));
      existingFindingWorkOrderId = options.existingFindingWorkOrderId ?? null;
      replacementTaskId = options.replacementTaskId ?? null;
      technicianCompletedByUserId = Object.prototype.hasOwnProperty.call(options, 'technicianCompletedByUserId')
        ? options.technicianCompletedByUserId ?? null
        : null;
      cmDowntimeIntervals = (options.cmDowntimeIntervals ?? []).map((interval, index) => ({
        CMDowntimeIntervalId: interval.CMDowntimeIntervalId ?? `cm-interval-${index + 1}`,
        StartedAt: interval.StartedAt ?? new Date('2026-09-16T07:30:00Z'),
        StartedByUserId: interval.StartedByUserId ?? fixtureUserId,
        StartedReason: interval.StartedReason ?? null,
        EndedAt: interval.EndedAt ?? null,
        EndedByUserId: interval.EndedByUserId ?? null,
        EndReason: interval.EndReason ?? null,
      }));
      cmEventLog = (options.cmEventLog ?? []).map(event => ({ ...event }));
      recurringWorkOrderId = options.recurringWorkOrderId ?? null;
      recurringFromTaskId = options.recurringFromTaskId ?? null;
      contextKind = options.contextKind ?? 'asset';
      nextPlannedPmDueAt = options.nextPlannedPmDueAt ?? new Date('2026-09-16T08:00:00Z');
      nextPmDueAt = options.nextPmDueAt ?? new Date('2026-09-16T08:00:00Z');
      lastPmCompletedAt = options.lastPmCompletedAt ?? null;
      blackoutEnd = options.blackoutEnd ?? null;
      scheduleAnchorWrites = (options.scheduleAnchorWrites ?? []).map(write => ({ ...write }));
    },
  };
}
