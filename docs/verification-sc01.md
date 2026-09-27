# SC-01 verification

Date: 2026-09-16.

## Scope

SC-01 local verification for planned-date recurrence, PM Now reuse order, skipped/missed occurrence persistence, scheduling read parity, and desktop exposure of planned versus effective due dates.

## Changed areas

- `db/schema.sql`
- `backend/src/db/pmAssignment.ts`
- `backend/src/db/pmSchedulingPolicy.ts`
- `backend/src/jobs/scheduleCalc.ts`
- `backend/src/routes/assets.ts`
- `backend/src/routes/facilities.ts`
- `backend/src/routes/scheduling.ts`
- `backend/src/routes/tasks.ts`
- `src/lib/api.ts`
- `src/pages/AssetDetail.tsx`
- `src/pages/FacilityDetail.tsx`
- `backend/src/index.ts`
- `docs/openapi.yaml`
- `docs/functional-specification.md`
- `docs/database-schema-specification.md`
- `docs/open-questions-and-challenges.md`

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

3. SC-01 policy tests

```bash
npm run test:sc01
```

Result: 4 passing tests covering:

- planned-date recurrence stays anchored to the planned due date
- missed occurrences are recorded while one actionable current occurrence remains
- PM Now reuse prefers due/overdue work before a future occurrence
- month-end advancement follows SQL-like calendar month behavior

4. AF-01 regression

```bash
npm run test:af01
```

Result: 5 passing tests. Broken-asset cancellation and PM Now blocking remained intact after SC-01 scheduling changes.

## Notes

- Verification is local/static plus isolated test coverage; no live SQL Server migration rehearsal or browser walkthrough is claimed here.
- Reporting/compliance treatment of skipped versus missed occurrences remains open under `Q-09` and was not closed by this verification.
