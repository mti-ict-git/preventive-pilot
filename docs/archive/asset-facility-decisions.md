> Historical snapshot — superseded by the unified implementation roadmap on 2026-09-11. Old task statuses below are historical, not current instructions.

# Asset and Facility Evaluation

Decision date: 2026-09-11. Source: user answers to the ten asset/facility discovery questions. Scope: desktop/web requirements discussion, not implementation or runtime verification.

## Evaluation against the baseline

| Topic | User direction | Evaluation / implication |
| --- | --- | --- |
| Asset source | All new assets must be created in Snipe-IT and then synchronized | Confirmed and strengthened: no independent asset creation in PM |
| Classification | AC and electrical panels are excluded; server-specific UPS belongs to facilities | Scope clarified; facility definition expands beyond areas to selected infrastructure equipment |
| Asset/facility relationship | Potentially useful, but mapping may be difficult in practice | Tentative only; do not implement or require a relationship yet |
| Asset master-data editing | PM is passive; source data is edited in Snipe-IT | Confirmed: PM owns maintenance settings/work/history, not synchronized master-data edits |
| Broken assets | No new PM tasks; already-created tasks remain records | Follow-up confirmed cancellation of tasks for broken assets while retaining records; current sync/scheduler does not implement this cancellation |
| Missing upstream assets | No admin confirmation is needed for now | Automatic archival remains the baseline; behavior when an asset reappears was not answered |
| Location | Location represents the site and does not change in normal operation | Clarified: room-level moves and transfer workflows are not current requirements; exceptional upstream corrections remain unspecified |
| Facility administration | Admin/Superadmin make changes; supervisors communicate requests verbally | Follow-up confirmed: Supervisor must not create/edit/archive facilities; no in-app request/approval workflow is requested |
| PM prerequisites/exclusion | The suggested information is sufficient; exclusion has not been considered | No additional data fields requested beyond category/location/responsibility/template discussion. Per-entity mandatory validation and exclusion policy are not yet approved |
| Daily use | View schedules and PM tasks | Confirmed desktop priority; do not prioritize asset editing or mapping features over these workflows |

## Implementation handoff

Use the [action plan](../asset-facility-action-plan.md) for AF-01 cancellation and AF-02 facility authorization. Requirements discussion can move to Templates and Checklists; this handoff does not mark either implementation complete.

## Confirmed requirements

- Snipe-IT is the sole asset master source. New assets enter this system through synchronization.
- Synchronized master data is passive in PM; maintenance configuration and records remain owned by PM.
- AC and electrical panels are outside the current maintenance scope. Whether to filter them out during sync or retain them as non-PM catalog entries is not specified.
- Server-specific UPS is treated as a facility maintenance context.
- Broken assets do not receive new scheduled PM tasks; the user requires their tasks to become cancelled, with records retained. The implementation change must scope affected nonterminal PM states explicitly rather than rewrite completed history or automatically cancel CM repair work.
- Missing Snipe-IT assets may be archived automatically without an admin confirmation step.
- Location means site location for current operations.
- Admin/Superadmin control facility master-data changes. Supervisors communicate needs verbally and do not make those changes. This does not introduce a facility approval-request workflow in the application.
- Schedule visibility and PM task visibility are the primary daily desktop needs.

## Open boundaries

Track mapping, remaining cancellation mechanics, reappearing assets, facility closure behavior, and exact prerequisite/exclusion validation as Q-12–Q-15 in [open questions](../open-questions-and-challenges.md). Cancellation and Admin/Superadmin ownership are confirmed requirements, not unanswered product questions. Inspect implementation before proposing further questions.

## Brief implementation inspection — 2026-09-11 follow-up

- `backend/src/jobs/snipeSync.ts` calls `/hardware` and passes returned assets to `upsertAssets` without an AC/panel category exclusion. This does not prove those categories exist in the connected Snipe-IT instance; no live inventory was queried.
- Sync updates normalized asset status. `backend/src/jobs/scheduleCalc.ts` excludes broken/archived assets from new generation. No broken-status task cancellation was found in these paths or the checked DDL. A manual cancellation endpoint exists in `tasks.ts`, which does not establish automatic cancellation on sync.
- Existing asset upsert sets `IsArchived = 0` for matched upstream records, so a reappearing asset is unarchived in the current implementation. Product acceptance and schedule effects are not yet verified.
- Facility create/update routes use `requireManager`, which includes Supervisor, Admin, and Superadmin. Therefore the implementation is broader than the confirmed master-data permission policy. PM execution/assignment permissions must not be changed indiscriminately by narrowing the global manager helper.
- Scope remains D1 requirements reconciliation. No runtime behavior changed. Before any further product question, inspect relevant existing behavior and ask only about the remaining decision.

## Verification evidence

Compared each answer with F-01/F-03, the project scope, and the prior question register. Confirmed requirements and tentative/unanswered aspects are separated in the table above. Documentation structure/link/contract checks are recorded in the [verification log](../documentation-verification.md). No API, schema, permission, or UI behavior was changed or tested in this evaluation.
