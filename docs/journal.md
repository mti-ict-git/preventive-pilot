# Journal

## 2026-01-01 14:03
- Added initial SQL Server `pm` schema script and apply runner.
- Added implementation plan document for database, API, jobs, and UI integration.

## 2026-01-01 14:08
- Fixed lint errors blocking CI (no-explicit-any, no-empty-object-type, no-require-imports).

## 2026-01-01 14:14
- Verified SQL Server `pm` schema presence, tables, foreign keys, and SchemaInfo version.

## 2026-01-01 14:48
- Applied SQL Server schema changes (SchemaInfo version 2) and verified successfully.
- Added `npm run dev:full` to run frontend + backend together.
- Updated backend to use `BACKEND_PORT` (avoids conflict with existing `PORT=8080`).

## 2026-01-01 15:07
- Removed env-based local superadmin bootstrap; local accounts are DB-backed.
- Added backend CLI to create local superadmin in the database.

## 2026-01-01 15:17
- Updated login to accept username or email (frontend + backend).
- Enhanced LDAP auth to accept DOMAIN\\user and user@domain formats.

## 2026-01-01 15:20
- Wired the web login screen to backend auth API and token storage.

## 2026-01-01 15:45
- Implemented Phase 1 backend APIs for assets, templates, scheduling, tasks, reports, and notifications.
- Added role-based middleware and enforced admin-only actions for sensitive endpoints.
- Wired new API routers into the backend entrypoint and validated with lint and backend typecheck.
