# Implementation Roadmap

Last reviewed: 2026-09-11.

## Start work here

This is the **single work reference** for this repository. It owns the next action, ordered backlog, implementation checklists, dependencies, and verification status. Do not reconstruct work from feature-review notes or use their old checkboxes as a second backlog.

**Current mode:** D1 desktop requirements discussion. Application implementation has not started. **Next action:** inspect PM execution/submission and revision paths before the next feature questions. Role-queue assignment, technician self-claim, reassignment boundaries, and aggregate daily capacity are agreed. Blackout remains as implemented; Skip next PM includes Supervisor, Admin, and Superadmin. Skip treatment in compliance remains undecided. Multi-period overdue, early execution, and PM Now reuse policy are now agreed (Q-18). Do not reopen settled decisions.

**When implementation is requested:** start with AF-02, the smallest defined permission change, unless the user selects another item. Follow the order below for the remaining work; resolve only the applicable open boundary before dependent changes. A documentation decision marked complete is not an implemented feature.

| Order | Item | Requirement | Status / remaining boundary |
| --- | --- | --- | --- |
| 1 | [AF-02](#af-02) | Admin/Superadmin-only facility master changes | Not started; inventory scoped mutations; keep PM planning rights unchanged |
| 2 | [TC-01](#tc-01) | Notes required on Fail, not merely mandatory status | Not started; reconcile RequiresNotes setting and submission validation, Q-02/Q-17 |
| 3 | [TC-02](#tc-02) | Preserve checklist at technician submission | Not started; cutoff settled; returned work and historical migration need design |
| 4 | [AF-01](#af-01) | Cancel affected PM tasks when assets become broken | Not started; scope nonterminal/approval states, PM Now and concurrency, Q-13 |
| 5 | [SC-01](#sc-01) | Recurrence follows planned dates | Not started; missed-cycle/PM Now policy agreed; blackout/migration and technical boundaries remain, Q-04/Q-18 |
| 6 | [AS-01](#as-01) | Role queue, exclusive technician claim, and reassignment locks | Not started; inspect ownership across execution/approval paths and existing individual assignments |

Read the item's linked specification and current implementation, perform its checklist, record actual evidence in [documentation verification](documentation-verification.md) for documentation work or a dated implementation verification record for runtime work, then update this document. Inspect code before asking further questions. Preserve user work and published Git history under [AGENTS.md](../AGENTS.md).

### Confirmed decisions to preserve

- Desktop/browser app and supporting backend/database are current scope; mobile is deferred. Cloudflare is only a future option, not current migration work.
- All asset master data comes from Snipe-IT; PM is passive for synchronized fields. AC/panels are excluded from maintenance scope, server UPS is a facility, and location means site. No new sync filter or asset/facility mapping is approved.
- Broken assets receive no new PM work; affected existing PM tasks become cancelled with records retained. Missing upstream assets are archived without admin confirmation.
- Facility master changes belong to Admin/Superadmin; supervisors communicate verbally. Template management and PM planning remain Supervisor/Admin/Superadmin. These are distinct permission scopes.
- Notes are required on failure; attachment rules stay as implemented. Tasks follow template changes until technician submission for approval (PendingSupervisor), when their checklist definition is preserved for review/history.
- One default template per asset/facility; first-date fallback remains current time plus interval when no date/history exists; generation horizon remains 30 days.
- Route routine work to a role queue and let eligible technicians claim it exclusively. Managers retain individual assignment/reassignment before submission and after return for revision; rule editing remains Superadmin-only. Keep aggregate daily estimated workload; no per-technician balancing is requested.
- Recurrence is anchored to planned dates: due 1 September, completed 10 September, next due 1 October. Completion/approval delays do not shift it.

Product semantics remain in the [functional specification](functional-specification.md), API schemas in [OpenAPI](openapi.yaml), and data semantics in the [database specification](database-schema-specification.md). Those documents define behavior, not separate execution queues. [Open questions](open-questions-and-challenges.md) records undecided boundaries, not a parallel backlog. Historical feature notes are optional provenance only.

## Active phase

**D0 — Documentation baseline (complete, 2026-09-10).** This phase reconstructs the documentation baseline for an existing application. It does not represent a new implementation of the product. D1 is active for desktop requirements discussion. The asset/facility handoff is recorded; Template/Checklist decisions and the technician-submission preservation cutoff are confirmed; the current feature discussion is PM settings and scheduling, with the first five decisions confirmed, including fixed planned-date recurrence; operational edge cases remain to discuss. Application implementation has not started; D2–D3 remain proposed.

Historical plans describe earlier intentions; an unchecked historical item is not proof that a feature is missing. Source inspection establishes implementation presence, not runtime correctness.

## D0 — Documentation baseline

### Objective

Establish the English documentation set required by [AGENTS.md](../AGENTS.md), reconcile conflicting guidance, and make verification gaps explicit without changing application behavior.

### Source documents

- [Documentation index](README.md) and the historical sources listed there.
- Existing root/mobile README, implementation plans, PM enhancement plans, mobile plans, journal, and APK publication guide.
- Evidence: backend routes and embedded OpenAPI, `db/schema.sql`, package scripts, Docker files, and available mobile source.

### Checklist

- [x] D0.1 Replace the entry README and publish the eight mandatory documents. [Evidence](documentation-verification.md#d01--mandatory-documents-and-entry-points).
- [x] D0.2 Reconcile architecture, environment, PM/CM workflow, mobile, and deployment guidance; preserve historical context. [Evidence](documentation-verification.md#d02--reconciliation-and-historical-preservation).
- [x] D0.3 Publish a reproducible OpenAPI baseline and record route coverage gaps. [Evidence](documentation-verification.md#d03--openapi-baseline-and-coverage).
- [x] D0.4 Verify documentation links, required sections, contract references, source parity, and schema inventory; record evidence and update this roadmap. [Evidence](documentation-verification.md#d04--structural-verification).

- [x] D0.5 Record the user-directed desktop-first priority and defer mobile-only gates. [Evidence](documentation-verification.md#d05--desktop-first-scope-follow-up).
- [x] D0.6 Consolidate all active feature action checklists into this single work reference; preserve discussion archives and verify no checklist loss. [Evidence](documentation-verification.md#unified-work-reference-consolidation--2026-09-11).

### Output

An indexed documentation baseline, supporting operational guidance, a documented API snapshot, and an explicit register of unresolved questions.

### Challenge / verification

Record results in [documentation verification](documentation-verification.md). Check for misleading claims of completed runtime verification, missing setup prerequisites, obsolete mobile paths, stale contract exports, and incomplete roadmap phases. Completion requires all D0 checks to pass; application acceptance remains a separate phase.

## Current priority — Desktop/web first

User direction, 2026-09-10: prioritize the browser-based desktop application and its supporting backend/database. Mobile questions Q-06, Q-07, and Q-11 are deferred, not resolved, and do not block desktop acceptance. Mobile-only API operations, APK delivery, native integrations, and mobile verification are excluded from D1–D3 for now. Preserve shared API compatibility when making desktop-related backend changes. Resume mobile work only when explicitly brought back into scope.

## D1 — Contract and workflow reconciliation

Status: active requirements discussion since 2026-09-11; application changes and runtime verification have not started.

### Objective

Resolve differences between documented desktop/web behavior, supporting API definitions and routes, and PM approval/scheduling behavior.

### Source documents

[functional specification](functional-specification.md), [OpenAPI](openapi.yaml), [API coverage](api-coverage.md), [data model](database-schema-specification.md), [access model](security-and-access-model.md), and [open questions](open-questions-and-challenges.md).

### Checklist

- [x] Consolidate confirmed asset/facility, template/checklist, and initial scheduling decisions into this roadmap and the functional specification. [Evidence](documentation-verification.md).
- [x] Replace per-feature work references with historical redirects; this roadmap owns AF-01/AF-02/TC-01/TC-02/SC-01.
- [x] Record agreed missed-cycle, early-execution, and PM Now reuse policy after source inspection. [Evidence](documentation-verification.md).
- [x] Record no blackout expansion and the Skip next PM role correction (Supervisor/Admin/Superadmin). [Evidence](documentation-verification.md).
- [x] Record role-queue/self-claim policy, unchanged rule administration, pre-submit/revision reassignment, and aggregate daily capacity. [Evidence](documentation-verification.md).
- [ ] Inspect PM execution/submission/revision before further questions; scope remaining implementation/migration and skip-reporting details under Q-18/Q-09.
- [ ] Execute AF-02, TC-01, TC-02, AF-01, SC-01, and AS-01 using the detailed checklist below; attach verification before marking implementation complete.
- [ ] Resolve applicable Q-12–Q-15 boundaries without re-asking settled asset/facility decisions.
- [ ] Agree on completion versus submission validation and approval role/self-approval behavior (Q-02, Q-03).
- [ ] Reconcile desktop API dependencies and payload/error contracts (Q-01); defer mobile-only gaps.
- [ ] Confirm report denominators, approval inclusion, MTTR, and timezone boundaries (Q-09).
- [ ] Complete feature discussions for remaining task/approval, CM, reporting, notification, and administration topics; record new actions here rather than creating another feature backlog.

### Output

A reconciled API/workflow contract and recorded decisions with regression evidence.

### Challenge / verification

Use an isolated test database. Exercise technician, Supervisor, Admin, and Superadmin requests; challenge invalid transitions, missing evidence, repeated submissions, concurrent PM Now calls, broken/frozen schedules, and facility approval. Verify both successful and rejected requests against the contract. Do not close using typecheck alone.

### Detailed implementation backlog

The order below is the default execution order after implementation is requested. All application work remains pending.

<a id="af-02"></a>

#### AF-02 — Restrict facility master-data changes

**Status:** not started. **Sources:** [F-01](functional-specification.md), [access model](security-and-access-model.md), Q-14; inspect facility routes, shared middleware and desktop facility controls.

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

<a id="tc-01"></a>

#### TC-01 — Outcome-based notes validation

**Status:** not started. **Sources:** [F-02/F-05](functional-specification.md), [OpenAPI](openapi.yaml), Q-02/Q-17; inspect template flags, complete/submit validation and desktop task controls.

- [ ] Align desktop and backend notes rules so Fail requires notes and mandatory status alone does not require notes on Pass/Done.
- [ ] Reconcile the existing RequiresNotes flag and UI wording with that rule; do not leave contradictory settings or silently impose extra requirements.
- [ ] Check complete and submit-for-approval paths together (Q-02), including inactive/invalid items and optional notes retention.
- [ ] Verify Fail without notes is rejected, Fail with notes is accepted when other requirements are met, and Pass/Done without notes is not rejected merely for mandatory status. Preserve mandatory no-skip enforcement and attachment behavior.

<a id="tc-02"></a>

#### TC-02 — Preserve final-submitted/historical checklist definitions

**Status:** not started. **Sources:** [F-02/F-05](functional-specification.md), [data model](database-schema-specification.md), [OpenAPI](openapi.yaml), Q-16; inspect template updates, submission, review, detail and exports.

- [x] Confirm the cutoff: technician submission through submit-for-approval, transitioning to PendingSupervisor (user decision, 2026-09-11).
- [ ] Select and implement snapshot/version storage at successful technician submission, atomically with the approval transition; rejected/failed submissions must not create a misleading finalized snapshot.
- [ ] Let nonfinal tasks follow edited templates while preserving final-submitted/historical item text, order, requirements, and evidence/result associations.
- [ ] Inspect detail, approval, export, and any other historical readers; use a consistent preserved definition where applicable.
- [ ] Define returned/reopened work behavior and handling of historical records that lack a preserved definition. Do not fabricate an original checklist that can no longer be reconstructed.
- [ ] Update schema/API documentation if the chosen implementation requires it.
- [ ] Verify edit/add/deactivate/reorder operations against nonfinal and final tasks, including PDF output and evidence links; test concurrent finalization/template edits.

The snapshot cutoff is successful technician submission entering PendingSupervisor, not final approval. Preserve definitions without assuming all authorized result corrections are forbidden. Returned/reopened work must not silently replace submitted definitions; scope that behavior before implementation.

<a id="af-01"></a>

#### AF-01 — Cancel PM work when an asset becomes broken

**Status:** not started. **Sources:** [F-01/F-03](functional-specification.md), [data model](database-schema-specification.md), Q-13; inspect `snipeSync.ts`, `scheduleCalc.ts`, task lifecycle and reports.

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

<a id="sc-01"></a>

#### SC-01 — Anchor recurring PM to the planned schedule

**Status:** not started. **Sources:** [F-03](functional-specification.md), [data model](database-schema-specification.md), Q-04/Q-18; inspect SQL calculation, scheduling jobs/routes, completion/approval and PM settings.

Observed gap: completion and final-approval paths currently include next-due calculations based on completion time; the SQL primitive prioritizes an existing next-due value and otherwise can also use completion history. The confirmed policy therefore requires reconciliation across writers and readers, not only a calendar-label change.

- [ ] Inventory next-due writers/readers: generation, SQL primitive, normal/force recalculate, completion, final approval, projections, asset/facility settings, and PM Now.
- [ ] Define and preserve a durable planned anchor and distinguish it from effective work dates. Initialize a first schedule according to the confirmed fallback without repeatedly moving it on each job run.
- [ ] Calculate recurrence from the planned schedule consistently for assets and facilities; retain actual completion and lateness history.
- [ ] Implement one actionable PM job for the current maintenance need while preserving missed-period records as not performed; never mark missed periods completed or require repeated checklists for one physical execution. Protect in-progress and approval-stage tasks from automatic replacement.
- [ ] Reconcile an overdue task's period attribution and history without silently rewriting its original planned date. Define the data/status representation of missed periods before migration; no new enum name is approved yet.
- [ ] Make early PM fulfill the next regular occurrence and prevent duplicate generation of that occurrence. Preserve planned and actual dates separately and retain the fixed cadence.
- [ ] Make PM Now reuse due/overdue work first, otherwise an existing next regular task; create a task representing the next regular occurrence only when no applicable task exists. Apply this to the same context/template with state checks and concurrency-safe deduplication.
- [ ] Implement Skip next PM for Supervisor/Admin/Superadmin with a required reason, actor/time audit, and an explicit association to exactly one planned occurrence. Keep PM enabled and the fixed schedule anchor intact.
- [ ] Handle skip both before and after task generation, preserving records and preventing regeneration of the skipped occurrence. Protect in-progress/submitted work; reconcile repeated/concurrent requests without unintentionally skipping another period.
- [ ] Verify authorized/forbidden roles, missing reason, history retention, one-occurrence-only behavior, and a skipped 1 October occurrence advancing to 1 November. Keep compliance-policy selection open until reporting decisions are made.
- [ ] Retain existing blackout behavior; inspect manual date/interval changes, month-end handling, and remaining technical boundaries before dependent changes. Do not add a general freeze/suspension workflow without further scope.
- [ ] Define migration/reconciliation for existing due dates and already-generated tasks without silently changing historical records or creating duplicates.
- [ ] Synchronize functional/API/schema documentation where the selected implementation changes those contracts.
- [ ] Verify a monthly task due 1 September and completed 10 September yields 1 October; late approval does not shift it. Test equivalent asset/facility cases, retries, repeated recalculation, first activation, history retention, and the agreed boundary cases.

No implementation or acceptance item above is complete. The fixed-schedule decision is settled; remaining operational details are tracked as Q-18 and parity work remains Q-04.

### Current scheduling discussion — Q-18

Inspection, 2026-09-11: `scheduleCalc.ts` processes one next-due candidate per context and avoids reinserting the same context/template/due date. It does not enumerate every missed period. Asset and facility PM Now routes create work due now, using the default template. Duplicate checks consider unfinished, uncancelled tasks whose due time falls in the recent idempotency window (default 15 minutes), rather than all open/overdue regular tasks. Thus an older overdue task or a future regular task does not inherently prevent a new PM Now task. This is static source evidence, not a live test.

Confirmed product decisions (user agreement, 2026-09-11):

1. Keep one actionable job for the current PM need; missed periods remain separately recorded as not performed. For unfinished September PM discovered in November, perform maintenance once for the current need and retain September/October misses. After November work, the next planned date remains 1 December. Do not automatically replace work already in progress or submitted for approval.
2. Early PM replaces only the next regular occurrence. Work on 20 September for a 1 October occurrence fulfills October; the following planned date is 1 November. Keep actual work time separate from the 1 October planned due date.
3. PM Now reuses applicable due/overdue work first. If none exists, reuse an existing next regular task for early execution. If neither exists, create the PM Now task to represent the next regular occurrence and prevent an additional duplicate regular task.

These rules are the implementation target, not current runtime guarantees. Current task/period identities, missed-period storage/reporting, pre-existing duplicate tasks, in-progress/review exceptions, and migration must be reconciled without deleting history or inventing completion. The fixed recurrence and reuse decisions are settled; inspect before asking only the remaining boundaries.

### Current blackout and suspension discussion

Inspection, 2026-09-11: blackout records have name, start/end, and active state, with no site/context selector. SQL fn_CalculateNextDueAt shifts a matching due date to the maximum matching blackout EndsAt; it does not implement a general working-day/holiday calendar. Blackout management routes require Superadmin. Existing persisted tasks are not automatically rescheduled by the inspected blackout CRUD paths.

Asset/facility PM settings expose PMEnabled. The inspected setters do not cancel existing tasks. Generation and projections skip disabled contexts. Frozen columns are read by scheduling, but no application mutation of Frozen was found in the inspected backend/DDL search; do not describe a verified end-to-end freeze control. Facility settings also overwrite default-template/next-due fields from the submitted payload whereas asset settings preserve omitted fields; account for this difference when designing intentional suspension.

Confirmed direction, 2026-09-11:

- Ordinary scheduling is sufficient. Retain existing global blackout behavior; do not add site-specific blackout rules or a new suspension workflow now. This does not change existing blackout administration permissions.
- Use Skip next PM to intentionally omit one upcoming occurrence while keeping subsequent recurrence anchored. It must not disable PM indefinitely.
- Supervisor, Admin, and Superadmin may perform Skip next PM. Require a reason and retain who skipped, when, which planned occurrence, and its history; a skip is not completion.
- Example: skip 1 October, then the next regular occurrence remains 1 November. Preserve an already-generated task record and do not silently replace in-progress or approval-stage work.
- Keep deliberate skip distinguishable from unperformed overdue work. Its compliance denominator/score treatment is undecided and belongs to the reporting discussion (Q-09).

### Current assignment and capacity discussion

Source inspection, 2026-09-11:

- `scheduleCalc.ts` selects the first effective active assignment rule matching category, site/location, and raw asset status, ordered by priority ascending then update time descending. It assigns the specified user/role; absent a target it falls back to the template RequiredRoleId. If neither exists, both targets may remain null. No workload-balancing logic was found in this resolver.
- `tasks.ts` uses manager guards for assignment/reassignment and bulk assignment. Its access helper allows managers, the assigned user, or a member of the assigned role; it does not itself establish an exclusive technician claim. These are access-helper observations, not verification of all lifecycle endpoints.
- Assignment updates carry an audit record and can trigger notification on changed individual assignee. The inspected assignment route does not have an approval-status gate; phase/ownership restrictions must not be inferred from checklist editing locks.
- `scheduling.ts` limits assignment-rule create/update/delete to Superadmin. That differs from manager access to assigning individual tasks.
- Calendar capacity SQL sums estimated minutes per date across actual/projected occurrences. It does not calculate technician staffing/shift capacity or distribute work to the least-loaded technician.

Confirmed user decisions, 2026-09-11:

- Main flow: existing routing rules direct routine work to an appropriate role queue; an eligible technician takes the task and becomes its single responsible person. Supervisor manual allocation is not required for every task.
- Preserve manager assignment/reassignment for exceptions such as urgent work or technician absence. Do not silently erase existing individual assignments when introducing the role-queue default.
- Claim must be exclusive: two concurrent claimants cannot both succeed, and other technicians cannot take over an already-owned task without authorized reassignment.
- Assignment-rule management remains Superadmin-only. Existing Supervisor/Admin/Superadmin individual assignment privileges are retained.
- Reassignment is permitted before technician submission, including during execution. Lock it after submission; allow it again when a Supervisor returns the work for revision. Do not equate arbitrary rejection/cancellation with an authorized return-to-work transition.
- Retain aggregate estimated workload per day. Per-technician capacity, shift planning, and automatic workload balancing are not requested.

These are target requirements, not current runtime guarantees. Implementation belongs to AS-01 below.

<a id="as-01"></a>

#### AS-01 — Role queue, exclusive claim, and reassignment boundaries

**Status:** not started. **Sources:** [F-03/F-04](functional-specification.md), [access model](security-and-access-model.md), [OpenAPI](openapi.yaml), [data model](database-schema-specification.md); inspect `scheduleCalc.ts`, assignment-rule and task routes, task access helper, and desktop task/approval controls.

Observed gap: role membership currently permits task modification without an exclusive claim, and the inspected assignment route has no approval-state gate. The resolver can target a user or role; this is not a workload-balancing algorithm.

- [ ] Preserve existing rule matching/priority and template-role fallback while making the role queue plus self-claim the routine workflow. Inspect existing user-target rules and unassigned tasks before changing configuration or migration defaults.
- [ ] Implement an atomic eligible-technician claim for an unowned, executable role-queue task. Revalidate role, assignee, and lifecycle/approval state at mutation time; handle repeat requests without duplicate ownership.
- [ ] Enforce the responsible technician across execution, draft/evidence updates, and submission. Do not allow retained role membership to bypass an established individual owner; preserve authorized manager intervention.
- [ ] Keep Supervisor/Admin/Superadmin individual assignment rights, but enforce pre-submission or explicitly returned-for-revision state. Prevent assignment payloads or other endpoints from bypassing the lock by changing status in the same request.
- [ ] Define execution handoff during reassignment without losing previous actor/result/evidence history. Reconcile return-for-revision ownership with the frozen submitted checklist requirement in TC-02.
- [ ] Record claim and reassignment actor/time/history and align desktop queue/claim/owner controls and relevant notifications. Keep assignment-rule mutations Superadmin-only.
- [ ] Update the API contract and data/access specifications for the implemented behavior; do not invent an endpoint or schema before its design is reviewed.
- [ ] Verify two simultaneous eligible claimants yield one owner, wrong-role claims and takeover are rejected, manager assignment is retained, submitted work cannot be reassigned, and explicit revision restores permitted reassignment. Test stale clients and preservation of work/history.
- [ ] Retain aggregate daily capacity behavior and verify no per-technician staffing/balancing feature was added inadvertently.

No application checklist item is complete. Remaining ownership/handoff mechanics must be inspected and resolved without reopening the agreed primary workflow.

### Feature intake rule

For the next feature, inspect implementation briefly, discuss only remaining product decisions, update its functional-specification section and question IDs, and add any agreed implementation item to this backlog with sources, boundaries, verification, and status. Do not create another active feature-plan file.

## D2 — Reproducible environment and delivery

Status: proposed; not started; depends on applicable D1 decisions.

### Objective

Make desktop/web and backend fresh-checkout setup and deployment reproducible.

### Source documents

[Technical plan](technical-implementation-plan.md), [deployment](deployment-and-environment.md), [testing](testing-strategy.md), and [open questions](open-questions-and-challenges.md).

### Checklist

- [ ] Decide whether local-only authentication may start without LDAP configuration (Q-05).
- [ ] Validate clean setup, repeatable schema application, and expand schema verification coverage (Q-08).
- [ ] Establish CI commands, environment templates, release evidence, backup/restore ownership, and rollback procedure (Q-10).

### Output

A verified installation and release runbook with reproducible inputs.

### Challenge / verification

Use a fresh checkout and disposable database, apply schema twice, restart services, verify same-origin API routing, and verify the desktop browser application. Verify backup restoration before making recovery claims. Capture actual versions and command results.

## D3 — End-to-end operational acceptance

Status: proposed; not started; depends on D1 and D2.

### Objective

Validate desktop/web CMMS workflows and supporting integrations in a representative staging environment.

### Source documents

[Project plan](project-plan.md), [functional specification](functional-specification.md), [integration contracts](integration-contracts.md), [testing strategy](testing-strategy.md), and [operational runbook](operational-runbook.md).

### Checklist

- [ ] Verify PM and CM execution, evidence, approval, reporting, and role restrictions end to end.
- [ ] Verify Snipe-IT synchronization, desktop-relevant notification behavior, retry behavior, and job observability; defer native mobile push delivery tests.
- [ ] Record business acceptance criteria, owners, remaining limitations, and release decision.

### Output

A dated acceptance report tied to a commit, environment, and test evidence.

### Challenge / verification

Test loss of connectivity, expired credentials, duplicate actions, absent storage, failed external services, rejected approval, and timezone boundaries. External messages must use explicitly authorized test recipients. Close only after evidence is attached and unresolved release blockers are addressed.
