# Implementation Roadmap

Last reviewed: 2026-10-05.

## Start work here

This is the **single work reference** for this repository. It owns the next action, ordered backlog, implementation checklists, dependencies, and verification status. Do not reconstruct work from feature-review notes or use their old checkboxes as a second backlog.

**Current mode:** D2 environment verification, alongside remaining D1 contract discussions. AF-02 facility master permissions, TC-01 checklist validation, TC-02 checklist snapshot preservation, AF-01 broken-asset cancellation, SC-01 planned-date recurrence, AS-01 role-queue claim/ownership boundaries, EX-01 timed PM execution/return-to-work semantics, CM-01 supervisor-verified work-order closure/restoration timing, the current Q-09 reporting semantics plus desktop dashboard/report contract coverage, the Q-02 PM submission-versus-completion boundary, the Q-03 PM maker-checker review policy, and the Q-04 final-approval schedule parity are implemented and locally verified; [AF-02 evidence](verification-af02.md), [TC-01 evidence](verification-tc01.md), [TC-02 evidence](verification-tc02.md), [AF-01 evidence](verification-af01.md), [SC-01 evidence](verification-sc01.md), [AS-01 evidence](verification-as01.md), [EX-01 evidence](verification-ex01.md), [CM-01 evidence](verification-cm01.md), [Q-01/Q-09 evidence](verification-q01-q09.md), [Q-02/Q-03 evidence](verification-q02-q03.md), and [Q-04 evidence](verification-q04.md) remain separate. **Next action:** complete remaining D2 delivery/recovery gates; Q-05 local-only authentication is implemented and locally verified ([evidence](verification-q05.md)); see [D2 evidence](verification-d2-environment.md). Q-12 mapping is deferred; retain current synchronization. Task/work-order deletion boundaries are implemented and verified against live SQL via isolated local HTTP routes (12 scenario groups); see [evidence](verification-task-deletion.md). Q-14/Q-15 are implemented and verified against live SQL through isolated HTTP routes (9 scenario groups); see [policy verification](verification-q14-q15.md). Full local regression passes 149/149 (2026-09-29); backend typecheck/build and lint pass. Desktop OpenAPI coverage is now 127/141, with [contract verification](verification-q01-desktop.md). The 2026-09-27 live schema blocker is resolved by a scoped additive migration; live deletion/rollback/reference/concurrency checks pass. Deployed API/web acceptance remains separate. Preserve settled decisions.

**Production storage checkpoint, 2026-10-03:** user-approved CIFS migration is complete: `//10.60.10.44/ict` is mounted at `/mnt/preventive-evidence` and bound to API `/app/shared-documents`. All 102 local files were copied and verified; local originals retained. API filesystem guard, runtime read/write, health, and proxy passed; Hermes independently verified container state. The initial user-approved application release ran commit `7a68e7abebad64eb74b8b4644d33037b58662bad`; the subsequent Tasks correction deployed API/web from `49572fd37952f1e4dbcd332f2b589615398778e1`. The 2026-10-05 context correction below supersedes only the web image. Both services are healthy; SQL connectivity, public HTTPS/new web assets, proxy routing, and all 102 evidence hashes plus container write/read/delete passed. SQL COPY_ONLY/CHECKSUM backup and VERIFYONLY passed. See [D2 evidence](verification-d2-environment.md) and [deployment details](deployment-and-environment.md). The production subfolder was validated by reviewed equivalent deployment steps; the committed script still needs to support that configuration for future direct script use. Authenticated Tasks list acceptance passed; broader business acceptance, tested restore/rollback, recovery ownership, remote CI, and reboot acceptance remain open.

**Selected correction, 2026-10-03:** user requested the desktop Tasks tabs/layout/counts/filtering audit. This D1 runtime/UI correction is active alongside D2. Server-side facets/search/approved-only, exact totals and wrapping counted tabs with pagination are implemented; 158/158 Linux regression, build/typecheck/contract checks, the exact generated SQL batch for all views and scoped browser checks passed. That release deployed API/web from commit `49572fd37952f1e4dbcd332f2b589615398778e1`; authenticated acceptance of all ten views, scoped counts/search/approved-only/pagination, storage and independent Hermes runtime verification passed. The earlier candidate was withheld and its duplicate SQL ordering corrected before activation. Existing global-header overflow on narrow desktop panes remains UI debt outside the task-tab correction. See [Tasks verification](verification-q01-desktop.md#tasks-views-badge-totals-and-filtering--2026-10-03). Keep D2 recovery and D3 business acceptance open.

**Selected correction, 2026-10-05:** preserve the Tasks view/filter/page when its detail modal closes after supervisor/final approval. Remove only a deep-link `taskId`; refresh Tasks and approval queues after successful approval. Implemented; scoped synthetic browser approval/deep-link/close tests, frontend typecheck/build, five task-list regression groups and docs verification passed. Production web-only release `ce0dbd2` and authenticated modal-close acceptance passed; API container remained unchanged. Hermes independently verified runtime. The selected correction is complete; see [verification](verification-q01-desktop.md#tasks-modal-return-context--2026-10-05). This is a D1 navigation correction alongside D2, with no backend/permission/approval-policy change.

**When implementation is requested:** continue the remaining D1 contract and product boundaries after the locally completed eight-item backlog and Q-02/Q-03/Q-04/Q-09, unless the user selects another item. Follow the order below for the remaining work; resolve only the applicable open boundary before dependent changes. A documentation decision marked complete is not an implemented feature.

| Order | Item | Requirement | Status / remaining boundary |
| --- | --- | --- | --- |
| 1 | [AF-02](#af-02) | Admin/Superadmin-only facility master changes | Implemented; local HTTP/browser/static/build checks passed; deployment verification separate |
| 2 | [TC-01](#tc-01) | Notes required on Fail, not merely mandatory status | Implemented; local HTTP/typecheck/build/docs checks passed; PM submission/completion boundary is now documented and locally verified |
| 3 | [TC-02](#tc-02) | Preserve checklist at technician submission | Implemented; local HTTP/typecheck/build/docs checks passed; legacy fallback is explicit |
| 4 | [AF-01](#af-01) | Cancel affected PM tasks when assets become broken | Implemented; local HTTP/typecheck/build/docs checks passed; no automatic reopen on later asset reappearance |
| 5 | [SC-01](#sc-01) | Recurrence follows planned dates | Implemented locally; planned-versus-effective reporting semantics are now documented and locally verified |
| 6 | [AS-01](#as-01) | Role queue, exclusive technician claim, and reassignment locks | Implemented locally; concurrent claim, ownership precedence, and submitted-PM reassignment lock verified |
| 7 | [EX-01](#ex-01) | PM work timing, Fail-to-WO option, and revision/rejection semantics | Implemented locally; work sessions, rejection replacement, and finding-linked WO reuse verified |
| 8 | [CM-01](#cm-01) | Supervisor-verified WO closure and independent downtime end | Implemented locally; additive event/interval model, return-for-correction, and linked recurrence verified |

The [code-to-implementation map](code-implementation-map.md) and [source inventory](code-audit-inventory.json) support every item; this roadmap remains the only execution checklist.

Read the item's linked specification and current implementation, perform its checklist, record actual evidence in [documentation verification](documentation-verification.md) for documentation work or a dated implementation verification record for runtime work, then update this document. Inspect code before asking further questions. Preserve user work and published Git history under [AGENTS.md](../AGENTS.md).

### Laptop and session handoff

Updated: 2026-09-11. This section carries conversational working context; this roadmap remains the only active backlog. Read AGENTS.md, README.md, this document, then the linked specification and open questions for the selected topic.

- Working mode: user authorized implementation on 2026-09-11. AF-02, TC-01, TC-02, AF-01, SC-01, AS-01, EX-01, and CM-01 are locally complete. Communicate with the user in Indonesian; maintain repository documentation in English.
- Working preference: inspect relevant implementation briefly before asking a small batch of feature questions. Recommend practical defaults when requested, preserve explicit agreements, and distinguish implemented behavior from approved future behavior.
- Latest agreement: Reject creates a new linked replacement task; the rejected task retains its results, evidence, work time, and rejection reason. Revise corrects the existing task and requires a written reason. EX-01 and CM-01 now implement those workflow boundaries locally.
- Resume point: the eight-item source audit and implementation map are complete; review code-implementation-map.md before starting the next user-selected item. AF-02, TC-01, TC-02, AF-01, SC-01, AS-01, EX-01, and CM-01 are locally complete, including CM `pending_review` repair submission, manager verify-close, same-WO correction return, independent restoration logging, repeated downtime intervals before closure, linked recurrence work orders after closure, shared PM-route bypass guards, and the current desktop reporting/dashboard contract semantics. Q-14/Q-15 now also pass live SQL state-transition tests via isolated HTTP routes: site/active template required at activation; disabling PM or archiving a facility cancels only unstarted PM. Deletion boundaries now pass isolated local HTTP tests against live SQL after the scoped additive migration: PM/CM separation, owned-row cleanup, atomic audit, and history-reference conflicts. Q-12 mapping is deferred; preserve current synchronization. Immediate follow-up: D2 authentication, delivery and recovery gates, while remaining D1 contract discussions stay tracked. Q-02/Q-03/Q-04 are locally verified.
- Transfer checkpoint: inspected branch was `main`, HEAD `3039da9`. This is a pre-handoff baseline, not proof that the latest edits are committed or uploaded. Run `git status --short` and inspect the current commit on both laptops. Documentation/checker edits were still uncommitted when this handoff was prepared; this session did not commit or push.
- Verification: run `node scripts/docs/check-docs.mjs` and `git diff --check`; see [verification evidence](documentation-verification.md). Runtime/database acceptance remains pending. Install Node.js 22 on the new laptop; do not depend on the old laptop's editor-bundled Node path.

Before leaving the old laptop, review and commit the intended documentation/checker changes and push normally to the intended remote branch, then confirm the remote contains that commit. Preserve published history and the Lovable connection. A clone only receives committed, pushed files. Alternatively, privately transfer the complete working repository including `.git` and uncommitted files; verify its status after copying. Do not assume either transfer has happened just because this section exists.

On the new laptop, clone/pull the transferred branch or open the private repository copy. Compare the commit and working changes, then open the project in Codex. Requirements discussion only needs the repository; application execution additionally needs dependencies and environment setup in the [deployment guide](deployment-and-environment.md). Transfer `.env` and credentials privately, never through Git. The current `.gitignore` also excludes `mobile`; preserve that local source separately even though mobile work is deferred. Database contents and uploaded files require their own backup/access arrangement if locally hosted; Git does not carry them. Reconfigure machine-specific paths and sign in to required tools on the new laptop.

Starter prompt for a new session:

> Read AGENTS.md, README.md, and docs/implementation-roadmap.md, especially Start work here and Laptop and session handoff. Continue D1 desktop requirements discussion in Indonesian. Read the linked specifications and open questions, inspect relevant code before asking questions, preserve confirmed decisions, and do not implement application changes yet. Start from the recorded resume point and report any repository-state mismatch.

Before future handoffs, update Current mode, Next action, this checkpoint, settled decisions, remaining questions, and verification evidence together. Keep secrets and full chat transcripts out of this document.

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

**D0 — Documentation baseline (complete, 2026-09-10).** D1 is active for desktop implementation. Asset/facility, template/checklist, scheduling, assignment, and initial execution/return-to-work decisions are recorded below. Reject now requires a linked replacement task. All eight ordered items through CM-01 are implemented with local evidence. Q-02/Q-03/Q-04/Q-09 are locally verified; remaining D1 contract and product boundaries stay open. D2 is in progress with schema/release-tooling evidence; D3 remains proposed.

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

Status: active implementation since 2026-09-11. AF-02, TC-01, TC-02, AF-01, SC-01, AS-01, EX-01, and CM-01 are implemented and verified locally; later phases and deployment acceptance remain pending.

### Objective

Resolve differences between documented desktop/web behavior, supporting API definitions and routes, and PM approval/scheduling behavior.

### Source documents

[functional specification](functional-specification.md), [OpenAPI](openapi.yaml), [API coverage](api-coverage.md), [data model](database-schema-specification.md), [access model](security-and-access-model.md), and [open questions](open-questions-and-challenges.md).

### Checklist

- [x] Audit and map all eight roadmap items across desktop/backend/SQL/jobs and indirect writers. Evidence: [technical map](code-implementation-map.md), [126-file screening inventory](code-audit-inventory.json), and [verification record](documentation-verification.md#d1--eight-item-code-audit-and-implementation-map-2026-09-11). The original map is a pre-implementation source checkpoint; current implementation status is recorded above.
- [x] Consolidate confirmed asset/facility, template/checklist, and initial scheduling decisions into this roadmap and the functional specification. [Evidence](documentation-verification.md).
- [x] Replace per-feature work references with historical redirects; this roadmap owns AF-01/AF-02/TC-01/TC-02/SC-01.
- [x] Record agreed missed-cycle, early-execution, and PM Now reuse policy after source inspection. [Evidence](documentation-verification.md).
- [x] Record no blackout expansion and the Skip next PM role correction (Supervisor/Admin/Superadmin). [Evidence](documentation-verification.md).
- [x] Record role-queue/self-claim policy, unchanged rule administration, pre-submit/revision reassignment, and aggregate daily capacity. [Evidence](documentation-verification.md).
- [x] Inspect execution/submission/revision and record initial EX-01 decisions, including linked replacement after Reject; prepare the repository session handoff. [Evidence](documentation-verification.md).
- [x] Resolve remaining execution/CM, implementation/migration, and skip-reporting boundaries under Q-20/Q-18/Q-09 after source inspection. [Evidence](verification-q01-q09.md).
- [x] Implement and verify AF-02 scoped facility permissions. [Evidence](verification-af02.md).
- [x] Execute CM-01 using the detailed checklist below; AS-01 is implemented with [verification evidence](verification-as01.md), EX-01 is implemented with [verification evidence](verification-ex01.md), and CM-01 is implemented with [verification evidence](verification-cm01.md).
- [x] Repair facility PM partial-update data loss and document omitted-field/explicit-clear semantics. [Evidence](verification-d1-regression.md).
- [x] Record Q-14/Q-15 product decisions: site and active template required at activation; disabling PM/archiving a facility cancels only unstarted PM tasks (2026-09-27).
- [x] Implement and verify the Q-14/Q-15 activation/cancellation policy across individual, bulk, clone, generation and reopen paths; see [evidence](verification-q14-q15.md).
- [x] Record Q-12 deferral confirmed 2026-09-27: retain current synchronization; no asset-to-facility mapping or new filtering. This is a scope decision, not an implemented mapping feature. See [boundary review](d1-boundary-review.md).
- [x] Verify and record the current PM submission-versus-completion contract, including repeated submission behavior (Q-02). [Evidence](verification-q02-q03.md).
- [x] Decide and implement PM own-work/self-approval behavior under Q-03; Updated user direction (2026-10-05): Supervisor own-submission review is allowed at PendingSupervisor only; final-stage and CM restrictions remain. Local targeted verification (18/18) and final-source Linux verification (160/160, lint, builds/typechecks, schema-source and contracts) passed. User authorized push/main and API activation on 2026-10-05. API source `802ab79` is deployed and runtime-verified; web container/image retained. Public contract, SQL task read, compiled guards, CIFS and authenticated read-only browser acceptance passed. See current release evidence; D2 recovery/D3 business acceptance remain open. [Evidence](verification-q02-q03.md).
- [x] Validate final approval schedule recalculation parity across asset and facility PM (Q-04). [Evidence](verification-q04.md).
- [x] Classify all 51 uncovered API operations by desktop callers: 37 have current desktop references. [Boundary review](d1-boundary-review.md). This is static dependency evidence only.
- [x] Repair and verify PM/CM deletion boundaries and all current task foreign-key dependencies; see [evidence](verification-task-deletion.md).
- [ ] Reconcile desktop payload/error contracts (Q-01) using the classified inventory; defer mobile-only gaps.
- [x] Confirm report denominators, approval inclusion, MTTR, and timezone boundaries (Q-09). [Evidence](verification-q01-q09.md).
- [ ] Complete feature discussions for remaining task/approval, CM, reporting, notification, and administration topics; record new actions here rather than creating another feature backlog.

### Output

A reconciled API/workflow contract and recorded decisions with regression evidence.

### Challenge / verification

Use an isolated test database. Exercise technician, Supervisor, Admin, and Superadmin requests; challenge invalid transitions, missing evidence, repeated submissions, concurrent PM Now calls, broken/frozen schedules, and facility approval. Verify both successful and rejected requests against the contract. Do not close using typecheck alone.

### Detailed implementation backlog

The order below is the default execution order after implementation is requested. The ordered feature backlog through CM-01 is now implemented locally; remaining D1 work is boundary reconciliation and later-phase execution.

<a id="af-02"></a>

#### AF-02 — Restrict facility master-data changes

**Status:** implemented and locally verified, 2026-09-11. **Sources:** [F-01](functional-specification.md), [access model](security-and-access-model.md), Q-14; inspect facility routes, shared middleware and desktop facility controls.

User requirement: Admin/Superadmin create, edit, and archive facilities. Supervisors communicate needs verbally; no application request/approval queue is required.

Resolved gap: create/update/clone now use scoped Admin/Superadmin authorization; PM settings/PM Now retain requireManager. The desktop bulk archive uses the guarded update endpoint.

Implementation checklist:

- [x] Inventory all facility master-data mutations, including clone and any bulk/archive path; distinguish them from PM configuration and task execution.
- [x] Apply scoped Admin/Superadmin authorization to facility master-data changes; do not narrow the shared manager guard globally.
- [x] Align desktop controls with backend authorization.
- [x] Verify authorized Admin/Superadmin requests and rejected Supervisor/Technician requests directly against each affected endpoint.
- [x] Verify reading facilities and unrelated PM execution/assignment are not accidentally restricted.
- [x] Synchronize API/access/workflow documentation and attach verification evidence.

Verification: role matrix tests for each affected mutation, direct-request bypass attempts, and a desktop interaction check. Facility closure effects on open work remain a separate decision; do not add an approval workflow to satisfy verbal coordination.

Evidence: [AF-02 verification](verification-af02.md), 37 passing HTTP tests with a fixture SQL boundary, Chrome role/interaction checks, lint/typechecks/builds and OpenAPI parity. No live database/deployment acceptance is claimed.

<a id="tc-01"></a>

#### TC-01 — Outcome-based notes validation

**Status:** implemented and locally verified, 2026-09-15. **Sources:** [F-02/F-05](functional-specification.md), [OpenAPI](openapi.yaml), Q-02/Q-17; inspect template flags, complete/submit validation and desktop task controls.

- [x] Align desktop and backend notes rules so Fail requires notes and mandatory status alone does not require notes on Pass/Done.
- [x] Reconcile the existing RequiresNotes flag and UI wording with that rule; do not leave contradictory settings or silently impose extra requirements.
- [x] Check complete and submit-for-approval paths together (Q-02), including inactive/invalid items and optional notes retention.
- [x] Verify Fail without notes is rejected, Fail with notes is accepted when other requirements are met, and Pass/Done without notes is not rejected merely for mandatory status. Preserve mandatory no-skip enforcement and attachment behavior.

Evidence: [TC-01 verification](verification-tc01.md). Submit and complete now share PM checklist validation for active item membership, duplicates, mandatory non-skip outcomes, fail notes, explicit notes-on-pass/done flags, and attachment requirements. `submit-for-approval` remains distinct from lifecycle completion and still does not set `Status = completed`; that state boundary stays open under Q-02.

<a id="tc-02"></a>

#### TC-02 — Preserve final-submitted/historical checklist definitions

**Status:** implemented and locally verified, 2026-09-16. **Sources:** [F-02/F-05](functional-specification.md), [data model](database-schema-specification.md), [OpenAPI](openapi.yaml), Q-16; inspect template updates, submission, review, detail and exports.

- [x] Confirm the cutoff: technician submission through submit-for-approval, transitioning to PendingSupervisor (user decision, 2026-09-11).
- [x] Select and implement snapshot/version storage at successful technician submission, atomically with the approval transition; rejected/failed submissions must not create a misleading finalized snapshot.
- [x] Let nonfinal tasks follow edited templates while preserving final-submitted/historical item text, order, requirements, and evidence/result associations.
- [x] Inspect detail, approval, export, and any other historical readers; use a consistent preserved definition where applicable.
- [x] Define returned/reopened work behavior and handling of historical records that lack a preserved definition. Do not fabricate an original checklist that can no longer be reconstructed.
- [x] Update schema/API documentation if the chosen implementation requires it.
- [x] Verify edit/add/deactivate/reorder operations against nonfinal and final tasks, including PDF output and evidence links; test concurrent finalization/template edits.

Evidence: [TC-02 verification](verification-tc02.md). Successful technician submission now captures `PMTaskChecklistSnapshots` atomically with the approval transition, later review/detail/export/checklist-progress readers prefer the frozen definition, returned/reopened work retains the existing snapshot, and legacy historical tasks surface an explicit live-template fallback instead of pretending to know the original submitted checklist.

<a id="af-01"></a>

#### AF-01 — Cancel PM work when an asset becomes broken

**Status:** implemented and locally verified, 2026-09-16. **Sources:** [F-01/F-03](functional-specification.md), [data model](database-schema-specification.md), [OpenAPI](openapi.yaml), Q-13; inspect `snipeSync.ts`, `scheduleCalc.ts`, task lifecycle and reports.

User requirement: a broken asset receives no new PM tasks; its affected existing tasks become `cancelled` and remain in history.

Resolved implementation: Snipe-IT sync now cancels all unfinished PM asset tasks when the synchronized operational status becomes `broken`, records a system audit trail/reason, and leaves completed/cancelled PM history plus CM work orders untouched. Schedule insertion and PM Now recheck asset eligibility at mutation time, and PM lifecycle actions that would make the task actionable again return a conflict while the asset remains broken.

Implementation checklist:

- [x] Inspect and define the affected nonterminal PM statuses and the status-change/sync trigger. All unfinished PM asset tasks, including approval-pending submissions, are affected; completed/cancelled PM history and CM work orders are excluded.
- [x] Implement cancellation with a reason, timestamp, and attributable system/audit event while retaining task/checklist/evidence records.
- [x] Make repeated syncs idempotent and reconcile races with completion/approval.
- [x] Keep new-task generation blocked for broken assets; check manual PM Now and lifecycle routes for applicable consistency before deciding their behavior.
- [x] Verify task lists, scheduling, overdue counts, history, and reports against the agreed cancellation behavior.
- [x] Update API/workflow documentation for actual changed behavior and record test evidence.

Evidence: [AF-01 verification](verification-af01.md). Broken-asset cancellation now uses the existing PM cancellation fields plus system audit entries, cancels unfinished PM asset work on sync, blocks PM Now/start/pause/resume/complete/submit/reopen while the asset remains broken, keeps retries idempotent, and leaves completed PM history plus CM work untouched. Asset reappearance does not silently reopen previously cancelled PM tasks.

<a id="sc-01"></a>

#### SC-01 — Anchor recurring PM to the planned schedule

**Status:** implemented and locally verified, 2026-09-16. **Sources:** [F-03](functional-specification.md), [data model](database-schema-specification.md), [OpenAPI](openapi.yaml), Q-04/Q-18; inspect SQL calculation, scheduling jobs/routes, completion/approval and PM settings.

Resolved implementation: SC-01 now persists `NextPlannedPMDueAt` separately from blackout-adjusted `NextPMDueAt`, stores `PlannedDueAt` and `FulfilledPlannedDueAt` on PM tasks, records `PMMissedOccurrences` and `PMSkippedOccurrences`, advances recurrence from planned dates in completion and final approval, reuses due/overdue or upcoming regular work for PM Now, and exposes skip-next-PM plus planned/effective due data in the desktop/client contract.

- [x] Inventory next-due writers/readers: generation, SQL primitive, normal/force recalculate, completion, final approval, projections, asset/facility settings, and PM Now.
- [x] Define and preserve a durable planned anchor and distinguish it from effective work dates. Initialize a first schedule according to the confirmed fallback without repeatedly moving it on each job run.
- [x] Calculate recurrence from the planned schedule consistently for assets and facilities; retain actual completion and lateness history.
- [x] Implement one actionable PM job for the current maintenance need while preserving missed-period records as not performed; never mark missed periods completed or require repeated checklists for one physical execution. Protect in-progress and approval-stage tasks from automatic replacement.
- [x] Reconcile an overdue task's period attribution and history without silently rewriting its original planned date. Define the data/status representation of missed periods before migration; no new enum name is approved yet.
- [x] Make early PM fulfill the next regular occurrence and prevent duplicate generation of that occurrence. Preserve planned and actual dates separately and retain the fixed cadence.
- [x] Make PM Now reuse due/overdue work first, otherwise an existing next regular task; create a task representing the next regular occurrence only when no applicable task exists. Apply this to the same context/template with state checks and concurrency-safe deduplication.
- [x] Implement Skip next PM for Supervisor/Admin/Superadmin with a required reason, actor/time audit, and an explicit association to exactly one planned occurrence. Keep PM enabled and the fixed schedule anchor intact.
- [x] Handle skip both before and after task generation, preserving records and preventing regeneration of the skipped occurrence. Protect in-progress/submitted work; reconcile repeated/concurrent requests without unintentionally skipping another period.
- [x] Verify authorized/forbidden roles, missing reason, history retention, one-occurrence-only behavior, and a skipped 1 October occurrence advancing to 1 November. Keep compliance-policy selection open until reporting decisions are made.
- [x] Retain existing blackout behavior; inspect manual date/interval changes, month-end handling, and remaining technical boundaries before dependent changes. Do not add a general freeze/suspension workflow without further scope.
- [x] Define migration/reconciliation for existing due dates and already-generated tasks without silently changing historical records or creating duplicates.
- [x] Synchronize functional/API/schema documentation where the selected implementation changes those contracts.
- [x] Verify a monthly task due 1 September and completed 10 September yields 1 October; late approval does not shift it. Test equivalent asset/facility cases, retries, repeated recalculation, first activation, history retention, and the agreed boundary cases.

Evidence: [SC-01 verification](verification-sc01.md). Reporting now explicitly uses the effective due window (`ScheduledDueAt`) and keeps skipped-versus-missed history distinguishable without reopening the fixed-cadence implementation.

### Current scheduling discussion — Q-18

Inspection, 2026-09-11: `scheduleCalc.ts` processes one next-due candidate per context and avoids reinserting the same context/template/due date. It does not enumerate every missed period. Asset and facility PM Now routes create work due now, using the default template. Duplicate checks consider unfinished, uncancelled tasks whose due time falls in the recent idempotency window (default 15 minutes), rather than all open/overdue regular tasks. Thus an older overdue task or a future regular task does not inherently prevent a new PM Now task. This is static source evidence, not a live test.

Confirmed product decisions (user agreement, 2026-09-11):

1. Keep one actionable job for the current PM need; missed periods remain separately recorded as not performed. For unfinished September PM discovered in November, perform maintenance once for the current need and retain September/October misses. After November work, the next planned date remains 1 December. Do not automatically replace work already in progress or submitted for approval.
2. Early PM replaces only the next regular occurrence. Work on 20 September for a 1 October occurrence fulfills October; the following planned date is 1 November. Keep actual work time separate from the 1 October planned due date.
3. PM Now reuses applicable due/overdue work first. If none exists, reuse an existing next regular task for early execution. If neither exists, create the PM Now task to represent the next regular occurrence and prevent an additional duplicate regular task.

These rules are now implemented locally by SC-01. Current reporting semantics are documented under Q-09; remaining follow-up is limited to any future parity regressions tracked by Q-04.

### Current blackout and suspension discussion

Inspection, 2026-09-11: blackout records have name, start/end, and active state, with no site/context selector. SQL fn_CalculateNextDueAt shifts a matching due date to the maximum matching blackout EndsAt; it does not implement a general working-day/holiday calendar. Blackout management routes require Superadmin. Existing persisted tasks are not automatically rescheduled by the inspected blackout CRUD paths.

Asset/facility PM settings expose PMEnabled. The inspected setters do not cancel existing tasks. Generation and projections skip disabled contexts. Frozen columns are read by scheduling, but no application mutation of Frozen was found in the inspected backend/DDL search; do not describe a verified end-to-end freeze control. Facility settings also overwrite default-template/next-due fields from the submitted payload whereas asset settings preserve omitted fields; account for this difference when designing intentional suspension.

Confirmed direction, 2026-09-11:

- Ordinary scheduling is sufficient. Retain existing global blackout behavior; do not add site-specific blackout rules or a new suspension workflow now. This does not change existing blackout administration permissions.
- Use Skip next PM to intentionally omit one upcoming occurrence while keeping subsequent recurrence anchored. It must not disable PM indefinitely.
- Supervisor, Admin, and Superadmin may perform Skip next PM. Require a reason and retain who skipped, when, which planned occurrence, and its history; a skip is not completion.
- Example: skip 1 October, then the next regular occurrence remains 1 November. Preserve an already-generated task record and do not silently replace in-progress or approval-stage work.
- Keep deliberate skip distinguishable from unperformed overdue work. Current reporting uses the effective due window and preserves skip history separately; any future KPI-policy change must keep that distinction explicit.

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

These are the confirmed assignment requirements and their local implementation record. Runtime deployment acceptance still remains separate.

<a id="as-01"></a>

#### AS-01 — Role queue, exclusive claim, and reassignment boundaries

**Status:** implemented and locally verified, 2026-09-16. **Sources:** [F-03/F-04](functional-specification.md), [access model](security-and-access-model.md), [OpenAPI](openapi.yaml), [data model](database-schema-specification.md); inspect `scheduleCalc.ts`, assignment-rule and task routes, task access helper, and desktop task/approval controls.

Resolved implementation: PM role-queued tasks now use atomic exclusive technician claim, ownership precedence is `assigned user > role queue`, submitted PM tasks are locked from reassignment/claim/draft edits until returned for revision, and desktop/API surfaces now reflect that lock plus claim workflow without changing aggregate workload behavior.

- [x] Preserve existing rule matching/priority and template-role fallback while making the role queue plus self-claim the routine workflow.
- [x] Implement an atomic eligible-technician claim for an unowned, executable role-queue task. Revalidate role, assignee, and lifecycle/approval state at mutation time; handle repeat requests without duplicate ownership.
- [x] Enforce the responsible technician across execution, draft/evidence updates, and submission. Do not allow retained role membership to bypass an established individual owner; preserve authorized manager intervention.
- [x] Keep Supervisor/Admin/Superadmin individual assignment rights, but enforce pre-submission or explicitly returned-for-revision state. Prevent assignment payloads or other endpoints from bypassing the lock by changing status in the same request.
- [x] Define execution handoff during reassignment without losing previous actor/result/evidence history. Reconcile return-for-revision ownership with the frozen submitted checklist requirement in TC-02.
- [x] Record claim and reassignment actor/time/history and align desktop queue/claim/owner controls and relevant notifications. Keep assignment-rule mutations Superadmin-only.
- [x] Update the API contract and data/access specifications for the implemented behavior.
- [x] Verify eligible claim, repeat claim idempotency, takeover rejection, owner-precedence execution checks, and submitted-work reassignment lock. Direct revision-unlock retest remains covered as a behavioral consequence of the approval-state lock and is not separately reimplemented here.
- [x] Retain aggregate daily capacity behavior and verify no per-technician staffing/balancing feature was added inadvertently.

Evidence: [AS-01 verification](verification-as01.md). The current implementation adds `POST /api/tasks/{taskId}/claim`, tightens `assigned=me` and outstanding-count ownership semantics, blocks submitted PM reassignment plus draft edits, and keeps CM/shared work-order ownership aligned with the same precedence rule.

### Current execution, submission, and revision discussion

Source inspection, 2026-09-11, `backend/src/routes/tasks.ts`:

- Start/pause/resume handlers use task access checks; the inspected pause handler accepts no required reason and changes any non-completed/non-cancelled state to paused while setting StartedAt if absent. This is not a strict open-to-start-to-pause state machine.
- Submit-for-approval accepts checklist results and moves approval to PendingSupervisor; its access/state checks do not require an explicit preceding Start transition. It does not apply the same checklist completeness/evidence validation as the manager-only complete handler (Q-02).
- The inspected complete handler has an explicit manager check in addition to task access. Do not describe it as the technician's ordinary final action; technician submission and manager completion are different operations.
- Fail is an allowed checklist outcome. Notes-on-Fail is already agreed (TC-01); it does not decide whether a failed inspection may be submitted or must await repair.
- Revise and reject routes accept an optional reason and optional reopen flag. Both are distinct existing operations. Revise from PendingSupervisor goes to None; from PendingSuperadmin goes back to PendingSupervisor. Reject sets Rejected. Reopen logic does not reopen completed/cancelled lifecycle states in the inspected code.

Confirmed user direction, 2026-09-11:

- Start/Pause/Resume must support measuring PM work time. Pause does not need a reason for now. The response confirms timed execution, but does not independently settle whether draft checklist entry must be blocked before Start.
- Fail findings may be submitted for approval; provide an option to create a corrective work order from the finding. Do not require repair before inspection submission or automatically create a work order for every Fail.
- Returning for revision requires a written reason.
- Revise means the existing task is still correctable. Reject means the work is incorrect and must be repeated. User confirmed a new replacement task linked to the rejected task. Retain the original results, evidence, work time, and rejection reason; creation timing and recurrence attribution still need design.

Additional source inspection: current DDL has StartedAt/CompletedAt and approval timestamps but no dedicated pause/resume work-session structure was found in the inspected paths. Pause updates status and can set StartedAt without recording an elapsed-work interval. The existing CM create payload includes asset/facility context and symptom/impact metadata; it does not declare a source-PM task/checklist field. Generic PM-to-WO entry points are documented, but full finding-level traceability is not established by this inspection.

<a id="ex-01"></a>

#### EX-01 — Timed PM execution, findings, and return-to-work semantics

**Status:** implemented and locally verified, 2026-09-16. **Sources:** [F-04/F-05/F-06](functional-specification.md), [data model](database-schema-specification.md), [OpenAPI](openapi.yaml), Q-02/Q-20; inspect task lifecycle/submission/revision routes, CM creation, existing desktop task/WO entry points, and TC-01/TC-02/AS-01 boundaries.

- [x] Persist Start/Pause/Resume timing with additive PM work-session rows and valid transitions. Separate elapsed calendar time from active work; do not charge paused or approval-waiting time as active PM work.
- [x] Keep Pause reason optional. Starting/claiming work remains separate from draft entry and ownership; timing starts only from explicit Start/Resume.
- [x] Make timing robust to repeated requests and server timestamps. Start/Resume are idempotent when an open session already exists, and open work sessions are closed on submit, completion, cancellation, revision, rejection, and final approval.
- [x] Permit Fail submission with required notes and existing evidence rules while preserving approval validation and the submitted checklist snapshot. Inspection submission remains distinct from equipment repair.
- [x] Reuse the existing PM-to-WO entry point for an explicit user action on a failed finding. Preserve source traceability and reuse the existing linked work order on repeated clicks instead of creating duplicates.
- [x] Require a nonblank revision reason in the backend and desktop flow; preserve prior submission/results/evidence/checklist definition and expose the correction instruction to the technician.
- [x] Implement distinct Revise (correct existing task) and Reject (repeat work in a new linked replacement task) behavior. Rejected work now creates or reuses one linked replacement PM task while preserving rejected history, evidence, results, and work time on the original task.
- [x] Verify timing with idempotent start, session closure on submission, blank revision rejection, replacement-task creation on reject, and finding-linked work-order reuse. Update API/data/workflow documentation and attach actual evidence. [Evidence](verification-ex01.md)

EX-01 builds on the earlier TC-01, TC-02, AF-01, SC-01, and AS-01 behaviors. Current reporting semantics now document how these timing and replacement records are interpreted without reopening the implemented workflow.

### CM work-order inspection — 2026-09-11

D1 requirements discussion only; no application change. Inspected `backend/src/routes/workOrders.ts`, `src/components/workorders/ReportBreakdownDialog.tsx`, `src/pages/WorkOrderDetail.tsx`, and report-dialog call sites in Tasks/AssetDetail/FacilityDetail.

- Creation accepts one asset/facility context, symptom and optional impact/failure/downtime metadata. The shared report dialog and create schema do not carry a source PM task/checklist identifier.
- The complete handler checks task modification access and writes completed status directly; it does not introduce a CM supervisor-review stage. This is source evidence, not approval of the intended CM workflow.
- Close downtime writes DowntimeEndedAt separately. The inspected completion update does not close downtime automatically.
- This inspection note is historical context only. The PM finding linkage/duplicate boundary was implemented by EX-01; the remaining product questions here have since been resolved into CM-01 requirements below.

<a id="cm-01"></a>

#### CM-01 — Supervisor verification and restoration timing

**Status:** implemented and locally verified, 2026-09-17. **Sources:** [F-06](functional-specification.md), [access model](security-and-access-model.md), [data model](database-schema-specification.md), [OpenAPI](openapi.yaml), Q-21/Q-09, `backend/src/routes/workOrders.ts`, desktop `WorkOrderDetail`, shared task paths, and `db/schema.sql`.

User confirmed on 2026-09-11: technician reports repair completion; Supervisor verifies and closes the WO. Equipment restoration ends downtime independently of administrative closure. Earlier inspection questions above are resolved by this decision.

- [x] Implement technician submission and one verification/closure stage for Supervisor/Admin/Superadmin. Self-verification by the repair performer is rejected in the verify-close route.
- [x] Return incomplete repair to the technician on the same WO with a nonblank written reason, preserving previous work and evidence.
- [x] Define and persist separate restoration, repair submission and closure events, actors and valid timestamps using additive CM event history.
- [x] Implement backend and desktop transitions with authorization, preservation of submitted work/evidence, and retry/concurrency protection. Shared PM routes now reject CM lifecycle bypasses.
- [x] Permit the assigned technician or Supervisor/Admin/Superadmin to record restoration independently of review/closure. Default to now; allow actual past restoration time with mandatory reason and change history.
- [x] Preserve multiple downtime intervals when the same fault recurs before closure on the same WO. For recurrence after closure, create a new linked WO while preserving previous intervals and excluding operational gaps.
- [x] Review/update OpenAPI and synchronize data, access, workflow and reporting semantics in the implementation work item.
- [x] Verify technician cannot close without review, closure by an authorized reviewer, self-verification rejection, blank return-reason rejection, same-WO correction, restoration-before-closure, repeated outage intervals, and linked recurrence after closure. See [CM-01 verification](verification-cm01.md).

Evidence: [CM-01 verification](verification-cm01.md). CM-01 now uses `pending_review` for technician repair submission, `verify-close` for manager closure, `return-for-correction` for same-WO correction, `CMDowntimeIntervals` plus `CMTaskEvents` for additive downtime/history, `RecurringFromTaskId` for post-closure recurrence linkage, updated desktop work-order detail actions, synchronized OpenAPI, and isolated CM route tests plus AS-01/EX-01 regressions.

### CM correction and reviewer inspection — 2026-09-11

Inspected CM lifecycle/resolution routes, shared task reopen/approval routes and role middleware. No dedicated CM return-for-correction route was found in workOrders.ts. Shared reopen accepts only cancelled tasks; shared Supervisor approval advances to PendingSuperadmin and is not the agreed CM closure flow. Existing shared approval/revision role guards differ (approval includes Admin; revision excludes Admin), so reviewer substitution must be specified explicitly. The inspected CM resolution route checks ownership/manager access but does not gate edits on review/closure state.

Resolved by CM-01 on 2026-09-17: the same WO can be returned for correction with a mandatory reason, one manager review stage verifies/closes it, and repair performers cannot verify-close their own work. Work/evidence history is preserved through correction.

### CM restoration and repeat-outage inspection — 2026-09-11

Inspected work-order creation/close-downtime handlers, desktop close-downtime mutation and schema downtime columns. Creation accepts an optional downtime start; close-downtime uses the first server timestamp through COALESCE and accepts no restoration-time input. It uses the broad task modification helper. The inspected schema stores one start/end pair per WO; this does not represent multiple distinct outage intervals on the same WO. No application behavior was changed.

Resolved by CM-01 on 2026-09-17: restoration can be recorded independently with optional historical timestamp plus mandatory reason, the same WO can reopen downtime before closure, and recurrence after closure creates a new linked WO. Additive downtime intervals preserve operational gaps correctly for the same fault on one WO.

### Feature intake rule

For the next feature, inspect implementation briefly, discuss only remaining product decisions, update its functional-specification section and question IDs, and add any agreed implementation item to this backlog with sources, boundaries, verification, and status. Do not create another active feature-plan file.

## D2 — Reproducible environment and delivery

Status: in progress since 2026-09-27. Schema source/live inventory and disposable clean/repeat/upgrade checks pass; fresh-checkout delivery and recovery gates remain open. See [evidence](verification-d2-environment.md).

### Objective

Make desktop/web and backend fresh-checkout setup and deployment reproducible.

### Source documents

[Technical plan](technical-implementation-plan.md), [deployment](deployment-and-environment.md), [testing](testing-strategy.md), and [open questions](open-questions-and-challenges.md).

### Checklist

- [x] Allow local-only authentication without LDAP configuration (Q-05, user approved); implementation and isolated configuration/HTTP checks recorded in [evidence](verification-q05.md).
- [x] Expand schema verification to all source objects and checked column shapes/flags (Q-08). [Evidence](verification-d2-environment.md).
- [x] Verify clean, repeated and legacy-context-guard schema application on a disposable SQL database; repair the two missing live context guards. [Evidence](verification-d2-environment.md).
- [x] Verify fresh dependency installation and all build/test commands on a secret-free source snapshot with Node 22.23.3. [Evidence](verification-d2-environment.md).
- [ ] Verify Docker setup, same-origin routing, browser startup and a remotely fetched release checkout. Docker images from exact source commit, healthy startup, same-origin routing and public HTTPS/assets passed on 2026-10-03; authenticated browser acceptance remains open. See [release evidence](verification-d2-environment.md#production-application-release--2026-10-03).
- [x] Add CI commands, safe environment template and Docker build-context exclusions; local validation recorded in [D2 evidence](verification-d2-environment.md).
- [ ] Execute CI remotely and establish backup/restore ownership, a tested restore and deployment rollback evidence (Q-10).

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

## Repository synchronization — 2026-09-11

- [x] Resolve the local documentation-baseline merge with remote checkpoint `6bb0c27`, preserving the current D1 decisions and the local mandatory OpenAPI change-control rules.
  - Evidence: documentation checker passed; merge markers and whitespace checked; no application, backend, or database source changes. See [verification record](documentation-verification.md#repository-merge-reconciliation--2026-09-11). D1 implementation items remain pending.

## Runtime correction — 2026-10-02

Repaired missing ownership-filter SQL conjunctions in PM task list/status/outstanding queries and the CM work-order list. See [contract verification](verification-q01-desktop.md). Prior fixture-based test success did not establish live SQL syntax validity. Deployment remains on hold by user instruction.

## Operator utility — 2026-10-02

Added an existing-local-account password reset CLI at user request. [Usage and isolated verification](deployment-and-environment.md#reset-one-local-account-password). No live account was reset; deployment remains on hold.

## Production deployment utility — 2026-10-02

Added the production Compose overlay and check/deploy script with isolated orchestration verification. See [deployment usage](deployment-and-environment.md#production-docker-deployment-script). Actual Docker build/runtime, database readiness, backup/restore and rollback acceptance remain open in D2. No deployment executed.

Production script follow-up: CIFS source/type/mount validation, optional fstab mount in deploy mode and temporary read/write/delete probes now gate build and container replacement. Isolated tests pass; actual Linux host/share acceptance remains pending.

## Production application release — 2026-10-03

User approval superseded the earlier deployment hold. Exact commit `7a68e7a` is running in both production services. Fresh Linux validation passed 153/153 regressions, lint, typechecks, builds, schema-source and documentation checks. No SQL migration or business-data test mutation was performed. Runtime gates and protected backup/image rollback references are recorded in the existing [D2 evidence](verification-d2-environment.md); D2 and D3 remain open for the outstanding acceptance/recovery work. No new parallel backlog was created.

Release preparation follow-up, 2026-10-05: the first exact-source Linux check passed 159/160 regressions; Windows Git archive conversion exported the deployment shell script with CRLF and Bash rejected `pipefail`. Added `*.sh text eol=lf` in `.gitattributes` to preserve portable shell input. The policy source was unaffected; final-source verification must pass before release.

### Selected desktop correction — Approvals completeness (2026-10-05)

- Scope: D1 user-selected correction; align Approvals pending queues and totals with PM Tasks, preserve complete Waiting Submit reads, and add 25-row pagination/search/recovery. No backend, SQL or API contract change was required.
- Diagnosis: Approvals fetched only the first 100 general PM tasks and filtered in the client. Read-only production inspection found 31 pending superadmin tasks, of which only 12 occurred in that subset and 19 were beyond it. Numbers may change as users approve records.
- Implementation: pending views and totals from GET /api/tasks; URL-backed tab/search/page, count badges, complete personal waiting reads, and cross-list invalidation after mutations. Removed nonfunctional location/category placeholders.
- [x] Verify and release the selected Approvals correction. Linux checks passed on `e28ec0b` (163 tests, lint, backend/frontend typechecks/builds, schema-source and documentation parity). Synthetic browser covered 131 pending rows behind unrelated tasks, full-queue search, keyboard, narrow layout, approval refresh and last-page clamping. Read-only production acceptance confirmed both Approvals and PM Tasks show 31 Pending Superadmin records; page 2 shows 26–31 of 31; search and reload preserve the queue context. Web-only release passed health/public asset gates, retained API/configuration, and used existing `PAT_GIT` for push. See [release evidence](deployment-and-environment.md#production-approvals-completeness--2026-10-05). D2 recovery exercises and broader D3 acceptance remain open.

### Selected desktop correction — Assets table (2026-10-05)

- Scope: D1 user-selected screenshot correction. Combine name/source ID, compact rows, single labelled filter toolbar, full-note popup, named detail links and readable Next PM dates. Remove the inert Export control; preserve source, role and PM actions.
- [x] Complete final-source checks and web-only production acceptance. Final source `30120f0` passed 163 regressions, Linux lint/typechecks/builds, schema-source and docs checks. Synthetic browser covered compact rows, popup Escape/focus, search empty/clear, pagination/per-page, keyboard scroll and error/retry. Read-only production covered search, full notes, and direct list/detail reload. Nginx route collision was corrected; API/configuration were retained. See [desktop verification](verification-q01-desktop.md#assets-table-presentation--2026-10-05) and [release evidence](deployment-and-environment.md#production-assets-table--2026-10-05).
- Existing limitation: PM-status filtering is page-local, and global header/sidebar narrow-screen overflow remains outside this visual slice. D2/D3 remain open. No API contract change.

### Selected correction — PM Now history and calendar (2026-10-06)

D1 user-authorized whole-PM scan/reconciliation alongside D2. Sources: functional specification SC-01, schema, OpenAPI, desktop UX contract.

- [x] Read-only production scan: 268 PM tasks, 29 legacy PM Now and 44 missed occurrences; protected snapshot `/var/backups/preventive-pilot/pm-reconciliation-20261006T020624Z`.
- [ ] Verify transactional planner/application, resolved history links, original-period finalization, remaining-capacity calendar buckets, source SQL and browser behavior.
- [ ] Back up and verify SQL, apply additive ledger and reviewed unambiguous repairs, release API/web, and verify production calendar. Active/ambiguous records require explicit review; no blanket historical completion.
