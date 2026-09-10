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
