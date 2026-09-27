# Q-02 / Q-03 Verification

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
