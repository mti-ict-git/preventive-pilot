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


## PM Now historical fulfilment and calendar — 2026-10-06

Selected D1 correction alongside D2. All 268 PM records (29 legacy PM Now) and 44 missed snapshots were scanned read-only. The conservative portable planner identifies 13 unique unstarted aliases and preserves eight active/ambiguous cases. Same context/template, one-period mapping, completion-date consistency and absence of work are required. SERIALIZABLE application rechecks both task images, work counts and current schedule settings under locks, saves protected before-images and records one audit entry per resolution.

A verified COPY_ONLY/CHECKSUM SQL backup exists in the protected production reconciliation audit. The actual 13-pair correction and additive ledger were exercised against production SQL inside a rolled-back transaction; the exact day and month read batches executed successfully. February 21 resolves once to PM-NOW-20260302-5F12BE0A, completed-late, with original task reference and zero remaining capacity. No database changes from this verification were committed. Backup VERIFYONLY passed; restore has not been exercised.

Targeted planner/finalization/reopen regression tests passed (11 tests). Synthetic browser verified February 21 Done late, actual March 3 completion, original task reference, zero remaining capacity and keyboard-addressable month/day navigation. The isolated fixture uses synthetic data; no real approval or notification was performed. Final-source Linux checks and production acceptance are pending before release.

The resolution ledger preserves missed snapshots, original cancelled aliases and performing task evidence/approval. It prevents reopening or deleting linked history. Completed/pending calendar items have zero remaining capacity; pending approval is distinct from overdue. The original task period takes priority during finalization; delayed approval cannot advance an unrelated later period or rewind the current cursor. D2 recovery and broader D3 business acceptance remain open.
