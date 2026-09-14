# Documentation Verification

Review date: 2026-09-10. Scope: D0 documentation baseline only.

## Evidence context

The review used the local workspace and static source inspection. `AGENTS.md` was supplied by the user and remains unchanged. `git ls-files mobile` returned no tracked files, while local PM Tech/secure-apk folders were available; this is recorded as Q-06.

Node was not on the shell PATH. An existing Node v22.16.0 executable was found and used by absolute path for documentation checks. No dependency installation or backend startup was required. The portable command below assumes Node is on PATH.

## D0.1 — Mandatory documents and entry points

Passed `node scripts/docs/check-docs.mjs`: all eight mandatory documents exist; 20 active Markdown files were inspected; D0–D3 each contain objective, source documents, checklist, output, and challenge/verification sections. The root README now directs readers to the index, working rules, roadmap, setup, and verification evidence.

## D0.2 — Reconciliation and historical preservation

Source review established React/Capacitor mobile, Express/mssql backend, fixed production API fallback with optional discovery, separate completion/submission/final approval behavior, mandatory LDAP startup fields, and the APK guide/stack mismatch. These are reflected in active documents and Q-01–Q-11.

Previous root/mobile README and APK guide were copied into `docs/archive` before replacement. Ten earlier plan/journal documents retain their original content after a historical-status banner. Historical chronological inconsistencies were preserved rather than rewritten as fresh evidence.

A Python/Git comparison checked all ten historical documents against `git show HEAD:docs/<name>` after removing the new banner and normalizing line endings: passed. The archived tracked root README and APK guide were checked against their HEAD versions the same way: passed. The mobile README was copied before replacement, but has no tracked HEAD version for comparison.

## D0.3 — OpenAPI baseline and coverage

Executed `node scripts/docs/check-docs.mjs --write-api` through the existing Node executable. Export result: 63 documented operations and 134 implemented literal route operations. The initial inventory reports 71 implemented operations absent from OpenAPI and no unmatched contract operations. These are tracked in Q-01; no missing payload schemas were invented.

## D0.4 — Structural verification

Passed `node scripts/docs/check-docs.mjs` through Node v22.16.0:

- All local file links found in active Markdown resolve; the initial pass checked 103 links before final evidence links were added.
- Ten historical documents have the required status banner.
- OpenAPI matches the embedded definition after normalizing the server URL.
- All 285 local OpenAPI references resolve; documented operations contain responses and required path parameters.
- The generated coverage report matches the current literal route inventory.
- All 33 SQL `CREATE TABLE` entries are represented in the data-model document.

Negative challenge: temporarily changed the OpenAPI title, ran the checker, and confirmed a nonzero exit with `OpenAPI differs`. Restored the exact original contract bytes in a `finally` block. This demonstrates detection of contract drift rather than only a successful baseline comparison.

`git diff --check` passed. Git emitted line-ending conversion notices (LF to CRLF), not whitespace errors. D0.1–D0.4 are complete with the evidence above; D1–D3 remain unchecked.

## Verification boundaries

No application build/typecheck, API execution, database application/verification, mobile/native build, external connection, notification delivery, or deployment was performed. Historical journal test claims were not reused as fresh evidence.

OpenAPI snapshot parity, reference checks, and route inventory are structural checks. They do not certify full OpenAPI specification compliance, complete contract coverage, runtime payload validity, authorization, workflow correctness, or production readiness. D1–D3 remain proposed follow-up work.

## D0.5 — Desktop-first scope follow-up

User direction on 2026-09-10 deferred mobile uncertainties and prioritized the desktop/browser application. Updated the root README, documentation index, project plan, functional/technical/testing scope notes, question triage, and D1–D3 roadmap checklists. Q-06, Q-07, and Q-11 remain deferred rather than resolved. Mobile-only contract coverage remains recorded but is not a desktop acceptance gate.

Verification: documentation checker passed after the scope changes (required documents, local links, OpenAPI parity and references, coverage freshness, roadmap sections, and schema inventory). Source review of the revised D1–D3 checklist confirms that APK/device/native/mobile acceptance is no longer required for desktop completion. No application behavior changed.

## D1 — Asset/facility requirements discussion, 2026-09-11

Recorded the ten user answers in `asset-facility-decisions.md` and reconciled F-01, product scope, the index, and roadmap. Q-12–Q-15 preserve tentative or unanswered decisions. The first documentation-evaluation checklist item is complete; implementation and runtime acceptance remain unchecked.

Verification: the documentation checker passed with 8 mandatory documents, 21 active Markdown files, 120 local links, 285 OpenAPI references, and 33 table entries. OpenAPI parity and coverage remained unchanged. This is documentation verification only.

## D1 — Implementation-first asset/facility follow-up, 2026-09-11

Read Snipe-IT sync hardware ingestion/upsert/archive paths, schedule broken-state filtering, task cancellation references, facility mutation guards, shared role middleware, and relevant DDL. No category-specific AC/panel ingestion filter or automatic broken-asset task cancellation was found in the inspected paths. Facility administration currently admits Supervisor through requireManager. These are source observations, not live-system test results.

Recorded confirmed cancellation with record retention and Admin/Superadmin-only facility changes with verbal supervisor requests. Updated specification, access policy, Q-12–Q-14, evaluation evidence, and roadmap. Further questions require brief implementation inspection first. Verification: run documentation checker and diff whitespace check; no application behavior was changed.

## D1 — Asset/facility action handoff and template review, 2026-09-11

Published AF-01/AF-02 with unchecked implementation tasks, scoped requirements, source gaps, and verification criteria. Linked the action plan from the index, decisions, and roadmap. Inspected template create/update/delete schemas and guards, in-place checklist updates/version increments, task detail joins, and completion notes/evidence validation before drafting the next questions. User answers for Templates and Checklists remain pending.

Verification passed: documentation checker reports 8 mandatory documents, 23 active Markdown files, 131 local links, 285 OpenAPI references, and 33 schema tables. API parity/coverage remains unchanged. `git diff --check` passed. No application implementation or runtime testing was performed.

## D1 — Template/checklist decision record, 2026-09-11

Recorded unchanged template roles/evidence policy, outcome-based notes direction, and live-versus-final checklist preservation in TC-01/TC-02, F-02, Q-16/Q-17, and the roadmap. Re-read approval transitions to identify the unresolved meaning of final submit rather than assume a cutoff. Verification passed: documentation checker (23 active Markdown files, 134 local links, contract parity/references, phase sections, schema inventory) and git diff --check. Implementation and runtime tests remain unperformed.

## D1 — Technician-submission cutoff confirmed, 2026-09-11

User clarified final submit as technician submission for approval. Mapped the decision to the previously inspected submit-for-approval transition to PendingSupervisor. Updated TC-02, F-02, Q-16, and the roadmap: the cutoff decision is complete; implementation, revision/history-migration boundaries, and acceptance remain open. Verification passed: documentation checker (23 active Markdown files, 134 local links, contract parity/references, phase sections, schema inventory) and git diff --check. No application behavior changed.

## D1 — PM scheduling initial review, 2026-09-11

Inspected default PM configuration, due-date precedence/calendar intervals, candidate generation, completion updates, blackout logic, and route permissions. Published pm-scheduling-review.md and updated the index/roadmap; user decisions remain pending. Documentation checker and git diff --check passed (24 active Markdown files, 136 local links, unchanged API parity/coverage). No runtime execution or application changes.

## D1 — Fixed planned-date recurrence agreed, 2026-09-11

Recorded all five scheduling answers, including explicit agreement that late completion does not shift recurrence. Published SC-01 as the implementation reference and synchronized F-03, Q-18, and the roadmap. Retained source observations separately from desired behavior; missed-cycle and migration choices remain undecided. Documentation checker passed (24 active Markdown files, 139 local links, unchanged API parity/coverage) and git diff --check passed. No runtime behavior changed; implementation checks remain open.

## Unified work reference consolidation — 2026-09-11

Consolidated the full AF-01/AF-02/TC-01/TC-02/SC-01 checklists into implementation-roadmap.md, with explicit current mode, next action, execution order, confirmed decisions, source documents, boundaries, and verification. Root README and documentation index now direct work there. Four former feature documents are historical redirects with original content retained in docs/archive. Active specifications/question links now point directly to the roadmap.

Verification: all original pending AF/TC/SC checklist lines were found verbatim in the unified roadmap. The checker passed and now enforces a unique anchor for each of the five actions, the work-entry/next-action section, and absence of competing checklists in historical redirects. Existing documentation checks passed (149 local links, OpenAPI parity/references, phase sections, and table inventory); git diff --check passed. No application code, API behavior, database state, or feature acceptance status changed.

## D1 — Missed cycles and PM Now policy agreed, 2026-09-11

Recorded user agreement in the unified roadmap SC-01, F-03, and Q-18: one actionable current job with missed periods recorded as not performed, early execution fulfills the next occurrence, and PM Now reuses due/overdue then next regular work before creating a task. Preserved in-progress/review exceptions and separated technical period/migration boundaries from settled policy. No additional feature-plan document was created. Documentation checker passed (151 local links, mandatory documents, unique roadmap actions, contract parity/references, schema inventory) and git diff --check passed. Application implementation and runtime acceptance remain pending.

## D1 — Blackout/suspension inspection, 2026-09-11

Inspected blackout request fields and SQL date shifting, scheduling Frozen reads, PMEnabled setters, and context filtering. Added source observations and pending product questions directly to the unified roadmap. No new feature document or application behavior was introduced. Documentation checker (151 local links, mandatory/roadmap checks, contract parity/references, schema inventory) and git diff --check passed. No runtime verification was performed.

## D1 — Skip next PM scope and roles, 2026-09-11

Recorded user correction that Supervisor is included alongside Admin/Superadmin for Skip next PM. Consolidated no blackout expansion, one-occurrence skip with reason/history, and pending compliance treatment in SC-01/F-03, the access model, and Q-18. No new feature document was added. Documentation checker passed (152 local links, required documents, unique backlog actions, contract parity/references, schema inventory) and git diff --check passed. Implementation remains pending.

## D1 — Assignment/capacity inspection, 2026-09-11

Read assignment resolver priorities/fallbacks, task ownership helper, individual/bulk assignment guards and update/audit logic, assignment-rule mutation guards, and calendar date-capacity aggregation. Added observations and pending questions only to the unified roadmap. Documentation checker (152 local links and unchanged contract/schema checks) and git diff --check passed. No application changes or runtime verification.

## D1 — Role queue and technician claim agreed, 2026-09-11

Recorded user agreement on role-queue routing, exclusive technician claim, retained manager assignment, reassignment before submit or after Supervisor return for revision, unchanged Superadmin rule administration, and unchanged aggregate daily workload. Added AS-01 directly to the unified roadmap, with ownership/state/concurrency and history-preservation checks; synchronized F-03, access policy, and Q-19. Extended the documentation checker to require the AS-01 anchor. Checks passed: 160 local links, mandatory/roadmap checks, unchanged OpenAPI parity/references and table inventory, and git diff --check. No feature implementation or runtime test was performed.

## D1 — Execution/submission/revision inspection, 2026-09-11

Inspected pause behavior, submission schema/state checks, complete-handler manager restriction, checklist outcomes, and revise/reject transitions and optional reasons/reopen flags. Recorded observations and five pending product questions directly in the roadmap, preserving previously agreed template/claim/notes rules. Documentation checker (160 local links, required documents, unique action anchors, contract parity/references, schema inventory) and git diff --check passed. No implementation or runtime verification occurred.

## D1 — Timed execution and return-to-work decisions, 2026-09-11

Recorded Start/Pause/Resume for PM time, optional Pause reason, Fail submission with optional corrective work order, mandatory revision reason, and distinct correction versus repeat-work semantics. Added EX-01 to the unified roadmap and synchronized F-04/F-05/F-06 and Q-20. Reject task identity remains a product question. Inspected timing columns, pause behavior, revision/rejection schemas, and CM creation payload; no application behavior changed. Extended the checker to require the EX-01 anchor. Documentation checker passed (165 local links, mandatory documents, roadmap structure, OpenAPI parity and 285 references, 33 table entries); git diff --check passed. Runtime, database, and feature acceptance tests were not run; implementation remains pending.

## D1 — Linked rejection replacement and laptop handoff, 2026-09-11

Recorded user approval for a new replacement task linked to the rejected original in F-05, EX-01, and Q-20; creation and recurrence boundaries remain open. Updated the roadmap active-phase summary and added a session handoff with working preferences, resume point, repository checkpoint, transfer steps, local-only dependencies, and a starter prompt. README links directly to the handoff; no second backlog or new feature document was created. Checked branch/HEAD, working status, and ignore rules without reading credentials. Documentation checker passed (169 local links, eight mandatory documents, roadmap checks, unchanged OpenAPI parity/285 references, 33 table entries); git diff --check passed. No application implementation, runtime testing, commit, push, or laptop transfer was performed.

## Repository merge reconciliation — 2026-09-11

Resolved 14 documentation conflicts between local baseline `24d9eae` and remote `6bb0c27`. The newer remote D1 requirements, specifications, roadmap, and embedded-contract OpenAPI baseline supersede the earlier local Phase 0 documents. Preserved local mandatory OpenAPI review/update rules in AGENTS.md; existing local commits and release notes remain in merge history. No published history was rewritten.

Verification: `node scripts/docs/check-docs.mjs` passed mandatory documents, local links, historical banners, roadmap structure, embedded OpenAPI parity, 285 references, and 33 schema table entries. Conflict-marker scan and `git diff --check` passed. No application/backend/schema source differs from either merge parent; runtime tests were not required for this documentation-only merge. The checker still reports 71 literal route operations missing from OpenAPI; this existing Q-01 limitation remains open. No feature checklist or runtime acceptance was marked complete.

## D1 — CM work-order continuation inspection, 2026-09-11

Resumed from the laptop handoff at synchronized checkpoint b3b11c7. Read AGENTS.md, README.md, handoff, F-06 and related access/data/open-question records. Inspected CM creation, completion, close-downtime and desktop report/detail paths. Recorded findings and pending product questions in the roadmap without changing confirmed requirements. Documentation checker and git diff --check passed. OpenAPI was not changed because no backend or contract behavior changed. No runtime/database tests or application implementation were performed.

## D1 — CM verification and downtime decisions, 2026-09-11

Recorded explicit user acceptance of technician repair-completion submission followed by Supervisor verification/closure, and independent downtime end at equipment restoration. Synchronized F-06, access/data semantics, Q-21, roadmap CM-01 and the session resume point. Documentation checker and git diff --check passed. No backend, frontend or database implementation changed; OpenAPI remains unchanged because no API contract behavior was implemented. Runtime acceptance and CM-01 implementation checks remain pending.

## D1 — CM correction/reviewer inspection, 2026-09-11

Read workOrders.ts lifecycle/resolution guards, tasks.ts reopen and approval/revision handlers, role middleware and desktop WorkOrderDetail. Recorded source findings and three unapproved Q-21 proposals in the roadmap. Documentation checker and git diff --check passed. No application or API contract change; OpenAPI unchanged. Runtime tests not performed.

## D1 — CM correction and reviewer policy confirmed, 2026-09-11

Recorded explicit user acceptance of same-WO correction with mandatory reason and preserved work/evidence, one verification by Supervisor/Admin/Superadmin, and prohibition of self-verification regardless of role. Synchronized F-06, access/data semantics, Q-21, CM-01 checklist and session next action. Documentation checker and git diff --check passed; implementation checklist items remain open. No application/backend/schema changes or runtime tests; OpenAPI unchanged because no API behavior was implemented.

## D1 — Restoration and repeat-outage inspection, 2026-09-11

Inspected creation and close-downtime behavior in workOrders.ts, the desktop mutation, and DowntimeStartedAt/DowntimeEndedAt schema fields. Recorded source limitations and unapproved restoration/recurrence proposals under Q-21 in the roadmap. Documentation checker and git diff --check passed. No application/schema/API behavior changed; OpenAPI unchanged. No runtime tests performed.

## D1 — Restoration and repeat-outage policy confirmed, 2026-09-11

Recorded user acceptance of restoration by the assigned technician or Supervisor/Admin/Superadmin, current-time default and reasoned historical restoration entry with change history, same-WO outage intervals before closure, and new linked WO after closure. Operational gaps do not count as downtime. Synchronized F-06, access/data semantics, Q-21, CM-01 and session next action. Documentation checker and git diff --check passed. No application, backend or schema implementation; OpenAPI unchanged because no runtime contract changed. CM-01 implementation and runtime verification remain pending.

## D1 — Eight-item code audit and implementation map, 2026-09-11

At source checkpoint b3b11c7, screened 126 tracked source files across src/backend/src/db/scripts and followed the relevant desktop handlers, backend routes, SQL and jobs for AF-02, TC-01, TC-02, AF-01, SC-01, AS-01, EX-01 and CM-01. Thirty-five files matched domain screening terms; that count is not a claim of exhaustive manual correctness review. Recorded per-item observations, work, contract/data impact, dependencies and test scenarios in code-implementation-map.md, with source inventory in code-audit-inventory.json. Included alternate writers, report/export readers and shared PM/CM bypasses.

Updated roadmap mapping evidence/next action, technical plan, testing strategy, documentation index and existing open-question boundaries. Documentation checker, referenced source-path existence, inventory consistency and git diff --check passed. No application/backend/schema changes; docs/openapi.yaml was reviewed alongside embedded contract coverage but left unchanged because this is a mapping task, not an API behavior change. Runtime, builds, database mutation and external integrations were not run. All eight application implementation items remain not started.

## D1 — AF-02 implemented, 2026-09-11

Restricted facility create/update/clone to Admin/Superadmin, including isActive and bulk archival through update. Preserved PM planning guards; aligned list/detail controls and visible failure handling. Updated embedded and versioned OpenAPI plus API coverage in the same work item. [AF-02 verification](verification-af02.md) records 37 HTTP tests with isolated SQL, Chrome interaction/failure/narrow-viewport checks, static/build results and limits. AF-02 checklist is complete for local implementation; deployment and remaining items remain open.
