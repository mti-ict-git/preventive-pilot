# Operational Runbook

Last reviewed: 2026-09-10. This is a source-derived baseline. Recovery procedures require staging validation before use as a production guarantee.

## Startup checks

1. Confirm environment, database target, storage mounts, and which jobs are enabled.
2. Follow [deployment and environment](deployment-and-environment.md) for package installation and schema handling.
3. Confirm the API process starts without environment-validation errors.
4. Request backend `/health` directly and expect JSON `{ "status": "ok" }`. This proves liveness only.
5. Check `/api/docs.json`, authenticated login, and a representative authorized read endpoint to distinguish process health from database/auth readiness.
6. Confirm evidence files are readable/writable under the API identity and inspect job/system logs.

For root Compose, backend health is at `http://localhost:5056/health`; the web is at `http://localhost:9102`. The SPA may return HTML for unknown non-API paths, so do not mistake a web HTTP 200 for backend readiness.

## Troubleshooting

| Symptom | First checks | Evidence to retain |
| --- | --- | --- |
| API fails at startup | Required JWT/DB/LDAP variables, backend working directory, env-file path | Error field names and timestamp, with secrets removed |
| Login fails | Chosen provider, directory reachability/search settings or local account, database connectivity | Sanitized request/error and provider |
| Browser cannot reach API | Effective client base URL, actual backend port, configured origins, Nginx proxy | URL/origin/status and proxy/API logs |
| Database schema mismatch | Intended target, schema application result, later DDL alterations | Schema version and missing objects; `db:verify` alone is partial |
| PM work not generated | PM enabled/default template, active context, operational state, Frozen, horizon, blackout, enabled jobs | Task/context IDs, schedule fields, system logs |
| Duplicate PM Now behavior | Existing task, idempotency window, scheduled due values, filtered unique index | Both requests and returned task IDs |
| Evidence missing | Metadata row, configured container path, actual bytes, mount permissions | Evidence/task IDs and sanitized filesystem errors |
| Notifications not received | Channel enabled, rule/event, resolved recipient/device, credentials, job outcome | Notification log, provider outcome, timestamp |
| Mobile reaches old API | Build-time endpoint values, optional discovery, fallback, installed version | Effective API base and app version |
| APK update fails | Selected update mechanism, metadata/path, signed-token expiry, actual native artifact | Sanitized metadata and HTTP status; see Q-07 |

Manual jobs can create tasks, import files, or send notifications. Confirm the intended scope before triggering them; a troubleshooting step is not automatic permission to broadcast messages.

## Deployment procedure to validate in D2

1. Record the source revision, configuration changes, intended environment, and open blockers.
2. Back up database and evidence files consistently; verify who owns restoration.
3. Review schema changes and compatibility with the previous application version.
4. Run static/build checks and staging schema/workflow tests.
5. Apply the approved schema and deploy application artifacts with correct mounts and secrets.
6. Verify liveness, authenticated data access, evidence, representative PM/CM flow, and enabled integrations.
7. Record deployment result and release evidence.

Do not rewrite published Git history. Lovable is connected to the repository and synchronized history must remain intact.

## Recovery limitations

No tested automated schema rollback or restoration procedure is established in this baseline. Rolling back a container does not undo SQL migrations or restore evidence files. Determine compatibility before redeploying an older build. RPO/RTO, retention, snapshot coordination, and restore drills remain Q-10.

Jobs run in the API process. Validate coordination before increasing replica count; do not claim cross-instance locking from an in-process non-overlap mechanism.
