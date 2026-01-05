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

## 2026-01-02 20:51
- Verified development environment health (frontend on port 8080, backend on port 3001).
- Confirmed backend health endpoint returns OK.

## 2026-01-02 21:42
- Moved Assets visible-category filter from localStorage to DB global setting (pm.SystemSettings).
- Added system API endpoints to load and update Assets UI settings.

## 2026-01-02 21:49
- Restricted Assets UI settings updates to Superadmin only.

## 2026-01-02 22:15
- Enabled custom date range selection on Reports page (compliance query).

## 2026-01-03 06:56
- Standardized checklist outcomes (0=skip, 1=pass/done, 2=fail) and enforced in API.
- Updated Tasks UI to use outcome dropdown instead of freeform numeric input.
- Added DB check constraint to restrict checklist outcome values.

## 2026-01-03 07:00
- Normalized legacy checklist outcomes before adding DB constraint and clamped API output for older data.

## 2026-01-03 11:01
- Added bulk selection actions for Assets visible categories filter (active-only, inactive-only, invert, show all).

## 2026-01-03 11:45
- Added category search input to Assets visible categories filter (More Filters).

## 2026-01-03 11:52
- Fixed Assets visible categories bulk actions to avoid expanding selection unexpectedly.

## 2026-01-03 21:16
- Fixed category IsActive parsing so active/inactive bulk filters apply correctly.

## 2026-01-03 21:36
- Updated active/inactive bulk filters to operate on current selection.

## 2026-01-04 23:28
- Added Superadmin-only Categories settings sub-page for global Assets category visibility.
- Added /settings/categories route and sidebar navigation entry.
- Removed category visibility controls from Assets page for non-admin focus.

## 2026-01-05 09:01
- Wired Asset Detail page to real asset/template APIs for PM settings.
- Added missing PM template warnings in Assets list and Asset Detail.
- Fixed backend asset PM PATCH to allow clearing template and next due date.

## 2026-01-05 09:29
- Added Assets per-page selector (50/100/200/500) and increased backend page-size cap.

## 2026-01-05 09:51
- Added bulk action to assign a PM template to multiple Assets.
- Updated Asset Detail PM History tab to load real completed task history.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## 2026-01-05 10:56
- Allowed Admin/Supervisor to trigger schedule recalculation.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## 2026-01-05 12:39
- Disabled bulk PM enable/disable actions for non-managers in the Assets page.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## 2026-01-05 16:19
- Re-verified bulk PM template assignment and Asset Detail PM history wiring.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## 2026-01-05 17:28
- Implemented backdated evidence importer job (file move + task/evidence creation + duplicate handling).
- Added System Settings UI to run evidence import with template and duplicate options.
- Added system endpoint to trigger evidence import and new env/scheduler toggles.
- Fixed backend import path resolution for evidence import job wiring.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## 2026-01-05 18:09
- Configured evidence import and storage roots in .env for Docker-mounted share.

## 2026-01-05 18:43
- Added Dockerfiles and docker-compose for web (9102) and api (5056).

## 2026-01-05 18:51
- Added CIFS-based docker compose override for mounting SMB share in Docker.

## 2026-01-05 19:29
- Fixed backend ESM imports for Node.js runtime in Docker.

## 2026-01-05 19:39
- Added same-origin /api proxy setup for Docker web container.

## 2026-01-05 20:50
- Refined docker-compose overrides for SMB mounting (bind vs CIFS).
