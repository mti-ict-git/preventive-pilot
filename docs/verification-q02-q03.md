# Q-02 / Q-03 Verification

Current policy update (2026-10-05): the user permits Supervisor own-submission approve/revise/reject at PendingSupervisor only. Earlier dated blanket-prohibition evidence is historical; final-stage and CM restrictions remain. See the current correction evidence at the end of this document.

Date: 2026-09-27

## Scope

Local verification for the PM approval boundary discussion after EX-01:

- submission versus lifecycle completion (`submit-for-approval`)
- repeated submission behavior
- current PM approval route-role matrix
- current PM maker-checker prohibition for same-user review actions
- regression coverage for the surrounding PM execution workflow

## Changed areas

- `scripts/tests/task-checklist-harness.mjs`
- `scripts/tests/pm-approval-boundaries.test.mjs`
- `package.json`
- `docs/functional-specification.md`
- `docs/security-and-access-model.md`
- `docs/open-questions-and-challenges.md`
- `docs/implementation-roadmap.md`

## Verification evidence

1. Targeted PM approval boundary tests

```bash
npm run test:q02q03
```

Validated:

- `submit-for-approval` moves PM work into `PendingSupervisor` without forcing lifecycle `Status = completed`
- repeated submission is rejected once the task is already waiting for approval
- supervisor-stage approval accepts `Supervisor`, `Admin`, and `Superadmin`
- supervisor-stage approval rejects same-user own-work approval, including a same-user `Technician + Supervisor` token
- `revise-approval` rejects `Admin` and accepts `Supervisor` / `Superadmin`
- same-user PM performers are rejected when they attempt `revise-approval` or `reject-approval` at either approval stage
- `approve-by-superadmin` rejects non-Superadmin reviewers

2. Regression coverage for related PM execution semantics

```bash
npm run test:ex01
```

Validated that the new approval-boundary harness support does not regress:

- PM work-session closure on submission
- revision reason validation
- rejection replacement-task behavior
- finding-linked work-order reuse

3. Documentation parity and diff hygiene

```bash
node scripts/docs/check-docs.mjs
git diff --check
```

## Notes

- Q-02 is now explicit and locally verified for the current desktop/web PM contract.
- Q-03 is now implemented locally: PM review follows a maker-checker rule and blocks the performer from reviewing the same submitted PM task.
- Backend review-route behavior changed in this step, so `backend/src/index.ts` and `docs/openapi.yaml` were updated together.


## Supervisor own-submission correction â€” 2026-10-05

User direction supersedes the earlier blanket PM prohibition: a Supervisor may approve, revise or reject their own PM at PendingSupervisor, including Technician/Supervisor users. Existing route roles remain; same-user PendingSuperadmin review, both final approval paths, and CM self-verification remain forbidden.

Backend guards and embedded/canonical OpenAPI descriptions are synchronized. No UI change or SQL/schema migration is required. Local relevant HTTP/policy regression passed 18/18 tests, backend typecheck and documentation/contract checks passed. Final-source release checks and production rollout remain pending.

Authorized production data correction: task `PM-20260106-12D5A750` had submitter `widji.santoso`; only `TechnicianCompletedByUserId` was changed to the existing active `it.support.assistant` / IT Support Assistant [MTI] account, which was already assigned to the task. Serializable transaction, row lock, exact identity/state guards and comparison of every other task column passed. The same transaction inserted `task_submitter.correct` audit metadata preserving the original actor and reason. Status remains completed / PendingSupervisor; submission time, checklist and evidence were not edited; no approval or notification was performed. Protected before/after evidence: `/var/backups/preventive-pilot/submitter-correction-20261005T025346Z/correction.json`.

Release preparation follow-up, 2026-10-05: the first exact-source Linux check passed 159/160 regressions; Windows Git archive conversion exported the deployment shell script with CRLF and Bash rejected `pipefail`. Added `*.sh text eol=lf` in `.gitattributes` to preserve portable shell input. The policy source was unaffected; final-source verification must pass before release.
