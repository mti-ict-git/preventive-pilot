# Operational Runbook

## Health Triage

1. Check process/container state.
2. Call `GET /health`.
3. Authenticate and inspect `GET /api/system/status`.
4. Review `pm.SystemLog` through the system UI/API.
5. Test database connectivity, evidence mount, and the affected external integration.

`/health` is process liveness, not proof that every dependency is ready.

## Database

Apply and verify:

```sh
npm run db:apply-schema
npm run db:verify-schema
```

Run only against an explicitly selected environment. Back up before material schema changes. Do not edit production data to bypass workflow without an approved and audited procedure.

## Jobs

Scheduled jobs:

- Snipe sync
- Schedule calculation
- Notification reminders/escalations
- Evidence import

Authorized admins can trigger supported jobs via system endpoints/UI. Before retry:

1. inspect the prior run/log;
2. correct the dependency/configuration cause;
3. confirm idempotency;
4. trigger once and record result.

Keep only one scheduler-enabled API replica until distributed locking exists.

## Evidence Incidents

- Confirm mount existence, permissions, capacity, and network share health.
- Do not delete orphan metadata/files during initial triage.
- Capture task/evidence IDs and file path metadata.
- Restore SQL and files to the same consistency point.
- Reconcile missing/orphan records with an approved script.

## Snipe-IT Incidents

- Test configured endpoint/token without exposing the token.
- Inspect `pm.SnipeSyncRuns` and system logs.
- A failed sync should not delete local assets.
- Verify archive behavior on a controlled fixture before manual correction.

## Notification Incidents

- Inspect channel/rule active state and notification log.
- Test Graph/Firebase configuration using administrative test actions.
- Avoid repeated broadcast/retry until duplicate impact is understood.

## APK Updates

Publishing guidance is in `apk-publish.md`. Verify manifest, signed download, checksum/metadata, release notes, and a test-device install before enforcing a minimum version.

## Recovery and Escalation

Escalate when:

- authorization or audit history may be compromised;
- SQL/evidence consistency is uncertain;
- duplicate PM/notification side effects occurred;
- a secret may be exposed;
- rollback requires destructive schema/data changes.

Record timeline, affected entities, commands/actions, results, and follow-up roadmap items.
