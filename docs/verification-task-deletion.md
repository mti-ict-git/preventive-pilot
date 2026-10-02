# D1 Task Deletion Verification — 2026-09-27

## Scope and implementation

`tasks.ts` now selects PM only, preventing manager access to CM deletion through the generic route. `workOrders.ts` remains CM-only and Superadmin-only. Both lock the typed parent, check independent references, read evidence paths after authorization, delete owned rows, write audit with the same transaction executor, and commit before best-effort file removal. Errors roll back and reach Express error middleware.

`taskDeletionPolicy.ts` covers every current incoming task foreign key. Owned rows: checklist results/snapshots, task/checklist evidence, drafts, work sessions, CM events and downtime intervals. Blocking references: task source/recurrence links, missed/skipped occurrence records and notification logs. Conflicts return 409 `TASK_REFERENCED`; independent records are never cascaded or detached. Missing/wrong-type IDs return 404. Existing audit history remains.

## Local evidence

`node --test scripts/tests/task-deletion-policy.test.mjs`: 12 tests pass. Real routes and JWT/role middleware are exercised with synthetic SQL. Tests cover unauthorized/forbidden requests, invalid and missing IDs, both wrong-type directions, reference conflicts with no deletion, allowed roles, owned-row/audit ordering, and rollback when deletion or audit fails. A schema check accounts for all 13 incoming task foreign keys and verifies child-before-parent cleanup.

At the initial local-only checkpoint, no schema migration, provider call, live task deletion, storage deletion, commit, push or deployment was performed. The fixture checks requested SQL and transaction calls; it does not prove SQL Server execution, physical rollback or concurrent lock behavior. Live acceptance must verify populated dependencies, incoming reference conflicts, audit persistence, concurrent reference/evidence insertion, and post-commit storage cleanup. A file-cleanup failure can leave an orphan file; it does not undo committed deletion.

Final checks: full suite 140/140 passed; backend typecheck/build, ESLint, documentation parity/link/schema checks, and `git diff --check` passed. ESLint retains the existing `.eslintignore` migration warning. The OpenAPI export remains 127/141 operations; no endpoint was added.

## Live database probe — 2026-09-27

User authorized live testing. The configured SQL Server `10.60.10.47:1433`, database `AssetMaintDB`, was reachable and authenticated (SQL Server 16.0.1050.5). Metadata reports 36 pm tables, 62 foreign keys, 65 indexes; SchemaInfo version 6 was applied on 2026-09-16. SchemaInfo alone does not establish current compatibility.

**Initial probe (resolved by the subsequent scoped migration):** `TaskWorkSessions`, `CMTaskEvents`, `CMDowntimeIntervals` and PMTasks columns `SourceTaskId`, `SourceTemplateChecklistItemId`, `RecurringFromTaskId` are absent. The current compiled `hasTaskDeletionReferences` helper was executed with a random nonexistent task ID inside a real SQL transaction. SQL Server returned error 207 for `SourceTaskId` and `RecurringFromTaskId`; the read-only transaction was rolled back. No fixture, operational row, file, migration or deployment was changed. No deployed HTTP route or successful live deletion is certified.

The old `db:verify` returned a false-positive OK because it did not check these prerequisites. The verifier now checks the three tables and columns, and the live rerun exits 2 listing all six missing items. This remains a partial schema verifier, not a complete schema-diff tool.

The missing structures were subsequently added through the scoped migration described below; the initial probe remains as failure evidence.

## Authorized migration and live acceptance — 2026-09-27

Applied [task-deletion prerequisites](../db/migrations/20260927-task-deletion-prerequisites.sql) to the configured live database in one bounded transaction. This adds three columns, three tables and related indexes/FKs only, without rewriting operational records or backfilling CM history. `db:verify` passes with 39 tables, 73 FKs and 76 indexes. The SchemaInfo marker remains unchanged because this was not the full schema deployment.

The repeatable runner is [scripts/live/task-deletion.mjs](../scripts/live/task-deletion.mjs). Run after building the backend, with explicit target opt-in: `node scripts/live/task-deletion.mjs --run <configured-server> <configured-database>`. It uses current compiled routes on a temporary loopback HTTP server, the real SQL database and a temporary evidence directory. JWT signing uses an ephemeral secret; its inactive synthetic user has no credentials or persistent role grants. Jobs/providers are not started. All fixtures use generated IDs, inactive masters and cancelled tasks.

An initial fixture run encountered the existing unique facility/template due-date constraint during setup; its generated rows were cleaned up. The runner now assigns distinct due dates per fixture. This was a fixture correction, not a weakened database constraint.

The concurrency probe initially observed a client request timeout instead of SQL error 1222. The test's `SET LOCK_TIMEOUT` was issued in a separate parameterized batch; the runner now puts that setting in the same batch as the competing write. All 11 fixture task IDs from that attempt were cleaned up, with zero remaining fixture rows verified. This changes the test timeout setup, not production lock behavior.

Final live run `6a6273a1-b5c0-4439-991b-74a23a04ecc6`: **12 scenario groups passed**, including PM/CM role and type boundaries; real audit-FK failure with full rollback and retained files; successful deletion across eight owned tables, audit persistence, physical evidence-file removal and repeat 404; all five incoming-reference classes returning 409; and concurrent evidence/source writes blocked by the parent lock with SQL lock-timeout 1222. Two audit failures were deliberate test stimuli.

Scope: live database and real local HTTP route execution, not the deployed API/web UI. Evidence files were in an isolated temporary directory, not the deployed storage mount. No service deployment, Git push, provider delivery or historical CM backfill was performed. Filesystem permission-failure recovery and broader end-to-end workflows remain outside this acceptance slice.

Cleanup committed for all 11 generated task IDs; post-cleanup queries verified zero owned/task/master/audit fixture rows, and the temporary evidence directory was removed. The process exited 0. [Sanitized final run log](live-task-deletion-20260927.txt) records each scenario and cleanup outcome.
