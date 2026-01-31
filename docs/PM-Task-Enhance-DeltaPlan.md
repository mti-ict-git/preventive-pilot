# PM Task Enhancement – Delta Plan

This document captures the concrete deltas required to bring the implementation in line with the PM Task Enhancement Plan, based on the current repository state.

## 1. Facility Job Scheduling (Phase 2 Core Gap)

### 1.1 Add facility candidate pipeline to schedule calculation job
- Extend the schedule calculation job to include facility candidates, mirroring the existing asset pipeline.
- Query `pm.Facilities`, `pm.FacilityPMSettings`, `pm.PMTemplates`, and `pm.fn_CalculateNextDueAt` to compute `NextDueAt` for facilities.
- Filter to active facilities with PM enabled and an active default template.
- Input horizon days should match the existing asset job configuration.

Done when: the job produces facility candidates with `FacilityId`, `TemplateId`, and `NextDueAt` inside the configured horizon.

### 1.2 Implement facility task creation with idempotency
- Generalize the existing `ensureTask` logic to support facility contexts as well as asset contexts.
- For facility candidates, insert PM tasks with `AssetId = NULL`, `FacilityId = candidate.FacilityId`, `MaintenanceType = 'PM'`, and `ScheduledDueAt = NextDueAt`.
- Use `IF NOT EXISTS` checks that align with `UQ_pm_PMTasks_FacilityTemplateDue (FacilityId, TemplateId, ScheduledDueAt)` to avoid uniqueness violations.
- Reuse assignment resolution logic:
  - Call the assignment resolver with `categoryId = NULL`, facility `LocationId`, and `assetStatus = NULL`.
  - If no assignment rule matches, fall back to the template `RequiredRoleId` for `AssignedToRoleId`.

Done when: running the schedule job creates non-duplicate facility PM tasks for the horizon, and uniqueness constraints are respected without errors.

### 1.3 Update facility schedules and settings from the job
- After creating or ensuring a facility task, update `pm.FacilityPMSchedules` via a MERGE that matches on `(FacilityId, TemplateId)`.
- Update `pm.FacilityPMSettings.NextPMDueAt` and `LastPMCompletedAt` using the same computed `NextDueAt` and completion data as the recalc endpoint.
- Keep the behavior symmetric with the existing asset-side `PMSchedules` and `AssetPMSettings` updates.

Done when: facility schedules and facility PM settings are updated by the job, and recalc plus job use the same `NextDueAt` values.

## 2. Broken Assets and Frozen Schedules (Phase 2 Behavior)

### 2.1 Exclude broken assets from schedule job candidates
- Update the asset candidate query in the schedule calculation job to filter out broken assets.
- Use `AssetOperationalStatus` to either restrict to `operational` or explicitly exclude `broken` and `archived` as needed.

Done when: the schedule job does not generate new PM tasks for assets marked as broken.

### 2.2 Respect Frozen flags in schedule calculations
- In asset and facility candidate queries, join to `pm.PMSchedules` and `pm.FacilityPMSchedules` when available.
- Skip candidates whose existing schedule row has `Frozen = 1`.
- Alternatively, compute `NextDueAt` but do not create tasks or update schedules or `NextPMDueAt` when the schedule is frozen.

Done when: marking a schedule as frozen stops further task creation and schedule updates for that asset or facility, while allowing existing tasks to proceed normally.

### 2.3 Respect Frozen and broken state in calendar and day projections
- Extend the projection portions of `GET /api/scheduling/day` and `GET /api/scheduling/calendar` to respect asset operational status and frozen schedules.
- For assets:
  - Exclude projected occurrences for assets that are broken (or non-operational) based on `AssetOperationalStatus`.
- For assets and facilities:
  - Exclude projected occurrences for schedules with `Frozen = 1`.
  - Continue to include actual tasks from `pm.PMTasks` regardless of frozen status so that existing work remains visible.

Done when: projected events no longer appear for broken assets or frozen schedules, but existing tasks still show up in calendar and day views.

## 3. Capacity-Aware Planning (Phase 3)

### 3.1 Add capacity data to scheduling day API
- Extend `GET /api/scheduling/day` to provide capacity information in addition to the existing item list.
- For real tasks, join to `pm.PMTemplates` and use `EstimatedDurationMinutes` to compute per-task estimated minutes, falling back to a default when null.
- For projected occurrences, apply the same template duration logic so each projected item has an estimated duration.
- Either:
  - Return `estimatedMinutes` per item and let the frontend aggregate totals per day, or
  - Provide a separate aggregated structure such as `capacity: { date: string; estimatedMinutes: number }[]`.

Done when: the day endpoint supplies enough data for the UI to display total estimated minutes for the selected date.

### 3.2 Add daily capacity summary to calendar API
- Extend `GET /api/scheduling/calendar` to expose total estimated minutes per date.
- Use the same duration calculation rules as the day endpoint, aggregating across all real and projected occurrences for each date.
- Return a per-date `capacityMinutes` or similar field alongside the existing bucketed counts.

Done when: the calendar endpoint provides, for each date, a capacity value that can be used to render utilization and warning states.

### 3.3 Implement capacity overlays in Scheduling UI (web)
- In the Scheduling page, consume the new capacity data from the day and calendar APIs.
- Implement a small helper to evaluate capacity, similar to:
  - Input: `{ date, estimatedMinutes, thresholdMinutes }`.
  - Output: `{ utilization, state: "ok" | "near" | "over" }`.
- Render capacity badges in the calendar day cells based on the evaluated state:
  - `over` → strong warning or danger styling.
  - `near` → caution styling.
  - `ok` → neutral styling.
- Add a capacity summary card in the day view showing `used / threshold` minutes for the selected date.
- Use a responsive 12-column grid layout so that calendar and capacity elements remain usable on both desktop and mobile.

Done when: the Scheduling page clearly exposes daily total estimated minutes and a visual capacity state on both calendar and day views.

### 3.4 Surface broken and frozen state in Scheduling UI
- Extend the day endpoint to include additional metadata on items:
  - `assetOperationalStatus` for asset-based tasks and projections.
  - `scheduleFrozen` (boolean) based on the associated schedule row when applicable.
- In the Scheduling UI task list, render badges or chips indicating:
  - Broken asset state (for example, a “Broken” badge on relevant rows).
  - Frozen schedule state (for example, a “Frozen schedule” badge on projected items).

Done when: users can visually identify tasks associated with broken assets and frozen schedules directly in the scheduling views.

## 4. Facility Scheduling API and OpenAPI Coverage (Phases 1 and 6)

### 4.1 Define FacilityPMSchedules API surface
- Decide whether facility schedules should be exposed via dedicated API endpoints or remain internal to recalc and job flows.
- If external access is required:
  - Implement `GET /api/facilities/{facilityId}/schedules` to list upcoming `FacilityPMSchedules` rows with `NextDueAt` and `Frozen` flags.
  - Optionally add a minimal update endpoint to toggle `Frozen` on facility schedules.
- If external access is not required:
  - Update the high-level plan and documentation to clarify that `FacilityPMSchedules` is an internal implementation detail.

Done when: the facility schedule API surface is clearly defined and implemented or the plan is updated to match an internal-only design.

### 4.2 Extend OpenAPI for scheduling and facility PM endpoints
- In the OpenAPI definition, add or update path entries for:
  - `POST /api/scheduling/recalculate` (including facility parameters and consistent response schema).
  - `GET /api/scheduling/calendar` and `GET /api/scheduling/day` (with query parameters, response shapes, and error responses).
  - `POST /api/facilities/{facilityId}/pm-now`.
  - Any new facility schedule endpoints introduced in 4.1.
- Ensure all of these use the shared `ErrorResponse` schema with `{ message, code, details[] }` for 4xx responses.

Done when: all PM scheduling and PM Now endpoints referenced in the enhancement plan are fully described in the OpenAPI spec with consistent error shapes.

## 5. QA, Ops, and Regression Guardrails (Phase 6)

### 5.1 Tests for PM Now idempotency and unique indexes
- Add backend tests covering PM Now behavior for both assets and facilities:
  - Duplicate PM Now requests within the configured idempotency window return `409` with `code = "PM_NOW_DUPLICATE"` and the existing task `id`.
  - PM Now does not violate the `UQ_pm_PMTasks_AssetTemplateDue` or `UQ_pm_PMTasks_FacilityTemplateDue` constraints when multiple requests race.

Done when: tests fail if idempotency checks are removed or changed in a way that reintroduces duplicate tasks.

### 5.2 Tests for broken/frozen and capacity behavior
- Add tests for schedule calculation and scheduling endpoints to guard key behaviors:
  - Schedule job does not create tasks for broken assets or frozen schedules.
  - Calendar and day endpoints do not project new occurrences for broken assets or frozen schedules, while still returning existing tasks.
  - Capacity totals per day align with the configured `EstimatedDurationMinutes` values and default fallbacks.

137Done when: the most important behaviors from Phases 2 and 3 are covered by automated tests and protected against regressions.

## 6. PM Task Approval Workflow (New)

### 6.1 Extend schema for approval tracking
- Introduce an approval state for PM tasks so that completion by a technician does not immediately count as fully approved work.
- Extend `pm.PMTasks` with dedicated approval fields, for example:
  - `ApprovalStatus` (enum or constrained nvarchar) with values such as `None`, `PendingSupervisor`, `PendingSuperadmin`, `Approved`, `Rejected`.
  - `TechnicianCompletedAt` and `TechnicianCompletedByUserId` to capture when the technician submits the task for approval.
  - `SupervisorApprovedAt` and `SupervisorApprovedByUserId` for the supervisor decision.
  - `SuperadminApprovedAt` and `SuperadminApprovedByUserId` for the superadmin decision.
- Keep existing lifecycle fields (`Status`, `CompletedAt`, `CompletedByUserId`) but clarify their meaning in relation to approval:
  - `Status = 'Completed'` reflects technician completion.
  - `ApprovalStatus` reflects whether the work has been through supervisor and superadmin review.

Done when: the schema can represent technician completion separately from supervisor and superadmin approval, and `db/schema.sql` contains the new columns and constraints.

### 6.2 Add approval workflow endpoints
- Add dedicated approval endpoints under the existing task routes, for example:
  - `POST /api/tasks/{taskId}/submit-for-approval`
    - Marks the task as completed by the technician and sets `ApprovalStatus = 'PendingSupervisor'`.
    - Records `TechnicianCompletedAt` and `TechnicianCompletedByUserId`.
  - `POST /api/tasks/{taskId}/approve-by-supervisor`
    - Requires a supervisor-level role.
    - Transitions `ApprovalStatus` from `PendingSupervisor` to `PendingSuperadmin`.
    - Records `SupervisorApprovedAt` and `SupervisorApprovedByUserId`.
  - `POST /api/tasks/{taskId}/approve-by-superadmin`
    - Requires a superadmin-level role.
    - Transitions `ApprovalStatus` from `PendingSuperadmin` to `Approved`.
    - Records `SuperadminApprovedAt` and `SuperadminApprovedByUserId`.
  - Optional: `POST /api/tasks/{taskId}/reject-approval`
    - Allows supervisor or superadmin to reject and send work back to technician with a reason.
    - Sets `ApprovalStatus = 'Rejected'` and optionally reopens the task for editing.
- Enforce role-based access control using the existing role model so that only supervisors and superadmins can perform the relevant approval steps.
- Ensure all endpoints use the shared validation and error response shape with `{ message, code, details[] }`.

Done when: approval endpoints exist, enforce the correct role checks, update approval fields as expected, and are covered in the OpenAPI specification.

### 6.3 Update PM task APIs to surface approval state
- Extend the task detail and list responses to include approval-related fields:
  - `approvalStatus`.
  - `technicianCompletedAt`, `technicianCompletedBy`.
  - `supervisorApprovedAt`, `supervisorApprovedBy`.
  - `superadminApprovedAt`, `superadminApprovedBy`.
- Ensure PM history and reporting queries can filter or aggregate by approval status when needed (for example, counting only tasks with `ApprovalStatus = 'Approved'` for compliance metrics).
- Keep backward compatibility for existing clients by adding fields rather than changing existing ones.

Done when: tasks APIs expose approval metadata and PM history consumers can distinguish between completed vs fully approved tasks.

### 6.4 Web UI flow for technician → supervisor → superadmin
- In the Task Detail and Asset/Facility PM history views, introduce explicit steps for the approval workflow:
  - For technicians:
    - Provide a "Submit for approval" action instead of immediate final completion.
    - Show a clear state indicator when a task is awaiting supervisor review.
  - For supervisors:
    - Show a queue of tasks in `PendingSupervisor` state with filters on asset, facility, and due date.
    - Allow approve, reject, or send-back actions with optional notes.
  - For superadmins:
    - Show a queue of tasks in `PendingSuperadmin` state.
    - Allow final approval or rejection with notes.
- Update the PM history timeline to surface the full approval trail, including who approved at each step and when.
- Ensure all new UI elements remain usable on desktop and mobile, following the existing responsive layout patterns.

Done when: the web UI supports technician submission and supervisor/superadmin approval actions end-to-end, and users can see the approval status and history for each PM task.

### 6.5 Audit, notifications, and regression coverage
- Record audit events for key approval transitions, including submit, approve, reject, and send-back actions, with user and timestamp.
- Optionally trigger notifications when tasks enter `PendingSupervisor` or `PendingSuperadmin` states so approvers are aware of items in their queue.
- Add tests to cover the approval state machine and role enforcement:
  - Technicians cannot approve their own tasks.
  - Supervisors cannot perform superadmin-only approvals.
  - Invalid transitions (for example, approving from `None` directly to `Approved`) are rejected.

Done when: approval actions are audited, optional notifications are wired into the existing notification engine, and automated tests guard the approval workflow against regressions.
