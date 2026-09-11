> Historical snapshot — superseded by the unified implementation roadmap on 2026-09-11. Old task statuses below are historical, not current instructions.

# Asset and Facility Action Plan

Status: agreed requirements handoff, 2026-09-11. Implementation has not started. This is the reference for subsequent desktop changes, read together with [decisions](../asset-facility-decisions.md), [F-01](../functional-specification.md), [access policy](../security-and-access-model.md), and the [roadmap](../implementation-roadmap.md).

## AF-01 — Cancel PM work when an asset becomes broken

User requirement: a broken asset receives no new PM tasks; its affected existing tasks become `cancelled` and remain in history.

Observed gap: Snipe-IT sync updates asset operational state and schedule generation skips broken assets. These paths do not currently cancel existing tasks. A manual task cancellation endpoint already exists.

Implementation checklist:

- [ ] Inspect and define the affected nonterminal PM statuses and the status-change/sync trigger. Do not treat this requirement as permission to rewrite completed history or cancel CM repair orders.
- [ ] Implement cancellation with a reason, timestamp, and attributable system/audit event while retaining task/checklist/evidence records.
- [ ] Make repeated syncs idempotent and reconcile races with completion/approval.
- [ ] Keep new-task generation blocked for broken assets; check manual PM Now and lifecycle routes for applicable consistency before deciding their behavior.
- [ ] Verify task lists, scheduling, overdue counts, history, and reports against the agreed cancellation behavior.
- [ ] Update API/workflow documentation for actual changed behavior and record test evidence.

Verification: use an isolated database with a broken-status transition, open PM work, completed history, and a CM repair order. Verify appropriate cancellation without deleting history; repeat sync; challenge concurrent completion and forbidden lifecycle actions. Remaining state/approval boundary decisions must be resolved before implementation, not converted into guessed behavior.

## AF-02 — Restrict facility master-data changes

User requirement: Admin/Superadmin create, edit, and archive facilities. Supervisors communicate needs verbally; no application request/approval queue is required.

Observed gap: facility administration routes use `requireManager`, which also allows Supervisor.

Implementation checklist:

- [ ] Inventory all facility master-data mutations, including clone and any bulk/archive path; distinguish them from PM configuration and task execution.
- [ ] Apply scoped Admin/Superadmin authorization to facility master-data changes; do not narrow the shared manager guard globally.
- [ ] Align desktop controls with backend authorization.
- [ ] Verify authorized Admin/Superadmin requests and rejected Supervisor/Technician requests directly against each affected endpoint.
- [ ] Verify reading facilities and unrelated PM execution/assignment are not accidentally restricted.
- [ ] Synchronize API/access/workflow documentation and attach verification evidence.

Verification: role matrix tests for each affected mutation, direct-request bypass attempts, and a desktop interaction check. Facility closure effects on open work remain a separate decision; do not add an approval workflow to satisfy verbal coordination.

## Retained scope and deferred design

Snipe-IT remains the sole asset master, PM is passive for synchronized data, site location is stable in normal operations, server UPS is a facility context, and schedules/tasks are the daily priority. AC/panels are excluded from maintenance scope; current sync has no special category filter. No additional ingestion filter is requested here.

Asset/facility mapping is tentative. General exclusion policy, detailed prerequisites, and closure/reappearance edge cases remain in Q-12–Q-15. They do not block moving the discussion to Templates and Checklists, but relevant ambiguities must be resolved before dependent code changes.

## Handoff evidence

Source inspection and user decisions are recorded in the decision document. All implementation boxes above remain unchecked. D1 may continue with the next feature discussion while preserving these actions as the implementation reference.
