# Database Schema Specification

## Authority and Conventions

`db/schema.sql` is the executable schema authority. This document explains the model and invariants; it does not replace the SQL.

- Database engine: Microsoft SQL Server.
- Application schema: `pm`.
- Primary identifiers: `uniqueidentifier`, generally generated with `NEWSEQUENTIALID()`.
- Dates: stored as SQL date/time types and exposed as ISO-8601 values.
- Deletion: operational/master records generally use active/archive flags; evidence and selected configuration records support physical deletion.

## Identity and Access

| Table | Purpose | Key relationships/invariants |
| --- | --- | --- |
| `pm.Roles` | Named roles | Unique `Name` |
| `pm.Users` | LDAP/local user identity and profile | Unique `Username`; active flag |
| `pm.UserRoles` | Many-to-many role grants | FK to Users and Roles |
| `pm.UserCredentials` | Local password hashes | FK to Users; never expose hashes |

## Maintenance Subjects

| Table | Purpose | Key relationships/invariants |
| --- | --- | --- |
| `pm.AssetCategories` | Asset classification | Unique name |
| `pm.Locations` | Shared location lookup | Unique name |
| `pm.Assets` | Snipe-synchronized asset record | Unique `SnipeAssetId`; category/location FKs; archive and operational state; image metadata/binary |
| `pm.Facilities` | Locally managed maintainable facility | Location FK; active flag |
| `pm.AssetPMSettings` | Asset PM enablement/default/next due | One row per asset |
| `pm.FacilityPMSettings` | Facility PM enablement/default/next due | Facility and template FKs |

An operational task must reference exactly one asset or one facility.

## Templates and Scheduling

| Table | Purpose | Key relationships/invariants |
| --- | --- | --- |
| `pm.PMTemplates` | Reusable PM/CM checklist definition | Unique name; optional category/role FKs; duration and recurrence settings |
| `pm.PMTemplateChecklistItems` | Ordered template work items | Template FK; mandatory/skip/attachment controls |
| `pm.AssignmentRules` | Automatic user/role assignment | Optional category/location conditions and user/role targets |
| `pm.BlackoutWindows` | Scheduling exclusion ranges | Start/end and active state |
| `pm.PMSchedules` | Asset schedule state | Asset/template FKs; frequency, next due, frozen state |
| `pm.FacilityPMSchedules` | Facility schedule state | Facility/template FKs; frequency, next due, frozen state |

## Work Execution

`pm.PMTasks` stores both PM and CM work. Important field groups include:

- Identity: task ID and unique task number.
- Subject: exactly one asset or facility.
- Definition: template and maintenance type.
- Planning: scheduled due, assignment user/role, priority.
- Lifecycle: status, start/pause/complete/cancel timestamps and actors.
- Approval: submission, supervisor, superadmin, rejection, revision, and related remarks.
- CM: symptom, impact, failure category/code, reported metadata, downtime, and resolution.
- Backdating and audit support.

Idempotency:

- Unique filtered indexes prevent duplicate asset-template-due and facility-template-due PM work.
- API-level PM Now window adds a short-term duplicate guard.

Related execution tables:

| Table | Purpose |
| --- | --- |
| `pm.PMTaskChecklistResults` | Outcome, notes, and completion actor per checklist item |
| `pm.PMTaskEvidence` | Task-level evidence metadata |
| `pm.PMTaskChecklistEvidence` | Checklist-item evidence metadata |
| `pm.TaskDrafts` | Per-user draft checklist state with a unique task/item/user index |

## Notifications and Devices

| Table | Purpose |
| --- | --- |
| `pm.NotificationChannels` | Delivery channel configuration |
| `pm.NotificationRules` | Event/timing rule bound to a channel |
| `pm.NotificationLog` | Delivery attempt history |
| `pm.Devices` | User/platform push tokens; token+platform unique |
| `pm.AppInstallations` | Reported client installation/version inventory |

## Audit, Operations, and Integrations

| Table | Purpose |
| --- | --- |
| `pm.AuditLog` | Actor/entity/action audit records |
| `pm.SystemLog` | Application/job operational logs |
| `pm.SnipeSyncRuns` | Asset sync execution summary |
| `pm.SystemSettings` | General key/value application settings |
| `pm.SnipeItSettings` | Snipe-IT URL/sync configuration |
| `pm.MicrosoftGraphSettings` | Email integration settings |
| `pm.SchemaInfo` | Schema metadata/version information |

WhatsApp and several UI/PM Now settings are persisted in general system settings rather than dedicated tables.

## Core Invariants

1. A task has one and only one maintenance subject.
2. A synchronized asset is archived, not deleted, when absent upstream.
3. New PM work is unique for subject/template/due combination.
4. Frozen schedules and non-operational assets do not generate new projected work.
5. Checklist results reference both the task and source template item.
6. Required evidence is validated before completion.
7. Approval transitions preserve reviewer, timestamp, and reason/remarks.
8. Local password material is one-way hashed.
9. Stored file paths must resolve beneath the configured evidence root.

## Schema Change Procedure

1. Add an idempotent change to `db/schema.sql`.
2. Preserve data or document an approved migration.
3. Add/adjust keys, constraints, and indexes.
4. Update this specification and affected functional/API docs.
5. Run `npm run db:apply-schema` against a safe target.
6. Run `npm run db:verify-schema`.
7. Record invariant queries and results in the active roadmap checklist.

## Known Gaps

- The SQL script contains cumulative additive migration logic rather than a numbered migration history.
- No automated disposable SQL Server integration-test harness is currently tracked.
- Restore behavior across SQL metadata and evidence filesystem needs a tested consistency procedure.
- Exact status/approval constraints are primarily API-enforced and should gain database or automated state-machine verification where appropriate.
