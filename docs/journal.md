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
