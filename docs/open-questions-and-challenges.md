# Open Questions and Challenges

Last reviewed: 2026-09-27. Findings below are based on source inspection, not confirmed production incidents. Proposed owners are roles, not assigned people.

## Current triage

Desktop/web first, per user direction on 2026-09-10. Q-01 plus Q-08–Q-10 remain relevant to the desktop application and supporting services. Q-06, Q-07, and Q-11 are **deferred**, not resolved; their closure criteria are retained for a later mobile scope. For Q-01, classify operations by desktop usage before selecting contract work; the full coverage report remains an inventory, not the current desktop checklist. For shared workflows, verify web and direct API behavior now and defer mobile client verification.

## Open register

| ID | Question / observed discrepancy | Evidence | Closure criterion | Proposed owner / phase |
| --- | --- | --- | --- | --- |
| Q-01 | Does the published API contract cover all routes and match their payloads/errors? | Embedded `openApiSpec`, route files, [coverage report](api-coverage.md); shared middleware can return only `{ message }` despite historical unified-error claims. Desktop reporting/dashboard dependencies were reconciled on 2026-09-17; 37 additional desktop operations and the PM/CM deletion boundary were reconciled locally on 2026-09-27. See [deletion evidence](verification-task-deletion.md). | Keep the desktop-used operations synchronized whenever they change, and continue burning down the wider inventory from `api-coverage.md` as later route work touches it | Backend / D1 follow-up |
| Q-05 | Resolved: local-only login may start without LDAP configuration, as approved by the user | Implemented 2026-09-29; optional all-or-none directory configuration, explicit unavailable responses, isolated local and LDAP-enabled verification | See [Q-05 evidence](verification-q05.md); target-host directory acceptance remains separate | Backend / D2 local verification complete |
| Q-06 | Where is mobile source maintained and how is it delivered with this repository? | `.gitignore` ignores `mobile`; `git ls-files mobile` returned no files at baseline review, although `mobile/pm-tech` exists locally; Field-Ready path is absent | Establish tracked source or explicit separate-repository/version reference; prove fresh-checkout mobile build | Repository owner / Deferred mobile |
| Q-07 | Which APK publication/update architecture is authoritative? | Old guide references `mobile/secure_apk`, `push:android`, port 9103, and upload API; available `mobile/secure-apk` is read-only Nginx on default 5057 with `/version.json`; backend also has signed app-update downloads | Select and document the supported path, manifest format, signing/build process, and authorization; validate on a device | Mobile + operations / Deferred mobile |
| Q-08 | Does schema verification cover the entire evolved model? | The expanded verifier inventories all source tables/columns/named constraints/explicit indexes; disposable clean/repeat/upgrade and live checked-shape verification pass. Constraint expressions, FK endpoints, index definitions and full delivery remain separate; see [D2 evidence](verification-d2-environment.md) | Verify all relevant entities/columns/constraints/indexes on clean and upgraded databases; expand checks as needed | Backend / D2 |
| Q-10 | What are the release, recovery, and job-coordination guarantees? | Compose provides API/web and external SQL/storage; no verified CI/restore evidence was supplied; jobs run inside API process | Establish staging/release gates, backup retention and restore test, job ownership across replicas, and recovery targets | Operations / D2 |
| Q-11 | What security and offline guarantees does the mobile app provide? | `mobile/pm-tech/lib/auth.ts` persists tokens in localStorage as well as memory; biometric credentials use native storage separately; historical plan says to avoid localStorage | Agree token policy and verify device storage/logout, offline replay, conflicts, evidence retries, push, and expired-token behavior | Mobile + security / Deferred mobile |

## Asset/facility follow-up — 2026-09-11

Based on the [user-answer evaluation](implementation-roadmap.md). Confirmed requirements belong in F-01; unanswered details remain open below.

| ID | Remaining question | Closure criterion | Phase |
| --- | --- | --- | --- |
| Q-12 | Deferred by user decision on 2026-09-27. Asset-to-facility mapping is outside the current scope; existing Snipe-IT synchronization is retained. | Do not add mapping or AC/panel filters. Revisit only when explicitly brought back into scope; upstream inventory presence remains unverified. | Deferred / not a current D1 blocker |
| Q-13 | Resolved 2026-09-16 by AF-01: Snipe-IT `broken` synchronization cancels all unfinished PM asset tasks, including approval-pending submissions, with retained history, system audit/reason, idempotent retries, PM Now/create-action guards, and no automatic reopening when the asset later reappears | Keep AF-01 verification evidence current if broken-asset cancellation, PM Now blocking, or retry semantics change again; do not extend this rule to CM repairs or completed PM history without a new decision | Closed / D1 |
| Q-14 | Resolved 2026-09-27: Admin/Superadmin retain master ownership; facility archival cancels only unstarted PM tasks, with history retained. | Preserve permissions and atomic cancellation; see [verification](verification-q14-q15.md). No in-app request workflow. | Closed locally / D1 |
| Q-15 | Resolved 2026-09-27: site and active default template are mandatory when enabling PM. Disabled contexts may remain incomplete. PM disabling cancels only unstarted tasks. | Preserve individual, bulk and clone validation and generation guards; see [verification](verification-q14-q15.md). | Closed locally / D1 |

## Template/checklist follow-up — 2026-09-11

| ID | Remaining question / gap | Closure criterion | Phase |
| --- | --- | --- | --- |
| Q-16 | Resolved 2026-09-16 by TC-02: the checklist definition freezes at the first successful technician `submit-for-approval`, remains attached to returned/reopened work, and legacy pre-snapshot tasks fall back explicitly to live template data without claiming historical certainty | Keep TC-02 verification evidence current if snapshot readers, correction behavior, or legacy fallback signaling change again | Closed / D1 |
| Q-17 | Resolved 2026-09-15 by TC-01: Fail notes are required, mandatory alone no longer implies notes, and explicit `RequiresNotes` now surfaces as a Pass/Done requirement instead of a hidden mandatory side effect | Keep TC-01 verification evidence current if the checklist-validation contract changes again | Closed / D1 |

## Scheduling follow-up — 2026-09-11

Q-18: Fixed recurrence from the planned schedule is implemented by SC-01. Asset/facility settings now persist `NextPlannedPMDueAt` separately from blackout-adjusted `NextPMDueAt`; PM tasks persist `PlannedDueAt` and `FulfilledPlannedDueAt`; missed/skipped planned occurrences are recorded additively; PM Now reuses due/overdue work first, then upcoming regular work; and Skip next PM is available for Supervisor/Admin/Superadmin with required reason/history and one-occurrence advancement. Blackout remains as implemented without expansion. Current reporting semantics are now explicit under Q-09 and continue to preserve skipped-versus-missed history as distinct records. Do not reopen the settled fixed-versus-completion-based decision. Status: implemented locally with verification evidence in SC-01, D1.

Q-04: Resolved 2026-09-27. Final PM approval now verifiably uses the shared scheduling-policy path for both asset and facility contexts: `loadPmScheduleContextByTask`, `reconcilePmScheduleContext`, and `finalizePmOccurrenceCompletion`. Direct logic tests confirm identical anchor advancement and blackout handling for asset and facility contexts, and route-level HTTP tests confirm `approve-by-superadmin` writes the same next anchor for both contexts. Keep [Q-04 verification](verification-q04.md) current if final approval or PM scheduling paths change again. Status: implemented locally / D1.

## Reporting semantics follow-up — 2026-09-17

Q-09: Resolved 2026-09-17 for the current desktop/web reporting contract. Compliance now uses UTC `ScheduledDueAt` within the requested range as the denominator, excludes cancelled tasks from that denominator, and applies `approvedOnly=true` only to the completion numerators. `currentlyOverdue` and the overdue report use unfinished, uncancelled tasks whose UTC `ScheduledDueAt` is already in the past. Overdue reporting now includes asset and facility contexts, with location filters applying to either context and category filters remaining asset-only. CM metrics remain explicitly reported-to-completed MTTR (`ReportedAt` to `CompletedAt`) filtered by UTC `ReportedAt`, not summed downtime intervals or technician labor time. Dashboard KPI queries are PM-only and exclude cancelled tasks from those PM aggregates. Keep this contract synchronized across route SQL, OpenAPI descriptions, and report-facing docs.

## Assignment follow-up — 2026-09-11

Q-19: Resolved 2026-09-16 by AS-01: PM role-queued tasks now support atomic exclusive technician claim, ownership precedence is `assigned user > role queue`, submitted PM tasks are locked from reassignment/claim/draft editing until returned for revision, and "assigned to me" / outstanding counts only treat role membership as ownership when no individual assignee exists. Manager assignment/reassignment remains available before submission and after explicit revision return; rule editing stays Superadmin-only; aggregate daily capacity stays unchanged. Keep [AS-01 verification](verification-as01.md) current if ownership precedence, claim semantics, or submission locks change again. Status: closed / D1.

## Execution/review follow-up — 2026-09-11

Q-02: Resolved 2026-09-27 for the current PM desktop/web contract. `submit-for-approval` preserves the current lifecycle `Status`, writes the technician submission trail, moves the task to `PendingSupervisor`, and rejects repeated submission once the task is already in an approval-waiting state. The route-role matrix was also challenge-tested directly: supervisor-stage approval accepts Supervisor/Admin/Superadmin, revise accepts Supervisor/Superadmin, and final approval rejects non-Superadmin reviewers. Keep [Q-02/Q-03 verification](verification-q02-q03.md) current if submission/approval state semantics or role guards change again.

Q-03: Resolved 2026-09-27 by explicit product direction and local implementation. Updated by user direction on 2026-10-05: a Supervisor may approve, revise or reject their own submission at PendingSupervisor, including a combined Technician/Supervisor role. The exception does not apply to other same-user roles, PendingSuperadmin, final approval, or CM verification. Earlier blanket maker-checker verification below describes the superseded baseline. Local HTTP tests verify supervisor-stage own-work approval is rejected, and same-user revise/reject attempts are rejected at both approval stages. The final Superadmin approval route now uses the same performer-reviewer guard; broader final-approval runtime verification continues alongside Q-04 schedule-parity work. User-authorized API release on 2026-10-05 deployed the Supervisor own-submission exception; targeted and full regression, runtime and read-only browser evidence is recorded. Keep [Q-02/Q-03 verification](verification-q02-q03.md) current if PM review guards or role-state semantics change again. Status: implemented and production-verified / D1; wider business acceptance remains D3.

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


## Historical PM reconciliation exceptions — 2026-10-06

Q-16/SC-01 follow-up in the existing [roadmap](implementation-roadmap.md#selected-correction--pm-now-history-and-calendar-2026-10-06): eight records remain protected after the whole-PM scan. Do not infer completion or cancel active work without a reviewed decision.

| Context | PM Now record | Review required |
| --- | --- | --- |
| MTI-PC-028 | PM-NOW-20260126-50E3B157 | CompletedAt and technician completion disagree (January 26 / February 3) |
| MTI-UPS-010 | PM-NOW-20260206-2ABDA9FE | No unique same-template period; historical/current interval differs |
| MTI-PC-046 | PM-NOW-20260313-E80514E6 | March 22 original was cancelled with reason "already being PM now"; March 13 execution incorrectly records September 22 fulfilment. Retain September work; review original-period link |
| MTI-PR-005 | PM-NOW-20260821-8D9F156F | Unfinished alias without a unique completed normal period |
| MTI-PC-010 | PM-NOW-20260302-EEEC7150 | Resolved 2026-10-06: cancelled as started-only duplicate; linked to approved PM-20260122-F2D04F2A. StartedAt and August obligation retained. |
| MTI-PC-049 | PM-NOW-20260302-5EA1A61C | Resolved 2026-10-06: cancelled as started-only duplicate; linked to approved PM-20260122-BBB0C2E2. StartedAt and August obligation retained. |
| MTI-PR-005 | PM-NOW-20260312-6A31DEB4 | In-progress work preserved |
| MTI-PR-007 | PM-NOW-20260821-89517209 | Paused work preserved; April history may resolve without changing its current anchor |

The protected SQL backup and reviewed plan are operational evidence, not a second backlog. The roadmap remains the entry point for continuing work.


### Thorough PM rescan - 2026-10-06

Fresh production read at 03:31:17 UTC: 269 PM tasks, 29 PM Now, 121 completed (59 Approved, 62 legacy None), 26 cancelled, 118 open, 3 in progress and 1 paused. All 122 nonterminal tasks were compared with all 121 completed tasks; active status was not an exclusion. LEFT JOINs retained every PM task regardless of template/context availability (no missing context/template found). Three CM records were counted separately and excluded from PM fulfilment. Protected scan and detailed review: `/var/backups/preventive-pilot/pm-thorough-rescan-20261006T033117Z`. The additional task since the first scan is `PM-20261006-8F9E2EFD` for MTI-PC-030, created at 03:18:23 UTC for August 27; it is a later obligation, not fulfilled by February's work.

| Finding | Evidence | Required follow-up |
| --- | --- | --- |
| MTI-PC-010 started-only duplicate | `PM-NOW-20260302-EEEC7150` remains In Progress; zero checklist results, task/checklist evidence, sessions and drafts. Same asset/template `PM-20260122-F2D04F2A` completed and approved March 3, 11 results, 4 checklist evidence rows, February 21 planned period. | Review a narrowly scoped started-only duplicate resolution; retain StartedAt, history, actual execution and the separate August 21 task. Current automatic runner deliberately does not accept active records. |
| MTI-PC-049 started-only duplicate | `PM-NOW-20260302-5EA1A61C` remains In Progress with the same zero-work counts. `PM-20260122-BBB0C2E2` completed and approved March 3, 11 results, 3 checklist evidence rows, February 21 planned period. | Same reviewed resolution boundary; retain the separate August 21 obligation. |
| MTI-PC-046 wrong fulfilment period | `PM-NOW-20260313-E80514E6` completed/approved March 13 with 11 results and 3 checklist evidence rows, but FulfilledPlannedDueAt is September 22. March 22 original `PM-20260220-624597EE` was cancelled March 23 with reason "already being PM now". Open September task `PM-20261002-EBD742C1` conflicts with the erroneous fulfilment metadata. | Link March execution to March original after reviewed correction; do not cancel September as a duplicate of March. Current next cursor is March 22, 2027 and also needs period-aware review. |
| MTI-UPS-010 unresolved cross-template history | February PM Now uses Personal Computer template; cancelled March records use Server Room / Printer Test templates and reason "test purpose". September open work uses Printer Test. | Do not map across templates or infer September completion; reconstruct historical configuration before correcting fulfilment/cadence. |
| MTI-PC-028 completion metadata disagreement | CompletedAt January 26 differs from technician completion February 3; cancelled November original had StartedAt and no cancellation reason. | Preserve execution/approval; review dates and original period before changing cadence. |
| MTI-PR-005 unfinished overlap | March PM Now is In Progress; April/July normal work and August PM Now remain open. Only January backdate execution exists; no completed execution for these later periods. | Review task reuse/overlap separately; cannot mark any later period fulfilled from January history. |
| MTI-PR-007 unfinished later cycle | August PM Now is Paused, July/October normal tasks remain open. Approved March execution already fulfils April via the ledger. | Keep later obligations separate; March execution cannot fulfil another cycle. |

All 29 PM Now records were accounted for: 13 appear in the previous resolution ledger, 6 other records are already cancelled, 5 other records are completed, and 5 remain nonterminal. All 13 prior ledger links were checked for matching context/template, cancelled alias, approved completed execution and matching fulfilment period; they passed. Selected audit action trails corroborate March 2 creation of the two PC aliases, March 3 assignment of the corresponding normal tasks, and March 23 cancellation of the PC-046 original; legacy trails do not supply every start/completion action.

Matching candidates used context/template, planned/fulfilled/effective dates, creation/start/completion order and a broad one-cycle envelope; these are review signals, not automatic authority to cancel work. A separate chronology check flagged 13 approved rows with differing completion timestamps or StartedAt later than CompletedAt; those flags are not 13 more duplicates and may reflect legacy/backdating semantics. Raw evidence remains protected for review. No task, approval, evidence, schedule, database schema or application runtime was changed during this rescan. The existing eight exceptions remain open but now have explicit evidence instead of a status-only exclusion.


### Started-only PC alias resolution - 2026-10-06

The user requested removal of the remaining March 2 overdue duplicates. The reviewed exception is limited to PC-010/049 and is documented in the functional specification. `scripts/admin/reconcile-started-only-pc.mjs` locks/rechecks both aliases, actual executions, work/evidence counts, candidate uniqueness, existing ledger references, current settings and August obligations in a SERIALIZABLE transaction. It rejects submitted, worked, linked, ambiguous or changed-period records. Exact SQL rollback rehearsal passed, including ten negative guard checks. Backup set 5043 passed COPY_ONLY/CHECKSUM and VERIFYONLY. The two corrections then committed once, with before-images and audit; no performing-task or recurrence update was issued.

Independent post-commit reads confirmed cancelled aliases, preserved StartedAt, unchanged performing task columns and work/evidence counts, unchanged August tasks/settings, 15 total ledger links, no March 2 day events and no March 2 calendar bucket. Authenticated production browser confirmed selected March 2: no tasks and zero capacity. Protected evidence: `/var/backups/preventive-pilot/pm-started-only-20261006-review`. PC-046, UPS-010, PC-028 and the three unfinished printer records remain open; these two resolutions do not close them. No approval, deletion, database migration or application restart was performed.


### Overdue queue overlap and missed-task retirement - 2026-10-06

User-selected follow-up after the two March 2 corrections. Fresh read-only snapshot at 05:05:37 UTC: 269 PM tasks, 113 overdue, 120 nonterminal, 121 completed, 28 cancelled and 15 ledger links. Protected evidence: `/var/backups/preventive-pilot/pm-thorough-rescan-20261006T050538Z` (`scan.json`, `overdue-overlap-review.json`, `missed-vs-active-review.json`). Grouping by context/template found 15 contexts with 34 nonterminal rows; nine contexts have multiple overdue rows (21 rows). The other six contexts each have a July overdue and October upcoming printer task; those must not be described as two overdue rows. No exact same-planned-day nonterminal duplicates were found; logical duplicates and stale missed jobs use different timestamps.

| Context | Multiple overdue due dates | Classification |
| --- | --- | --- |
| MTI-PC-015 | February 25 / August 25 | Different cycles; February already has a missed snapshot but task remains open. |
| Pyrite Server Room | February 28 / September 28 | Different cycles; February already missed but still open. |
| ACID Server Room | February 28 / September 28 | Same stale missed-task issue. |
| Chloride Server Room | February 28 / September 28 | Same stale missed-task issue. |
| Makarti Server Room | February 13 / February 28 / September 28 | February 28 already missed/open; February 13 is an additional off-cadence legacy record requiring original-period review. |
| MTI-PC-039 | March 15 / September 15 | Different cycles; March already missed/open. |
| MTI-PR-005 | March 12 PM Now / April 16 / July 16 / August 21 PM Now | Active early legacy PM Now and normal April job overlap; April was already marked missed while the PM Now remains in progress. Later July/August work requires separate review; no completed later execution exists. |
| MTI-PC-030 | August 11 / August 27 | Same half-year maintenance window with different anchors. August 27 is the restored canonical cadence; old August 11 empty task remains. Review stale-anchor retirement. |
| MTI-PR-007 | July 16 / August 21 paused PM Now | Legacy PM Now overlaps an earlier overdue normal task; preserve paused work. October 16 is a separate upcoming period. |

Eight nonterminal tasks match missed snapshots exactly: PC-015 February, PC-039 March, the four server rooms' February tasks, PR-005 April and UPS-007 May (`PM-20260409-B1FCC40B`). All eight have zero checklist results, task/checklist evidence, sessions and drafts; this finding supports reviewed retirement as not performed, never completion. UPS-007 is an additional stale missed/open record without a second active same-template row. Its task and current default both use the Printer template; current cursor is August 9, while the open missed task is May 9. Generation eligibility and the absent newer task need separate checking.

Source diagnosis: `recordPmMissedOccurrence` merges only the missed ledger; it never updates the unstarted source task. `reconcilePmScheduleContext` can advance past that period and the generator creates later work while the older task remains open. Overdue filtering correctly includes open work past due, exposing the inconsistency. Occurrence loading/creation use exact `PlannedDueAt` equality, so older PM Now records with execution-time dates are not associated with the normal planned period; status protection then fails to protect the matching normal occurrence. These are source/read-data findings, not proof that every pair is the same period or completed.

Follow-up must retire genuinely missed untouched tasks with explicit not-performed history, preserve ongoing/paused work and original cadence, associate reviewed unfinished PM Now with its canonical occurrence, and prevent recurrence of this overlap in generator/PM Now flows. No fulfilment ledger entry may claim an unfinished task performed a period. Review PC-030/Makarti off-cadence records and PR-005/007 active aliases separately. No production task, schedule or runtime was changed during this audit; the two earlier March 2 resolutions remain applied.


### Calendar-wide red-bucket cross-check - 2026-10-06

The user's calendar follow-up was verified against both the authenticated browser and the exact deployed scheduling read model over January 2025 through October 6, 2026. Protected evidence: `/var/backups/preventive-pilot/pm-calendar-audit-20261006T053052Z`. There are 121 overdue calendar entries across 38 days: 113 persisted tasks and 8 projected occurrences without persisted tasks. Month counts: February 6, March 3, April 1, May 1, June 2, July 57, August 37, September 14. Browser independently showed July 6 with 42 PM, July 16 with 8 PM, and March 15 with the open PC-039 task alongside two distinct completed-late tasks. July's majority therefore remains visible; fixing March 2 did not clear the wider calendar.

The eight projected contexts are PC-041, UPS-007, PC-043, PC-047, PC-024, PC-044, PC-042 and PC-040. Calendar and Tasks totals have different scopes: projected occurrences are added only by the scheduling read model. Projection generation/eligibility must be reviewed separately before claiming queue/calendar numerical parity; no cause for the absent persisted tasks was established by this query. Red remains a mix of actual unperformed work, the earlier eight missed/open records and unfinished logical overlaps. Do not recolour all red entries as completed or assume all 121 entries are duplicates. March red entries are LAB PC-003 (March 4), PR-005 ongoing PM Now (March 12), and the stale missed/open PC-039 job (March 15). This was read-only verification; wider queue cleanup and prevention remain open.
