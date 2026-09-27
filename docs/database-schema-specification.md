# Database Schema Specification

Last reviewed: 2026-09-10. Baseline: static inspection of [db/schema.sql](../db/schema.sql); no database connection was made for D0.

## Authority and evolution

This document owns the data-model explanation. The executable DDL is `db/schema.sql`; maintain both together. The script contains initial creation and subsequent conditional alterations, so reading only a `CREATE TABLE` block can give an incorrect final column definition. For example, `PMTasks.AssetId` is subsequently made nullable to support facilities.

The database engine is Microsoft SQL Server and the application schema is `pm`. Most entity identifiers use `uniqueidentifier`; maintenance timestamps use `datetime2`, commonly with `sysutcdatetime()` defaults. Applications must interpret stored timestamps consistently as UTC and present local time deliberately.

## Entity inventory

All names below belong to the `pm` schema. This inventory lists every `CREATE TABLE` entry in the current DDL; it does not replace column-level SQL definitions.

| Area | Tables | Responsibility |
| --- | --- | --- |
| Schema tracking | `SchemaInfo` | Applied schema metadata |
| Identity | `Roles`, `Users`, `UserRoles`, `UserCredentials` | User identity, role membership, and local credentials |
| Asset catalog | `AssetCategories`, `Locations`, `Assets` | Synchronized asset context, raw/normalized status, and image data |
| Facilities | `Facilities` | Locally managed non-asset maintenance contexts |
| PM defaults | `AssetPMSettings`, `FacilityPMSettings` | PM enabled state, default template, completion metadata, and durable planned/effective next-due anchors |
| Templates | `PMTemplates`, `PMTemplateChecklistItems` | Interval/category/role/duration and ordered checklist definitions |
| Planning | `AssignmentRules`, `BlackoutWindows`, `PMSchedules`, `FacilityPMSchedules` | Assignment selection, exclusions, recurring schedules, and freeze state |
| Execution | `PMTasks`, `TaskWorkSessions`, `CMDowntimeIntervals`, `CMTaskEvents`, `PMTaskChecklistResults`, `PMTaskChecklistSnapshots`, `TaskDrafts`, `PMMissedOccurrences`, `PMSkippedOccurrences` | Shared PM/CM work, additive PM active-time intervals, additive CM downtime/history intervals, submitted checklist results, frozen PM checklist definitions, user drafts, and recurrence history for missed/skipped planned occurrences |
| Evidence | `PMTaskEvidence`, `PMTaskChecklistEvidence` | Task/checklist attachment metadata and storage references |
| Notifications | `NotificationChannels`, `NotificationRules`, `NotificationLog` | Routing configuration, triggers, and delivery records |
| Audit/operations | `AuditLog`, `SystemLog`, `SnipeSyncRuns` | Action history, operational events, and sync runs |
| Settings | `SystemSettings`, `SnipeItSettings`, `MicrosoftGraphSettings` | Application and integration configuration |
| Mobile | `Devices`, `AppInstallations` | Push registration and installed application reporting |

## Relationships

```mermaid
erDiagram
  Assets ||--o{ PMTasks : asset_context
  Facilities ||--o{ PMTasks : facility_context
  PMTemplates ||--o{ PMTasks : defines_work
  PMTemplates ||--o{ PMTemplateChecklistItems : contains
  PMTasks ||--o{ PMTaskChecklistResults : records
  PMTasks ||--o{ PMTaskChecklistSnapshots : freezes
  PMTasks ||--o{ PMTaskEvidence : attaches
  PMTasks ||--o{ PMTaskChecklistEvidence : attaches
  PMTemplateChecklistItems ||--o{ PMTaskChecklistResults : answers
  PMTemplateChecklistItems ||--o{ PMTaskChecklistSnapshots : captured_from
  Users ||--o{ UserRoles : has
  Roles ||--o{ UserRoles : grants
```

The diagram is conceptual and omits many foreign keys. Each task has an asset **or** a facility, never both. The two diagram edges do not imply both contexts are populated.

## Task model and invariants

- `PMTasks` is the shared work entity; `MaintenanceType` is constrained to `PM` or `CM`. There is no separate top-level WorkOrders table.
- `TaskId` is the primary key; `TaskNumber` is unique.
- `CK_pm_PMTasks_AssetOrFacility` enforces exclusive context.
- Filtered unique indexes cover `(AssetId, TemplateId, ScheduledDueAt)` and `(FacilityId, TemplateId, ScheduledDueAt)` for non-null contexts. SC-01 also adds filtered unique indexes on `(AssetId, TemplateId, PlannedDueAt)` and `(FacilityId, TemplateId, PlannedDueAt)` so one planned PM occurrence cannot be represented by multiple open task rows for the same context/template.
- Lifecycle `Status` and `ApprovalStatus` have distinct meanings. Approval values include `None`, `PendingSupervisor`, `PendingSuperadmin`, `Approved`, and `Rejected`.
- Technician, supervisor, superadmin, rejection, completion, cancellation, and backdating fields preserve different events; do not collapse them into one timestamp.
- AF-01 uses the existing PM cancellation columns for system-driven broken-asset cancellation as well. In that path `CancelledByUserId` remains `NULL`, `CancelledReason` records the broken-asset reason, and attribution lives in `AuditLog`.
- CM fields include reported-by/at/channel, symptom, failure category/code, impact, and downtime boundaries. Check later alterations for resolution fields.
- Checklist outcomes are constrained to `0`, `1`, or `2`; evidence and draft tables are distinct from submitted results.
- `PMTaskChecklistSnapshots` is additive, keyed by task plus original `TemplateChecklistItemId`, and preserves sort order, text, requirement flags, active state, capture time, and source template version at the first successful technician submission. It does not replace submitted results/evidence rows; those continue to identify checklist items by `TemplateChecklistItemId`.
- SC-01 extends recurrence tracking with `AssetPMSettings.NextPlannedPMDueAt`, `FacilityPMSettings.NextPlannedPMDueAt`, `PMTasks.PlannedDueAt`, and `PMTasks.FulfilledPlannedDueAt`. `PlannedDueAt` identifies the schedule anchor for the task's occurrence; `ScheduledDueAt` remains the effective due after blackout adjustment; `FulfilledPlannedDueAt` records which planned occurrence was actually satisfied when the task completed or was approved.
- `PMMissedOccurrences` and `PMSkippedOccurrences` retain history for planned dates that were not performed or were intentionally skipped. They preserve the planned due, effective due, optional related task, and user/reason data for skips so reporting can distinguish overdue nonperformance from intentional omission.
- EX-01 adds `PMTasks.SourceTaskId` for linked replacement PM work and PM-finding-sourced CM work, plus `PMTasks.SourceTemplateChecklistItemId` for one-finding-to-one-CM-work-order traceability. Filtered unique indexes prevent multiple replacement PM tasks for the same rejected source task and multiple CM work orders for the same failed finding pair.
- CM-01 adds `PMTasks.RecurringFromTaskId` to link a post-closure recurrence back to the previous CM work order.
- `CMDowntimeIntervals` stores additive same-WO downtime intervals with one filtered open interval per task, supporting restoration-before-closure and repeated outages without counting operational gaps as downtime.
- `CMTaskEvents` stores additive CM history entries such as `reported`, `repair_submitted`, `returned_for_correction`, `verified_closed`, `restoration_recorded`, `downtime_reopened`, and `repeat_fault_linked`.
- `TaskWorkSessions` stores additive PM execution intervals with `StartedAt`, `StartedByUserId`, optional `EndedAt`, and optional `EndedByUserId`. A filtered unique index on `(TaskId)` where `EndedAt IS NULL` ensures at most one open session per task at a time.

## Schedule calculation

SC-01 persists a durable planned anchor alongside the effective due. `AssetPMSettings` and `FacilityPMSettings` now store both `NextPlannedPMDueAt` and blackout-adjusted `NextPMDueAt`, while `PMTasks` stores `PlannedDueAt` and `ScheduledDueAt`. Schedule readers and writers must preserve the distinction: planned recurrence advances from `PlannedDueAt`, while blackout only affects the effective execution date.

The legacy SQL primitive `pm.fn_CalculateNextDueAt` still exists for older paths, but the implemented SC-01 policy uses the persisted planned/effective anchors plus missed/skipped ledgers to avoid completion-date drift. See Q-04 and Q-18 for remaining reporting/compliance boundaries when interpreting this data.

## Storage and history

Asset image binaries can be stored in SQL alongside image metadata. Evidence files use filesystem/share storage with database metadata; backing up SQL alone does not preserve all evidence. PM checklist history now depends on both submitted results/evidence and the preserved snapshot rows. Archive behavior, permanent deletion, and reference protection vary by entity and endpoint. Preserve referential meaning when changing deletion behavior.

## Applying and validating changes

Run `npm run db:apply-schema` only against the intended database after reviewing the script and configuration. Run `npm run db:verify` afterward, but do not treat it as complete model validation: its hard-coded expected-table inventory omits some newer entities and does not prove all column/index/constraint semantics.

Required D2 checks: fresh database application, repeat application, expected columns/types/nullability, all foreign keys and filtered indexes, approval values, exclusive context, and duplicate rejection. Record the target environment and results. These database checks were not performed during documentation reconstruction.

## Confirmed CM event semantics — 2026-09-11

CM-01 now distinguishes equipment restoration (downtime end), technician repair-completion submission, and Supervisor/Admin/Superadmin verification/WO closure with additive event history rather than overloading one timestamp pair. Administrative waiting does not extend equipment downtime after restoration. Correction retains the same WO identity and previous work/evidence history, with an attributable mandatory return reason. Repair-performer and reviewer identities remain stored separately so self-verification can be rejected regardless of role.

Confirmed downtime-history requirement, 2026-09-11, now implemented locally by CM-01: preserve multiple outage intervals on the same WO when the same fault recurs before closure. Sum outage durations without counting operational gaps. Recurrence after closure creates a new linked WO; preserve previous WO and interval history. Restoration defaults to current time and supports actual past time with a mandatory reason and change history. Legacy data is backfilled additively from the original single downtime start/end pair into `CMDowntimeIntervals` and `CMTaskEvents`.
