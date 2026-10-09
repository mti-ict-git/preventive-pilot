# PM workflow repair - 2026-10-09

## Production evidence

Read-only Hermes run run_255f3ce82b9943eba9ec382c27fb0b1f identified MTI-PC-067/47B6P04 asset 67FC3368-F7E6-F011-84EE-0050569F18B6. PM Now and Reject collided with unique asset/template/due indexes; uncaught SQL 2601 errors restarted the API six times. Original task 04BF0817-5A74-F111-84F7-0050569F18B6 remains pending because Reject rolled back. No production task mutations were performed during diagnosis.

## Candidate behavior

Submission requires StartedAt and currently in_progress at both UI and transactional backend boundary. Open/paused attempts return TASK_NOT_STARTED 409 without result writes. Desktop task dialog gains supervisor/superadmin Revise with required reason, using existing API and invalidating task and approval queues. Reject invalidates those queues; mobile removes the unsupported reopen-after-rejection option. Reject preserves old record and creates one linked rework task; Revise modifies the same record using established stage routing (superadmin revision returns to supervisor).

Occurrence indexes continue protecting normal active/completed rows but exclude cancelled/rejected originals and linked source-task work. Existing unique PMReplacementSourceTask still allows only one replacement per rejected source. Both planned and scheduled indexes for assets and facilities change together. Schema migration and baseline are synchronized. No date offsets, history deletion, false completion or bypass of context locks. Actual/default Snipe-IT site correction is separately committed as 1d671f1.

PM Now/Reject catch errors and return controlled 409 conflicts or 500 failures without rethrowing into Express 4. Failed Reject remains pending because nothing committed; user gets explicit failure rather than false success. No real rejection/approval is executed for verification.

## Verification and release gates

Initial workflow tests: 18 passed, including start/session timing, revision reason, source-linked rejection, permission boundaries and blocked open/paused submission. Added injected duplicate-insert regression verifies rollback and continued API availability. Desktop/mobile/backend typechecks and builds recorded after final candidate validation. Isolated SQL Server temporary-table rehearsal requested via Hermes run run_e427991b8d5a4d63b2d2eb90becefa68; it must not mutate production schema. Migration activation requires guarded data backup, actual index snapshot, preflight duplicate groups, rollback proof and scoped release.

OpenAPI YAML and embedded API documentation updated for TASK_NOT_STARTED and occurrence conflict handling. Database schema specification and roadmap reference this candidate. Remote-main push was previously rejected by automatic approval review; explicit approval still needed before push/deploy. Existing unrelated UI/mobile edits remain separate. Mobile APK has not been regenerated for this latest change.

## Final local validation and gates

Web Vite build and backend tsc build passed. Desktop tsconfig.app.json and mobile tsconfig.json typechecks passed after removing a stale mobile state setter. Scheduling/site suites passed 17 tests. Execution suite passed 10 tests including injected SQL2601 rollback and continued API availability; approval boundaries previously passed eight tests. Diff whitespace check passed. Browser verification was unavailable because the Windows sandbox helper failed during CUA initialization. Existing build warnings remain. The SQL Server rehearsal run is waiting_for_approval; exact SQL parsing and migration rollout are NOT verified. Production release and original record recovery remain pending. No real PM Now/reject/approve action was executed.
