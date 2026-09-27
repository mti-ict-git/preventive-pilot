# Open Questions and Challenges

Last reviewed: 2026-09-27. Findings below are based on source inspection, not confirmed production incidents. Proposed owners are roles, not assigned people.

## Current triage

Desktop/web first, per user direction on 2026-09-10. Q-01 and Q-03–Q-05 plus Q-08–Q-10 remain relevant to the desktop application and supporting services. Q-06, Q-07, and Q-11 are **deferred**, not resolved; their closure criteria are retained for a later mobile scope. For Q-01, classify operations by desktop usage before selecting contract work; the full coverage report remains an inventory, not the current desktop checklist. For shared workflows, verify web and direct API behavior now and defer mobile client verification.

## Open register

| ID | Question / observed discrepancy | Evidence | Closure criterion | Proposed owner / phase |
| --- | --- | --- | --- | --- |
| Q-01 | Does the published API contract cover all routes and match their payloads/errors? | Embedded `openApiSpec`, route files, [coverage report](api-coverage.md); shared middleware can return only `{ message }` despite historical unified-error claims. Desktop reporting/dashboard dependencies (`/api/dashboard/overview`, `/api/system/logs`, and the active `/api/reports/*` endpoints) were reconciled on 2026-09-17. | Keep the desktop-used operations synchronized whenever they change, and continue burning down the wider inventory from `api-coverage.md` as later route work touches it | Backend / D1 follow-up |
| Q-03 | Should PM approval prohibit own-work/self-approval? | The current route matrix is now locally verified: supervisor approval accepts Supervisor/Admin/Superadmin, revise accepts Supervisor/Superadmin, and final approval rejects non-Superadmin reviewers. Historical plans promise segregation of duties, but no PM own-work/self-approval prohibition is implemented or verified yet. | Agree own-work policy and test same-user / multi-role approval attempts across the PM review stages | Product + backend / D1 |
| Q-04 | Does final approval recalculate asset and facility schedules using identical rules? | `approve-by-superadmin` updates `AssetPMSettings` with inline `DATEADD`; global scheduling uses `fn_CalculateNextDueAt` and facility schedules | Verify facility completion, blackout/month-end handling, freeze behavior, and all recalc paths; document and resolve differences | Backend / D1 |
| Q-05 | Should local-only login require LDAP configuration at startup? | `backend/src/config/env.ts` requires LDAP fields even though historical setup describes LDAP as optional | Decide startup contract; verify local-only and LDAP-enabled environments and update environment guidance | Backend + operations / D2 |
| Q-06 | Where is mobile source maintained and how is it delivered with this repository? | `.gitignore` ignores `mobile`; `git ls-files mobile` returned no files at baseline review, although `mobile/pm-tech` exists locally; Field-Ready path is absent | Establish tracked source or explicit separate-repository/version reference; prove fresh-checkout mobile build | Repository owner / Deferred mobile |
| Q-07 | Which APK publication/update architecture is authoritative? | Old guide references `mobile/secure_apk`, `push:android`, port 9103, and upload API; available `mobile/secure-apk` is read-only Nginx on default 5057 with `/version.json`; backend also has signed app-update downloads | Select and document the supported path, manifest format, signing/build process, and authorization; validate on a device | Mobile + operations / Deferred mobile |
| Q-08 | Does schema verification cover the entire evolved model? | `scripts/db/verify-schema.mjs` contains a partial expected-table list relative to `db/schema.sql` | Verify all relevant entities/columns/constraints/indexes on clean and upgraded databases; expand checks as needed | Backend / D2 |
| Q-10 | What are the release, recovery, and job-coordination guarantees? | Compose provides API/web and external SQL/storage; no verified CI/restore evidence was supplied; jobs run inside API process | Establish staging/release gates, backup retention and restore test, job ownership across replicas, and recovery targets | Operations / D2 |
| Q-11 | What security and offline guarantees does the mobile app provide? | `mobile/pm-tech/lib/auth.ts` persists tokens in localStorage as well as memory; biometric credentials use native storage separately; historical plan says to avoid localStorage | Agree token policy and verify device storage/logout, offline replay, conflicts, evidence retries, push, and expired-token behavior | Mobile + security / Deferred mobile |

## Asset/facility follow-up — 2026-09-11

Based on the [user-answer evaluation](implementation-roadmap.md). Confirmed requirements belong in F-01; unanswered details remain open below.

| ID | Remaining question | Closure criterion | Phase |
| --- | --- | --- | --- |
| Q-12 | Asset-to-facility mapping is tentative. Inspection shows sync imports returned hardware without special AC/panel filtering. Actual upstream inventory was not queried. | Inspect existing behavior before asking remaining mapping/identity questions; no relationship/filter change is currently approved | Product / D1 discussion |
| Q-13 | Resolved 2026-09-16 by AF-01: Snipe-IT `broken` synchronization cancels all unfinished PM asset tasks, including approval-pending submissions, with retained history, system audit/reason, idempotent retries, PM Now/create-action guards, and no automatic reopening when the asset later reappears | Keep AF-01 verification evidence current if broken-asset cancellation, PM Now blocking, or retry semantics change again; do not extend this rule to CM repairs or completed PM history without a new decision | Closed / D1 |
| Q-14 | Admin/Superadmin ownership and exclusion of Supervisor from facility master-data changes are confirmed; requests are verbal. Existing routes still allow Supervisor through requireManager. | Align scoped facility administration guards and verify them; inspect closure behavior before asking remaining task-handling questions. Do not add an in-app request/approval workflow | Backend + product / D1 gap |
| Q-15 | The suggested category/location/responsibility/template information is sufficient, but which fields are mandatory for assets versus facilities? How should deliberate PM exclusion work? | Agree per-context prerequisites and decide whether an exclusion policy is needed; do not infer validation from a general acceptance of suggested fields | Product / D1 discussion |

## Template/checklist follow-up — 2026-09-11

| ID | Remaining question / gap | Closure criterion | Phase |
| --- | --- | --- | --- |
| Q-16 | Resolved 2026-09-16 by TC-02: the checklist definition freezes at the first successful technician `submit-for-approval`, remains attached to returned/reopened work, and legacy pre-snapshot tasks fall back explicitly to live template data without claiming historical certainty | Keep TC-02 verification evidence current if snapshot readers, correction behavior, or legacy fallback signaling change again | Closed / D1 |
| Q-17 | Resolved 2026-09-15 by TC-01: Fail notes are required, mandatory alone no longer implies notes, and explicit `RequiresNotes` now surfaces as a Pass/Done requirement instead of a hidden mandatory side effect | Keep TC-01 verification evidence current if the checklist-validation contract changes again | Closed / D1 |

## Scheduling follow-up — 2026-09-11

Q-18: Fixed recurrence from the planned schedule is implemented by SC-01. Asset/facility settings now persist `NextPlannedPMDueAt` separately from blackout-adjusted `NextPMDueAt`; PM tasks persist `PlannedDueAt` and `FulfilledPlannedDueAt`; missed/skipped planned occurrences are recorded additively; PM Now reuses due/overdue work first, then upcoming regular work; and Skip next PM is available for Supervisor/Admin/Superadmin with required reason/history and one-occurrence advancement. Blackout remains as implemented without expansion. Current reporting semantics are now explicit under Q-09 and continue to preserve skipped-versus-missed history as distinct records. Do not reopen the settled fixed-versus-completion-based decision. Q-04 now only tracks any future asset/facility parity regressions across new code paths. Status: implemented locally with verification evidence in SC-01, D1.

## Reporting semantics follow-up — 2026-09-17

Q-09: Resolved 2026-09-17 for the current desktop/web reporting contract. Compliance now uses UTC `ScheduledDueAt` within the requested range as the denominator, excludes cancelled tasks from that denominator, and applies `approvedOnly=true` only to the completion numerators. `currentlyOverdue` and the overdue report use unfinished, uncancelled tasks whose UTC `ScheduledDueAt` is already in the past. Overdue reporting now includes asset and facility contexts, with location filters applying to either context and category filters remaining asset-only. CM metrics remain explicitly reported-to-completed MTTR (`ReportedAt` to `CompletedAt`) filtered by UTC `ReportedAt`, not summed downtime intervals or technician labor time. Dashboard KPI queries are PM-only and exclude cancelled tasks from those PM aggregates. Keep this contract synchronized across route SQL, OpenAPI descriptions, and report-facing docs.

## Assignment follow-up — 2026-09-11

Q-19: Resolved 2026-09-16 by AS-01: PM role-queued tasks now support atomic exclusive technician claim, ownership precedence is `assigned user > role queue`, submitted PM tasks are locked from reassignment/claim/draft editing until returned for revision, and "assigned to me" / outstanding counts only treat role membership as ownership when no individual assignee exists. Manager assignment/reassignment remains available before submission and after explicit revision return; rule editing stays Superadmin-only; aggregate daily capacity stays unchanged. Keep [AS-01 verification](verification-as01.md) current if ownership precedence, claim semantics, or submission locks change again. Status: closed / D1.

## Execution/review follow-up — 2026-09-11

Q-02: Resolved 2026-09-27 for the current PM desktop/web contract. `submit-for-approval` preserves the current lifecycle `Status`, writes the technician submission trail, moves the task to `PendingSupervisor`, and rejects repeated submission once the task is already in an approval-waiting state. The route-role matrix was also challenge-tested directly: supervisor-stage approval accepts Supervisor/Admin/Superadmin, revise accepts Supervisor/Superadmin, and final approval rejects non-Superadmin reviewers. Keep [Q-02/Q-03 verification](verification-q02-q03.md) current if submission/approval state semantics or role guards change again. Remaining PM own-work/self-approval policy stays under Q-03.

Q-20: Resolved 2026-09-16 by EX-01. PM work now uses persisted `TaskWorkSessions` for additive Start/Pause/Resume timing, open sessions close on submit/complete/cancel/revise/reject/final approval, Pause reason remains optional, revision requires a nonblank reason, rejection creates or reuses one linked replacement PM task, and failed PM findings can create or reuse one linked CM work order via source traceability fields. Preserve original rejected results, evidence, work time, and rejection reason on the source task; do not invent legacy work-session history. Current reporting semantics now document how these execution records are interpreted. Status: closed / D1.

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

## CM review and restoration follow-up — 2026-09-11

Q-21: Resolved 2026-09-17 by CM-01. CM work orders now use technician repair submission into `pending_review`, one manager verify-close stage, same-WO return-for-correction with mandatory reason, self-verification rejection, independent restoration recording with historical-time reason/history, additive same-WO downtime intervals, and linked recurrence work orders after closure. Shared PM routes reject CM lifecycle bypasses, and OpenAPI/detail payloads now expose CM history and downtime intervals. Keep [CM-01 verification](verification-cm01.md) current if these lifecycle, interval, or linkage semantics change again. Current reporting semantics now explicitly keep CM MTTR separate from downtime-interval duration. Status: closed / D1.

## Code-audit clarification register — 2026-09-11

The [technical map](code-implementation-map.md) supplies evidence and bounded work under existing questions; it does not reopen approved product decisions. Q-01/Q-02 include direct-submit validation, missing-item checks and shared PM/CM mutation bypasses. Q-13 includes sync/generator race protection and affected cancellation states. Q-16/Q-20 include legacy snapshot/import/delete behavior and replacement period uniqueness. Q-21 includes performer history across assignment/account deletion and CM self-verification. Q-04/Q-18 include missing PM-only history predicates and asset/facility recurrence parity. The earlier Q-09 findings about asset-only compliance joins and reported-to-completed CM timing are now implemented and documented in the active contract. These are static findings requiring implementation and runtime verification, not proven live incidents.

## AF-02 permission implementation — 2026-09-11

Q-14 master-mutation permission scope is implemented for create/update/clone, including isActive and UI bulk archival via per-facility update. PM planning rights remain unchanged. [Verification](verification-af02.md) covers isolated HTTP authorization and browser controls; live deployment/data persistence are not claimed. Existing shared middleware accepts valid token roles and refreshes roles only when needed to satisfy a guard; this change does not introduce immediate revocation of already-issued privileged tokens. Broader auth/session policy remains outside AF-02.
