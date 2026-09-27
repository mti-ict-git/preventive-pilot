# AS-01 verification

Date: 2026-09-16.

## Scope

AS-01 local verification for PM role-queue claim, ownership precedence, submitted-task reassignment locks, shared task/work-order ownership enforcement, desktop claim controls, and API/documentation parity.

## Changed areas

- `backend/src/db/taskOwnership.ts`
- `backend/src/routes/tasks.ts`
- `backend/src/routes/workOrders.ts`
- `src/lib/api.ts`
- `src/pages/Tasks.tsx`
- `backend/src/index.ts`
- `docs/openapi.yaml`
- `docs/functional-specification.md`
- `docs/open-questions-and-challenges.md`
- `docs/implementation-roadmap.md`
- `scripts/tests/task-checklist-harness.mjs`
- `scripts/tests/task-assignment-policy.test.mjs`
- `package.json`

## Verification evidence

1. Backend typecheck

```bash
npm --prefix backend run typecheck
```

Result: passed.

2. Frontend production build

```bash
npm run build
```

Result: passed. Vite reported the pre-existing large-chunk warning only.

3. AS-01 policy tests

```bash
npm run test:as01
```

Result: passed. Coverage includes:

- eligible technician can claim an unowned role-queued PM task
- repeated claim by the same technician is idempotent
- another technician in the same role cannot take over an already claimed task
- role membership alone cannot execute a task once a personal assignee exists
- manager reassignment is blocked after PM submission

4. AF-01 regression after ownership changes

```bash
npm run test:af01
```

Result: passed. Broken-asset cancellation and PM action blocking remained intact after the AS-01 ownership changes.

## Notes

- Verification is local/static plus isolated route-harness coverage; no live SQL Server concurrency rehearsal or browser walkthrough is claimed here.
- AS-01 does not add a database migration. It changes task ownership policy, route behavior, frontend controls, and OpenAPI/documentation only.
