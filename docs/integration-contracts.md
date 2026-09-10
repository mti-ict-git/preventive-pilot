# Integration Contracts

Last reviewed: 2026-09-10. Describes integration boundaries found in source; live connectivity and delivery were not tested.

## Snipe-IT

- Purpose: import hardware, categories, and locations into the maintenance catalog.
- Implementation: `backend/src/jobs/snipeSync.ts`; configuration through environment and application settings.
- Ownership: Snipe-IT supplies synchronized catalog attributes; PM owns maintenance settings and history.
- Status: raw status labels are retained; normalized operational state drives scheduling. Missing upstream assets are archived locally to preserve history. Asset images may be persisted as SQL binary data with metadata.
- Evidence: `pm.SnipeSyncRuns` and system logs. Verify paging, partial failures, missing records, and image failures against a controlled source before asserting production consistency.

## Evidence storage/import

- Upload storage root: `EVIDENCE_STORAGE_ROOT`; import root: `EVIDENCE_IMPORT_ROOT`.
- Database: task/checklist evidence metadata; filesystem/share: attachment bytes.
- Existing folder convention: quarter and year. Verify access from the API runtime/container identity, not only from the operator's desktop.
- Import is an optional job. A mounted share and successful SQL connection are separate prerequisites.
- Backups must cover both metadata and files. Missing bytes should be diagnosed separately from missing database references.

## Notifications

| Channel | Configuration boundary | Delivery/verification concern |
| --- | --- | --- |
| Microsoft Graph/mail | Global Graph credentials/defaults plus channel recipient, sender, subject/body, and merge configuration | Token acquisition, sender permissions, recipient resolution, and logged delivery outcome |
| WhatsApp | Application settings and channel target/number/group/base-URL override | Confirm the actual gateway contract and authorized destination in the deployment |
| Firebase push | Device registrations, Firebase credentials, channel/rules, and broadcast endpoints | Token validity, native registration, role targeting, foreground/background/tap behavior |

Reminder/escalation and immediate lifecycle events are distinct triggers. Observed event names include `task_assigned`, `task_submitted_for_approval`, `task_pending_superadmin`, `task_revised`, `task_approved`, and `task_rejected`.

Existing templates support task/context fields such as `{{taskNumber}}`, `{{dueAt}}`, `{{assetName}}`, `{{templateName}}`, `{{technicianNumber}}`, approval/rejection/revision fields, and `{{message}}`. Check the renderer when adding placeholders; not every field is available for every event.

Reminder routing can prefer the assigned technician and fall back to configured recipients. Channel config can override global defaults. Do not equate enqueued notifications or a triggered job with confirmed external delivery. Tests/broadcasts must use explicitly authorized test recipients.

## Optional API discovery

PM Tech supports an optional `VITE_DISCOVERY_URL`. The ngrok/Gist development utilities publish JSON containing `apiBaseUrl` and `updatedAt`. The client may refresh discovery and fall back to a configured API base after a timeout.

Discovery is disabled by default in the inspected client; normal production fallback uses a fixed HTTPS URL. The root Docker stack no longer includes ngrok/Gist watcher services. Existing `ngrok:full` and `ngrok:gist-watch` scripts are optional development tools. A Gist-writing token stays on the publishing host, never in the mobile bundle.

## App updates

Two supplied components need a clarified deployment contract:

1. Backend `/api/app-updates` routes handle update metadata/policy, installation reporting, and signed download URLs backed by configured storage.
2. Local `mobile/secure-apk` is a static read-only Nginx stack exposing `/version.json` and `/apk/`.

The old authenticated-upload/manifest guide does not match that static stack. See [APK publication](apk-publish.md) and Q-07; do not assume either component implements the old upload API.

## Integration change procedure

Record input/output fields, authentication, timeouts/retries, ownership, failure signals, and an isolated verification scenario before changing a connector. Keep endpoint changes synchronized with [OpenAPI](openapi.yaml) and record environment-specific unknowns in the question register.
