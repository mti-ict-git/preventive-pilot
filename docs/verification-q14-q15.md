# Q-14/Q-15 Verification — 2026-09-27

User decisions: enabling PM requires a site and active default template; disabling PM or archiving a facility cancels unstarted PM tasks.

Implementation: `backend/src/db/pmEligibilityPolicy.ts` validates effective settings and cancels tasks within the settings/master transaction. Individual asset/facility settings, asset bulk enable/template changes, facility update and clone use this policy. Invalid requests roll back, including newly cloned facilities. Existing permissions are preserved.

Unstarted means open PM, no start/work-session/submission/completion/cancellation timestamp, and no approval, revision or rejection history. Cancellation retains all records and writes actor, reason, time and audit. Started/paused/submitted work, CM and completed history are untouched. Reactivation does not reopen tasks automatically.

Schedule candidates require site; insertion rechecks enabled settings, active context and active category-compatible default template. Manual reopen applies the same eligibility check to the task template. Start/resume checks affected rows before creating a work session, preventing a concurrent cancellation from being silently overwritten.

Verification: `node --test scripts/tests/pm-eligibility-policy.test.mjs` passes 15 tests, including invalid activation rollback, valid activation, protected histories, idempotent cancellation/audit, invalid batch rollback, clearing settings, archival, clone rollback, generation guards, reopening and start/resume race outcomes. The SQL construction assertion checks that the eligibility predicate belongs to INSERT SELECT, after the task-number declaration.

The harness executes real route/auth code with synthetic SQL results and transaction snapshots. It does not parse or execute T-SQL against SQL Server or prove concurrent database locking behavior. Live SQL acceptance must exercise disable versus generation/start/reopen, rollback/audit persistence, and retained task histories before deployment acceptance.

No schema migration is required: existing task lifecycle, work-session and audit fields are used. Embedded OpenAPI and exported YAML describe the prerequisites, atomic cancellation, validation errors and reopen conflicts. Functional specification, questions, boundary review and roadmap are synchronized.

Final local checks: full regression suite 128/128 passed; backend typecheck and build passed; ESLint passed with existing warnings and no errors; documentation parity/link/schema checks and `git diff --check` passed. At that local checkpoint, no deployment or live SQL test was performed.

## Live SQL and loopback HTTP acceptance — 2026-09-27

[Live runner](../scripts/live/pm-eligibility.mjs) uses explicit server/database opt-in, current compiled routes and real `AssetMaintDB` SQL. A temporary loopback server uses an ephemeral JWT secret; its inactive test user has no credentials or persisted roles. The runner starts no jobs and makes no upstream/provider calls. Synthetic asset IDs use negative upstream IDs; contexts use PM anchors in 2099 to avoid scheduled operational work. Only generated fixture IDs are written or cleaned up.

Run `ecaf0a60-6404-4821-9521-988cb2f77067` passed **9 scenario groups**:

- Asset and facility activation each reject missing site/template and inactive templates without persisting invalid changes; valid activation succeeds; clearing an enabled template fails.
- Disabling each context cancels only unstarted PM. Started, paused, previously worked, submitted, revised and CM tasks remain, along with evidence. Cancellation records its reason and audit once; repeated disable is idempotent; disabled-context reopen is rejected; re-enabling never automatically reopens cancelled work.
- The actual SQL INSERT SELECT is exercised for each context in rollback-only transactions: disabled settings block insertion, eligible settings permit insertion.
- Bulk asset activation rolls back the valid member when another member lacks prerequisites.
- Facility archive cancels pending PM; reactivation preserves cancellation.
- Invalid enabled-PM clone rolls back the newly created facility and copied settings.

The initial fixture used archived assets, which the existing PM settings route correctly treats as unavailable (404). Those fixtures were cleaned up; the final runner uses unarchived synthetic assets with far-future schedule anchors. No application behavior was changed to accommodate the test.

Limits: this certifies the listed state transitions against real SQL through isolated local HTTP routes, not deployed API/web acceptance. Simultaneous disable/start/generation races are not certified by these sequential checks; existing isolated race tests remain separate. No production deployment or schema migration was performed in this Q-14/Q-15 run. The additive schema prerequisites had already been applied during [deletion acceptance](verification-task-deletion.md).

The final process exited 0. Cleanup removed all 15 generated task IDs and related fixtures; post-cleanup checks found zero fixture task/master/audit rows. [Sanitized run log](live-pm-eligibility-20260927.txt) records all outcomes. Backend build, ESLint, documentation parity/link/schema checks and `git diff --check` passed. Embedded OpenAPI and YAML were reviewed and remain unchanged because only verification tooling/documentation changed.
