# Deployment and Environment

Last reviewed: 2026-09-10. Commands below are derived from repository scripts/configuration. A clean installation and deployment were not executed in D0.

## Prerequisites

- Node.js and npm. Docker builds currently use Node 22; use a compatible local Node installation and verify its version. No repository-wide `engines` policy is declared.
- A reachable Microsoft SQL Server database and credentials with appropriate schema/application privileges.
- Backend configuration, including JWT and the currently mandatory LDAP fields.
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
| LDAP connection | `LDAP_URL`, `LDAP_BASE_DN`, `LDAP_BIND_DN`, `LDAP_BIND_PASSWORD` | Required by current startup validation |
| LDAP search | `LDAP_USER_SEARCH_BASE`, `LDAP_USER_SEARCH_FILTER`, `LDAP_GROUP_SEARCH_BASE`, `LDAP_GROUP_SUPERADMIN` | Required by current startup validation |
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

LDAP being required by the current parser is a known limitation, not a recommendation to populate fake directory credentials. Resolve Q-05 before claiming a local-only setup path without LDAP configuration.

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
