# Deployment and Environment

Last reviewed: 2026-09-10. Commands below are derived from repository scripts/configuration. A clean installation and deployment were not executed in D0.

## Prerequisites

- Node.js and npm. Docker builds currently use Node 22; use a compatible local Node installation and verify its version. No repository-wide `engines` policy is declared.
- A reachable Microsoft SQL Server database and credentials with appropriate schema/application privileges.
- Backend configuration, including JWT and optional LDAP configuration.
- Optional integration credentials and storage mounts only for the features being enabled.
- Android Studio/JDK/Android SDK and the local PM Tech source for Android packaging. Mobile source availability is unresolved (Q-06).

Run commands from the repository root unless a different working directory is specified. The root, backend, and mobile are separate npm packages.

## Local installation

```sh
npm ci
npm ci --prefix backend
```

Create/configure the root `.env` using the variable reference below. Do not overwrite an existing configured `.env`. There is no maintained complete `.env.example` in the baseline.

After confirming the intended database target:

```sh
npm run db:apply-schema
npm run db:verify
npm --prefix backend run create-local-superadmin -- --username <username> --password <password>
npm run dev:full
```

The schema command mutates the configured database. The bootstrap command creates a privileged account; substitute real values locally and avoid preserving passwords in shared command transcripts. `db:verify` has partial coverage (Q-08).

`npm run dev:full` starts the backend and web; it does not install backend dependencies or apply the schema. For separate terminals use `npm run dev` and `npm run dev:backend`.

## Ports and URLs

| Mode | Web/client | Backend |
| --- | --- | --- |
| Web development | Default `http://localhost:8080`; check startup output if occupied | Default `http://localhost:3001`, overridden by `BACKEND_PORT` |
| PM Tech development | Default Vite port 3000 in mobile config | Development fallback `http://localhost:3001` |
| Root Docker Compose | `http://localhost:9102` | Host port 5056, container `api:5056`; web API through `/api/` |
| Optional static APK stack | Default host port 5057 | Separate Nginx service; not the application API |

Backend endpoints: `/health`, `/api/docs`, and `/api/docs.json`. `/health` only confirms that the process responds; it does not check database/storage readiness. Root Nginx proxies `/api/` only, so test backend health directly rather than treating the SPA fallback as an API health response.

## Backend variable reference

The executable startup schema is [backend/src/config/env.ts](../backend/src/config/env.ts). It resolves the root `.env` relative to the backend working directory, unless `BACKEND_ENV_FILE` overrides the path.

| Group | Variables | Required/default behavior |
| --- | --- | --- |
| HTTP | `BACKEND_PORT`, `FRONTEND_ORIGIN` | Default port 3001; comma-separated allowed browser origins |
| Tokens | `JWT_SECRET`, `JWT_EXPIRES_IN`, `REFRESH_TOKEN_EXPIRES_IN` | Secret required, minimum 16 characters; default lifetimes 8h and 30d |
| Database | `DB_SERVER`, `DB_DATABASE`, `DB_USER`, `DB_PASSWORD` | Required |
| Database transport | `DB_PORT`, `DB_ENCRYPT`, `DB_TRUST_SERVER_CERTIFICATE` | Defaults 1433, false, true; choose environment-appropriate transport settings |
| LDAP connection | `LDAP_URL`, `LDAP_BASE_DN`, `LDAP_BIND_DN`, `LDAP_BIND_PASSWORD` | Required only when any LDAP connection/search field is configured |
| LDAP search | `LDAP_USER_SEARCH_BASE`, `LDAP_USER_SEARCH_FILTER`, `LDAP_GROUP_SEARCH_BASE`, `LDAP_GROUP_SUPERADMIN` | Required only when any LDAP connection/search field is configured |
| LDAP timing/TLS | `LDAP_TIMEOUT`, `LDAP_CONNECT_TIMEOUT`, `LDAP_TLS_REJECT_UNAUTHORIZED` | Defaults 5000 ms, 10000 ms, true |
| Jobs | `JOBS_ENABLED`, `JOB_SNIPE_SYNC_ENABLED`, `JOB_EVIDENCE_IMPORT_ENABLED` | Defaults true, false, false respectively |
| Job timing | `JOB_SNIPE_SYNC_INTERVAL_MINUTES`, `JOB_SCHEDULE_CALC_INTERVAL_MINUTES`, `JOB_NOTIFICATION_INTERVAL_MINUTES`, `JOB_EVIDENCE_IMPORT_INTERVAL_MINUTES` | Defaults 60, 10, 60, 60 minutes |
| Planning | `JOB_TASK_HORIZON_DAYS`, `PM_NOW_IDEMPOTENCY_WINDOW_MINUTES` | Defaults 30 days and 15 minutes; check system-setting overrides |
| Snipe-IT | `SNIPEIT_BASE_URL`, `SNIPEIT_API_TOKEN` | Optional integration configuration; settings can also supply values |
| Evidence | `EVIDENCE_STORAGE_ROOT`, `EVIDENCE_IMPORT_ROOT`, `EVIDENCE_IMPORT_MAX_FILES` | Explicit writable/readable paths as needed; default import maximum 2000 |
| Graph | `MS_GRAPH_ENABLED`, `MS_GRAPH_TENANT_ID`, `MS_GRAPH_CLIENT_ID`, `MS_GRAPH_CLIENT_SECRET`, `MS_GRAPH_SCOPE`, `MS_GRAPH_SENDER_EMAIL` | Configure for email delivery; enabled defaults false |
| Graph recipients/templates | `MS_GRAPH_DEFAULT_TO`, `MS_GRAPH_DEFAULT_CC`, `MS_GRAPH_DEFAULT_BCC`, `MS_GRAPH_EMAIL_SUBJECT_TEMPLATE`, `MS_GRAPH_EMAIL_BODY_TEMPLATE`, `MS_GRAPH_USE_LOGGED_IN_USER_AS_SENDER` | Optional defaults; logged-in-sender preference defaults true |
| Firebase | `FIREBASE_SERVICE_ACCOUNT_PATH`, `FIREBASE_SERVICE_ACCOUNT_JSON_BASE64`, `FCM_SERVER_KEY` | Optional push configuration; verify the selected backend delivery path |
| App updates | `APP_UPDATE_STORAGE_ROOT`, `APP_UPDATE_CONFIG_JSON`, `APP_UPDATE_SIGNING_SECRET`, `APP_UPDATE_TOKEN_TTL_SECONDS` | Optional update configuration; default signed-token lifetime 600 seconds |

For local-only operation, leave all eight LDAP connection/search values absent or empty. Timing/TLS settings alone do not enable LDAP. Partial connection/search configuration fails startup. Configure all eight fields to enable LDAP. Select Local on the login screen or send `provider: "local"`; omitted provider remains `ldap` for compatibility. LDAP login, nonblank directory search, assignment, and profile refresh return 503 with `code: LDAP_NOT_CONFIGURED` when they reach an unconfigured directory operation. Existing authorization and request validation still apply. See [Q-05 verification](verification-q05.md).

For an isolated verification environment, disable jobs until external systems/test recipients and scheduling side effects are intentionally configured. Starting the backend can otherwise start enabled jobs.

## Web and mobile configuration

Web uses `VITE_API_BASE_URL`; production defaults to same-origin behavior and development to the backend development URL. Verify the actual base when changing ports.

PM Tech configuration in `.env.local` may include:

- `VITE_API_BASE_URL` and `VITE_API_FALLBACK_BASE_URL` for endpoint selection.
- `VITE_DISCOVERY_URL` for optional API discovery.
- `VITE_API_DISCOVERY_TIMEOUT_MS` and `VITE_API_DISCOVERY_REFRESH_MS` for discovery timing.

The inspected mobile source defaults to `https://preventivepm.justanapi.my.id` in production and an empty discovery URL. This records the source default; it is not a reachability check or a required deployment hostname. On a physical device, `localhost` refers to the device; configure a reachable API URL and matching origin policy.

From `mobile/pm-tech`, when that source and dependencies are available:

```sh
npm install
npm run dev
npm run build:android
```

`build:android` builds the web bundle and syncs Capacitor. It does **not** compile or sign an APK. Use Android Studio/Gradle for the native artifact. If the platform has not been added, follow the package's `cap:add:android` script first; do not re-add an existing platform. See [APK publication](apk-publish.md).

## Docker deployment

Review root Compose, `.env`, evidence paths, and Firebase mount configuration, then run:

```sh
docker compose up --build
```

The stack builds web and API; it does not provision SQL Server or automatically apply `db/schema.sql`. The API receives `.env`, a Firebase service-account file mount, and an evidence host-path mount. Ensure `EVIDENCE_STORAGE_ROOT` points to the intended path inside the container and provision mounted files/directories before startup.

SMB options are `docker-compose.bind.yml` for an already mounted share and `docker-compose.cifs.yml` for Docker-managed CIFS on a suitable Linux host. Inspect overlay variables before use. PowerShell sets process variables with `$env:NAME = 'value'`; POSIX `NAME=value command` examples are not PowerShell syntax.

Read [operational runbook](operational-runbook.md) for release/health/recovery checks. TLS termination, production domain ownership, backups, and release automation are deployment responsibilities still requiring verified procedures.

## D2 verification commands and release gates — 2026-09-27

Use [.env.example](../.env.example) as a placeholder-only configuration template; provide real values privately. The [CI workflow](../.github/workflows/verify.yml) lists reproducible build/test commands and does not deploy. Runtime secrets and evidence directories are excluded from Docker build context.

`node scripts/db/verify-schema.mjs --source-only` needs no live database. `npm run db:verify` reads the configured live database and rejects missing objects or checked column/flag mismatches. For an explicitly approved SQL host with create-database privileges, `node scripts/db/verify-disposable.mjs --run <configured-server>` creates and drops its own unique database to test clean/repeated/upgrade application; it never applies the full schema to the configured operational database.

[Current D2 evidence](verification-d2-environment.md) distinguishes successful schema and local build checks from pending fresh-checkout/Docker/browser/restore acceptance. Do not describe the application as deployed or recoverable based on these checks alone.


## Reset one local account password

Run from the repository root using an exact username. The command reads the root `.env` (or `BACKEND_ENV_FILE`) and updates only an existing `local` user's credential hash and password timestamps. It does not create accounts, reset LDAP passwords, change roles, enable disabled users, or revoke existing access/refresh tokens. Confirm the configured database target before running.

For the macOS zsh shell, read the password without echoing it or including it in command history:

```zsh
read -r -s 'pm_reset_password?New password: '
printf '\n'
printf '%s' "$pm_reset_password" | npm --prefix backend run reset-local-password -- --username YOUR_USERNAME --password-stdin
unset pm_reset_password
```

Passwords require at least 12 characters and at most 72 UTF-8 bytes (bcrypt limit). The script uses bcrypt cost 12 and parameterized SQL. `--help` does not connect to the database. An unmatched/local-credential-missing account fails without creating a credential or converting a directory account.

Verification on 2026-10-02: two isolated regression tests passed for hash verification, exact local-account filtering, length validation, and missing-account failure; CLI help passed without a database connection. No account reset was executed. OpenAPI reviewed: this is an operator CLI, so HTTP contracts are unchanged.


## Production Docker deployment script

Run on the intended Docker host from the release checkout. Requirements: Bash, Python 3, Docker Engine and Compose v2 with `up --wait` support. Use the existing Compose project name; if customized, export `COMPOSE_PROJECT_NAME` consistently. A different checkout directory/project name can create a separate stack or port conflicts.

```sh
bash scripts/deploy/production.sh --check
bash scripts/deploy/production.sh --deploy
```

Default invocation is check-only. Prepare the production root `.env`, SQL schema, database backup/recovery arrangements, existing evidence directory, and Firebase credential file referenced by the base Compose configuration first. The existing base Compose mounts Firebase even when push is unused; the script checks that the mount source is a file. Set `EVIDENCE_STORAGE_HOST_PATH` to existing persistent storage; `EVIDENCE_STORAGE_ROOT` must be omitted or `/app/shared-documents`. This script requires a Linux host with an evidence bind directory that is the exact CIFS mount point; Docker-managed CIFS overlays are not used. Check the jobs setting deliberately: API startup can run enabled jobs and external integrations.

The script validates resolved configuration without printing credentials, verifies the Docker daemon, builds both images, then runs Compose with readiness waiting. The production overlay adds restart policies and process healthchecks. It checks Nginx-to-API routing through `/api/docs.json`. Existing ports remain web 9102 and API 5056; use the host's existing HTTPS reverse proxy/firewall setup. Healthchecks do not prove SQL connectivity, evidence access, public TLS, login or business workflow correctness.

No git pull, schema migration, data reset, volume deletion, or automatic rollback is performed. Build failure stops before container replacement. A failure during startup may leave a partially updated stack: inspect Compose status/logs and use the previously tested release and recovery procedure. This is not a zero-downtime or verified rollback mechanism.

Verification 2026-10-02: shell syntax/help and isolated command-orchestration tests pass for check-only behavior, build-failure stop, deployment ordering, proxy check and partial-LDAP rejection. Docker image build, container startup, production deployment and recovery were not executed. OpenAPI reviewed: no HTTP contract change. That checkpoint preceded the user-approved 2026-10-03 deployment below; the earlier deployment hold has been superseded.


### Shared-storage gate before build

The deployment script now requires `CIFS_SHARE_PATH` in `.env` and checks the actual mount source, target and filesystem type with `findmnt`. An existing local directory alone is insufficient. Use a Linux Docker host with `cifs-utils` and `util-linux`; prepare a dedicated directory and a matching `/etc/fstab` entry once. Run on the actual Docker host, not against a remote Docker daemon.

Example `.env` values:

```dotenv
CIFS_SHARE_PATH=//fileserver/maintenance
EVIDENCE_STORAGE_HOST_PATH=/mnt/preventive-evidence
EVIDENCE_STORAGE_ROOT=/app/shared-documents
```

Example `/etc/fstab` entry (replace server/share and credentials location):

```text
//fileserver/maintenance /mnt/preventive-evidence cifs credentials=/etc/samba/preventive.credentials,vers=3.0,_netdev,nosuid,nodev 0 0
```

The credentials file contains `username=...`, `password=...` and optionally `domain=...`; keep it owned by root with mode 600. Configure mount ownership/permissions for the deployment operator and container process as appropriate. The script never writes fstab or credentials. It calls `mount <target>` as root, or `sudo -n mount <target>` otherwise; arrange narrowly scoped privileges in advance. No password is passed on the command line and raw mount errors/options are not printed.

`--check` verifies an existing mount without mounting or writing. If absent it fails with guidance. `--deploy` validates the fstab source/type/target, mounts if needed, revalidates the actual mount, then creates a unique temporary file, writes and reads back data, and deletes that file. Any failure stops before build. The gate runs again after build before replacing containers. Existing mounts are never unmounted or replaced automatically. A successfully mounted share remains mounted even if a later build fails. This host probe does not establish access under every container UID or guarantee availability after deployment; test the application evidence workflow separately.

Verification: `python3 scripts/tests/deploy-share.test.py` checks missing mount in check mode, wrong source, mount success/failure, probe cleanup and access failure with simulated mount commands. `node --test scripts/tests/production-deploy.test.mjs` confirms failed storage validation prevents build. No real share was mounted and no deployment was run.


## Production evidence storage migration — 2026-10-03

The user authorized mounting `//10.60.10.44/ict` at `/mnt/preventive-evidence`, copying existing local evidence, and switching the API bind only after verification. The prior host directory `/root/preventive-pilot/shared-documents` is retained intact as a rollback copy. All 102 source files (36,263,260 bytes) were copied without overwriting differing target content and verified by SHA-256, including reads from the actual API container after cutover. Existing share content and other applications' mounts were preserved.

Production now sets `EVIDENCE_STORAGE_HOST_PATH=/mnt/preventive-evidence`. The container destination remains `/app/shared-documents`; `EVIDENCE_STORAGE_ROOT` remains `/app/shared-documents/01. Preventive Maintenance Record/01. Support & System`. A root-owned mode-0600 credential file supports an fstab entry with a generated systemd automount unit. No credentials are recorded here. The production-local Compose configuration also checks SMB/CIFS filesystem type before executing `node dist/index.js`, rejecting local ext4 fallback with exit 78. Both Linux SMB/CIFS magic values (`0xff534d42`, `0xfe534d42`) are supported; the live mount reports the latter. An isolated negative test confirmed rejection of the local source filesystem.

The API was briefly stopped for final synchronization and recreated with `--no-build --pull never --no-deps`, retaining its previous image. Web was retained. API health, web-to-API proxy, actual-container evidence reads, and a unique write/read/delete probe passed; no probe files remain. Protected configuration backups, manifests, and migration state are at `/var/backups/preventive-pilot/storage-20261003T081649Z`. Preserve these and the local evidence directory; any future rollback must reconcile evidence written after cutover before switching back.

This was a storage migration, not an application release or SQL migration. Host reboot/recovery and authenticated application workflows were not tested. The committed `production.sh` currently accepts only `/app/shared-documents` as the logical evidence root; the preserved production subfolder differs. The subsequent release below used reviewed equivalent validation that accepts an existing descendant folder while retaining the exact-share and filesystem guards. Direct use of the committed script remains incompatible with this nested production root until its validation is updated.

## Production application release — 2026-10-03

The user authorized activating the current code. Host checkout, origin/main and local source agreed on `7a68e7abebad64eb74b8b4644d33037b58662bad`; no pull/reset or source changes were required. Codex executed the existing pinned SSH/sudo relay. Hermes reviewed the plan and independently inspected runtime afterward; Hermes did not execute host Compose.

Both candidates were built from a secret-free `git archive` of that exact commit, with OCI revision labels. API image is `sha256:57172ccf183c7e67b896d8661575ad71c390bfe41a9e03edb81dcf21c54b6c09`; web is `sha256:640a1681b8bbe3693e59c0155b124a17e9fbdb6da1a3733d4e4977d0ae6ab843`. Runtime configuration, Firebase bind, ports, jobs/integrations, nested logical evidence root and CIFS startup guard were preserved. The committed production overlay adds restart policies and API/web healthchecks.

The nested logical root was checked as an existing resolved descendant of the exact evidence mount, without `..` traversal. All other configuration gates from `production.sh`, exact CIFS source/type/target checks and temporary storage probes were retained. Resolved base/overlay configurations were compared, allowing only the overlay health/restart/dependency changes. The images were built before replacement and retagged to the existing project service image names only after both succeeded. This is a reviewed equivalent deployment procedure; it does not change the committed script's strict-root rule.

The activation command on the actual host was:

```sh
docker compose -p preventive-pilot --project-directory /root/preventive-pilot --env-file /root/preventive-pilot/.env -f /root/preventive-pilot/docker-compose.yml -f /root/preventive-pilot/docker-compose.production.yml up -d --no-build --pull never --no-deps --wait --wait-timeout 120 api web
```

Pre-release SQL COPY_ONLY backup with CHECKSUM succeeded, followed by RESTORE VERIFYONLY WITH CHECKSUM, STOP_ON_ERROR. Backup set 5040, approximately 119 MB compressed, is on the SQL host at `C:\Program Files\Microsoft SQL Server\MSSQL16.MSSQLSERVER\MSSQL\Backup\AssetMaintDB_preventive_7a68e7a_20261003_2b3b5ed8-52de-4ae9-a322-88cfd9e39ff4.bak`. Protected host configuration copies, build logs, resolved configuration and release state are at `/var/backups/preventive-pilot/release-20261003T085816Z`. They may contain secrets: keep root-only and do not publish them.

Old image rollback tags are `preventive-pilot-api:rollback-20261003T085816Z` and `preventive-pilot-web:rollback-20261003T085816Z`. A service image rollback would retag both to the corresponding existing `:latest` names and run the same scoped Compose activation, preserving the current CIFS bind and guard. Do not revert storage to the retained local copy without reconciling post-cutover evidence. No rollback or database restore was executed; retained references and VERIFYONLY do not establish successful recovery or a zero-downtime rollout.

Both new image IDs and labels matched running containers; healthchecks and Nginx-to-API routing passed. Live API database connection reached `AssetMaintDB` with 39 pm tables. All 102 pre-cutover evidence files/36,263,260 bytes passed SHA-256 from the new API, and a unique probe passed write/read/delete with cleanup. Public HTTPS root and API specification returned 200, root HTML matched the new web container, and its two referenced assets were accessible. See [full evidence and remaining acceptance limits](verification-d2-environment.md#production-application-release--2026-10-03).

## Production Tasks correction — 2026-10-03

The desktop Tasks correction was deployed from exact commit `49572fd37952f1e4dbcd332f2b589615398778e1`. Source was pushed to origin/main and production fast-forwarded without resetting the production-local Compose or runtime files. Hermes reviewed candidate `729ed27` and identified repeated ordering columns; that image pair was withheld. The corrected candidate passed exact generated SQL execution for every view and all 158 regression tests in a secret-free Node 22 Debian sandbox before activation. Codex executed build/activation through the existing pinned SSH/sudo relay; Hermes independently verified runtime afterward.

Running images: API `sha256:6b4369d76275c5e144dba04cc56ff1871c702e2c927bd201145665c511cec976`, web `sha256:a5e3f82c409c1e755788809abb810dc26be3a8360031499183ef06358e23106c`. Both OCI revision labels match the exact source commit. The same scoped Compose command and reviewed descendant-root validation described above were used. Configuration, Firebase, ports, jobs/integrations, nested evidence root and CIFS startup guard were preserved; no schema migration or business test mutation was performed.

Pre-activation SQL backup set 5041 passed COPY_ONLY/CHECKSUM and RESTORE VERIFYONLY WITH CHECKSUM, approximately 119.6 MB compressed. Its protected path/state, configuration copies and build logs are retained at `/var/backups/preventive-pilot/tasks-release-20261003T130304Z`; state is `verified`. The backup filename references the first candidate, but was taken before either candidate activation and remained the rollback data checkpoint. Old service images remain tagged `preventive-pilot-api:rollback-20261003T130304Z` and `preventive-pilot-web:rollback-20261003T130304Z`; they are the initial `7a68e7a` release images. No rollback or SQL restore was executed.

Both services are healthy with zero restarts at independent verification. Public HTTPS and JS/CSS assets, same-origin API specification, live SQL connectivity (39 pm tables), all 102 baseline evidence hashes and actual-container storage write/read/delete passed. Authenticated browser verification covered all ten Tasks views, totals, pagination, search, approved-only and clear filters; [acceptance evidence](verification-q01-desktop.md#production-acceptance-of-the-tasks-correction) records scope and limits. Hermes runtime verification: `run_2dc543f8dc374affa4f2e6328e322b9c`. The committed deployment script's nested-root limitation and wider recovery/business acceptance remain open.

## Tasks modal context frontend release — 2026-10-05

Web-only source `ce0dbd2747a12348e29527adeea8fe7c79e9e379` fixes modal-close return context and refreshes Tasks/approval caches after successful approval. Production checkout was fast-forwarded from `f9492c8`, preserving local Compose/runtime files. Codex built an isolated secret-free exact Git archive and activated only `web` with the existing scoped Compose command (`--no-build --pull never --no-deps --wait --wait-timeout 120 web`). API container, image and revision `49572fd` were unchanged. No backend, SQL/schema, permissions, storage, jobs or integration change occurred; no SQL backup/restore or production business approval was needed/performed for this frontend-only release.

Web image `sha256:1c6296ffbafe3c5437e62e1ac0e2abcb5b71f5b38826895c98325487a0ff0ce1` has the exact source OCI revision. Protected audit/configuration copies/build logs are under `/var/backups/preventive-pilot/context-release-20261005T001502Z`, stage `verified`. Previous web image is retained as `preventive-pilot-web:rollback-20261005T001502Z`; rollback would retag it to the existing web image name and activate only web with the same flags. No rollback was exercised.

Frontend typecheck/build, five relevant task-list route groups and documentation checks passed. Isolated synthetic browser approvals and production read-only open/close acceptance passed ([evidence](verification-q01-desktop.md#tasks-modal-return-context--2026-10-05)). Healthy API/web, same-origin proxy and public HTTPS assets `/assets/index-Osne0jZa.js` and `/assets/index-DnX6hjbG.css` passed; root HTML matched the new container. Hermes pinned-source review found no blockers (`run_90f503af72b1483da5a7fac2ebda27c6`); independent runtime verification passed (`run_099485de47fe4e2b9c5077e98988746f`), including unchanged API/CIFS configuration and matching public/direct asset hashes. `docs/openapi.yaml` required no update because backend/API contracts did not change. Recovery and wider business acceptance limits remain open.


## PM Supervisor own-submission API release — 2026-10-05

User-authorized source publication and API-only deployment activated candidate source `802ab79b833430061a7d5bf2e0e9ca4f182dbd43`, image `sha256:b8edc766c92018c58dc7083a620e9cdd1dc697ef10263e5ef55f74c0556b5eff`. Checkout `ed91297987af9a839f9347fd0916d26513e79bda` adds documentation-only evidence. Supervisor own approve/revise/reject is permitted at PendingSupervisor; own final approval and CM self-verification remain forbidden. Full exact-source Node 22.23.3 Linux verification passed 160/160 regressions, lint, typechecks/builds, schema-source and documentation/OpenAPI checks. Git archive LF rules for shell and Markdown prevent Windows export conversion from breaking Linux release checks.

Codex performed fast-forward source update and scoped activation via the existing pinned SSH/sudo relay. Compose used the existing project/base/production files with `up -d --no-build --pull never --no-deps --wait --wait-timeout 120 api`. Web retained container/image/revision `ce0dbd2`; runtime env/Compose, Firebase, CIFS source/target, nested logical evidence root and startup guard remained intact. API health/actual image revision, proxy/public contract, compiled guard count, SQL task read, CIFS and authenticated browser reads passed. No SQL schema change, live workflow approval or repeated submitter correction occurred.

Protected release state/configuration/checks are under `/var/backups/preventive-pilot/own-review-candidate-20261005T030948Z`. Prior API image is retained as `preventive-pilot-api:rollback-own-review-20261005T030410Z`; retag it to the existing API service image name and use the same scoped API activation for compatible service rollback. No rollback or SQL restore was performed. That would not reverse the separately audited submitter correction. See [current Q-03 release evidence](verification-q02-q03.md#authorized-api-production-release) for review/runtime/acceptance details and remaining recovery limits.

Independent Hermes runtime verification `run_2dc8f473cb87418c9259e4b3ea1ff6a0` passed actual API/web image identities/health (zero restarts), CIFS bind/filesystem and public routing/contract. Its host checkout and compiled normalization checks were incomplete; Codex performed those checks separately. Final publication/checkout advances for this evidence are documentation-only; running API source remains `802ab79`, running web source remains `ce0dbd2`.

## Production Approvals completeness — 2026-10-05

Web-only release source `e28ec0b55e57050e73581c3f7372fd388a66f779`; image `sha256:6a5013172e75b8ef6fb75fb25f10d0677e0cecfb72dfc3c9369b71c5b4d654f8`; container `fa99b5b2d4f6646c9727de6bcd148a8d74c7535f130f35b951b2240f30a14761`. API retained container `eedd0c55e5d21717ddf5022c07d19f7f5be918546684279f1eaf123c5af7aafc`, image `sha256:b8edc766c92018c58dc7083a620e9cdd1dc697ef10263e5ef55f74c0556b5eff`, source `802ab79b833430061a7d5bf2e0e9ca4f182dbd43`. Both healthy with restart count zero. No SQL migration or production business mutation. Runtime env and Compose bytes matched protected checkpoints.

Pinned secret-free Git archive passed Linux Node 22 checks: lint, 163 tests, backend typecheck/build, frontend app/node typechecks/build, schema-source inventory and documentation/OpenAPI parity. Candidate build preserved active images. Codex performed host source fast-forward and scoped `web` activation through the established SSH relay; Hermes performed limited excerpt review (initial `run_b73c9e3129824b6f9b7c2153155f1f0b`, clarified `run_0d3166e4c0d1454798209e0311da5ab4`). Review limits remain explicit; it was not an independent full source audit. Post-release Hermes verification: `run_267f25e81ebb487cb41123efbaa3c38f` confirmed runtime identities, health, zero restarts and public assets; the initial supplied hash excluded outer whitespace. Follow-up `run_c6f6f56431c04de1a82079bb27447593` independently confirmed full container/public byte equality (1,300 bytes, SHA-256 `501c18b29e135445b1e19ffdf7b5de422556f71c66dd95dc92e9d7612b1e0ad0`) and JSON 200 from the established `/api/docs.json` proxy route. It did not independently verify authenticated queues, tests, checkout or protected config preservation; Codex verified those separately.

Protected audit: `/var/backups/preventive-pilot/approvals-candidate-20261005T040220Z`. Rollback image: `preventive-pilot-web:rollback-approvals-20261005T040220Z`. Two initial public-HTML assertions triggered scoped automatic web rollback. Diagnosis proved a false negative: subprocess text mode normalized CRLF while HTTP preserved CRLF; the candidate raw hash matched the earlier public response. Byte-preserving comparison corrected the gate and final activation passed; public JS/CSS assets and same-origin API routing passed. This exercised image-only web recovery, not database restore or broader D2 recovery.

Authenticated read-only browser acceptance: both PM Tasks and Approvals Pending Superadmin 31; pagination 1–25 and 26–31 of 31; full-queue search, clear and tab persistence after reload passed. Approval refresh/last-page draining were exercised only on synthetic fixtures. No real task was approved. Documentation-only follow-up checkout updates do not rebuild the images; distinguish checkout HEAD from the runtime source SHA above.

## Production Assets table — 2026-10-05

User-selected D1 UI correction deployed web only. UI source `44c82ee5f37c6dd3109ddbe27733aa4a28fa42f5`; final runtime source `30120f060aaef3c900af0dce960a89447062412a` additionally corrects the existing Nginx collision between Assets SPA routes and Vite static assets. Codex executed the established SSH relay; Hermes performed independent read-only metadata/public-response verification. Push used the existing project PAT_GIT through process-scoped Git headers, with no new connector or stored credential configuration.

- Final web image: `sha256:79f37a2b9992d500eb0e8ab946b5b9e5cdb6926f521017c6d2ae5a9c00874a29`; container `5a81fcecbf6c87ccd57f2c6a4d65cff9a8c1dcfffbcfceeeae5708e477981b0b`, healthy, restart count 0.
- API retained: container `eedd0c55e5d21717ddf5022c07d19f7f5be918546684279f1eaf123c5af7aafc`, image `sha256:b8edc766c92018c58dc7083a620e9cdd1dc697ef10263e5ef55f74c0556b5eff`, runtime source `802ab79b833430061a7d5bf2e0e9ca4f182dbd43`, healthy, restart count 0.
- Final candidate audit: `/var/backups/preventive-pilot/assets-layout-candidate-20261005T054823Z`; prior UI audit `/var/backups/preventive-pilot/assets-layout-candidate-20261005T053727Z`. Both exact-source Linux checks passed 163 regressions, lint, backend/frontend typechecks/builds, source schema and docs parity. Existing bundle-size/Browserslist warnings remain.
- Rollback references retained: `preventive-pilot-web:rollback-assets-layout-20261005T054823Z` (prior UI image) and `preventive-pilot-web:rollback-assets-layout-20261005T053727Z` (pre-change web image). No rollback or database recovery was exercised in this work item.
- Activation used the verified image with scoped Compose `web --no-build --pull never --no-deps --wait`. Runtime `.env` and local Compose bytes matched checkpoints; API and evidence mounts were preserved. No SQL migration or business mutation.
- Nginx candidate syntax check passed. Public root, Assets index including trailing slash, and an actual Assets detail route returned the exact active index bytes; missing JS returned 404. Public JS/CSS and internal/public GET /api/docs.json passed. Browser verified direct list/detail reload, real asset search/clear and notes.
- Hermes baseline `run_bd17edce89e144e399445f9a7b01af96`; final `run_383db5adf4134fdd9d12cad00ded119a` confirmed web/API identities, health/restart counts, /assets 200 without redirect, exact 1,300-byte public HTML parity (SHA-256 `de81223cc93c8a2367fd9e36bd1c56e09db5906906eb51fc3d334040678c5a22`) and OpenAPI JSON 200. Hermes did not independently inspect source/tests/audit or interact with the UI.

Limits: PM-status filtering remains page-local and global narrow-screen header/sidebar overflow remains existing debt. Whole-app strict UI audit is not closed. D2 recovery exercises and broader D3 business acceptance remain open. OpenAPI reviewed; no API request/response or backend behavior changed. Documentation-only closure advances checkout HEAD separately from the runtime revision above and does not rebuild/restart services.

## Production PM history and calendar — 2026-10-06

User-authorized whole-PM reconciliation and API/web release. Running source `a821ae1f8f328ef3cdcaecdbd12afb20cfbfa26b` passed exact-source Linux lint, 173/173 regressions, backend typecheck/build, both frontend TypeScript projects, web build, schema-source and documentation parity. Candidates came from a tracked secret-free Git archive; protected release audit is `/var/backups/preventive-pilot/pm-history-candidate-20261006T025449Z`.

Codex used the established pinned SSH relay for fast-forward source update and scoped Compose activation (`up -d --no-build --pull never --no-deps --wait --wait-timeout 120 api web`). An initial activation was rolled back because an order-sensitive mount comparison failed; selected metadata confirmed identical bind contents, and the retry compared mounts by destination. Existing env/Compose bytes, Firebase, ports, jobs/integrations, `/mnt/preventive-evidence` CIFS source and `/app/shared-documents` bind/nested root/startup filesystem guard were preserved. API image `sha256:04760b5068be1fbca056516391aa091d7e6f74a39fcbc6ca1e839c47d860fa36`; web image `sha256:fb211df35b000b8c1e9325775436cfd58b559d65bd87502d10b89ee04bbdd52a`. Health, zero restarts, exact revision labels, proxy/public API contract, raw public HTML and static assets passed. Browser acceptance independently confirmed February 21 Completed late, actual March 3 completion and the original task reference.

The protected data audit `/var/backups/preventive-pilot/pm-reconciliation-20261006T020624Z` contains the 268-task scan, 29 legacy PM Now records, 44 missed snapshots, reviewed 13-pair plan, rolled-back exact SQL rehearsal, before-images, committed audit and post-data verification. An additive `PMOccurrenceResolutions` migration was applied; 13 untouched aliases were retired with explicit fulfilment reasons. Actual execution, approval, completion and evidence were preserved. All original task records and missed snapshots remain. Eight active/ambiguous records remain unchanged and are listed in the existing challenge register. MTI-PC-009 fulfils February 21 through PM-NOW-20260302-5F12BE0A completed March 3; its next planned period is August 21, which remains a separate open obligation.

SQL backup set 5042 is COPY_ONLY with checksums; 150190574 compressed bytes; VERIFYONLY passed. Protected metadata records the full SQL Server backup path. Restore has not been exercised. Previous images remain at `preventive-pilot-api:rollback-pm-history-20261006T025449Z` and `preventive-pilot-web:rollback-pm-history-20261006T025449Z`. Previous applications are compatible with the additive table and retained task rows; image rollback does not undo data repairs. Reversing the specific repairs requires a separately reviewed compensating transaction from before-images, or an independently reviewed database recovery procedure. No data rollback or database restore was performed; the initial image activation rollback is recorded above.

Hermes could not access the host checkout; Codex executed host work. Hermes supplied a brief assessment, a bounded earlier compiled-candidate review and final selected runtime observations (`run_5fb12a3ba72c4f98a5c75cc0564e46d0`). Its final image-content inspection was stopped by its tool safety guard; final compiled atomic reopen verification was performed independently by Codex on the running API. The reopen race it identified was addressed by a locked mutation predicate and regression test; those are distinct from Codex's actual SQL and browser verification. The strict whole-app UI audit retains 58 pre-existing findings, including Scheduling date/select ownership flags and surrounding narrow header overflow; it is not a whole-app clean audit. D2 recovery exercises and wider D3 acceptance remain open. OpenAPI and the embedded runtime definition were updated together for calendar/day buckets, completion/reference fields and resolved-alias reopen conflict.


### March 2 started-only duplicate correction - 2026-10-06

Data-only follow-up for PC-010/049; no build, service restart, migration, approval or deletion. Running API/web remain from `a821ae1`. Backup set 5043 is COPY_ONLY with checksums, compressed size 150267238 bytes; VERIFYONLY passed (restore not exercised). Protected backup metadata, exact SQL rollback rehearsal, before-images, committed two-link audit and independent post-verification are under `/var/backups/preventive-pilot/pm-started-only-20261006-review`. The two March 2 aliases were cancelled with explicit performing-task references; source completion/evidence, StartedAt and August obligations/cadence remain unchanged. Production Scheduling March 2 has no events and zero capacity, independently verified in SQL and the authenticated browser. Screenshot: `pm-march2-corrected-20261006.png` in the local Codex proof directory. The general conservative planner is unchanged; the new bounded operational runner handles only the two named started-only exceptions. Six remaining historical exception records require separate review. Image rollback cannot undo this data-only correction; protected before-images are a recovery reference, not an exercised recovery procedure.


### Automatic PM execution policy candidate - 2026-10-06

User authorized automatic single active maintenance need and full correction. Source adds transaction-owned context locks for execution, generator and create; existing task cancellation/audit fields preserve supersession and missed history. Finalization catches up elapsed unperformed periods without false completion. Future automatically superseded untouched occurrences are restored under their existing unique task ID only when current, eligible and no ongoing job remains. UI copy distinguishes filtered tab totals from global sidebar overdue counts. OpenAPI YAML and embedded specification are synchronized for execution conflicts, history reopen, and evidence-write fencing. No migration or infrastructure change is required.

Protected preparation audit: `/var/backups/preventive-pilot/pm-automatic-policy-20261006T060126Z`. Backup set 5044 COPY_ONLY/checksum, 150282380 compressed bytes, VERIFYONLY PASS; restore not exercised. Exact compiled SQL rollback verification covered supersession, work protection/conflict, cross-date selection, atomic reuse, unique-ID next-cycle restoration, evidence fencing, missed retirement, calendar/day batches and deterministic two-connection lock contention. Guarded whole-context repair rehearsal PASS, 269 original PM task rows retained, completion/approval/StartedAt fields preserved, ledger 15 to 17 in rehearsal only. Apply and runtime release remain pending at this candidate checkpoint.

Rehearsed legacy corrections: PR-005 March PM Now owns April 16 and PR-007 paused August PM Now owns July 16; competing empty schedules are retired. Approved PC-046 covers March 22 (not September 22), PC-028 covers its November 12 overdue original, while existing inconsistent technician/completion timestamps remain unchanged. UPS-010 old-template execution is independent of September work under the new template. PC-030 August 11, Makarti February 13 and PC-028 July 26 off-cadence empty rows are retired. Missed source tasks are retired without completion. Calendar projection blockers are verified: seven PCs lack LocationId; UPS-007 has UPS category with Printer-specific template. No site/category/template master data is invented or changed.

Hermes `run_e1e1ccd074a74dfb845c3a60d2c2bb06` provided planning-only review, highlighting cooperating-writer locks, work protection, atomic audits, unique-cycle resumption and exact SQL verification. It did not implement, mutate, deploy or approve the candidate. Codex owns host execution through the established pinned SSH path. Full Linux release validation and authenticated browser evidence are still required. Existing whole-app UI audit findings and D2/D3 acceptance remain outside this selected correction.

### Automatic PM production closure - 2026-10-06

Runtime API and web now use exact source `e6dff70377278d2acb984d4c6d85476d4c3ff5bf`. Final isolated Linux validation passed 178/178 tests, lint, backend/frontend typechecks/builds, schema-source, documentation and embedded OpenAPI parity. Earlier candidate `3f189ac` was never activated. API image `sha256:671771e39c3bd934af9ce5a09609a3dfd1c733c331a9cdf25aa2c7d6b039defc`; web image `sha256:5e516205b72e3a108d190325624c906d31405b9db5ec6279253f3dfc1370f8c2`. Exact-source build/activation evidence is under `/var/backups/preventive-pilot/pm-history-candidate-20261006T063609Z`.

The existing preparation audit `/var/backups/preventive-pilot/pm-automatic-policy-20261006T060126Z` now contains committed before-images, applied correction proof, post-release full scan/summary and compiled runtime proof. Backup 5044 and VERIFYONLY preceded mutation; restore remains unexercised. Thirteen exact SQL checks passed using rollback transactions, including independent asset/facility contexts sharing a UUID and two-connection exclusive lock contention. The running compiled policy and calendar modules match those verified modules by SHA-256. Both services are healthy with zero restarts. Scoped API/web activation preserved env/Compose bytes, CIFS mount, nested evidence storage, Firebase and existing integrations; no schema migration or infrastructure change.

Guarded repair preserved all 269 original PM records and their StartedAt, technician/completion and approval metadata. It added two historical fulfilment links (ledger 15 to 17), corrected legacy active periods and stale anchors, and retired untouched competing/missed tasks. Reconciliation plus the normal generator left 270 PM records: 121 completed, 50 cancelled, 97 open, one in progress and one paused. The one new task `PM-20261006-206361B2` represents PC-028's unperformed May 12 cycle following the corrected November 12/May 12 cadence; it is not a false completion. Two CM completed and one CM open remain unchanged across generator verification. Existing inconsistent PC-028 historical timestamps are preserved.

Post-release generation was run twice. The second run left all tasks/settings identical; work child-record counts remained unchanged. There are zero live context/template duplicate groups and zero untouched missed-period task records still open. The normal scheduler is enabled every 10 minutes. All 99 active PM tasks are overdue; calendar/day SQL independently returns exactly 99 persisted overdue events and zero projected red events. Seven PCs without LocationId and UPS-007 with an incompatible Printer template no longer create ghost calendar projections; their master-data configuration remains unchanged and requires its own administrative correction.

Authenticated browser acceptance confirmed global PM Tasks/Overdue 99, printer search `mti-pr` Overdue 8, Completed 15, Cancelled 18, and explicit filtered-versus-global explanatory copy. March 2 has zero events/capacity; March 22 shows Completed; April 16 contains one PR-005 In Progress event with its original scheduled-task reference alongside genuine completed printer histories. Evidence files in the local Codex proof directory: `pm-automatic-printer-20261006.png`, `pm-automatic-printer-summary-20261006.png`, `pm-automatic-march2-20261006.png`, `pm-automatic-april16-20261006.png`.

Previous images are retained at `preventive-pilot-api:rollback-pm-history-20261006T063609Z` and the corresponding web tag. Image rollback does not undo data correction; protected before-images support a separately reviewed compensating transaction, not an exercised recovery. Hermes planning-only review remains distinct from Codex's host implementation/deployment. Full Windows regression execution was not a pass (existing platform/path assumptions); final Linux execution is the passing release proof. The strict whole-app UI audit still reports 58 pre-existing findings, and 14 literal API operations remain outside documented coverage. These limits and D2 recovery/wider D3 acceptance are not closed by this selected release.

### Production PM Tasks date sorting - 2026-10-06

User-selected D1 date-sort correction. Backend/API source `ed4c3f95fa11e318716a80d92e2345c9ee821d7b` passed 180 Linux regressions, lint, backend/frontend typechecks/builds, source schema and documentation/OpenAPI parity. Seven targeted HTTP tests additionally exercise full-dataset date sorting and validated keys. Eight exact route SELECT batches ran read-only against production: four sort modes, two 25-row pages each, correct date direction, no adjacent-page duplicates and unchanged totals. No migration, business-data repair or production approval was performed.

Scoped API/web activation passed revision/image/health/public HTML/assets/proxy/CIFS and excluded-service checks. API image `sha256:9a6f81444d7a6fb6418bbbae2e8fa1619d9bab5a22855a4db13d6dfcabffe06d`, container `2ee7fc87e00264a0fdd3ec322f755da058dcc9aaea3432a475f6398408a35112`; protected audit `/var/backups/preventive-pilot/pm-history-candidate-20261006T080348Z`. Public API now documents the sort allowlist/default. Existing backup/data recovery references were not replaced because this release does not change schema/data.

The final two-class responsive follow-up is web source `ecf9ed687ca97662a1479912f2ef6426a9ef7990`, image `sha256:515ef40cbba86b4092c313c3309ae2a27ab064d65be25fdad8a3c8f368be66f0`. Audit `/var/backups/preventive-pilot/pm-sort-layout-20261006T081553Z`; rollback tag `preventive-pilot-web:rollback-sort-layout-20261006T081553Z`. API source/container remain retained. Final UI source passed local typecheck/lint and seven targeted tests, then Linux frontend typechecks/lint/docs and production build. The 180-test full suite belongs to the API/base source, not a claimed rerun after the CSS-only follow-up.

Export of an owned intermediate builder image was aborted after it stalled; active services were untouched. Validation was moved into the Docker build stage using a generated validation recipe outside the unchanged source archive, and only the final web image was exported. Recipe and logs are retained in the protected audit. Runtime activation is web-only with exact image ID, preserved env/Compose bytes, API/dependencies and CIFS evidence mount; no general Docker cleanup was performed.

Synthetic browser covered popup geometry, keyboard/Escape, pagination reset, empty/clear/error states, tab/detail/reload and approval context using synthetic records only. Authenticated production verified due-descending printer dates (August 21, July 16, March 12), modal close/reload persistence, page two with sort retained and sort change returning page one, all 99 overdue rows counted. Final production screenshot: `pm-task-sort-production-20261006.png` in the existing local Codex proof directory. Existing 58 whole-app UI findings and wider D2 recovery/D3 acceptance remain open.

Final web-only activation passed; web container `acbd88a8c967cd966f068e56025f52b9debb109b07b96613637bc53ed6156b82` is healthy with zero restarts, API container/image unchanged and healthy with zero restarts. Other Compose services/Hermes retained their container identities. New public assets are `/assets/index-BfGS-SQP.js` and `/assets/index-LuKPVoAr.css`; public HTML matches the active image. Final browser verified desktop at 1440px and default narrow width 651px; narrow trigger/popup both 218.5px. Temporary viewport override was reset. Final screenshot and `pm-task-sort-production-narrow-20261006.png` are saved locally; no business record was mutated during acceptance.

## Production outstanding PM schedule correction - 2026-10-07

Deployed API source `95af66de711d591d6b47bb410865a5db8739fdb1`, image `sha256:773d62797994af7fafa06a2c6e97c2a6091416000586630f86002442a9ea1531`, container `025eed4eaf3761b1400a76fc4c9afd0fbf18107d14a36cd4da84c86d2c2f3333`. The retained web is source `ecf9ed687ca97662a1479912f2ef6426a9ef7990`, image `sha256:515ef40cbba86b4092c313c3309ae2a27ab064d65be25fdad8a3c8f368be66f0`, container `acbd88a8c967cd966f068e56025f52b9debb109b07b96613637bc53ed6156b82`.

Protected release audit: `/var/backups/preventive-pilot/pm-anchor-final-20261007T002809Z`. It contains exact-source validation (186/186 Linux tests and all build/typecheck/lint/docs/schema-source gates), captured/final SQL proof, eight rollback rehearsals, configuration checkpoints, source update, runtime image/health/public/proxy proof, generator post-scan, guarded PC-059 correction and full history-preservation comparison. The earlier `063bde1` candidate was never activated. Its validation-worker quoting/capture failures were confined to verification; final source passed the repaired helper. API activation used the existing project and Compose files with no build/pull/dependency restart. Web and excluded production services/Hermes retained identities; API/web are healthy with zero restarts. Public bundles remain index-BfGS-SQP.js and index-LuKPVoAr.css.

No schema migration. SQL COPY_ONLY/CHECKSUM backup 5045 and VERIFYONLY passed before any schedule correction. The checkpoint originated in `/var/backups/preventive-pilot/pm-anchor-candidate-20261007T001954Z`; final audit retains its backup metadata, original before-images and explicit origin reference. Restore was not exercised. API rollback image tag: `preventive-pilot-api:rollback-pm-history-20261007T002809Z`. Image rollback alone does not undo schedule settings; any compensating data change must use retained before-images and reviewed guards. No database restore or task/evidence deletion occurred.

Seven settings were recovered through normal generation; PC-059's missing-site anchor was repaired under a context lock using its existing open task with an audit event. LocationId remains null and generation eligibility is unchanged. Two final generator passes and full before/after comparison prove unchanged task history and child counts, eight corrected asset settings, unchanged facility settings, zero remaining cursor drift and zero active duplicate groups. CIFS `/mnt/preventive-evidence` -> API `/app/shared-documents`, nested evidence root and filesystem startup guard remain intact; env/base Compose bytes are retained. Authenticated PC-006 browser acceptance shows July 30, 2026 and Overdue while retaining the 180-day template. Wider D2/D3 gates remain open.


## Calendar actions and technician label release - 2026-10-09

Source release: `f8023cd80b8226a6c2acf8a5b09175d371398ece`. Only the web service was activated, using an isolated exact-commit Docker candidate. Mobile and the unpublished Snipe-IT fallback change were excluded.

Validation passed in the candidate build: lint, both frontend TypeScript projects, 14 label PDF/draft tests, documentation checks and production build. Existing bundle-size/documentation-coverage warnings remain.

Production verification passed: web healthy with the exact source revision, public HTML and JS/CSS bytes matched the candidate, scheduling/label-designer/tasks/assets routes served the release, and the nginx API documentation proxy worked. All excluded running containers retained their container IDs and images; API remained healthy. Environment and Compose files were unchanged. No database migration or business-data correction was performed.

Audit: `/var/backups/preventive-pilot/calendar-label-web-20261009T085700Z/state.json`. Image: `sha256:0b7568b136c93af5f2d933d2d6787c1702327bfe4ea9998366d5310a76ff9e27`. Rollback tag: `preventive-pilot-web:rollback-calendar-label-20261009T085700Z`.

Production browser interaction acceptance remains OPEN because the Codex browser kernel failed during Windows sandbox setup. Prior synthetic technician customization/draft acceptance is recorded separately and is not production-browser evidence. Calendar month/day preservation and modal keyboard interaction must still be exercised in a working browser; do not mark those checks complete based on deployment health.

## Production PM workflow and site repair - 2026-10-10

API and web deployed from tracked exact source c789ff37a89bb77422bed46dd6278dd1581f2614, preserving published calendar/label changes. API image sha256:111c6edc212649f746e0318160ebacba30fae91c9f6762ca09a320c10155efef; web image sha256:e5aa86203f9ea32a6954c742fda5b64d86235782ebe58dde4b77577e3fe39f76. Both healthy with zero restarts. Protected audit: /var/backups/preventive-pilot/pm-workflow-20261010-c789ff3. Public HTML/assets match active web; public API OpenAPI exposes TASK_NOT_STARTED and PM_OCCURRENCE_CONFLICT. API proxy, runtime config hashes, CIFS and excluded-container identities passed. Native existing SSH/sudo performed host operations; Hermes performed SQL preparation/inspection. Broad host-mount helper requests were not approved or executed.

Integrated candidate passed 36 targeted execution/approval/scheduling/site tests, desktop typecheck and web/backend builds. Hermes ran the complete migration twice on a production-typed temporary table, changing only table and metadata references; four legacy indexes updated, second execution unchanged, 36 behaviors passed and zero residual transactions/temp tables. Initial incomplete fixture and corrected rerun are retained. Production preflight and post-release scans show zero duplicates in four occurrence keys and replacement source.

SQL backup set 5047 COPY_ONLY/CHECKSUM/compressed, compressed size 151227400 bytes, VERIFYONLY passed. Backup filename: AssetMaintDB_pm_workflow_20261010_c789ff3_4c2539f6-6d4d-4d53-9702-1ebc4eefc221.bak in the established SQL backup directory. Restore was not exercised. Exact unmodified migration SHA256 de97b6255b388fadadd11f9a1bae517c253f3e633559464ba33efc5d2640eea8 executed successfully. Fingerprints of 19 tables remained identical across migration, including all 273 PMTasks and child/history records. Rollback images: preventive-pilot-api:rollback-pm-workflow-20261010-c789ff3 and matching web tag. Image rollback retains relaxed indexes; restoring old uniqueness requires duplicate preflight and a reviewed schema recovery. No application rollback was exercised.

Authorized normal Snipe sync 63B844F7-57C4-F111-84F7-0050569F18B6 succeeded for 2380 assets. PC051, PC127 and PC067 now resolve to mapped Morowali; PC127 PM remains disabled and other two remain enabled. Post-sync task/child/history fingerprints remain identical. Assets, Locations and NotificationLog fingerprints changed through normal sync/runtime activity, with unchanged counts; no manual site SQL or PM activation was performed.

Interactive browser acceptance could not run because the CUA Windows sandbox helper failed. No real PMNow/start/submit/revise/reject/approve was performed for testing. Earlier failed rejection remains pending and should be retried by its reviewer; no approval or rejection was fabricated. Desktop revision and submit guards are deployed; latest local mobile rejection-option cleanup is not in this tracked source and no APK was regenerated. Broader mobile acceptance and D2/D3 remain open. Checkout/documentation commits after this source do not imply new image activation.
