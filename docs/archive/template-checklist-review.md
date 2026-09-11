> Historical snapshot — superseded by the unified implementation roadmap on 2026-09-11. Old task statuses below are historical, not current instructions.

# Template and Checklist Review

Review date: 2026-09-11. Status: user decisions and technician-submission cutoff confirmed; implementation pending. Desktop D1 discussion only.

## Observed backend behavior

Sources: `backend/src/routes/templates.ts`, task detail/completion in `backend/src/routes/tasks.ts`, and shared role middleware.

- Create/update/delete template operations use `requireManager`: Supervisor, Admin, and Superadmin.
- A template holds interval days, optional category, optional estimated duration, optional required role, active state, and checklist items. The create schema permits an empty checklist.
- Checklist items have order, text, mandatory, notes, pass/fail, attachment-enabled, attachment-required, and active flags.
- In the completion handler, a mandatory item cannot be skipped and requires notes for non-skip outcomes, even if its separate notes flag is false. Attachment validation is conditional on both attachment flags.
- Updates increment template Version and modify existing checklist records in place; omitted existing items are deactivated. Task detail joins the current checklist definitions, so a version counter alone is not immutable task checklist history.
- Unused templates can be permanently deleted; deletion is blocked with 409 when referenced.

These are source observations, not an end-to-end validation. Completion/submission validation differences remain Q-02.

## User decisions — 2026-09-11

| Topic | Decision | Difference from current behavior |
| --- | --- | --- |
| Template management | Retain Supervisor/Admin/Superadmin access | No change; do not apply facility-only role restrictions globally |
| Notes | Notes required on failure is acceptable; do not require notes merely because an item is mandatory | Change: current completion requires notes for mandatory non-skip outcomes, including Pass |
| Template changes | Tasks follow template changes until the technician submits for approval; submitted/reviewed/historical work retains the definition captured at submission | Partial match: current task detail reads live definitions, including for historical tasks; a Version counter does not preserve past definitions |
| Evidence | Keep existing per-item attachment behavior | No new automatic evidence-on-failure requirement |

## TC-01 — Outcome-based notes validation

- [ ] Align desktop and backend notes rules so Fail requires notes and mandatory status alone does not require notes on Pass/Done.
- [ ] Reconcile the existing RequiresNotes flag and UI wording with that rule; do not leave contradictory settings or silently impose extra requirements.
- [ ] Check complete and submit-for-approval paths together (Q-02), including inactive/invalid items and optional notes retention.
- [ ] Verify Fail without notes is rejected, Fail with notes is accepted when other requirements are met, and Pass/Done without notes is not rejected merely for mandatory status. Preserve mandatory no-skip enforcement and attachment behavior.

## TC-02 — Preserve final-submitted/historical checklist definitions

- [x] Confirm the cutoff: technician submission through submit-for-approval, transitioning to PendingSupervisor (user decision, 2026-09-11).
- [ ] Select and implement snapshot/version storage at successful technician submission, atomically with the approval transition; rejected/failed submissions must not create a misleading finalized snapshot.
- [ ] Let nonfinal tasks follow edited templates while preserving final-submitted/historical item text, order, requirements, and evidence/result associations.
- [ ] Inspect detail, approval, export, and any other historical readers; use a consistent preserved definition where applicable.
- [ ] Define returned/reopened work behavior and handling of historical records that lack a preserved definition. Do not fabricate an original checklist that can no longer be reconstructed.
- [ ] Update schema/API documentation if the chosen implementation requires it.
- [ ] Verify edit/add/deactivate/reorder operations against nonfinal and final tasks, including PDF output and evidence links; test concurrent finalization/template edits.

## Confirmed cutoff and remaining implementation boundaries

User clarification on 2026-09-11: final submit means the technician sends the task for approval. The existing backend maps this to `POST /api/tasks/{taskId}/submit-for-approval` and `ApprovalStatus = PendingSupervisor`. The checklist definition must be captured at that point, not deferred until Supervisor or Superadmin approval.

Before submission, task definitions follow the current template. After successful submission, template edits must not alter checklist text, order, requirements, or result/evidence associations for review and history. This freezes the template definition, not every possible authorized review/correction action.

The cutoff decision in Q-16 is resolved; TC-02 implementation and verification remain open. Returned/reopened work and pre-existing history without snapshots still need scoped treatment before dependent changes. Do not assume that a revision silently replaces the submitted definition with the latest template.

## Handoff status

This document is the implementation reference for TC-01/TC-02. The cutoff decision is complete; all implementation/acceptance checkboxes remain open. Observations were verified by reading template update logic, task detail joins, completion validation, approval transitions, and DDL; no application behavior was changed or tested.
