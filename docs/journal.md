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
2026-01-07 06:24:47 UTC
- Added backend endpoints: POST /api/tasks/{taskId}/pause and /cancel
- Updated backend OpenAPI to document pause/cancel actions
- Added frontend API functions: apiPauseTask, apiCancelTask
- Added Pause and Cancel buttons to Task Detail dialog on web
- Ran lint and typecheck; addressed any arising issues
2026-01-07 06:30:12 UTC
- Added backend endpoint: POST /api/tasks/{taskId}/resume
- Updated backend OpenAPI to document resume action
- Added frontend API function: apiResumeTask and Resume button on web
- Mobile app: added Start, Pause, Resume, Stop (Cancel) actions on Task Detail
- Extended mobile status badge to show Paused status
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

## 2026-01-05 20:56
- Updated CIFS mount options (domain/sec) to fix permission denied.

## 2026-01-05 21:57
- Added evidence import skip-reason breakdown and samples for debugging.

## 2026-01-05 22:27
- Extended evidence import filename date parsing to support DDMMYYYY.

## 2026-01-05 22:39
- Added evidence import error-stage breakdown and sample errors in results.

## 2026-01-06 06:12
- Added evidence import DB schema precheck for pm.PMTaskEvidence.StoragePath.
- Improved rollback failure logging for evidence import transactions.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## 2026-01-06 06:21
- Applied schema.sql to production database.
- Verified pm schema and confirmed pm.PMTaskEvidence.StoragePath exists.

## 2026-01-06 06:36
- Fixed Evidence attachments UI to avoid navigating to Uri (e.g. "imported").
- Added in-app evidence preview modal with open-new-tab and download actions.
- Wired evidence preview/download to /api/tasks/evidence/:evidenceId.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## 2026-01-06 08:08
- Fixed evidence preview rendering by inferring Content-Type from file extension when missing.
- Extended evidence preview modal to support PDF, images, video, and audio.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## 2026-01-16 01:02
- Wired Asset Detail "PM Now" button to open a PM Task detail dialog for the asset's default template.
- Reused existing Task Detail checklist and evidence UI to complete PM directly from Asset Detail.
- Triggered PM schedule recalculation automatically after completing PM Now to update Next PM date.
- Ensured Label Designer uses DB-backed UI settings and QR payload configuration via real APIs.

## 2026-01-16 00:00
- Added asset-level PM recalculate action on Asset Detail page using existing scheduling API.
- Restricted PM recalc to managers with PM enabled and default template set.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## 2026-01-16 00:46:59 WIB
- Renamed Asset Detail header action from "Recalculate PM" to "PM Now" for clarity.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## 2026-01-16 00:49:54 WIB
- Fixed apiRecalculateSchedules to send a JSON object body instead of a pre-serialized string.
- Resolved 400 Bad Request when clicking "PM Now" (scheduling recalc schema now matches payload).
- Verified with `npm run lint` and `npx tsc --noEmit`.

## 2026-01-15 17:16
2026-01-15 17:16:44 UTC
- Seeded core roles (Superadmin, Admin, Supervisor, Technician, Viewer) in pm.Roles via schema.sql
- Applied schema to DB to populate missing roles
- Verified Users & Roles lookups show full role list
- Ran `npm run lint` and `npx tsc --noEmit`: OK

## 2026-01-15 17:20
2026-01-15 17:20:33 UTC
- Restricted users to exactly one role
- Frontend: switched Edit User roles to single-select RadioGroup
- Backend: enforced single role via UpdateUserRolesSchema length(1)
- Ran `npm run lint` and `npx tsc --noEmit`: OK

## 2026-01-07 13:38:26 WIB
- Implemented JWT refresh tokens on backend (sign/verify, env REFRESH_TOKEN_EXPIRES_IN).
- Added /api/auth/refresh endpoint and updated OpenAPI schemas and paths.
- Mobile: store refresh token on login and auto-refresh on 401 in request wrapper.
- Mobile: clear refresh token on logout.
- Ran backend typecheck and mobile lint + typecheck; no errors.

## 2026-01-07 13:41:59 WIB
- Web: added refresh token storage and 401 auto-refresh in apiFetchJson.
- Web: login now stores refresh token alongside access token.
- Verified with repo lint and typecheck.

## 2026-01-07 13:44:36 WIB
- Mobile: added provider selection (LDAP/Local) to Login page.
- Mobile: AuthProvider accepts optional provider and sends it to /auth/login.
- Verified mobile lint and typecheck.

## 2026-01-07 13:47:35 WIB
- Mobile: adjusted API base URL config to prefer VITE_API_BASE_URL and default to http://localhost:3001 when not using proxy.
- Mobile: implemented login fallback to try the alternate provider if the first returns 401.

## 2026-01-06 08:55
- Added delete support for task evidence and checklist item attachments (API + UI).
- Allowed CORS `x-filename` header and exposed `Content-Disposition` for evidence endpoints.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## 2026-01-06 10:36
- Added template checklist flag: Requires Attachment (DB, API, and UI).
- Extended Tasks API and UI to enforce required checklist attachments on completion.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## 2026-01-07 11:28
- Updated Swagger for /api/assets: documented search fields (Name, AssetTag, SerialNumber), categoryIds CSV (max 50), and pageSize cap at 500.
- Added Role, AssetCategory, Location, and LookupsResponse schemas.
- Documented /api/system/lookups response schema.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## 2026-01-07 11:30
- Added root script `dev:backend` to run backend dev server.
- Verified it starts: Backend listening on http://localhost:3001; health at /health.

## 2026-01-07 12:16
- Refined Swagger with concrete AssetListItem, AssetListResponse, AssetDetail schemas.
- Updated /api/assets 200 response to AssetListResponse and /api/assets/{assetId} to AssetDetail.
- Documented pmEnabled oneOf (string|boolean) and categoryIds CSV example.
- Bumped API version to 1.0.1 in Swagger info.

## 2026-01-07 12:20
- Tweaked Swagger summaries to display "(updated)" for assets endpoints to make changes visibly obvious in the UI list.
## 2026-01-07 12:26
2026-01-07 12:26:00 UTC
- Added backend endpoint: PUT /api/system/users/{userId}/roles to update roles and active state
- Wired Users page Edit User dialog to assign roles and toggle Active
- Added API client function apiUpdateUserRoles
- Updated Swagger: documented /api/system/users (GET) and /api/system/users/{userId}/roles (PUT)
- Ran `npm run lint` and `npx tsc --noEmit`: OK
## 2026-01-15 00:48
2026-01-15 00:48:13 UTC
- Fixed Users menu Edit User selection to reliably open dialog (Radix onSelect)
- Re-ran `npm run lint` and `npx tsc --noEmit`: OK
## 2026-01-06 15:44
- Fixed Next PM off-by-one for annual interval by using dateadd(year, 1).
- Updated assets, scheduling, tasks, and evidence import queries to apply year-based addition when IntervalDays = 365.
 - Verified with `npm run lint` and `npx tsc --noEmit`.

## 2026-01-06 16:22
- Mapped template intervals to calendar units: 30→+1 month, 90→+3 months, 180→+6 months, 365→+1 year.
- Applied mapping across assets, scheduling job, manual recalc, task completion, and evidence import.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## 2026-01-06 17:00
- Queried API for asset MTI-PC-003 and its assigned template.
- Confirmed template IntervalDays = 180 (Semi-Annual).
- Noted existing NextPMDueAt stored as 2026-07-04 which conflicts with template.

## 2026-01-06 17:03
- Added force option to scheduling recalculation to ignore stored NextPMDueAt.
- Ran forced recalculation across all PM-enabled assets; normalized NextPMDueAt.
- Verified MTI-PC-003 NextPMDueAt is now 2026-01-03 (aligned to 180 days).

## 2026-01-06 17:07
- Added Scheduling UI actions: Recalculate All and Recalculate (Force).
- Implemented frontend API call for forced recalculation and invalidation of calendar/day/assets queries.
- Verified with `npm run lint` and `npx tsc --noEmit`.
- Implemented Microsoft Graph notification settings storage in pm.MicrosoftGraphSettings.
- Added backend system routes to load, update, and test Microsoft Graph settings with env fallback.
- Created Settings > Notification UI for Microsoft Graph configuration and wired to API.
- Wired /settings/notifications route and sidebar navigation entry.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## 2026-01-06 11:23
- Added Microsoft Graph env fallback keys to .env (secret/body left for local entry).

## 2026-01-06 11:47
- Fixed notifications job to deliver queued email via Microsoft Graph (not just enqueue).
- Updated NotificationLog status transitions for queued/sent/failed.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## 2026-01-06 10:40
- Added Reports filters for location and category.
- Wired CSV exports for Compliance and Overdue reports.
- Added CSV exports for System Logs and Assets Without PM reports.
- Updated Label Designer mock assets to match the API Asset shape.
- Adjusted label QR encoding to prefer Snipe-IT hardware IDs.
- Fixed backend lint errors in reports CSV escaping and Graph settings fallback.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## 2026-01-06 10:56
- Removed hardcoded Snipe-IT fallback URL from Label Designer QR codes.
- Export PDF now opens print dialog (Save as PDF).
- Verified with `npm run lint` and `npx tsc --noEmit`.

## 2026-01-06 11:52
- Added Notifications page button to run notifications job and surface send failures.

## 2026-01-06 12:05
- Added "Send test email" option to Microsoft Graph connection test in Notification Settings.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## 2026-01-06 12:08
- Added server-generated PDF export for PM History task details.
- Added PM History detail "Export PDF" button to download the generated report.
- Verified with `npm run lint`, `npx tsc --noEmit`, and `npm run --prefix backend typecheck`.

## 2026-01-06 12:27
- Fixed Assets "Next PM" to use computed NextDueAt when missing.
- Updated scheduling recalculation and schedule job to honor LastPMCompletedAt.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## 2026-01-06 12:31
- Added scheduling day selection with default highlight on today.
- Added right-side event list showing PM tasks for the selected day.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## 2026-01-06 (time unavailable)
- Updated Scheduling calendar/day endpoints to include projected PM occurrences when tasks have not been generated yet.
## 2026-01-06 17:19
- Aligned Scheduling calendar/day fallback to calendar-aware intervals (30/90/180→months, 365→year).
- Updated Assets API Next PM computation to use calendar-aware mapping instead of pure days.
- Verified removal of duplicate apiRecalculateSchedules definition in frontend.
- Ran lint and typecheck: OK.
- Attempted API verification for MTI-PC-003 via DB; asset not found in current DB.
## 2026-01-06 17:27
- Added table header filters on Assets: Asset ID search, Category, Location, PM Enabled.
- Extended apiListAssets to support locationId.
- Verified with `npm run lint`, `npx tsc --noEmit`, and backend typecheck.
## 2026-01-06 17:29
- Added PM Status header filter and client-side filtering keys.
- Updated PM status logic: assets with PM enabled but no history show "Not Started".
- Verified with `npm run lint` and `npx tsc --noEmit`.
## 2026-01-06 17:35
- Fixed Assets runtime error by moving getPMStatus above filteredAssets.
- Verified UI filters render correctly and selection logic remains intact.
- Ran `npm run lint` and `npx tsc --noEmit`: OK.
## 2026-01-06 17:37
- Moved PM Status filter to correct column in Assets header.
- Verified alignment and behavior with lint and typecheck: OK.
## 2026-01-06 19:49
- Enhanced Notifications page with status/channel filters and page size.
- Added quick actions: Run Now, Send Test Email, Settings link.
- Implemented load-more appending and payload viewer for log entries.
- Fixed lint warnings by memoizing query result arrays.
- Ran `npm run lint` and `npx tsc --noEmit`: OK.
## 2026-01-06 19:59
- Added API client functions: create notification channel/rule.
- Implemented Add/Edit Rule modals (Reminder/Escalation) with validation.
- Implemented Add/Edit Channel modal; wired chevron/row click to edit.
- Hooked saves to backend, invalidating queries on success.
- Ran `npm run lint` and `npx tsc --noEmit`: OK.

## 2026-01-06 19:58
- Wired sidebar PM Tasks badge to real counts from dashboard overview.
- Ran `npm run lint` and `npx tsc --noEmit`: OK.

## 2026-01-06 21:08
- Expanded backend OpenAPI/Swagger docs for Assets, Tasks, and Notifications routes.
- Fixed mobile lint errors (no-empty-object-type, no-require-imports).
- Verified with `npm run lint`, `npx tsc --noEmit`, and backend typecheck.

## 2026-01-06 21:18
- Removed broken Git submodule entry for mobile/field-ready while keeping local files.
## 2026-01-07 10:36
- Verified per-user theme preferences: DB schema (ThemeMode/ThemePalette), backend preferences endpoints, and frontend Header integration.
- Ran `npm run lint` (warnings only) and `npx tsc --noEmit` (OK).
## 2026-01-07 10:38
- Verified live DB schema via `npm run db:verify`: pm schema version 4, tables OK, verification passed.
## 2026-01-07 10:40
- Applied schema to add missing pm.Users ThemeMode/ThemePalette columns.
- Verified columns exist via INFORMATION_SCHEMA query.
## 2026-01-07 10:43
- Set global default theme to light in App.tsx.
- Ran `npm run lint` and `npx tsc --noEmit`: OK.

## 2026-01-14 23:40:17 WIB
- Web API: added Label Designer settings client (types + GET/PUT helpers).
- Fixed runtime import error by exporting apiGetLabelDesignerUiSettings/apiUpdateLabelDesignerUiSettings.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## 2026-01-16 00:14:29 WIB
- Fixed Assets bulk PM enable/disable failing with 400 when selecting >200 assets.
- Increased backend bulk request maxItems to 500 (matches 500-per-page UI option).
- Updated backend OpenAPI schemas for bulk PM endpoints.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## 2026-01-16 07:21:39 WIB
- Changed PM Now to always create a new immediate PM task for the asset's default template, ignoring existing scheduled tasks.
- Added `/api/tasks/pm-now` backend endpoint with manager-only access and OpenAPI documentation.
- Updated frontend Asset Detail PM Now button to call the new endpoint and open the created task directly.
- Documented the new behavior in README.

## 2026-01-16 00:31:32 WIB
- Added Superadmin-only delete endpoint for local users in Users & Roles.
- Included ExternalProvider in users list response so UI can gate the delete action.
- Added Users & Roles UI action with confirmation dialog for deleting local users.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## 2026-01-16 00:43:54 WIB
- Replaced Asset Detail → Schedule tab mock data with real computed schedule.
- Schedule combines scheduled tasks and projected occurrences (respects blackout windows).
- Verified with `npm run lint` and `npx tsc --noEmit`.

## 2026-01-16 01:01:59 WIB
- Fixed Task Detail action buttons: allow Start when task status is `open` (overdue tasks).
- Disabled Complete on cancelled tasks for consistency.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## 2026-01-16 01:19:26 WIB
- Added Task Detail Reopen action for managers to restore cancelled tasks to `open`.
- Verified with `npm run lint` and `npx tsc --noEmit`.
