# CM Mobile Implementation Plan (Field-Ready)

This plan describes how the **Field-Ready** mobile app (`mobile/field-ready`) will support Corrective Maintenance (CM) work orders in three phases:

- Phase 1: Technicians can see and execute CM work orders (list + detail + checklist + evidence).
- Phase 2: Technicians can report breakdowns from the field.
- Phase 3: Technicians can see basic CM metrics (read-only).

The mobile app is a Capacitor-wrapped React app that talks to the same backend as the web UI.

---

## Phase 1 — CM Work Orders Inbox and Execution

### Objective

Give technicians a focused mobile experience to **see and execute their own CM work orders**, reusing the existing task/checklist/evidence engine.

### Scope

- Add CM-specific list and detail views to the Field-Ready app.
- Reuse existing task APIs for checklist and evidence.
- Support start/pause/resume/complete/cancel/close-downtime actions for CM tasks.

### High-Level UX Flow

1. Technician opens the app and signs in (existing auth flow).
2. From Home, technician navigates to **My Work Orders**.
3. The Work Orders list shows CM tasks assigned to the technician, with basic filters.
4. Technician taps a work order to open the detail screen.
5. Detail screen shows CM summary, asset/facility context, and checklist.
6. Technician executes the checklist, optionally adding evidence.
7. Technician completes or pauses/cancels the work order as appropriate.

### Mobile Component Tree (Field-Ready)

- `App`
  - `AuthProvider`
  - `MobileLayout`
    - `BottomNav`
    - `Routes`
      - `HomePage`
      - `TasksPage` (existing PM)
      - `WorkOrdersPage` **(new)**
      - `TaskDetailPage` (existing PM)
      - `WorkOrderDetailPage` **(new)**

Phase 1 adds two pages and some CM-specific components:

- `WorkOrdersPage`
  - Uses `MobileLayout` and a `WorkOrderCard` list.
  - Filters: status (open/in progress/completed), assigned (default `me`).
  - Primary action is navigating to `WorkOrderDetailPage`.
- `WorkOrderDetailPage`
  - Uses `MobileLayout` plus:
    - `WorkOrderHeader` (task number, status, impact, asset/facility label).
    - `CorrectivePanel` (symptom, failure category/code, reported by/at/channel, downtime fields).
    - `TimelinePanel` (created/started/completed/cancelled timestamps).
    - `ChecklistSection` (reusing existing `ChecklistItem` component wired to the task API).
    - `EvidenceSection` (reusing evidence upload/outbox helpers).
    - `WorkOrderActionsBar` (start/pause/resume/complete/cancel/close-downtime).

### Navigation Update: Bottom Tab Bar

Update the bottom navigation to surface CM Work Orders as a first-class destination:

- Replace the current **Alert** tab with a **Work Orders** tab.
- Bottom tab order becomes: **Home**, **Tasks**, **Assets**, **Work Orders**, **Offline**.
- Alerts remain accessible via the existing alert icon in the top-right of the app.
- The new **Work Orders** tab routes to `WorkOrdersPage` and uses a wrench or similar maintenance icon for clarity.

### Backend/API Usage

All API calls are made via `mobile/field-ready/src/lib/api.ts`, using the existing `request` helper.

- List CM work orders:
  - `GET /api/work-orders?assigned=me&status=open` (default) with pagination as needed.
  - Returns `ListWorkOrdersResponse` matching the web `apiListWorkOrders` type.
- Work order detail (CM metadata):
  - `GET /api/work-orders/{taskId}` for summary fields and CM-specific metadata.
- Checklist and evidence:
  - `GET /api/tasks/{taskId}` for checklist items and evidence references (existing endpoint).
  - `POST /api/tasks/{taskId}/checklist-items/{templateChecklistItemId}/evidence/upload` via existing `uploadChecklistEvidenceFile` helper.
- Lifecycle actions:
  - `POST /api/work-orders/{taskId}/start`
  - `POST /api/work-orders/{taskId}/pause`
  - `POST /api/work-orders/{taskId}/resume`
  - `POST /api/work-orders/{taskId}/complete` with checklist results and optional backdate data.
  - `POST /api/work-orders/{taskId}/cancel`
  - `POST /api/work-orders/{taskId}/close-downtime`

### Checklist and Evidence Behavior

- Checklist items and validations mirror the web Task Detail UX:
  - Mandatory items cannot be skipped.
  - Outcome `fail` is only allowed for items that require pass/fail.
  - Notes are required when `requiresNotes` is true or item is mandatory and outcome is not skip.
  - Attachments are required when `enableAttachment` and `requiresAttachment` are true and outcome is not skip.
- Evidence capture on mobile uses the existing **evidence outbox** utilities in `lib/api.ts`:
  - Add items to an outbox when offline or when uploads fail.
  - Process the outbox opportunistically when connectivity returns.

### Acceptance Criteria

- Technician can open **My Work Orders** and see their CM tasks with correct status/impact/asset/facility labels.
- Technician can view CM details (symptom, failure metadata, reported by/at/channel, downtime) for a work order.
- Technician can execute a CM work order end-to-end: start, fill checklist, attach evidence, complete.
- Lifecycle transitions respect backend rules (including permissions and checklist validations).
- Evidence added on mobile appears in the web UI and vice versa.

---

## Phase 2 — Report Breakdowns from the Field

### Objective

Allow technicians to **create CM work orders directly from the field** using the mobile app, from either asset or facility context.

### Scope

- Add a "Report Breakdown" action to relevant mobile screens.
- Implement a breakdown form that creates CM work orders via `/api/work-orders`.
- Route technicians from creation back into the CM flow (list or detail).

### High-Level UX Flow

1. Technician opens an asset (or facility) in the mobile app.
2. Technician taps **Report Breakdown**.
3. A bottom sheet or full-screen form collects:
   - Symptom (required text).
   - Impact level (normal/high/critical).
   - Failure category and code (optional text fields).
   - Optional downtime start.
   - Optional reported channel (default `mobile`).
4. Technician submits the form.
5. App calls `POST /api/work-orders` with `assetId` or `facilityId` and the CM metadata.
6. On success, technician is redirected to either:
   - The new work order detail view, or
   - The Work Orders list with the new item highlighted.

### Mobile Component Tree Additions

- `AssetDetailPage`
  - Adds a **Report Breakdown** quick action button.
  - Opens `ReportBreakdownSheet`.
- `ReportBreakdownSheet` (or `ReportBreakdownPage` on smaller screens)
  - Fields for symptom, impact, failure category/code, downtime start, reported channel.
  - Submits to the work orders create API and handles success/failure.

### Backend/API Usage

- Create CM work order:
  - `POST /api/work-orders`
  - Payload includes:
    - Exactly one of `assetId` or `facilityId`.
    - `symptom` (non-empty string).
    - Optional `impactLevel` in {`normal`, `high`, `critical`}.
    - Optional `failureCategory`, `failureCode`.
    - Optional `downtimeStartedAt` as ISO-8601 string.
    - Optional `reportedChannel` (default `mobile` when omitted).

### Acceptance Criteria

- From an asset or facility screen, technicians can open a breakdown form.
- Valid submissions create CM work orders linked to the correct asset or facility.
- New CM work orders are visible both in the mobile **My Work Orders** view and in the web Work Orders page.
- Backend validation errors are surfaced to the user with clear messages.

---

## Phase 3 — CM Metrics (Read-Only)

### Objective

Expose **basic CM metrics** in the mobile app so supervisors and technicians can see trends without leaving the field app.

### Scope

- Add a simple CM metrics view that reads from the existing CM reporting endpoints.
- Keep Phase 3 read-only; no configuration is done from mobile.

### High-Level UX Flow

1. Supervisor or technician opens the app.
2. From Home or Profile, they tap **CM Metrics**.
3. The CM Metrics screen loads metrics for a chosen period (for example, last 30 days).
4. The screen shows:
   - Breakdown of CM incidents by asset category.
   - Breakdown by location.
   - Breakdown by failure category and impact level.
   - Simple MTTR by category and location.
   - Monthly incident counts.

### Mobile Component Tree Additions

- `HomePage`
  - Adds a **CM Metrics** card linking to `CmMetricsPage`.
- `CmMetricsPage`
  - Period selector (for example, last 7/30/90 days).
  - Metric sections:
    - `CmBreakdownByCategory`
    - `CmBreakdownByLocation`
    - `CmBreakdownByFailureCategory`
    - `CmBreakdownByImpactLevel`
    - `CmMonthlyIncidents`
    - `CmMttrByCategory`
    - `CmMttrByLocation`

Visuals can be simple lists or lightweight charts depending on device capabilities and time.

### Backend/API Usage

- Metrics endpoint:
  - `GET /api/reports/cm/metrics?from=…&to=…&locationId=…&categoryId=…`
  - Returns:
    - `breakdownByCategory`
    - `breakdownByLocation`
    - `breakdownByFailureCategory`
    - `breakdownByImpactLevel`
    - `monthlyIncidents`
    - `mttrByCategory`
    - `mttrByLocation`

### Acceptance Criteria

- CM Metrics page loads successfully using the existing backend reports API.
- Users can change the period and see metrics update accordingly.
- Metrics are read-only and match values shown in the web Reports page for the same filters.

---

## Out of Scope for This Plan

- Offline creation of CM work orders (Phase 2 assumes an online backend call on submit).
- Advanced CM reporting configuration from mobile.
- Role-based restrictions beyond the backend’s existing authorization model.

These can be revisited in future iterations if mobile CM usage grows significantly.
