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

Verification 2026-10-02: shell syntax/help and isolated command-orchestration tests pass for check-only behavior, build-failure stop, deployment ordering, proxy check and partial-LDAP rejection. Docker image build, container startup, production deployment and recovery were not executed. OpenAPI reviewed: no HTTP contract change. The user instruction to defer actual deployment remains in force.


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
