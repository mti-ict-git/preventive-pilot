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

## 2026-01-01 16:38
- Fixed Templates page edit flow to load real template data before opening the edit form.
- Reset Template form state correctly between create/edit sessions.
- Implemented template deletion as a deactivation workflow (backend + frontend).

## 2026-01-01 17:05
- Fixed manual job run endpoint to force-run Snipe-IT sync regardless of scheduler flag.
- Centralized job run locking to prevent duplicate concurrent runs.
- Improved Snipe-IT manual run errors (400 when integration not configured).

## 2026-01-01 17:26
- Added DB-backed Snipe-IT settings endpoints with env fallback.
- Wired System Settings UI to edit, save, and test Snipe-IT integration.
- Updated system status and job scheduling to respect DB Snipe-IT sync settings.

## 2026-01-01 17:37
- Hardened Snipe-IT settings save endpoint when pm.SnipeItSettings is missing.
- Made system status tolerate missing SnipeSyncRuns table.

## 2026-01-01 17:53
- Fixed Snipe-IT sync upserts to match existing categories/locations by name.
- Resolved UNIQUE constraint crash when categories already existed without Snipe IDs.

## 2026-01-01 18:07
- Fixed Assets page bulk selection to respect current filters.
- Stabilized Assets page memo dependencies to satisfy hook lint rules.
- Adjusted assets API PM filtering and default PMEnabled insert behavior.

## 2026-01-01 18:36
- Added saved category visibility filter for Assets list (frontend + backend).
- Persisted visible category selection in localStorage with safe normalization.
