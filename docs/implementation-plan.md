# Preventive Maintenance System Implementation Plan

## Goal
Deliver a production-ready PM system with standardized templates, automated scheduling, task execution tracking, reporting/audit evidence, and Snipe-IT asset synchronization across web and background jobs.

## Scope of This Plan
- PM data platform on SQL Server (`pm` schema)
- Backend services (Node.js + Express REST API + background jobs)
- Web UI (Vite + React + shadcn-ui) integration
- Integrations (Snipe-IT, evidence storage, notifications)
- Operational concerns (audit, permissions, reporting, observability)

## Current State
- SQL Server `pm` schema and baseline tables are implemented in `db/schema.sql` and verified with `npm run db:verify`.
- Backend API (Node.js + Express, TypeScript) exists under `backend/` with modules for auth, users/roles, assets, facilities, templates, tasks, scheduling, notifications, and system settings.
- Background job runner (`backend/src/jobs`) implements Snipe-IT sync, schedule calculation, reminder/escalation, and evidence import jobs, writing outcomes to `pm.SystemLog` and `pm.SnipeSyncRuns`.
- Web UI is implemented with route-level pages under `src/pages` and uses a centralized API client + React Query instead of mocked data.
- Evidence storage and Microsoft Graph/email notifications are configurable via environment variables and Settings pages.
- Local development commands exist for applying and verifying schema, running backend + frontend, and exposing the API via ngrok for mobile clients.

## Phase 0 — Database Foundation
### Status
- Implemented: `pm` schema, baseline tables, idempotent schema script, and schema verification.

### Deliverables (ongoing)
- Maintain and evolve the dedicated SQL Server schema `pm` with tables for:
  - Roles, users, credentials, and user-role mappings
  - Asset categories, locations, assets, facilities, and PM settings
  - Templates and checklist items
  - Scheduling rules, blackout windows, schedules, and tasks
  - Checklist results and evidence metadata
  - Notifications (channels, rules, delivery log)
  - Audit and system logs, sync runs, and system/settings tables
- Keep `db/schema.sql` as the idempotent source of truth, updated for every structural change.
- Use `npm run db:apply-schema` and `npm run db:verify` to apply and validate schema in all environments.

### Acceptance Criteria
- Schema can be applied and verified on a clean database using the provided scripts.
- Core entities have primary keys, foreign keys, and indexes aligned to key queries (assets, tasks, schedules, notifications, logs).
- No secrets are stored in source control; all connection details come from environment variables.

## Phase 1 — Backend API (Node.js + Express)
### Status
- Implemented baseline API in `backend/` with modules for auth, assets, facilities, templates, tasks, scheduling, notifications, reports, and settings.

### API Modules
- AuthN/AuthZ: session/JWT-backed auth, role-based access control, local superadmin creation, optional LDAP integration.
- Assets & Facilities: read from Snipe-IT–backed `pm.Assets`/`pm.Facilities`, PM enable toggle, default template assignment, "PM Now" endpoints.
- Templates: CRUD templates and checklist items, including item-level requirements (notes/pass/fail/attachments).
- Scheduling: rule management (`pm.AssignmentRules`), blackout windows (`pm.BlackoutWindows`), schedule recalculation endpoints, calendar/day views, and upcoming schedule projections.
- Tasks: list/detail, assignment/reassign to user or role, lifecycle actions (start, pause, cancel, complete, reopen), evidence upload metadata.
- Reports: dashboard overview and compliance/overdue reports feeding the Reports page.
- Notifications: configure channels and rules, drive reminder/escalation flow used by the job runner.

### Data Access
- Use the `mssql` driver and a focused data-access layer instead of a full ORM, with SQL encoded in `db/schema.sql` and backend query modules.
- Evolve schema and queries together; keep `db/schema.sql` as the single source of truth for migrations.

### Acceptance Criteria
- All UI routes rely on the backend API (no mocked data).
- API surface is documented via OpenAPI/Swagger and remains stable for external/mobile clients.
- Validation and error responses are consistent and helpful for consumers.

## Phase 2 — Job Scheduler & Snipe-IT Sync
### Status
- Implemented job runner in `backend/src/jobs` and wired to environment-driven scheduling.

### Jobs
- Snipe-IT sync: synchronize categories, locations, assets; store last sync metadata and configuration in `pm.SnipeItSettings` and `pm.SnipeSyncRuns`.
- Schedule calculation: generate and update upcoming tasks based on templates, rules, and blackout windows.
- Reminder/escalation: send notifications based on due dates, assignment, and notification rules.
- Evidence import: ingest evidence from shared storage into the evidence store.

### Observability
- Write job outcomes and failures into `pm.SystemLog` and `pm.SnipeSyncRuns` with enough context for troubleshooting.
- Expose high-level job status and last-run details through the System/Settings APIs.

### Acceptance Criteria
- Jobs can be run on schedule and on-demand without overlapping executions.
- Failures are logged with enough context to trace and remediate.
- Snipe-IT sync and schedule calculation keep assets and PM tasks in sync without manual data entry.

## Phase 3 — UI Integration (Web)
### Status
- Implemented Vite + React + shadcn-ui SPA under `src/pages` backed by the API client and React Query.

### Client Architecture
- Use a centralized API client (`src/lib/api.ts`) and React Query for data fetching, caching, and mutations.
- Keep the Dashboard primarily read-only and optimized for quick scanning of compliance, upcoming, due-today, and overdue counts.

### Mapping to Routes
- Dashboard: overview metrics and compliance trend charts sourced from backend reports.
- Assets & Asset Detail: list/detail views with filters, PM enable toggle, template assignment, history, and "PM Now" actions.
- Facilities & Facility Detail: manage non-asset areas, PM enablement, default templates, and facility-level PM Now.
- Templates: list, create, and edit templates and checklist items wired to template endpoints.
- Scheduling: rule CRUD, blackout windows, calendar view, schedule recalc, and bulk assignment of unassigned tasks.
- Tasks: list/detail with checklist submission, evidence upload, and assignment/reassignment actions.
- Reports: compliance, overdue, system log, and assets-without-PM reports with filters and CSV exports.
- Notifications & Settings: configure notification channels, rules, Snipe-IT settings, and evidence storage paths.

### Acceptance Criteria
- All critical workflows (enable PM, schedule, execute tasks, upload evidence, review compliance) are fully executable end-to-end from the web UI.
- Loading, error, and empty states are handled consistently and accessibly.
- UI remains responsive and usable across desktop and mobile breakpoints.

## Phase 4 — Security, Audit, and Compliance
### Status
- Roles, users, and audit/system log tables exist; core permissions and audit flows are in place.

### Focus Areas
- Enforce role permissions for supervisor-only actions (e.g., assignment changes, force complete, cancel) across all routes and actions.
- Ensure immutable audit events are written for sensitive actions, including task assignment changes, force complete, cancel, PM Now invocations, and schedule recalculation.
- Confirm all user- and time-related data is stored in UTC at the DB level and presented in local time in the UI.
- Harden authentication flows (session/jwt lifetime, logout, lockout) and protect all APIs with proper authorization checks.

### Acceptance Criteria
- Permission model is documented and enforced consistently in backend and frontend.
- Every sensitive action leaves a traceable audit trail in `pm.AuditLog` and/or `pm.SystemLog`.
- Timezone handling is verified for reports, schedules, and job-driven notifications.

## Phase 5 — Deployment & Operations
### Focus Areas
- Define environment-specific configuration (dev/staging/prod) via environment variables and `.env` templates.
- Use Docker images and docker-compose to run backend and its dependencies in a reproducible way.
- Ensure CI (or equivalent automation) runs lint, typecheck, and schema verification on every change.
- Document the minimal runbook for applying `db/schema.sql` during deployments and verifying `pm` schema health.

### Acceptance Criteria
- A new environment can be provisioned with documented steps: configure env vars, apply schema, deploy backend and web, verify health.
- CI or deployment pipeline blocks builds when lint, typecheck, or schema verification fails.
- Operations and support teams have enough documentation to troubleshoot common issues (job failures, sync problems, evidence storage, notification delivery).

## Phase 6  Corrective Maintenance (CM / Work Orders)

### Goal
- Introduce a first-class Corrective Maintenance capability for reactive work orders, reusing the existing task, evidence, and audit infrastructure while clearly separating preventive vs corrective flows.

### Scope
- Extend the `pm.PMTasks` schema to support CM-specific fields (maintenance type, symptom, failure metadata, downtime, reporter).
- Add backend endpoints for creating, listing, and managing Work Orders as a dedicated CM surface.
- Integrate Work Orders into the web UI (asset/facility entry points, list and detail views, lifecycle actions, evidence and audit).
- Prepare the API to support future mobile app flows for reporting breakdowns and executing work orders in the field.

### High-Level UX Flows
- Asset/facility-level breakdown reporting:
  - From Asset Detail or Facility Detail, authorized users click "Report Breakdown".
  - A dialog collects symptom, impact level, failure category/code, and optional downtime start.
  - Submitting creates a new CM work order and navigates to its detail view.
- Work Orders workspace:
  - Dedicated Work Orders page lists open/in-progress/completed CM tasks with filters for asset, location, category, status, impact, and dates.
  - Supervisors and technicians can assign/reassign work orders, update status, add evidence, and close downtime.
- Task detail reuse:
  - CM Work Order detail reuses the existing Task Detail UX (status transitions, checklist, evidence) with an added Corrective Maintenance panel (symptom, failure metadata, impact, reported by/at, downtime).

### Backend Design
- Schema extensions (in `db/schema.sql`):
  - Add `MaintenanceType` to `pm.PMTasks` with allowed values `PM` and `CM` and default `PM`.
  - Add CM metadata columns to `pm.PMTasks`:
    - `ReportedByUserId`, `ReportedAt`, `ReportedChannel`.
    - `Symptom`, `FailureCategory`, `FailureCode`, `ImpactLevel`.
    - `DowntimeStartedAt`, `DowntimeEndedAt`.
  - Preserve existing PM semantics; PM tasks continue to work with `MaintenanceType = 'PM'` and null CM fields.
- Service and API surface:
  - Implement a work-order-focused service that operates on `pm.PMTasks` rows with `MaintenanceType = 'CM'`.
  - Add REST endpoints under `/api/work-orders` for:
    - Create Work Order (asset/facility, symptom, impact, optional template and downtime).
    - List Work Orders with filters (status, asset/facility, location, category, impact, reported/completed dates).
    - Get Work Order detail including CM metadata, checklist, evidence, and audit.
    - Lifecycle actions (assign/reassign, start, pause, complete, cancel, close downtime).
  - Enforce that CM endpoints can only operate on `MaintenanceType = 'CM'` tasks and respect existing auth/role rules.

### Web UI Design (Vite + React + shadcn-ui)
- Entry points:
  - Asset Detail: add a "Report Breakdown" button opening a Shadcn dialog to create a CM work order for that asset.
  - Facility Detail: add a similar "Report Breakdown" entry for facility-level issues.
- Work Orders page:
  - New route under `src/pages` dedicated to Work Orders, using the same layout and patterns as PM Tasks.
  - Top-level filters for status, impact, location, category, asset/facility, and reported date range.
  - List rows show work-order number, status, priority, impact badge, asset/facility name, location, symptom snippet, reported by/at, and current assignee.
- Work Order detail view:
  - Reuse the Task Detail component patterns for status transitions, assignments, checklist, and evidence.
  - Add a Corrective Maintenance summary panel showing:
    - Symptom and failure metadata.
    - Impact level.
    - Reported by/at and channel.
    - Downtime start/end and computed duration where applicable.

### Reporting and Analytics
- Extend backend reports to include CM perspectives:
  - Breakdown counts by asset category, location, and failure category.
  - Time-based CM metrics (e.g., incidents per month, MTTR per category/location).
  - Combined asset history views that show both PM and CM events for a given asset or facility.
- Update the Reports page to add CM-focused widgets and filters once the backend reports are available.

### Future Mobile Integration (Optional)
- Design the `/api/work-orders` endpoints to be mobile-friendly:
  - Simple JSON payloads for creating work orders from mobile clients.
  - Detail responses that include all data needed for offline-friendly execution (task fields, checklist items, evidence upload URLs).
- When a mobile app is introduced, reuse these endpoints to:
  - Report breakdowns directly from the field.
  - Execute work orders with checklist completion and photo evidence.

### Acceptance Criteria
- Schema
  - `pm.PMTasks` gains `MaintenanceType` and CM-specific fields without breaking existing PM behavior.
  - Schema changes are captured in `db/schema.sql` and validated via `npm run db:verify`.
- Backend
  - `/api/work-orders` supports create, list, detail, and lifecycle operations for CM tasks only.
  - Auth and role checks mirror existing task APIs, with supervisor-only actions for sensitive transitions.
- Web UI
  - Users can report breakdowns from Asset Detail and Facility Detail and see them immediately in the Work Orders view.
  - Work Orders page allows filtering, assignment, and full lifecycle management of CM tasks.
  - CM detail view shows corrective metadata, checklist, and evidence in an audit-ready format.
- Operations
  - CM tasks participate in existing logging and audit flows (system log, audit log) for key actions.
  - Reports can distinguish PM vs CM and expose at least basic CM trend metrics (counts and MTTR by category/location).
