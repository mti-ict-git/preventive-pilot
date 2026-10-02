# D2 Environment Verification — 2026-09-27

D2 is in progress. This records a bounded schema/release-tooling slice, not complete deployment or recovery acceptance. Source base: `1a50d88` plus the current uncommitted working tree. No Git push or deployed service replacement was performed.

## Schema verification

The former verifier used a partial table list and three task columns. It now inventories `db/schema.sql`: 39 tables, 372 columns, 257 named constraints and 29 explicit indexes. It checks all expected table/column names, column type/nullability and applicable size/precision, constraint kind/enabled/trusted flags, and explicit index presence/uniqueness/enabled flags. Extra objects are tolerated. `--source-only` validates the source inventory and table-creation dependency order without credentials or a database connection.

The parser is deliberately limited to this repository's explicit DDL. It is not a general SQL parser. Constraint expressions, FK endpoints, index key/filter definitions, default expressions, identities, collation, permissions and backfilled data are not certified. SchemaInfo alone is not a compatibility guarantee.

## Clean and repeated application

Fixed two source-order defects: FacilityPMSettings referenced PMTemplates before its creation, and planned-occurrence filtered indexes referenced MaintenanceType before its addition. Added guarded upgrade DDL for the task facility FK and exclusive asset/facility check, which existed only in the original CREATE TABLE path.

The opt-in [disposable runner](../scripts/db/verify-disposable.mjs) creates a unique database on the configured server, applies the source transactionally, verifies its inventory, applies it a second time, removes the two context guards to simulate the older upgrade gap, then reapplies and verifies their restoration. It drops only its generated database in cleanup.

The first disposable run exposed the MaintenanceType ordering error and was cleaned up. After the fix, all three checks passed on `PreventivePilot_D2_2c570ab50ce145b4ba94369067917bac`; the database was dropped. No operational data was copied or changed by those tests. See [run log](d2-disposable-20260927.txt).

## Live comparison and bounded repair

Initial connectivity timed out, then recovered on retry. Expanded verification found missing `FK_pm_PMTasks_Facilities` and `CK_pm_PMTasks_AssetOrFacility`. Read-only inspection confirmed the constraints were absent, with zero invalid-context tasks and zero orphan facility references.

The [scoped context migration](../db/migrations/20260927-task-context-constraints.sql) was applied to `AssetMaintDB` in one transaction using WITH CHECK, XACT_ABORT, a five-second lock timeout in the same batch, and a 15-second request timeout. No operational rows were rewritten. Final live verification passes: 39 tables, 373 columns, 258 named constraints and 76 indexes including primary/unique constraints. Extra objects are permitted; this is not a declaration that definitions outside checked dimensions match. See [live report](d2-live-schema-20260927.txt).

## Release tooling and remaining gates

Added [CI workflow](../.github/workflows/verify.yml) for Node 22 dependency installation, lint, isolated regression, backend/frontend typechecks and builds, source schema checks, and documentation parity. It has no live credentials or deployment step. GitHub execution remains unverified until pushed/run; locally installed dependencies are not proof that a fresh CI install succeeds.

Added [.env.example](../.env.example) with placeholders and jobs/integrations disabled by default. At the 2026-09-27 checkpoint, Q-05 was pending; the 2026-09-29 [Q-05 verification](verification-q05.md) supersedes that limitation. Runtime environment files, Firebase credentials and evidence storage are excluded from Docker build context; mounted runtime configuration remains unchanged.

Remaining D2 gates: Docker startup plus same-origin browser verification; local-only auth decision; backup/storage restoration on a disposable target; named recovery owner, RPO/RTO and release rollback evidence. The source-based CI checks and schema tests do not satisfy these gates.

Local workspace validation: 146/146 isolated tests passed; ESLint, backend typecheck/build, frontend app/tooling typechecks, web build, documentation checks and whitespace checks passed. Existing warnings concern `.eslintignore`, stale Browserslist data and bundle size. No API route/payload changed; embedded OpenAPI/YAML parity was reviewed and remains unchanged.

Docker inspection failed because `/Users/widjis/.colima/default/docker.sock` is unavailable. No engine was started and no application containers or deployed services were changed. At that checkpoint Q-05 awaited an answer. The user subsequently approved local-only operation; see the Q-05 evidence for implementation.

## Clean source snapshot with Node 22

A temporary source snapshot excluded `.env`, credentials, evidence and installed dependencies. With Node 22.23.3 it completed fresh root/backend `npm ci`, lint, all 146 tests, backend and frontend typechecks, both builds, source schema checks and documentation checks (exit 0). The snapshot was then removed. [Sanitized summary](d2-clean-node22-20260927.txt) records the results. This tests the current working sources and lockfiles, not a remote Git clone containing unpublished changes; browser/runtime configuration and GitHub execution remain separate.
