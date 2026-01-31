# Corrective Maintenance (CM) / Work Orders Implementation Plan

## Goal
- Deliver a first-class Corrective Maintenance (CM) capability for reactive work orders, reusing the existing PM task, evidence, and audit infrastructure while clearly separating preventive vs corrective flows.

## Scope
- Database: extend `pm.PMTasks` to support CM-specific fields and semantics without breaking existing PM behavior.
- Backend: expose a dedicated Work Orders API surface for CM tasks.
- Web UI: add breakdown reporting from Asset/Facility Detail and a Work Orders workspace for managing CM.
- Reporting: enable basic CM analytics (counts, trends, MTTR) alongside existing PM reports.
- Mobile readiness: design APIs and flows that can be consumed by a future mobile app.

---

## Phase 0 — CM Concept and Domain Alignment

### Objective
- Align CM concepts with the existing PM task model and decide how Work Orders map to `pm.PMTasks`.

### Decision Record
- CM will use `pm.PMTasks` as the underlying entity for both preventive and corrective tasks.
- A new `MaintenanceType` field on `pm.PMTasks` will distinguish `PM` (preventive) from `CM` (corrective/work order).
- No new top-level CM/WorkOrders table will be introduced; this keeps queries, reports, and integrations centered on a single task entity.

### CM Vocabulary
- Work Order (CM task): a reactive maintenance task created in response to a breakdown or issue, modeled as a `pm.PMTasks` row with `MaintenanceType = 'CM'`.
- PM task: a scheduled preventive maintenance task, modeled as a `pm.PMTasks` row with `MaintenanceType = 'PM'` (default for existing rows).
- Symptom: free-text description of the observed issue; stored on the CM task and shown prominently in the Work Order detail view.
- Failure category: short label describing the type of failure (for example, hardware, network, power); used for grouping and reporting.
- Failure code: optional structured code (for example, PSU_FAIL) for standardized failure taxonomies; treated as an optional string in the first iteration.
- Impact level: qualitative impact of the issue (for example, normal, high, critical); used for triage, prioritization, and reporting.
- Downtime: time window during which the asset or facility is considered unavailable due to the issue; represented via `DowntimeStartedAt` and `DowntimeEndedAt` on the CM task.
- Reported by/at: user and timestamp indicating who reported the issue and when; mapped to `ReportedByUserId`, `ReportedAt`, and optional `ReportedChannel`.

### Concept Mapping to Existing Entities
- Asset and facility:
  - CM Work Orders always relate to either an asset (`AssetId`) or a facility (`FacilityId`), using the existing check constraint that enforces exactly one of these per task.
- Assignment and responsibility:
  - Responsibility for executing a Work Order is tracked via existing `AssignedToUserId` and `AssignedToRoleId` fields on `pm.PMTasks`.
- Checklist and evidence:
  - Execution details and proof are handled via the existing PM checklist and evidence model, so CM tasks can use the same UI and storage for steps and attachments.
- Audit and system behavior:
  - Sensitive CM actions (create, assign, cancel, close downtime, complete) are logged through the existing `pm.AuditLog` and `pm.SystemLog` mechanisms.

### Acceptance Criteria
- CM terminology and data responsibilities are documented and agreed, including clear definitions for Work Order, Symptom, Failure Category/Code, Impact Level, Downtime, and Reported By/At.
- It is explicitly agreed that no new top-level Work Orders table will be created and that CM will extend `pm.PMTasks` via `MaintenanceType` and additional CM fields.

---

## Phase 1 — Schema Extensions for CM

### Objective
- Extend the `pm.PMTasks` table to represent both preventive and corrective maintenance tasks with CM-specific metadata.

### Deliverables
- Schema changes in `db/schema.sql`:
  - Add `MaintenanceType nvarchar(8) NOT NULL` with default `PM` and constraint limiting values to `PM` or `CM`.
  - Add CM metadata columns to `pm.PMTasks`:
    - `ReportedByUserId uniqueidentifier NULL` (FK to `pm.Users`).
    - `ReportedAt datetime2(0) NULL`.
    - `ReportedChannel nvarchar(32) NULL`.
    - `Symptom nvarchar(1024) NULL`.
    - `FailureCategory nvarchar(64) NULL`.
    - `FailureCode nvarchar(64) NULL`.
    - `ImpactLevel nvarchar(32) NULL`.
    - `DowntimeStartedAt datetime2(0) NULL`.
    - `DowntimeEndedAt datetime2(0) NULL`.
- Backfill strategy for existing rows:
  - Set `MaintenanceType = 'PM'` for all existing tasks.
  - Leave CM-specific columns null for PM tasks.
- Indexing review:
  - Confirm existing task indexes remain optimal.
  - Add indexes for CM reporting if needed (e.g., `MaintenanceType, ImpactLevel`, `MaintenanceType, FailureCategory`).

### Acceptance Criteria
- `db/schema.sql` remains idempotent and can be applied safely to existing databases.
- `npm run db:apply-schema` and `npm run db:verify` succeed in dev/staging.
- All existing PM flows continue to operate unchanged with `MaintenanceType = 'PM'`.

---

## Phase 2 — Backend Work Orders API

### Objective
- Introduce a dedicated Work Orders API for CM while reusing existing task logic where possible.

### Deliverables
- Domain service layer:
  - Work Order service responsible for:
    - Creating CM tasks with `MaintenanceType = 'CM'`.
    - Validating asset/facility references.
    - Managing CM-specific lifecycle (downtime, impact, failure metadata).
    - Delegating assignment and status changes to the existing task engine.
- REST endpoints (examples):
  - `POST /api/work-orders`
    - Create CM work order for an asset or facility based on symptom, impact, and optional template/downtime.
  - `GET /api/work-orders`
    - List CM work orders with filters: status, assetId, facilityId, locationId, categoryId, impactLevel, reportedFrom/To, completedFrom/To.
  - `GET /api/work-orders/{id}`
    - Retrieve full CM task details including CM metadata, checklist, evidence, and audit summary.
  - `POST /api/work-orders/{id}/assign`
    - Assign or reassign work order to a user or role, reusing existing task assignment rules.
  - `POST /api/work-orders/{id}/start`
  - `POST /api/work-orders/{id}/pause`
  - `POST /api/work-orders/{id}/complete`
  - `POST /api/work-orders/{id}/cancel`
  - `POST /api/work-orders/{id}/close-downtime`
- Validation and auth:
  - Ensure only tasks with `MaintenanceType = 'CM'` are exposed via Work Orders endpoints.
  - Reuse existing auth/role model (e.g., supervisor-only for sensitive transitions).
- OpenAPI updates:
  - Add Work Orders schemas and endpoints to backend OpenAPI spec.

### Acceptance Criteria
- Work Orders endpoints operate exclusively on `MaintenanceType = 'CM'` tasks.
- Input validation returns clear, consistent error responses.
- Auth and permission checks match the existing PM task endpoints.
- OpenAPI documentation reflects the new Work Orders API.

---

## Phase 3 — Web UI: Entry Points and Work Orders List

### Objective
- Enable users to report breakdowns from Asset/Facility Detail and to manage CM work orders from a dedicated Work Orders page.

### Deliverables
- Asset Detail integration:
  - Add a "Report Breakdown" button to Asset Detail.
  - Implement a dialog to capture CM input:
    - Symptom (required text).
    - Impact level (normal/high/critical).
    - Failure category/code (optional).
    - Downtime started at (optional datetime).
  - On submit, call the Work Orders create API for the current asset and navigate to the Work Order detail view.
- Facility Detail integration:
  - Add a "Report Breakdown" button for facility-level issues.
  - Reuse the same dialog pattern, targeting facilityId instead of assetId.
- Work Orders page:
  - New route under `src/pages` dedicated to CM Work Orders.
  - Filters:
    - Status (open/in progress/completed/cancelled).
    - Impact level.
    - Location, category.
    - Asset/facility.
    - Reported date range.
  - List layout using shadcn-ui components and Tailwind grid:
    - Work order number, status, priority.
    - Impact badge.
    - Asset/facility name and location.
    - Symptom snippet.
    - Reported by/at.
    - Assigned to (user or role).
  - Row actions:
    - View details.
    - Assign/Reassign (for supervisors/managers).

### Acceptance Criteria
- Asset and Facility Detail pages can create CM work orders via the new dialog.
- Newly created CM work orders appear in the Work Orders list with correct filters applied.
- The Work Orders page is responsive and consistent with existing PM Tasks UI.
- Error and loading states for Work Orders are handled consistently with other pages.

---

## Phase 3.5  Web UI: Work Orders as Tickets (UX Refinement)

### Objective
- Evolve CM Work Orders into a clearer, ticket-like experience with explicit subject, impact, priority, assignment, and resolution fields, without breaking the existing PM/CM task model.

### Deliverables
- Ticket-style header and subject:
  - Introduce a Work Order "subject" concept used in list rows, detail headers, and notifications.
  - Initial implementation can compute subject in the web UI as:
    - `<AssetTag> <AssetName>  <SymptomSnippet>` when an asset is present.
    - `<FacilityName>  <SymptomSnippet>` for facility-only work orders.
  - Optionally add a `Subject` column to `pm.PMTasks` in a later phase; Phase 3.5 focuses on UI-level subject computation.
- Ticket field grouping in Work Order detail:
  - Group `Status`, `ImpactLevel`, and `Priority` visually as a "Ticket Summary" block at the top of Work Order detail.
  - Present `Symptom` as "Issue Description" in the Corrective Maintenance panel, matching ticket terminology.
  - Ensure `FailureCategory` / `FailureCode` are clearly labeled as the Work Order category and subcode.
- Assignment UX polish:
  - Emphasize current assignee (user or role) in the header or summary block.
  - Keep assignment/reassignment flows on Work Order detail but present them with clearer ticket language (e.g., "Reassign work order").
- Resolution capture and display (UI-first):
  - Add a dedicated "Resolution" section on Work Order detail that surfaces how the issue was resolved.
  - Phase 3.5 can reuse existing checklist outcomes and notes to populate a read-only resolution summary area.
  - A later backend phase may add explicit `ResolutionSummary` / `ResolutionNotes` fields on `pm.PMTasks` and wire them into complete flows.
- Lists and navigation:
  - Extend the Work Orders list to display a Subject column (computed as above) so the table reads like a ticket queue.
  - Ensure list rows and detail headers use consistent labels for status, impact, priority, and subject.

### Non-goals (Phase 3.5)
- No changes to underlying lifecycle semantics or status values beyond improved labeling.
- No new CM-specific tables; all changes build on the existing `pm.PMTasks` entity and Work Orders API.
- No mandatory resolution fields yet; that can be enforced in a later phase once UX is validated.

### Acceptance Criteria
- Work Orders page and detail views present CM work orders using ticket-style fields: subject, status, impact, priority, assignee, and issue description.
- Subject is consistently displayed in Work Orders list and detail header, derived from asset/facility label plus symptom.
- Users can quickly understand who owns a work order, how urgent it is, and what the issue is from the header alone.
- Resolution information is surfaced in a distinct section on completed work orders using existing checklist/notes data, without changing backend schema.

---

## Phase 4 — Web UI: Work Order Detail and Lifecycle

### Objective
- Provide a rich Work Order detail view for executing CM tasks, reusing PM Task Detail patterns.

### Deliverables
- Work Order detail view:
  - Layout:
    - Header with work order number, status pill, priority, and key timestamps.
    - Corrective Maintenance panel showing:
      - Symptom.
      - Failure category/code.
      - Impact level.
      - Reported by/at and channel.
      - Downtime start/end and computed duration where applicable.
    - Assignment panel for user/role assignment.
    - Checklist and evidence sections mirroring PM Task Detail.
  - Actions:
    - Start, Pause, Complete, Cancel.
    - Assign/Reassign.
    - Close downtime (sets `DowntimeEndedAt`).
- Interaction rules:
  - Respect existing task status transitions and permission rules.
  - Prevent completion when required checklist items are not satisfied.
  - Record CM-related actions in audit/system logs (e.g., downtime close, impact changes).

### Acceptance Criteria
- Users can execute the full lifecycle of a CM Work Order from the detail view.
- Checklist and evidence flows behave identically to PM tasks.
- CM-specific fields are visible and correctly updated when lifecycle actions occur.
- Audit and system logs capture key CM events.

---

## Phase 5 — Reporting and Analytics for CM

### Objective
- Extend reporting to cover CM-specific metrics and integrate them with existing PM analytics.

### Deliverables
- Backend reports:
  - Breakdown counts:
    - By asset category and location.
    - By failure category.
    - By impact level.
  - Time-based CM metrics:
    - Monthly count of CM incidents.
    - Mean time to repair (MTTR) by category and location.
  - Asset-level history queries combining PM and CM.
- Reports endpoint extensions:
  - New CM-specific report endpoints or parameters on existing ones to filter `MaintenanceType = 'CM'`.
- Web UI updates:
  - Additional cards/charts on Reports page for CM metrics.
  - Filters allowing users to toggle between PM-only, CM-only, or combined views.

### Acceptance Criteria
- Reports can clearly distinguish PM vs CM where relevant.
- CM dashboards show accurate counts and trends verified against the database.
- Asset history views display a combined timeline of PM and CM events.

---

## Phase 6 — Mobile Readiness (Optional)

### Objective
- Ensure the Work Orders API and flows are suitable for future mobile clients.

### Deliverables
- API review:
  - Confirm Work Orders endpoints return all data needed for mobile views (task core fields, CM metadata, checklist items, evidence references).
  - Ensure payload sizes and shapes are mobile-friendly.
- Mobile usage scenarios (design-level):
  - Report breakdown from asset/facility screen.
  - List and filter open work orders for a technician.
  - Execute work order: update status, fill checklist, capture photo evidence.
- Documentation:
  - Short guide for mobile developers describing how to integrate with `/api/work-orders` and related endpoints.

### Acceptance Criteria
- Work Orders API is stable and documented for mobile use.
- Key CM flows can be executed purely through the API without web-specific assumptions.
