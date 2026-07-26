# Technical Implementation Plan

## System Context

```text
Web browser ─┐
             ├─ HTTPS/JSON ─> Express API ─> SQL Server (pm schema)
Capacitor ───┘                    │
                                 ├─ evidence filesystem / SMB
                                 ├─ LDAP
                                 ├─ Snipe-IT
                                 ├─ Microsoft Graph
                                 ├─ Firebase Cloud Messaging
                                 └─ APK store/uploader
```

The API is the business-rule boundary. Clients must not directly access SQL Server or shared evidence storage.

## Components

### Web

- Entry: `src/main.tsx`, routing in `src/App.tsx`.
- Authentication state: browser storage helpers in `src/lib/auth.ts`.
- Contract client/types: `src/lib/api.ts`.
- Data fetching: TanStack Query plus page-local state.
- UI: Tailwind and shadcn/Radix components.
- Protected routes require a decodable access token; API authorization remains authoritative.

### API

- Entry: `backend/src/index.ts`.
- Global middleware: CORS, JSON parsing, Bearer authentication for `/api/*` except explicit public endpoints.
- Validation: Zod schemas beside route handlers.
- Data access: parameterized `mssql` queries and transactions.
- Modules: auth, assets, facilities, templates, scheduling, tasks, work orders, reports, notifications, app updates, system, dashboard, and devices.
- Runtime API documentation: an embedded OpenAPI object served at `/api/docs` and `/api/docs.json`.

### Jobs

`backend/src/jobs/index.ts` prevents concurrent duplicate execution within one process and schedules:

- `snipe-sync`;
- `schedule-calc`;
- `notifications`;
- `evidence-import` when enabled and storage paths exist.

Multi-instance deployment does not currently show a distributed job lock; treat single-scheduler operation as a deployment constraint until resolved.

### Database

- SQL Server schema `pm`.
- `db/schema.sql` is idempotent and includes additive migration statements.
- UUID primary keys use `NEWSEQUENTIALID()` in most operational tables.
- Referential integrity and selected uniqueness/idempotency constraints are enforced in SQL.

### Evidence Storage

Binary evidence is stored under a configured root. Metadata and task relationships are stored in SQL Server. Compose variants support bind and CIFS mounts.

### Mobile

`mobile/pm-tech` is a React/Capacitor client with HashRouter, protected routes, offline sync attempts, device-native back handling, Firebase push, barcode scanning, biometric capability, and Android forced update. It is currently untracked by Git, so it is implementation evidence but not a reproducible part of the repository baseline.

## Cross-Cutting Design

### Authentication

- LDAP or local password at login.
- Access and refresh JWTs signed with the same configured secret.
- Roles are included in claims and can be refreshed from SQL by middleware.
- Token revocation/versioning is not implemented in the inspected code.

### Authorization

- `requireAuth` protects API modules globally.
- `requireManager`: Superadmin, Admin, or Supervisor.
- `requireSuperadmin`: Superadmin only.
- Some task/work-order mutations additionally validate assigned user or manager access.
- System settings use Admin/Superadmin variants in the route module.

### Validation and Errors

- Zod guards query/body inputs.
- SQL parameters guard query values.
- Consistent error envelopes should converge on `{ message, code?, details? }`; current handlers are not fully normalized.

### Observability

- `pm.SystemLog` stores job/application records.
- `pm.AuditLog` stores attributable entity actions.
- Snipe sync has a dedicated run table.
- No metrics/tracing exporter is currently visible.

## Implementation Boundaries

1. Route, payload, header, auth, validation, or response changes require `docs/openapi.yaml` review and update.
2. Database changes start in `db/schema.sql` and update the database specification.
3. Workflow/status changes update the functional specification and roadmap evidence.
4. Client types are consumers, not the canonical contract.
5. External integrations must have bounded timeouts, secret-safe errors, and operational logging.
6. New jobs must be idempotent and safe under retry.

## Targeted Technical Improvements

### Phase A — Contract Extraction

- Make `docs/openapi.yaml` the canonical artifact.
- Validate it in CI.
- Serve Swagger from the version-controlled file or generate both runtime and file artifacts from one typed source.

### Phase B — Modularization and Tests

- Extract services/domain transitions from large route modules.
- Add unit tests for state machines and validation.
- Add SQL-backed integration tests for critical endpoints and jobs.

### Phase C — Operational Hardening

- Add readiness separate from process liveness.
- Add distributed job locking or document a single scheduler replica.
- Define database/evidence backup and restore tests.
- Add structured request IDs and secret redaction.

### Phase D — Mobile Reproducibility

- Decide whether mobile is in this repository or a separate repository.
- Remove secrets/generated artifacts, then track only reproducible sources and lockfiles.

## Verification Matrix

| Change | Minimum evidence |
| --- | --- |
| Web UI | lint, TypeScript, production build, changed interaction |
| API | backend typecheck, contract review, success and failure-path test |
| Database | schema apply on disposable/approved DB, verification script, invariant query |
| Job | idempotency/retry test, failure log, no-overlap behavior |
| Mobile | mobile build, native sync where applicable, device/emulator flow |
| Deployment | compose config/build, health/readiness, storage and integration checks |
