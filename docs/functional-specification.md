# Functional Specification

## Product Surfaces

- **Web operations application:** planning, administration, execution, approval, reporting, and configuration.
- **PM Tech mobile application:** field execution, schedules, assets/facilities, CM reporting, offline queue, push, biometric entry, and Android updates.
- **REST API:** shared business rules and integration boundary.
- **Scheduled workers:** Snipe-IT sync, schedule calculation, reminders/notifications, and evidence import.

## Roles

| Capability | Technician | Supervisor | Admin | Superadmin |
| --- | ---: | ---: | ---: | ---: |
| View operational records | Yes | Yes | Yes | Yes |
| Execute permitted assigned work | Yes | Yes | Yes | Yes |
| Assign/reassign and PM Now | No | Yes | Yes | Yes |
| Review supervisor approval stage | No | Yes | According to route policy | Yes |
| Final PM approval | No | No | No | Yes |
| Manage general system/users | No | Limited | Yes | Yes |
| Delete protected records / highest-impact policy | No | No | No | Yes |

Route-level middleware is authoritative where this matrix is intentionally broad.

## Authentication and Session

1. User submits identifier, password, and `ldap` or `local` provider.
2. API verifies identity and loads roles from SQL Server.
3. API returns access and refresh JWTs.
4. Clients attach a Bearer access token.
5. On `401`, clients may exchange a valid refresh token and retry once.
6. Role middleware may reload roles from the database before returning `403`.

## Asset Management

- List and filter assets by search, upstream status, operational status, PM state, category, and location.
- Read asset detail, PM settings, maintenance history, assignment/responsibility, and image.
- Managers can enable/disable PM, choose a default template, and update next due.
- Managers can apply PM enabled/template settings in bulk.
- Snipe-IT sync updates supported asset fields and binary image content.
- An upstream-deleted asset is archived locally to preserve history.
- Operational states are `operational`, `broken`, and `archived`.

## Facility Management

- List, create, view, update, and clone facilities.
- Facilities may reference a location and have independent PM settings.
- Managers can trigger immediate facility PM work.
- Inactive facilities remain historical records.

## Templates and Checklists

- Managers create, update, and delete PM templates.
- Templates define category applicability, required role, estimated duration, recurrence defaults, and ordered checklist items.
- Checklist items can be mandatory, permit skipping, enable attachment, and require attachment.
- Completion validates current template rules on the server.

## PM Scheduling

- Assignment rules map category/location conditions to a user or role.
- Blackout windows exclude configured date ranges.
- Asset and facility schedules track template, frequency, next due, and frozen state.
- Schedule calculation generates work within a configurable horizon.
- Broken/archived assets and frozen schedules do not generate or project new work.
- Calendar and day views include existing work, projections, estimated minutes, and capacity summaries.
- PM Now creates immediate work subject to server idempotency rules.

## PM Task Lifecycle

Expected operational states include Upcoming, In Progress, Paused, Completed, and Cancelled, with overdue/due-today often derived from dates rather than persisted as independent lifecycle states.

1. A task is generated or created using PM Now.
2. A manager assigns it, or an assignment rule supplies responsibility.
3. Authorized user starts, pauses/resumes, or cancels it.
4. Draft checklist data may be saved.
5. Completion validates outcomes, mandatory notes, and required evidence.
6. Supervisors may backdate completion with reason where permitted.
7. Completed work can enter approval.

## PM Approval

1. Technician submits completed work: `PendingSupervisor`.
2. Supervisor approves: `PendingSuperadmin`.
3. Superadmin approves: final approved state.
4. Authorized reviewers may reject with a reason.
5. Revision can add a correction note and optionally reopen for technician edits.
6. Approval trail and remarks history remain visible.

Exact persisted status strings and all transition guards must be regression-tested; see the open-questions document.

## Evidence

- Task-level and checklist-item evidence are supported.
- Files are written below `EVIDENCE_STORAGE_ROOT`; SQL stores metadata.
- Maximum request handling for evidence is currently implemented separately from the global 1 MB JSON parser.
- Evidence can be streamed/downloaded and deleted by authorized users.
- Non-superadmin evidence changes are restricted during approval stages.
- Import job can ingest legacy/shared files with skip or replace behavior.

## Corrective Maintenance Work Orders

- Users report a breakdown against exactly one asset or facility.
- Report captures symptom, impact (`normal`, `high`, `critical`), optional failure classification, channel, and optional downtime start.
- Work orders can be listed, filtered, assigned, started, paused, resumed, completed, cancelled, and have downtime closed.
- Managers can set assignment and priority (`low`, `medium`, `high`).
- Resolution data records outcome/notes for completed or cancelled work.
- CM reporting includes breakdown dimensions, monthly incident counts, and MTTR.

## Notifications and Devices

- Notification channels and rules are configurable.
- Notification attempts are recorded in a log.
- Authenticated devices can register Firebase tokens.
- Admin/Superadmin can send broadcast push notifications.
- Reminder/escalation work runs on a configurable interval.

## Reporting

- Overdue maintenance, compliance, system-log export, assets without PM, and CM metrics.
- Maintenance-type filters accept PM, CM, or combined mode where implemented.
- CSV exports are provided for operational reports.
- PM task detail can export PDF with execution and approval evidence.

## Administration and Operations

- View system status and logs.
- Manage PM Now defaults, UI settings, users/roles, LDAP assignment, Snipe-IT, Microsoft Graph, and WhatsApp configuration.
- Trigger supported jobs manually.
- Configure Android/iOS/web minimum-version policy and receive installation reports.
- Host/download signed APK updates through the configured store or proxy.

## Failure Behavior

- Invalid input returns `400` with a JSON message.
- Missing/invalid authentication returns `401`.
- Insufficient role or record access returns `403`.
- Missing records return `404`.
- Duplicate/idempotency conflicts should return `409`.
- Unexpected dependency/server failures return `500` and should generate system-log evidence without leaking secrets.
