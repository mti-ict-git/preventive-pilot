# Q-02 / Q-03 Verification

Date: 2026-09-27

## Scope

Local verification for the PM approval boundary discussion after EX-01:

- submission versus lifecycle completion (`submit-for-approval`)
- repeated submission behavior
- current PM approval route-role matrix
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
- `revise-approval` rejects `Admin` and accepts `Supervisor` / `Superadmin`
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
- Q-03 is narrowed to PM own-work/self-approval policy and same-user multi-role review behavior.
- No backend route behavior changed in this step, so `docs/openapi.yaml` did not require an update.
