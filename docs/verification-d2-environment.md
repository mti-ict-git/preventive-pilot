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


## Production evidence storage migration — 2026-10-03

Executed the user-approved copy/verify/switch plan on `mtimrwcnt01` through the existing pinned SSH/sudo relay. Target checkout remained `7a68e7abebad64eb74b8b4644d33037b58662bad`; API image remained `sha256:8fbf2200b86dbcf4c819781cf7ceb08a4c002f8e751d090179931663cd634fe1`. Only API was recreated for storage/configuration activation; web and neighboring applications were not replaced.

Evidence: exact CIFS source and target verified by host `findmnt`; fstab automount unit loaded; protected credentials root:0600. All 102 files/36,263,260 bytes copied and SHA-256 verified before activation and from the live API afterward. API-identity write/read/delete probes passed and were removed. Local ext4 negative filesystem-guard challenge returned exit 78. API `/health` and Nginx `/api/docs.json` returned success. Resolved Compose comparison allowed only the evidence host path/environment key and startup filesystem guard; Firebase, port bindings, and other mount sources were preserved. Original local evidence remains intact. Private manifests/configuration backups/state: `/var/backups/preventive-pilot/storage-20261003T081649Z`.

One cutover attempt stopped before activation because the comparison removed a baseline null command field; original API/configuration were restored. Correcting the comparison allowed a subsequent verified cutover. No share files were deleted or conflicting target files overwritten.

Hermes independently verified the two named containers in `run_af9f4b920ca34d2d818e90415e5b8867`: API image matched, restart count 0, new evidence bind RW, filesystem type `0xfe534d42`, health/proxy HTTP 200, and retained web start timestamp. Host-only mount/copy/persistence evidence was collected separately by Codex.

Limits: no host reboot, authenticated upload/download workflow, database/evidence restore drill, SQL migration, or application image upgrade. Local originals are a retained pre-cutover copy, not proof of ongoing shared-storage backup. D2 remains open. See the deployment guide for the current nested-root script compatibility gate.

Documentation follow-up: deployment guide, roadmap production checkpoint, and this evidence record were updated locally. Structural/contract documentation checks passed with CRLF normalized in a temporary validator (the committed checker was not changed); git diff --check passed. These documentation edits have not been committed or pushed.

## Production application release — 2026-10-03

Deployment hold was superseded by explicit user approval. Source is exact commit `7a68e7abebad64eb74b8b4644d33037b58662bad`, matching local, origin/main and the production checkout. No forced reset, source modification, Git push, SQL migration, account impersonation or operational business-data test mutation was performed. Existing production-local Compose/storage changes were retained.

Fresh secret-free Linux source validation with Node 22 passed root/backend npm ci, all 153 isolated regression tests, lint, backend/frontend typechecks and builds, source-schema and documentation checks. The simulated share Python tests also passed in a separate non-root network-free sandbox. Live read-only schema comparison passed expected 39 tables/372 columns/257 constraints/29 explicit indexes; actual extra objects were tolerated. Earlier Windows-only harness/path and CRLF failures were not treated as Linux production regressions.

Before replacement, SQL COPY_ONLY backup with CHECKSUM passed, followed by RESTORE VERIFYONLY WITH CHECKSUM, STOP_ON_ERROR. Backup set 5040 records 199,321,600 bytes, compressed 119,491,874 bytes, copy-only true, checksums true, damaged false. Exact SQL-host backup path and root-only release audit directory are in the deployment guide. This was not an actual restore test.

Candidates were built from git archive, excluding runtime secrets and production-local files. Both OCI revision labels equal the full source SHA. Running API image is `sha256:57172ccf183c7e67b896d8661575ad71c390bfe41a9e03edb81dcf21c54b6c09`; running web image is `sha256:640a1681b8bbe3693e59c0155b124a17e9fbdb6da1a3733d4e4977d0ae6ab843`. Both are healthy with restart count 0 at acceptance. Scoped activation targeted only api/web, with no build/pull/dependency replacement, using existing project identity and the committed production overlay. Old images are retained under dated rollback tags; no rollback challenge was executed.

Reviewed equivalent preflight retained required DB/JWT/LDAP/file checks and the exact CIFS source/type/target probe. It validated the preserved nested logical evidence root as an existing resolved descendant. Resolved config equality allowed only overlay restart/health/dependency changes; runtime credentials, ports, Firebase mount, jobs/integrations, evidence bind and startup filesystem guard remained unchanged. The committed production.sh strict-root constraint remains a follow-up for direct script use.

Post-activation checks passed: API/web health, same-origin API specification, live API SQL connection to AssetMaintDB (39 pm tables), all 102 baseline evidence hashes/36,263,260 bytes, actual API write/read/delete probe with cleanup, SMB2 magic 4266872130 (0xfe534d42), public HTTPS root and API specification HTTP 200, root HTML equality with the new web image and access to its two referenced assets. The application deploy retained the shared-storage migration.

Hermes review run `run_815588a5fb2c4332adb63aa3de42d023` accepted this scope and retained controls. Independent post-release run `run_1c0789bc0eb74d5b863a87b98c952f9a` completed PASS: exact image IDs/revision labels, both healthy with restart count 0, API/proxy 200, expected RW evidence bind and nested root, SMB2 filesystem, retained startup guard, ports and HTTPS/assets. Hermes did not independently inspect host-only source, backup, copy/hash manifests or rollback artifacts; those are separate Codex evidence. Host execution was by Codex's existing pinned SSH/sudo relay, not Hermes.

Remaining limits: authenticated desktop/browser and PM/CM/evidence workflows, external integration delivery, actual backup restore, rollback exercise, recovery owner/RPO/RTO, remote CI and host reboot acceptance remain unverified. No operational test notifications were sent. D2/D3 remain open; HTTP contract source was unchanged, so docs/openapi.yaml required no edit. Roadmap and existing deployment/evidence documents were updated; documentation edits are local and not yet committed/pushed.

Release documentation verification: structural references, embedded OpenAPI parity and route inventory passed using a temporary read-only CRLF-normalized validator; committed tooling and contract were unchanged. git diff --check passed. Only the existing three deployment/roadmap/evidence documents were modified by this release follow-up.
