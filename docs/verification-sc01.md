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

Targeted planner/finalization/reopen regression tests passed (11 tests). Synthetic browser verified February 21 Done late, actual March 3 completion, original task reference, zero remaining capacity and keyboard-addressable month/day navigation. The isolated fixture uses synthetic data; no real approval or notification was performed. At the initial rehearsal checkpoint, final-source Linux checks and production acceptance were pending; the final acceptance below supersedes that checkpoint.

The resolution ledger preserves missed snapshots, original cancelled aliases and performing task evidence/approval. It prevents reopening or deleting linked history. Completed/pending calendar items have zero remaining capacity; pending approval is distinct from overdue. The original task period takes priority during finalization; delayed approval cannot advance an unrelated later period or rewind the current cursor. D2 recovery and broader D3 business acceptance remain open.

Final production acceptance passed on `a821ae1`: 173/173 Linux regressions plus lint/typechecks/builds/schema-source/docs. The additive migration and all 13 reviewed corrections committed once; post-data verification confirmed unchanged performing task history, approval and work/evidence, retained original task rows and 44 missed snapshots, all eight exceptions unchanged, and MTI-PC-009 next planned PM restored to August 21. Authenticated browser verified green Done late for February 21, actual completion March 3, original task reference and zero remaining capacity. Synthetic browser also covered pending review, empty day, loading/error and 768px calendar-label wrapping; surrounding narrow header/sidebar overflow remains existing debt. Strict whole-app audit still reports the 58 pre-existing findings. See the maintained [release evidence](deployment-and-environment.md#production-pm-history-and-calendar--2026-10-06). No workflow approval or synthetic production notification was performed; backup restore and broader D2/D3 acceptance remain open.


### Read-only review of remaining active aliases - 2026-10-06

The user challenged the earlier status-only protection. A fresh full-PM rescan covered 269 tasks, including all 122 nonterminal and 121 completed records, all 29 PM Now and the cancelled originals. Zero-work checks include checklist evidence as well as task evidence, sessions and drafts. All 13 previous ledger links passed consistency checks. Two started-only aliases have unique approved March 3 normal executions (PC-010/049); PC-046 has erroneous September fulfilment metadata and a March cancelled original explicitly referencing PM Now. UPS-010 cross-template history, PC-028 timestamps and unfinished PR-005/007 cycles remain distinct review items. See [the maintained exception evidence](open-questions-and-challenges.md#thorough-pm-rescan---2026-10-06). The earlier 13 repairs were not represented as closure of these cases. No business mutation, approval, migration or runtime deployment occurred. OpenAPI reviewed and unchanged: this is read-only operational analysis, not a backend contract change.


Started-only PC-010/049 follow-up: after the above read-only checkpoint, two reviewed aliases were cancelled and linked to their approved March 3 normal executions. Actual SERIALIZABLE SQL rehearsal was rolled back; ten negative checks rejected new work/submission, and successful application committed once. Independent reads verified every performing-task column, checklist/task evidence counts, alias StartedAt, August settings/task rows, 15 ledger links and zero March 2 events/calendar bucket. Authenticated browser shows March 2 empty with capacity 0. Node syntax and documentation checks passed; the application regression suite was not rerun because runtime application code was unchanged. OpenAPI reviewed and unchanged: only a limited operational runner and documented legacy exception were added, with no route/payload change. See [the resolution evidence](open-questions-and-challenges.md#started-only-pc-alias-resolution---2026-10-06).
