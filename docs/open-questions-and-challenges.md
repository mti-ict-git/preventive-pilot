# Open Questions and Challenges

Last reviewed: 2026-09-10. Findings below are based on source inspection, not confirmed production incidents. Proposed owners are roles, not assigned people.

## Current triage

Desktop/web first, per user direction on 2026-09-10. Q-01–Q-05 and Q-08–Q-10 remain relevant to the desktop application and supporting services. Q-06, Q-07, and Q-11 are **deferred**, not resolved; their closure criteria are retained for a later mobile scope. For Q-01, classify operations by desktop usage before selecting contract work; the full coverage report remains an inventory, not the current desktop checklist. For shared workflows, verify web and direct API behavior now and defer mobile client verification.

## Open register

| ID | Question / observed discrepancy | Evidence | Closure criterion | Proposed owner / phase |
| --- | --- | --- | --- | --- |
| Q-01 | Does the published API contract cover all routes and match their payloads/errors? | Embedded `openApiSpec`, route files, [coverage report](api-coverage.md); shared middleware can return only `{ message }` despite historical unified-error claims | Document missing operations and reconcile every changed request/response/auth contract with route-level tests | Backend / D1 |
| Q-02 | When must PM become completed, and which validations must submission enforce? | `tasks.ts` complete handler validates checklist/evidence and sets lifecycle completion; submit handler sets technician trail and `PendingSupervisor` without setting lifecycle completion or applying the same completion-validation loop | Agree intended sequence; verify desktop/web and direct API behavior, missing evidence, and repeated submissions; synchronize implementation and contract | Product + backend / D1 |
| Q-03 | Are self-approval and role differences intentional? | Supervisor approval accepts Supervisor/Admin/Superadmin; revise route accepts Supervisor/Superadmin; final approval accepts Superadmin. Historical plans promise segregation of duties without current verification evidence | Agree role/ownership/own-work policy and test each transition, including multi-role users | Product + backend / D1 |
| Q-04 | Does final approval recalculate asset and facility schedules using identical rules? | `approve-by-superadmin` updates `AssetPMSettings` with inline `DATEADD`; global scheduling uses `fn_CalculateNextDueAt` and facility schedules | Verify facility completion, blackout/month-end handling, freeze behavior, and all recalc paths; document and resolve differences | Backend / D1 |
| Q-05 | Should local-only login require LDAP configuration at startup? | `backend/src/config/env.ts` requires LDAP fields even though historical setup describes LDAP as optional | Decide startup contract; verify local-only and LDAP-enabled environments and update environment guidance | Backend + operations / D2 |
| Q-06 | Where is mobile source maintained and how is it delivered with this repository? | `.gitignore` ignores `mobile`; `git ls-files mobile` returned no files at baseline review, although `mobile/pm-tech` exists locally; Field-Ready path is absent | Establish tracked source or explicit separate-repository/version reference; prove fresh-checkout mobile build | Repository owner / Deferred mobile |
| Q-07 | Which APK publication/update architecture is authoritative? | Old guide references `mobile/secure_apk`, `push:android`, port 9103, and upload API; available `mobile/secure-apk` is read-only Nginx on default 5057 with `/version.json`; backend also has signed app-update downloads | Select and document the supported path, manifest format, signing/build process, and authorization; validate on a device | Mobile + operations / Deferred mobile |
| Q-08 | Does schema verification cover the entire evolved model? | `scripts/db/verify-schema.mjs` contains a partial expected-table list relative to `db/schema.sql` | Verify all relevant entities/columns/constraints/indexes on clean and upgraded databases; expand checks as needed | Backend / D2 |
| Q-09 | What precisely counts toward compliance, overdue, and MTTR? | Reports and historical plans distinguish PM/CM and approvals but do not establish one tested metric contract for all consumers | Define denominator, date boundary/timezone, cancelled work, approval inclusion, and downtime versus reported-to-complete duration; verify examples | Product + reporting / D1 |
| Q-10 | What are the release, recovery, and job-coordination guarantees? | Compose provides API/web and external SQL/storage; no verified CI/restore evidence was supplied; jobs run inside API process | Establish staging/release gates, backup retention and restore test, job ownership across replicas, and recovery targets | Operations / D2 |
| Q-11 | What security and offline guarantees does the mobile app provide? | `mobile/pm-tech/lib/auth.ts` persists tokens in localStorage as well as memory; biometric credentials use native storage separately; historical plan says to avoid localStorage | Agree token policy and verify device storage/logout, offline replay, conflicts, evidence retries, push, and expired-token behavior | Mobile + security / Deferred mobile |

## Asset/facility follow-up — 2026-09-11

Based on the [user-answer evaluation](implementation-roadmap.md). Confirmed requirements belong in F-01; unanswered details remain open below.

| ID | Remaining question | Closure criterion | Phase |
| --- | --- | --- | --- |
| Q-12 | Asset-to-facility mapping is tentative. Inspection shows sync imports returned hardware without special AC/panel filtering. Actual upstream inventory was not queried. | Inspect existing behavior before asking remaining mapping/identity questions; no relationship/filter change is currently approved | Product / D1 discussion |
| Q-13 | Cancellation for broken-asset tasks is now confirmed, with history retained; sync/scheduler currently only stop new generation. Upsert currently unarchives reappearing assets. | Reconcile cancellation trigger, applicable nonterminal PM states, audit/reason, retries, report effects, and reappearance behavior; do not reopen the settled cancellation decision or infer cancellation of CM repairs/completed history | Backend + product / D1 gap |
| Q-14 | Admin/Superadmin ownership and exclusion of Supervisor from facility master-data changes are confirmed; requests are verbal. Existing routes still allow Supervisor through requireManager. | Align scoped facility administration guards and verify them; inspect closure behavior before asking remaining task-handling questions. Do not add an in-app request/approval workflow | Backend + product / D1 gap |
| Q-15 | The suggested category/location/responsibility/template information is sufficient, but which fields are mandatory for assets versus facilities? How should deliberate PM exclusion work? | Agree per-context prerequisites and decide whether an exclusion policy is needed; do not infer validation from a general acceptance of suggested fields | Product / D1 discussion |

## Template/checklist follow-up — 2026-09-11

| ID | Remaining question / gap | Closure criterion | Phase |
| --- | --- | --- | --- |
| Q-16 | Cutoff resolved by user on 2026-09-11: freeze the checklist definition when the technician successfully submits for approval, entering PendingSupervisor. Current detail still uses live definitions. | Product cutoff decision closed; implement and verify TC-02, including scoped returned/reopened work and historical migration handling. This does not mark the implementation gap fixed | Decision resolved; backend work pending / D1 |
| Q-17 | Notes on Fail is accepted; current mandatory/non-skip validation and RequiresNotes settings need reconciliation | Implement outcome-based validation and consistent settings/UI semantics via TC-01, retaining evidence rules and mandatory no-skip | Backend + desktop / D1 |

## Scheduling follow-up — 2026-09-11

Q-18: Fixed recurrence from the planned schedule is confirmed. Existing completion-based next-due calculations must be reconciled via [SC-01](implementation-roadmap.md#sc-01). Missed-cycle and PM Now policy is now confirmed: one actionable job with missed periods recorded as not performed, early work fulfills the next occurrence, and PM Now reuses due/overdue work then upcoming work before creating a task. Protect in-progress/review work from automatic replacement. Blackout remains as implemented without expansion. Skip next PM is scoped to one occurrence with a reason and history, allowed for Supervisor/Admin/Superadmin; compliance treatment is still open under Q-09. Inspect before asking remaining questions about manual schedule/interval changes, month-end handling, task-period attribution, missed/skip representation, concurrency, and existing-record migration. Do not introduce indefinite suspension by inference. Do not reopen the settled fixed-versus-completion-based decision. Q-04 continues to track cross-path and asset/facility parity. Status: policy confirmed; implementation and boundary decisions pending, D1.

## Assignment follow-up — 2026-09-11

Q-19: Role-queue assignment plus exclusive technician claim is agreed. Supervisor/Admin/Superadmin may assign/reassign before submission and after explicit return for revision; submitted tasks otherwise remain locked. Rule editing stays Superadmin-only; aggregate daily capacity stays unchanged. [AS-01](implementation-roadmap.md#as-01) tracks atomic claim, ownership enforcement, revision handoff, existing individual-rule/assignment migration, and state-bypass verification. Inspect those details before further questions; no claim-endpoint/data design or per-technician workload feature is assumed. Status: product direction confirmed; implementation pending, D1.

## Execution/review follow-up — 2026-09-11

Q-20: Timed Start/Pause/Resume, no mandatory Pause reason, Fail submission with optional WO creation, mandatory revision reason, and Revise-versus-Reject meaning are confirmed. Reject requires repeating work in a new linked replacement task, confirmed by the user. Preserve original results, evidence, work time, and rejection reason. Creation trigger, duplicate prevention, ownership, template selection, and recurrence/compliance attribution remain open implementation boundaries. Inspect before asking remaining active-time/revision/handoff/backdating boundaries, pre-Start draft policy, and finding-to-WO traceability/duplicates. [EX-01](implementation-roadmap.md#ex-01) owns implementation and verification; Q-02 still covers validation parity. Do not invent historical work-session data or delete rejected evidence. Status: product directions recorded; specified boundaries pending, D1.

## Reconciled documentation conflicts

| Conflict | Baseline decision |
| --- | --- |
| React Native / Prisma / Sequelize in mobile workflow proposal | Current architecture is React + Capacitor and Express + `mssql`; preserve the proposal as historical |
| Field-Ready versus PM Tech | Describe locally available PM Tech; do not present absent Field-Ready as an installed component |
| Ngrok discovery as default | Describe fixed production API fallback and opt-in discovery, matching current client source |
| Lovable/AI Studio boilerplate as setup | Replace entry documentation with actual repository setup and a documentation index; retain Lovable connection guidance in AGENTS.md |
| Old plans presented as current backlog | Treat as historical inputs; use the new roadmap for active work and verification status |

## Closure process

For each question, record the decision, source evidence, affected contract/workflow documents, implementation changes if any, and successful verification. Move resolved items into a dated decision entry or mark them resolved with a link. Do not close an item merely because documentation describes the discrepancy.
