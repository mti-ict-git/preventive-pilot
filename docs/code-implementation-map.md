# Code-to-implementation map

Reviewed: 2026-09-11. Source checkpoint: `b3b11c7`; includes the current uncommitted D1 requirements documentation. Application source was not changed by this audit.

This is a supporting technical map for the [roadmap](implementation-roadmap.md), not a second backlog. The roadmap owns order, acceptance checklists and completion status. This audit originally preceded implementation. AF-02 is now implemented with [local verification](verification-af02.md); the observations below describe the pre-change checkpoint and the remaining seven items stay pending. Findings below come from static source inspection, not executed endpoint/database tests.

## Coverage and limits

Screened 126 tracked source files under `src`, `backend/src`, `db` and `scripts`; 35 contain the selected roadmap/domain terms. The [inventory](code-audit-inventory.json) records paths and matching line numbers. Screening is not a claim that every line was manually verified. Followed the relevant route handlers, SQL reads/writes, desktop callers, schema evolution, jobs, exports and administrative bypass paths in depth. Also read package scripts, architecture, testing guidance and API coverage.

Dependencies, generated output, credentials and ignored mobile source are excluded. Mobile development remains deferred; shared endpoint compatibility is an implementation requirement. No server, scheduler, external provider or live database was started. Generic UI primitives, authentication-provider internals and unrelated integration features were screened for dependency impact, not independently audited for correctness.

## Cross-cutting findings

| Finding | Evidence | Implementation consequence |
| --- | --- | --- |
| PM and CM share task storage and generic mutations | `tasks.ts` handlers often select by TaskId without MaintenanceType; CM uses shared task detail/evidence | Introduce explicit maintenance-type and transition policy at every affected mutation; CM cannot bypass its review via PM routes |
| Submission differs materially from completion validation | `tasks.ts` submit-for-approval upserts results and changes approval separately; complete validates submitted items | Validate the full required-item set server-side and commit results, snapshot and state atomically |
| Assignment can also alter lifecycle status | `tasks.ts` assign accepts status and updates it without approval-state predicate | Prevent status/ownership bypasses in single, bulk and shared CM routes |
| Mutable template definitions drive task history | `templates.ts` updates item definitions in place; task detail/count/PDF reads live items | Freeze definitions at submission and migrate every reader, not only the editor |
| New historical structures affect non-UI writers | `evidenceImport.ts` creates completed tasks and can delete/replace them; system user deletion clears actor references; reset CLI rewinds approval | Define legacy provenance and safe deletion/import/maintenance behavior before new foreign keys or actor rules ship |
| Existing duplicate keys describe a task date, not a business occurrence | SQL unique keys use context + template + ScheduledDueAt and are not PM-only | Design period/replacement/CM relationships before changing indexes; retain database-level concurrency protection |
| Jobs are only locally serialized | `jobs/index.ts` uses an in-process runningJobs map | Mutation-time DB guards must protect against another API process and sync/generator races |
| Contract coverage is incomplete | Checker: 134 literal operations, 63 documented, 71 missing | Review affected missing routes in each work item; parity with embedded Swagger is not full coverage |
| No application test script is declared | Root/backend package scripts; no dedicated workflow test suite found in tracked source | Add meaningful policy tests and isolated SQL workflow fixtures as implementation begins; build alone cannot close workflow items |

Common API work for all items: review `backend/src/index.ts` embedded OpenAPI and `docs/openapi.yaml`; update route schemas, responses, role descriptions and `src/lib/api.ts` together, regenerate the snapshot/coverage deliberately, and run the documentation checker. New endpoint names and SQL table names below are design work, not already approved contracts.

## AF-02 — Facility master permissions

**Observed:** `backend/src/routes/facilities.ts` applies requireManager to create (line 199), update (294), clone (649), PM settings (347) and PM Now (408). Update includes IsActive, so activation/archival is part of master editing. No separate facility delete/bulk-master endpoint was found. Desktop bulk PM settings calls are planning operations, not master creation. Facilities/FacilityDetail expose mutations without a scoped facility-admin capability; App routes themselves are not a substitute for authorization.

**Work to perform:**

1. Add a narrowly scoped Admin/Superadmin guard for POST `/api/facilities`, PUT `/api/facilities/{facilityId}` and POST `/api/facilities/{facilityId}/clone`, including isActive changes and clone-with-PM-settings.
2. Preserve Supervisor planning rights on PM settings/PM Now and template management. Do not redefine requireManager globally.
3. Use the same scoped capability for create/edit/clone/activate/archive controls and mutation entry paths in `src/pages/Facilities.tsx`, `src/pages/FacilityDetail.tsx` and `src/lib/auth.ts`; preserve read/detail access.
4. Document 403 behavior for all master operations. Update/clone are among missing contract operations. No schema change is currently indicated.

**Verification:** direct calls as each role for all three mutations; forged isActive/clone payloads; Supervisor reads and PM planning still succeed; stale role/UI controls cannot bypass backend checks. Run relevant static/build checks and desktop interaction checks.

**Dependencies/readiness:** first implementation item; no new business question is needed for these three permission changes. Effects of facility deactivation on existing tasks remain outside AF-02.

## TC-01 — Notes on Fail and complete submission validation

**Observed:** `Tasks.tsx` buildChecklistResults (line 963) derives notesRequired from requiresNotes OR isMandatory. PM complete (`tasks.ts`, around 3950) and CM complete (`workOrders.ts`) use similar logic. PM submit-for-approval (4357) does not run that validation, does not check template membership/active status for each item, and writes outside one encompassing transaction. Complete loops over supplied results, so the full required-item set needs an explicit missing-item check. Optional Fail can escape the intended notes rule when neither flag is set.

**Work to perform:**

1. Define one backend checklist-validation policy: Fail requires trimmed notes; mandatory status alone must not imply notes. Resolve the documented RequiresNotes setting boundary (Q-17) before changing explicit per-item configuration semantics.
2. Validate missing mandatory items, duplicate item IDs, foreign/inactive items, supported outcomes and existing evidence rules across submit, complete and privileged correction paths. Draft saving may remain incomplete but must respect item ownership and editing state.
3. Apply it to PM submit/complete and review shared CM completion usage; preserve intentional privileged exceptions only where documented. Make submission atomic to prevent a half-written checklist if validation or state change fails.
4. Align `Tasks.tsx`, `TemplateFormDialog.tsx`, `TemplateDetailDialog.tsx`, `templates.ts` and API descriptions. Review `WorkOrderDetail.tsx`, which currently sends an empty checklistResults array, before making completeness validation stricter.

**Data/API:** existing outcome and notes fields can support the basic rule; payload validation and error behavior change. No new table is necessary solely for notes. TC-02 later changes the source of validated definitions.

**Verification:** mandatory Pass without unnecessary notes; optional/mandatory Fail with blank versus nonblank notes; omitted mandatory item; duplicate/foreign IDs; attachment unchanged; direct submit cannot bypass UI; failure rolls back all writes.

**Dependencies:** implement validation so TC-02 can provide live or frozen definitions without duplicating policy. Q-02/Q-17 are bounded prerequisites, not reasons to restart requirements discussion.

## TC-02 — Submission snapshot and historical reads

**Observed:** `templates.ts` PUT increments Version but overwrites item text/order/flags and deactivates omitted items. `tasks.ts` detail (2650 onward), list counts, PDF export (3038) and result joins use `PMTemplateChecklistItems`. `PMTaskChecklistResults` and checklist evidence reference live item IDs. A version counter does not retain version contents. No task-definition snapshot table was found in `db/schema.sql`.

**Work to perform:**

1. Design a task-bound immutable definition revision containing item identity/text/order, active/mandatory/outcome/notes/attachment rules and relevant template metadata. Preserve source item identity for compatibility and evidence linkage.
2. At the first successful technician submission, atomically validate against and freeze one consistent definition. Coordinate with template edits so a concurrent edit cannot produce a mixed snapshot.
3. Before submission, continue reading current definitions as agreed. After submission, detail, review, progress counts, PDF/history/export and validation must use the frozen definition.
4. Returned work retains the submitted definition; preserve prior submissions/results/evidence as history while supporting corrections. Resolve legacy snapshots honestly: current template content cannot be claimed to be the original historical definition.
5. Update `tasks.ts`, `templates.ts`, affected `workOrders.ts` shared readers, `src/lib/api.ts`, `Tasks.tsx`, `Approvals.tsx`, asset/facility history and document exports. Review evidence upload item checks and storage labels for renamed/inactive template items.
6. Reconcile task deletion, evidence-import replacement and maintenance CLI behavior with snapshot/result/history foreign keys. Do not cascade away required historical evidence by default.

**Data/API:** additive snapshot/revision storage and indexes; provenance for legacy records; API read shapes for frozen/live definition source. Actual table/payload names need design before implementation. Existing clients must still identify checklist items consistently.

**Verification:** template changes before submit propagate; after submit do not alter review/PDF/history; removed/reordered item remains understandable; concurrent edit/submit freezes one version; revision preserves original evidence; legacy uncertainty is explicit; import/delete paths do not violate foreign keys/history.

**Dependencies:** TC-01 validation; AS-01 returned-work permissions and EX-01 rejection links must consume the same frozen definition policy.

## AF-01 — Broken assets and cancellation

**Observed:** `snipeSync.ts` maps labels beginning broken/archived and upserts AssetOperationalStatus; archiveMissingAssets marks absent upstream assets archived after the sync path. It contains no PMTask cancellation update. `scheduleCalc.ts` candidate selection excludes broken/archived assets, but insert is separate from candidate selection. Asset PM Now in `tasks.ts` must gain explicit operational-status validation; current checks focus on archive/template context. Merely filtering the generator does not cancel existing work or prevent a stale candidate from inserting after sync.

**Work to perform:**

1. At operational-status transition, cancel the agreed affected PM states with actor/system provenance, reason and history; do not delete results/evidence. Define treatment of submitted/in-progress tasks under Q-13 and close active timing intervals when EX-01 exists.
2. Recheck asset eligibility at mutation time in generator, PM Now and relevant task actions; protect sync-versus-submit/start/create races.
3. Preserve upstream archive behavior; test complete versus partial/empty sync before relying on absence. Do not invent a new source filter or ask for manual archive approval.
4. Reconcile `scheduleCalc.ts`, task lifecycle/reopen, `assets.ts` PM setup/bulk operations, `scheduling.ts` projections/recalculate and reminders so unavailable assets do not silently regain actionable PM work.
5. Reflect cancellation reason/status in `Assets.tsx`, `AssetDetail.tsx`, `Tasks.tsx`, `Scheduling.tsx`, Dashboard/Reports and exports without dropping historical rows.

**Data/API:** existing cancellation fields provide a base; system actor/provenance and timing integration may need additive support. Document operational-state rejections. Exclude CM cancellation by accident.

**Verification:** broken transition with open/paused/in-progress/review/terminal examples; repeated sync is idempotent; concurrent generation/PM Now cannot create new PM; recovery does not silently reopen cancelled work; retained evidence readable; CM unaffected.

**Dependencies:** initial cancellation can precede SC-01, but period attribution and cancellation reporting need SC-01/Q-09. Final affected-state choice remains Q-13.

## SC-01 — Planned-date recurrence and occurrence accounting

**Observed:** SQL `fn_CalculateNextDueAt` (schema line 398) falls back to completion-based intervals, uses calendar months for 30/90/180 and years for 365, then shifts a blackout date. PM complete and final approval update AssetPMSettings from completion time separately; inspected final approval does not implement the equivalent facility update. `scheduleCalc.ts` and scheduling read projections repeat history/calculation queries, including completed-task history without a PM-only predicate in inspected paths. PM Now uses a recent-time duplicate window rather than the agreed overdue-then-upcoming reuse order. There is no explicit missed/skipped occurrence ledger in the inspected schema.

**Work to perform:**

1. Design persisted planned occurrence identity/anchor and fulfillment, missed, skipped, cancelled and replacement attribution. Separate real execution timestamps from the schedule anchor.
2. Centralize the recurrence policy consumed by generator, explicit recalculate, calendar/day projections, PM settings, complete/final approval and PM Now for both assets and facilities. Preserve the 30-day horizon, first-date fallback, existing blackout/Frozen scope and aggregate daily capacity.
3. Implement the agreed single actionable current job and missed-period records; preserve in-progress/review work. Early execution fulfills the next occurrence without shifting later dates.
4. PM Now must atomically reuse due/overdue work, then upcoming regular work, before creating; coordinate both asset and facility endpoints with generator concurrency.
5. Add one-occurrence Skip with reason/history for Supervisor/Admin/Superadmin. Keep compliance scoring unresolved until Q-09 is settled; do not invent a rate.
6. Align `assets.ts`, `facilities.ts`, `scheduling.ts`, `tasks.ts`, `scheduleCalc.ts`, SQL function/indexes, `Scheduling.tsx`, Assets/AssetDetail/FacilityDetail, API types, reports/dashboard and reminders.
7. Inspect historical CM contamination in last-completion reads, asset/facility parity, duplicate keys, calendar-month boundary semantics and existing-data migration before switching calculations.

**Data/API:** occurrence/skip/missed representation; PM Now reuse responses and repeat-request behavior; calendar/report response implications. Preserve old task IDs/history. Never resolve uniqueness by simply deleting existing duplicate work.

**Verification:** planned 1 September, completed 10 September still next 1 October; multiple missed periods; early work; PM Now at each reuse tier; in-progress/review protection; month-end/leap-year/timezone; asset/facility parity; generator/PM Now concurrency; skip does not reappear; blackout unchanged; capacity remains aggregate.

**Dependencies:** AF-01 eligibility; EX-01 replacement attribution; Q-18 technical boundaries and Q-09 reporting definitions. This is a data/workflow change, not a date-formula-only fix.

## AS-01 — Exclusive claim and reassignment

**Observed:** `tasks.ts` canModifyTask accepts assigned user OR assigned role, so a role match can allow another technician even after individual assignment. `workOrders.ts` has a second helper and additionally accepts unassigned non-Viewer users. Desktop Tasks duplicates access logic. Assignment single route accepts status; bulk assignment checks completion/cancellation timestamps but not approval state. Generator and PM Now duplicate assignment-rule resolution, including direct-user targets; no claim route was found. Rule CRUD is already Superadmin-only in scheduling.ts.

**Work to perform:**

1. Centralize assignment/ownership/transition policy with explicit PM/CM scope. An established individual owner takes precedence over role membership; preserve authorized manager intervention.
2. Route routine PM generation to the agreed role queue; retain existing manager individual assignments. Reconcile existing rule targets before changing their semantics.
3. Add atomic claim for an eligible unowned executable role task; recheck role/owner/state in the transaction and record actor/time/history. Two competitors must yield one owner; repeat by that owner must be safe.
4. Enforce ownership across start/pause/resume, draft save/delete, evidence add/upload/delete, submission and checklist mutations. Review shared CM routes without assuming all PM queue requirements were separately approved for CM.
5. Lock single/bulk reassignment after submission; allow it only before submit or on explicit return for revision. Prevent simultaneous status changes from bypassing the lock. Preserve prior performer/evidence history and hand off any active timer safely.
6. Update `Tasks.tsx`, `Approvals.tsx`, shared detail/actions, assignment controls, `src/lib/api.ts`, assignment-user lookup and notifications. Retain aggregate capacity and Superadmin rule management.
7. Audit user deletion in `system.ts` (clears assignment and actor columns) so historical performer identity and CM self-review checks cannot be defeated by account maintenance.

**Data/API:** claim mutation and ownership response; audit/performer history; possibly concurrency token/version. Do not mandate a specific route name until the contract is designed.

**Verification:** simultaneous claims; stale role token; wrong-role/nonowner edit; role-plus-user owner exclusivity; submitted single/bulk reassignment rejected; revision restores permitted reassignment; history survives account/handoff changes; existing direct assignments retained.

**Dependencies:** TC-02 snapshot/returned results; EX-01 timers; CM-01 actor history. Claim/assignment policy should be established before timed execution ships.

## EX-01 — Timed PM, finding links and rejected replacement

**Observed:** PM pause/start/resume use broad access checks and status CASE updates, without work-session intervals; pause can initialize StartedAt. Draft save checks lifecycle completion/cancellation but not approval locks. Submit can occur without a recorded Start and preserves first TechnicianCompletedAt via COALESCE. Revise/reject accept optional reasons; reject marks Rejected on the same task, without a linked replacement. ReportBreakdownDialog receives asset/facility/template only; no source-task/checklist field exists in the create schema. These are not yet the confirmed target semantics.

**Work to perform:**

1. Design persisted active-work sessions with actor, start/end and transition provenance; use server timestamps and one valid active session per task. Define revision/handoff/cancel/import behavior and legacy unknown durations.
2. Enforce valid Start/Pause/Resume transitions atomically; optional pause reason; close active time on submission/exceptional exits. Approval waiting is not active work. Resolve pre-Start draft policy without assuming a Start requirement that was not agreed.
3. Require nonblank revision reason; correct the same task while preserving submitted definitions/results/history. Reject retains the original and creates a new linked replacement through an idempotent designed trigger.
4. Resolve replacement owner/template/period mapping with TC-02/SC-01; the existing date uniqueness key may prohibit a naive same-due-date copy.
5. Add explicit optional finding-to-WO action using source PM task/checklist identity and retained context. Handle repeated clicks and existing links. Fail submission must remain valid without WO creation or repair completion.
6. Update `tasks.ts`, `workOrders.ts`, Tasks/Approvals/WorkOrderDetail, ReportBreakdownDialog, API types, PDF/history and notifications. Review import/reset/delete paths rather than fabricating historical timer sessions.

**Data/API:** session/event history, replacement/finding links and submitted-history preservation; lifecycle payloads/read responses and error semantics. No automatic WO creation is authorized.

**Verification:** active minutes across multiple pauses; reload/retry/concurrent transitions; handoff while running; no review-time charging; missing/blank revision reason; revision remains same task; repeated Reject creates one replacement; failed item can submit without WO; repeated finding action preserves one intended link; original evidence unchanged.

**Dependencies:** TC-01, TC-02, AS-01, SC-01 occurrence design; CM creation/link surface coordinated with CM-01.

## CM-01 — Review, restoration and repeated downtime

**Observed:** `workOrders.ts` complete directly writes completed; WorkOrderDetail invokes it with empty checklistResults. No dedicated CM review/return route exists. Shared PM approve advances to PendingSuperadmin and is unsuitable as-is. CM resolution update checks broad task access without a review-state edit lock. Close-downtime writes only the first server time using COALESCE; schema has one start/end pair. Creation does not carry previous-WO or source-PM links. Start/pause/resume/cancel/assign and generic task routes also need policy coverage.

**Work to perform:**

1. Model technician submission, one review by Supervisor/Admin/Superadmin, same-WO return with required reason, resubmission and final closure. Do not reuse PM's two-stage state machine implicitly.
2. Enforce no self-verification regardless of role, using durable repair-performer attribution rather than only the current assignee. Resolve multiple performers and legacy unknown identities explicitly.
3. Preserve previous work/results/evidence on return; gate resolution/evidence/assignment and all shared task mutations by the CM review state. Make transition checks atomic.
4. Persist restoration separately from submission/closure. Assigned technician or manager roles may record it; current time is default, actual past time requires reason/change history. Validate chronological order, future dates, duplicate events and corrections.
5. Store multiple non-overlapping downtime intervals for same-fault recurrence before closure on the same WO; exclude operational gaps. After closure create a new linked WO. Retain prior history and prevent duplicate recurrence creation.
6. Update `WorkOrders.tsx`, `WorkOrderDetail.tsx`, ReportBreakdownDialog, shared Tasks/Approvals entry points, `src/lib/api.ts`, backend workOrders/tasks routes, schema, actor handling, notification events and exports.
7. Reconcile reports: current CM metric is AVG(ReportedAt to CompletedAt), not downtime or active labor. Keep these measures separate; Q-09 must define KPI names/denominators/date attribution before changing published values. Compliance queries with asset INNER JOIN also need facility coverage review.

**Data/API:** explicit CM transition/read contracts, immutable performer/review history, restoration intervals and previous/source relationships; migration from the one-pair legacy fields. Unknown legacy times remain unknown. Add constraints/indexes only after import/delete/account-maintenance compatibility review.

**Verification:** all reviewer roles; repair performer denied even as Superadmin; blank return reason; same WO and retained evidence on correction; no closure via generic PM/assign/complete routes; restoration before review; past time reason/history; multiple outage sums excluding gaps; concurrent restoration/review/recurrence; closed WO remains closed with a new linked WO; legacy migration and reporting fixtures.

**Dependencies:** AS-01 actor/ownership policy, TC-02 retained history, EX-01 source links and Q-09 metric definitions. Do not mark workflow complete based only on UI states.

## File impact summary

| File/group | Primary items | Responsibility |
| --- | --- | --- |
| `backend/src/routes/facilities.ts` | AF-02, SC-01 | Scoped master guards, planning and facility PM Now parity |
| `backend/src/routes/tasks.ts` | TC-01/02, AF-01, SC-01, AS-01, EX-01, CM-01 | Validation, frozen reads, ownership, transitions, periods, links, shared-route safeguards |
| `backend/src/routes/templates.ts` | TC-01/02 | Notes semantics and consistent template/snapshot interaction |
| `backend/src/jobs/snipeSync.ts` | AF-01 | Source-state transition and cancellation reconciliation |
| `backend/src/jobs/scheduleCalc.ts`, `routes/scheduling.ts`, `routes/assets.ts` | AF-01, SC-01, AS-01 | Eligibility, recurrence, projections and assignment |
| `backend/src/routes/workOrders.ts` | TC-01/02, AS-01, EX-01, CM-01 | CM validation/access/history/review/downtime/source links |
| `backend/src/routes/reports.ts`, `routes/dashboard.ts` | SC-01, EX-01, CM-01 | Period counts, facility inclusion, timestamp/metric consumers |
| `backend/src/jobs/reminders.ts`, `routes/notifications.ts` | AF-01, AS-01, EX-01, CM-01 | Eligible task events, recipients and deduplication; no live messages during tests |
| `backend/src/jobs/evidenceImport.ts`, `routes/system.ts`, reset CLI | TC-02, AS-01, EX-01, CM-01 | Alternate writers, actor retention and historical compatibility |
| `db/schema.sql`, `scripts/db/verify-schema.mjs` | TC-02, SC-01, AS-01, EX-01, CM-01 | Additive models, migration, constraints and expanded verification |
| `src/pages/Facilities.tsx`, `FacilityDetail.tsx`, `src/lib/auth.ts` | AF-02 | Scoped controls, planning unchanged |
| `src/pages/Tasks.tsx`, `Approvals.tsx`, template dialogs | TC-01/02, AS-01, EX-01 | Entry/validation, frozen review, claim/timing and return/replacement |
| `src/pages/Assets.tsx`, `AssetDetail.tsx`, `Scheduling.tsx` | AF-01, SC-01 | Eligibility, due/period displays, PM Now and Skip |
| `src/pages/WorkOrders.tsx`, `WorkOrderDetail.tsx`, report dialog | EX-01, CM-01 | Submission/review, restoration history and links |
| `src/pages/Reports.tsx`, `Dashboard.tsx` | SC-01, CM-01 | Agreed metric presentation and state/count coherence |
| `src/lib/api.ts`, `backend/src/index.ts`, `docs/openapi.yaml` | All | Contract/types/errors and compatible consumers |

## Execution and verification gates

Keep roadmap order AF-02 → TC-01 → TC-02 → AF-01 → SC-01 → AS-01 → EX-01 → CM-01. Cross-item schema/state design may be prepared earlier so later work does not undo earlier migrations. This audit does not authorize implementation or automatically close any item.

For each implementation item: update its exact contract, add meaningful policy/SQL integration tests, then run lint, `tsc -p tsconfig.app.json --noEmit`, `tsc -p tsconfig.node.json --noEmit`, backend typecheck and applicable builds. Use a disposable SQL Server with jobs/external sends disabled, apply schema twice, verify new columns/indexes/FKs as well as tables, and exercise concurrent/failure requests. Runtime authorization must be tested through endpoints, not only helper unit tests.

D2 remains separate: clean setup, migration rehearsal, configuration, backup/restore and release/rollback evidence. D3 remains separate: representative end-to-end PM/CM and integration acceptance. Neither phase is complete because this map exists.

Audit verification: documentation checker, source-path existence and `git diff --check`; source inventory has 126 entries. No application test/build is claimed for a documentation-only audit. The current 71-operation contract gap remains open under Q-01. Remaining product boundaries retain their existing Q IDs; technical recommendations here are not invented user approvals.
