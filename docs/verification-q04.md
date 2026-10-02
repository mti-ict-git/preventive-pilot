# Q-04 Verification

Date: 2026-09-27

## Scope

Local verification for PM final-approval schedule parity across asset and facility contexts:

- shared scheduling helper behavior during finalization
- blackout-adjusted next-anchor calculation
- `approve-by-superadmin` route behavior for asset and facility PM tasks

## Changed areas

- `scripts/tests/task-checklist-harness.mjs`
- `scripts/tests/pm-final-approval-parity.test.mjs`
- `package.json`
- `docs/functional-specification.md`
- `docs/open-questions-and-challenges.md`
- `docs/implementation-roadmap.md`

## Verification evidence

1. Targeted Q-04 parity tests

```bash
npm run test:q04
```

Validated:

- `finalizePmOccurrenceCompletion` advances asset and facility anchors identically
- blackout-adjusted `NextPMDueAt` is applied through the same helper path for both contexts
- `POST /api/tasks/{taskId}/approve-by-superadmin` writes the same next anchor for asset and facility PM tasks

2. Scheduling-policy regression coverage

```bash
npm run test:sc01
```

Validated that the new Q-04 route/harness coverage remains aligned with the established SC-01 recurrence policy:

- planned-date monthly anchoring
- missed-occurrence reconciliation
- PM Now reuse order
- SQL-like month-end progression

3. Documentation parity and diff hygiene

```bash
node scripts/docs/check-docs.mjs
git diff --check
```

## Notes

- No backend route or SQL implementation changed in this step; the work verified that the current final-approval path already uses the shared scheduling-policy helper for both asset and facility contexts.
- `docs/openapi.yaml` did not require an update because the published API contract did not change.
