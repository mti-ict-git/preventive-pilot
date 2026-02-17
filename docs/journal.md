# Journal

## Tue Feb 17 20:26:11 WITA 2026
- Store (secure_apk): persist release notes per APK entry in manifest.json.
- Backend: expose release notes in /api/app-updates/latest response.
- Mobile (pm-tech): show “What’s new” in forced update modal and Profile.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Tue Feb 17 20:33:38 WITA 2026
- Mobile (pm-tech): Assets “All” now lists all assets instead of recents.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Tue Feb 17 20:44:30 WITA 2026
- Docs: add release notes file for Android push.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Tue Feb 17 20:50:42 WITA 2026
- Scripts: push:android supports `--inc` to bump Android versionCode and build debug APK.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Tue Feb 17 14:11:27 WITA 2026
- Backend: optional proxy for APK downloads to avoid device DNS/redirect issues.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Tue Feb 17 14:20:04 WITA 2026
- Mobile (pm-tech Android): ensure updater plugin always posts results on main thread.
- Mobile (pm-tech): preflight HEAD request so download failures show immediately.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Tue Feb 17 14:40:14 WITA 2026
- Scripts: push:android supports local publish mode to bypass store DNS issues.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Tue Feb 17 14:44:56 WITA 2026
- Scripts: reverted push:android local publish changes (per request).
- Mobile (pm-tech): preflight download check no longer depends on AbortController.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Tue Feb 17 15:22:58 WITA 2026
- Backend: proxy APK downloads for Android clients to avoid store DNS redirects.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Tue Feb 17 15:36:23 WITA 2026
- Env: point app update store base/manifest to internal secure_apk service.
- Env: force proxy download to avoid redirects on Android.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Tue Feb 17 15:51:46 WITA 2026
- Docker: allow backend container to reach host via host.docker.internal.
- Env: point app update store base/manifest to host-mapped secure_apk port.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Tue Feb 17 16:01:50 WITA 2026
- Env: point app update store base/manifest to Docker gateway host port for server.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Tue Feb 17 16:23:27 WITA 2026
- Mobile (pm-tech Android): add logcat logs for updater download/install flow.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Tue Feb 17 16:33:59 WITA 2026
- Mobile (pm-tech Android): log MainActivity plugin registration for troubleshooting.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Tue Feb 17 16:40:55 WITA 2026
- Mobile (pm-tech Android): include AppUpdater in capacitor.plugins.json for native availability.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Tue Feb 17 17:02:23 WITA 2026
- Mobile (pm-tech Android): move AppUpdater into a local Capacitor plugin package for sync.
- Mobile (pm-tech Android): allow HTTP updater URLs in debug builds only.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Tue Feb 17 17:09:05 WITA 2026
- Mobile (pm-tech Android): add appcompat dependency to AppUpdater plugin build.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Tue Feb 17 17:11:26 WITA 2026
- Mobile (pm-tech Android): detect debuggable app without BuildConfig in plugin module.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Tue Feb 17 17:20:10 WITA 2026
- Mobile (pm-tech): avoid awaiting AppUpdater proxy to prevent AppUpdater.then() error.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Tue Feb 17 20:04:56 WITA 2026
- Docs: add lessons learned for APK updates, backend proxying, and Capacitor plugins.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Tue Feb 17 11:55:15 WITA 2026
- secure_apk: uploader accepts raw APK uploads via X-File-Name header.
- Scripts: push:android now uses raw upload request body for reliability.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Tue Feb 17 13:57:48 WITA 2026
- Mobile (pm-tech Android): bumped versionCode to 4 for forced-update testing.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Tue Feb 17 14:03:51 WITA 2026
- Scripts: push:android prints fetch failure cause details for easier troubleshooting.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Tue Feb 17 11:51:07 WITA 2026
- Scripts: push:android upload now uses fetch FormData (multipart field "file").
- Tooling: ESLint recognizes Node globals for secure_apk uploader and scripts fetch globals.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Fri Feb 13 23:32:50 WITA 2026
- Backend: added signed APK update discovery and download endpoints (/api/app-updates).
- Mobile (pm-tech): added update check UI and optional startup update prompt.
- Mobile (pm-tech Android): added native downloader/installer plugin for in-app APK updates.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Fri Feb 13 23:41:33 WITA 2026
- Docker: added secure-apk nginx service with CIFS-mounted APK share.
- Docker: wired APP_UPDATE_* env vars for api when using docker-compose.cifs.yml.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Fri Feb 13 23:46:10 WITA 2026
- Docker: adjusted CIFS mount and secure-apk nginx alias for release-folder share path.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Fri Feb 13 23:53:00 WITA 2026
- Docker: moved secure-apk compose to mobile/secure_apk/docker-compose.yml.
- Docker: removed secure-apk service from root docker-compose.cifs.yml.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Fri Feb 13 23:59:19 WITA 2026
- Docker: secure-apk now mounts Windows share root with CIFS prefixpath for subfolder.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Sat Feb 14 00:04:31 WITA 2026
- Docs: added mobile/secure_apk README with CIFS prefixpath and volume recreate notes.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Fri Feb 13 21:38:30 WITA 2026
- Web: improved Tabs active state highlight across the app.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Sun Feb  8 22:52:07 WITA 2026
- Web: added new notification rule event types (Due Today, Revised, Submitted for approval, Pending superadmin).
- Backend: enqueue immediate push notifications for approval workflow transitions with role-based audiences.
- Backend: improved reminder rule default templates per event type and expanded push title mapping.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Sun Feb  8 22:27:34 WITA 2026
- Web: added Push rule template support (channel type select + title/body templates + preview).
- Backend: parse rendered Push JSON template into notification title/body on send.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Sun Feb  8 21:38:22 WITA 2026
- Mobile (pm-tech): updated Home header title to “OPTIMA Mobile”.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Sun Feb  8 21:21:06 WITA 2026
- Mobile (pm-tech): updated login header/subtitle copy.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Sun Feb  8 21:19:03 WITA 2026
- Mobile (pm-tech): updated login title to “MTI Mobile PM System”.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Sun Feb  8 20:22:14 WITA 2026
- Mobile (pm-tech): replaced login icon with app logo image.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Sun Feb  8 19:56:50 WITA 2026
- Web: added Push Broadcast dialog (title/message/audience) on Notifications page.
- Web: added apiPushBroadcast client helper and documented Broadcast dialog in README.

## Sun Feb  8 19:45:09 WITA 2026
- Mobile (pm-tech): show app version in Profile > Account > About Version.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Sun Feb  8 19:39:21 WITA 2026
- Mobile (pm-tech): bump app version to 1.0.0.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Sun Feb  8 19:43:15 WITA 2026
- Web: refactored Push channel card to match existing channel list UI/UX.

## Sun Feb  8 19:39:15 WITA 2026
- Web: added Push channel card with enable/disable toggle and push test.
- README: documented Push channel card in Notifications section.

## Sun Feb  8 18:55:27 WITA 2026
- Backend: validate device platform as ios/android/web and normalize broadcast audience.
- Backend: add fallback Firebase service account path for local dev.
- DB: add pm.Devices indexes for UserId and IsActive.
- Docker: set FIREBASE_SERVICE_ACCOUNT_PATH for api container.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Sun Feb  8 18:40:53 WITA 2026
- Backend: added /api/devices/push-broadcast for admin push announcements with role filtering.
- Backend: documented push broadcast schema in OpenAPI spec.
- Docs: updated README with push broadcast endpoint.

## Sun Feb  8 18:35:29 WITA 2026
- Git: stop tracking pm-tech Android google-services.json.

## Sun Feb  8 17:46:22 WITA 2026
- Mobile (pm-tech): Offline sync now flushes queued actions and attachments.
- Mobile (pm-tech): auto-sync queued work when connection returns.
- Mobile (pm-tech): show pending sync state and queued attachment counts on Task detail.
- Mobile (pm-tech): record non-retryable sync failures as conflicts and allow clearing.

## Sun Feb  8 17:52:37 WITA 2026
- Mobile (pm-tech): Task Detail Save Draft now shows immediate “Saved” feedback and saved timestamp.

## Sun Feb  8 18:13:45 WITA 2026
- Mobile (pm-tech): Offline page now shows per-task pending actions/files and refresh progress during sync.

## Sun Feb  8 18:21:24 WITA 2026
- Mobile (pm-tech): Offline cached task cards now show explicit status (Synced/Pending/Conflict/Failed).

## Sun Feb  8 17:32:17 WITA 2026
- Mobile (pm-tech): add outstanding badge count on Home > My Tasks.
- Backend: add /api/tasks/my-outstanding-counts for technician badge.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Sun Feb  8 17:25:56 WITA 2026
- Mobile (pm-tech): show success acknowledgement after Submit for approval.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Sun Feb  8 17:21:30 WITA 2026
- Mobile (pm-tech): added local Save action for PM Task checklist draft.
- Mobile (pm-tech): persist checklist drafts in localStorage for offline usage.
- Mobile (pm-tech): enable offline reads by caching GET API responses.
- Mobile (pm-tech): Offline page now syncs and lists cached tasks.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Sun Feb  8 17:16:46 WITA 2026
- Docker: mount Firebase service account into api container and point FIREBASE_SERVICE_ACCOUNT_PATH to /app/firebase-adminsdk.json.

## Sun Feb  8 17:20:30 WITA 2026
- Docker: switch FIREBASE_SERVICE_ACCOUNT_HOST_PATH to repo-relative path for dev/prod parity.

## Sun Feb  8 18:17:17 WITA 2026
- Docs: added detailed push notifications phased plan and templates in docs/push_channel.md.

## Sun Feb  8 18:21:41 WITA 2026
- Docs: expanded push notification phase tasks with step-by-step instructions.
## Sun Feb  8 15:23:06 WITA 2026
- Mobile (pm-tech): re-register push token when push notifications are enabled.
- Mobile (pm-tech): export registerDeviceToken for reuse.
## Sun Feb  8 14:59:55 WITA 2026
- Mobile (pm-tech): fixed assets:android script to use @capacitor/assets generate.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Sun Feb  8 14:52:12 WITA 2026
- Mobile (pm-tech): added assets:android script to regenerate Android icons/splash from assets/logo.png.

## Sun Feb  8 14:34:06 WITA 2026
- Mobile (pm-tech): replaced Android app icons and splash assets with new logo.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Sun Feb  8 12:04:41 WITA 2026
- Mobile (pm-tech): made PM Now role gating case-insensitive.
- Backend: /api/auth/me and /api/auth/refresh now reload roles from DB.
- Backend: role middleware checks are now case-insensitive.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Sun Feb  8 13:27:51 WITA 2026
- Mobile (pm-tech): PM Task Detail asset name now links to Asset Detail.
- Mobile (pm-tech): PM Task Detail now shows asset notes from Asset Detail.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Sun Feb  8 08:51:08 WITA 2026
- Mobile (pm-tech): added submit-for-approval, revise/reject modals, and strict role-based edit locks.
- Mobile (pm-tech): superadmin can edit only during PendingSuperadmin review (not after Approved).
- Mobile (pm-tech): surfaced rejection reason and revision note on Task detail.
- Backend: enforced approval-state edit locks on evidence upload/delete endpoints.
- Backend/DB: added revised audit fields (RevisedAt, RevisedByUserId, RevisionNote) and returned them in task detail.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Sun Feb  8 08:57:53 WITA 2026
- Mobile (pm-tech): made checklist and evidence editing read-only for Supervisor/Admin.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Sun Feb  8 11:01:34 WITA 2026
- Mobile (pm-tech): Home Resolve Now now opens PM Tasks on the Overdue tab.
- Mobile (pm-tech): PM Tasks page supports deep-linking via /tasks?tab=overdue.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Sun Feb  8 12:04:28 WITA 2026
- Backend: added /api/devices/push-test to send FCM test notification to registered tokens.
- Web: added Notifications page “Push Test” button.
- Mobile (pm-tech): registers push token and calls /api/devices/register after login.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Sun Feb  8 12:35:20 WITA 2026
- Backend: added Firebase Admin SDK support for push (service account path/base64 env).
- Backend: /api/devices/push-test and notifications job now prefer Admin SDK, fallback to legacy key.
- Repo: ignored firebase-adminsdk JSON files to prevent committing secrets.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Sun Feb  8 12:43:52 WITA 2026
- Backend: push-test returns detailed failure reasons and configUsed.
- Backend: Firebase Admin init failures no longer block legacy FCM fallback.
- Web: Push Test toast shows first failure reason for faster debugging.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Sun Feb  8 12:48:50 WITA 2026
- Backend: improved CORS allowlist to support wildcard origins via FRONTEND_ORIGIN.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Sat Feb 14 16:30:50 WITA 2026
- Docker: fixed missing closing quote in mobile/secure-apk/docker-compose.yml CIFS options.

## Sun Feb  8 12:54:30 WITA 2026
- Backend: CORS error now logs the rejected Origin to simplify production setup.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Sun Feb  8 13:05:25 WITA 2026
- Docker: included https://pmit.merdekabattery.com in default FRONTEND_ORIGIN for api service.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Sun Feb  8 13:13:05 WITA 2026
- Backend: allow Capacitor Android origin http://localhost for CORS.
- Docker: added http://localhost to default FRONTEND_ORIGIN for api service.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Sun Feb  8 13:58:34 WITA 2026
- Mobile (pm-tech): disable submit-for-approval while task is paused.
- Mobile (pm-tech): disable pause/resume actions when approval is locked.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Sun Feb  8 14:04:37 WITA 2026
- Mobile (pm-tech): persist checklist draft through evidence uploads.
- Mobile (pm-tech): keep draft values when reloading task detail.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Sun Feb  8 15:28:03 WITA 2026
- Mobile (pm-tech): add My Tasks filter view using assigned=me.
- Mobile (pm-tech): add My Tasks shortcut icon in Tasks header.
- Mobile (pm-tech): update Home My Tasks button to open assigned=me.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Sun Feb  8 13:53:22 WITA 2026
- Mobile (pm-tech): allow any file type for task and checklist attachments.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Sun Feb  8 13:35:30 WITA 2026
- Docker: mounted evidence storage into api container for checklist evidence download.
- Docker: added EVIDENCE_STORAGE_HOST_PATH volume mapping to /app/shared-documents.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Sun Feb  8 13:25:13 WITA 2026
- Mobile (pm-tech): made attachment preview fullscreen.
- Mobile (pm-tech): added pinch-to-zoom and pan for image attachments.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Sun Feb  8 08:43:43 WITA 2026
- Mobile (pm-tech): added Capacitor Android scaffolding (appId com.merdekatsingshan.pmtech, appName MTI Mobile PM).
- Mobile (pm-tech): added biometric login using native secure storage for refresh token (kept on logout).
- Mobile (pm-tech): updated Vite base for Capacitor production builds.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Sun Feb  8 08:51:21 WITA 2026
- Mobile (pm-tech): added build:android script (build + sync + open Android Studio).
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Sun Feb  8 09:30:39 WITA 2026
- Mobile (pm-tech): enabled Scan QR on Home and Asset Detail to open scanned asset.
- Mobile (pm-tech): added Capacitor MLKit barcode scanner and Android camera config.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Sun Feb  8 09:55:30 WITA 2026
- Mobile (pm-tech): fixed Scan QR tap behavior by removing false-disabled state.
- Mobile (pm-tech): centralized scanner logic and improved error handling.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Sun Feb  8 10:22:06 WITA 2026
- Mobile (pm-tech): wired Scan QR / Barcode button in Asset Lookup.
- Mobile (pm-tech): expanded scanner to accept barcodes in addition to QR.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Sun Feb  8 11:01:54 WITA 2026
- Mobile (pm-tech): added page transition animation between routes.
- Mobile (pm-tech): animated Assets/Facilities sidebar drawer open/close.
- Mobile (pm-tech): added subtle active-state animation on bottom nav.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Sun Feb  8 03:50:19 WITA 2026
- Mobile Login: added subtle enter animations (fade/slide) for hero and card.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Sun Feb  8 03:48:30 WITA 2026
- Mobile Login: made login screen full-screen (no scrolling) by reducing hero height and spacing.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Sun Feb  8 03:45:11 WITA 2026
- Mobile Profile & Settings now shows authenticated user data and sync status.
## Sun Feb  8 04:20:22 WITA 2026
- Mobile Asset Detail now loads the real asset image from /api/assets/:id/image.
- Added mobile API helper to download asset images with auth.

## Sun Feb  8 04:26:21 WITA 2026
- Mobile Asset Detail now prefers asset imageUrl when available, falling back to image endpoint.

## Sun Feb  8 04:30:07 WITA 2026
- Mobile Asset Detail image now uses contain to avoid cropping.

## Sun Feb  8 04:44:37 WITA 2026
- Mobile Home Dashboard: removed duplicate Report Breakdown button.

- Added theme mode, accent selection, and push toggle state persisted locally.
- Profile sync now refreshes user from /api/auth/me and updates last sync timestamp.

## Sun Feb  8 03:29:59 WITA 2026

## Sun Feb  8 03:29:59 WITA 2026
- Mobile PM History: display checklist evidence attachments on Task detail.
- Added evidence download APIs for checklist evidence and task evidence.
- Verified with `npm run lint` and `npx tsc --noEmit -p mobile/pm-tech/tsconfig.json`.

## Sun Feb  8 03:35:31 WITA 2026
- Mobile PM History: made completed PM tasks read-only (disable checklist toggles).
- Verified with `npm run lint` and `npx tsc --noEmit -p mobile/pm-tech/tsconfig.json`.

## Sun Feb  8 03:43:40 WITA 2026
- Mobile Asset Detail: added PM Now action for Supervisor/Admin/Superadmin.
- Added mobile API helper for POST /api/tasks/pm-now (handles duplicate by returning existing task id).
- Verified with `npm run lint` and `npx tsc --noEmit -p mobile/pm-tech/tsconfig.json`.

## Sat Feb  7 22:44:55 WITA 2026
- Mobile Work Orders: wired list to /api/work-orders with status tabs and search.
- Added Work Order detail screen with CM metadata, checklist, evidence upload, and lifecycle actions.
- Added Report Breakdown form with asset/facility targeting and navigation from Asset Detail.

## Sat Feb  7 22:38:26 WITA 2026
- Added mobile Facilities list with search and location filters and a new /facilities route.
- Added Assets/Facilities sidebar switcher in mobile Assets and Facilities headers.
- Added mobile facilities API client types and list call.
- Verified with `npm run lint` and `npx tsc --noEmit -p mobile/pm-tech/tsconfig.json`.

## Sat Feb  7 20:56:00 WITA 2026
- Mobile Home: replaced mock data with real API calls using apiListTasks.
- Added state for user profile (getMe), stats (today, week, overdue, done), and task lists.
- Implemented real-time stats calculation based on apiListTasks results.
- Added loading states and empty state handling.
- Verified with typecheck and lint.

## Sat Feb  7 20:49:46 WITA 2026
- Phase 3 PM Tasks: wired Tasks list and Task detail in mobile.
- Implemented apiListTasks and lifecycle actions: start, pause, resume, complete.
- Tasks page fetches assigned=me with filters; Task detail loads metadata and checklist, buttons call server.
- Verified with typecheck and lint.

## Sat Feb  7 20:45:24 WITA 2026
- Phase 2 Models & API Client: added typed models (Asset, Task, WorkOrder) and shared helpers apiGet/apiPost with normalized ApiError.
- Extended mobile lib/api.ts with TaskDetail, TaskListItem, WorkOrder list/detail shapes aligned to backend.
- Centralized JSON serialization and bearer header handling; 401 auto-refresh remains in apiFetchJson.
- Verified typecheck and lint for mobile.

## Sat Feb  7 20:38:47 WITA 2026
- Fixed runtime error "tailwind is not defined" by removing CDN Tailwind inline config from pm-tech/index.html; project now uses build-time Tailwind.
- Removed importmap block referencing CDN React modules; Vite bundler handles all imports.
- Added inline SVG favicon link to prevent /favicon.ico 404 in mobile dev.
- Verified with `npm run lint` and `npx tsc --noEmit -p mobile/pm-tech/tsconfig.json`.

## Sat Feb  7 20:34:59 WITA 2026
- Phase 1 Auth & Session for mobile: added lib/auth.ts with in-memory tokens and local storage fallback.
- Implemented lib/api.ts with API_BASE_URL, apiFetchJson, login, refresh, and getMe.
- Added providers/AuthProvider.tsx and wrapped App with AuthProvider; ProtectedRoute now checks context.
- Refactored Login page to call backend /api/auth/login, provider selection, and error handling; offline routes moved to public.
- Updated mobile tsconfig to include vite/client types; verified `npx tsc --noEmit -p mobile/pm-tech/tsconfig.json` and repo `npm run lint`.

## Sat Feb  7 20:30:17 WITA 2026
- Phase 0 mobile hardening: configured VITE_API_BASE_URL and removed exposed GEMINI keys from Vite define.
- Replaced Tailwind CDN with build-time Tailwind (added tailwind/postcss configs and index.css; imported in index.tsx).
- Backend CORS: updated FRONTEND_ORIGIN to include http://localhost:3000 and http://127.0.0.1:3000.
- Ran `npm run lint`, `npx tsc --noEmit -p mobile/pm-tech/tsconfig.json`, and `npx tsc --noEmit -p backend/tsconfig.json`; all passed.

## Sun Feb  1 02:31:52 UTC 2026
- PM Task Approval Workflow 6.2: added backend approval endpoints.
- API: POST /api/tasks/{taskId}/submit-for-approval sets ApprovalStatus=PendingSupervisor and technician completion trail.
- API: POST /api/tasks/{taskId}/approve-by-supervisor transitions to PendingSuperadmin.
- API: POST /api/tasks/{taskId}/approve-by-superadmin finalizes approval, sets Approved, and updates AssetPMSettings with NextPMDueAt.
- API: POST /api/tasks/{taskId}/reject-approval allows supervisor or superadmin to reject; optional reopen.
- OpenAPI: documented approval workflow endpoints under backend entrypoint.
- Verified repository with `npx tsc --noEmit` and `npm run lint`.

## Sun Feb  1 02:38:54 UTC 2026
- PM Task Approval Workflow 6.3: surfaced approval state in tasks APIs.
- Tasks list: added approvalStatus and approver/submission fields (technician/supervisor/superadmin).
- Task detail: included full approval metadata for display and audit.
- Asset PM history: added approvalStatus field and optional approvedOnly filter.
- Verified repository with `npx tsc --noEmit` and `npm run lint`.

## Sun Feb  1 02:39:52 UTC 2026
- Reports: added optional approvedOnly filter to compliance summary and CSV.
- Compliance metrics can count only Approved tasks when requested.
- Verified repository with `npx tsc --noEmit` and `npm run lint`.

## Sun Feb  1 10:30:54 WITA 2026
- Notifications: added Test button on each channel row in Notifications page.
- Web: test button calls settings test APIs with per-channel overrides (Mail/WhatsApp).
- Verified with `npx tsc --noEmit` and `npm run lint`.

## Sun Feb  1 10:35:48 WITA 2026
- Notifications: disabled Test button for unsupported channel types (e.g., Teams).
- Button shows "Unsupported" tooltip when channel type cannot be tested.
- Re-ran `npx tsc --noEmit` and `npm run lint`; both passed.

## Sun Feb  1 10:39:48 WITA 2026
- Notifications: updated Reminder Rule flow to match new implementation.
- Event options limited by type (Reminder: Due/Overdue; Escalation: Overdue).
- Channel display uses channel name in Rule modal and rule cards.
- Verified with `npx tsc --noEmit` and `npm run lint`.

## Sun Feb  1 10:46:26 WITA 2026
- Notifications: Test button now stops row click; no edit modal opens.
- Clicking Test only runs the test and shows a toast result.
- Re-ran `npx tsc --noEmit` and `npm run lint`; both passed.

## Sun Feb  1 10:23:15 WITA 2026
- PM Task Approval Workflow 6.1: extended DB schema for approval tracking.
- DB: pm.PMTasks added ApprovalStatus (default None, enum constraint) and approval trail fields:
- TechnicianCompletedAt/TechnicianCompletedByUserId, SupervisorApprovedAt/SupervisorApprovedByUserId, SuperadminApprovedAt/SuperadminApprovedByUserId with FKs to pm.Users.
- Verified repository with `npx tsc --noEmit` and `npm run lint`.

## 2026-02-01 09:09:02 WITA
- Notifications: applied per-channel overrides in backend delivery job.
- Email: channel to/cc/bcc merge mode (override/append), sender and templates.
- WhatsApp: channel base URL, target, number/group, and mentions merged.
- Updated queue processor to load channel config and compute effective settings.
- Ran `npx tsc --noEmit` (root + backend) and `npm run lint`; all passed.

## 2026-02-01 09:25:52 WITA
- Notifications: added per-channel display name across DB, API, and UI.
- DB: pm.NotificationChannels.ChannelName with create-time and migration add.
- API: channels list includes channelName; create/update accept channelName.
- UI: Channel modal has Name field; list shows channelName fallback to type.
- Ran `npx tsc --noEmit` and `npm run lint`; both passed.

## 2026-02-01 10:19:44 WITA
- Notifications: implemented delete channel backend route and UI confirmation.
- Backend: DELETE /api/notifications/channels/:channelId with reference checks.
- Frontend: Delete button with AlertDialog confirm; shows errors if references exist.
- Ran `npx tsc --noEmit` and `npm run lint`; both passed.

## 2026-02-01 10:21:53 WITA
- Fix: added missing AlertDialogTrigger import to Notifications.tsx to resolve runtime error.
- Verified with `npx tsc --noEmit` and `npm run lint`.

## 2026-01-31 13:18:10 UTC
- CM Work Orders: added superadmin-only delete endpoint (DELETE /api/work-orders/:taskId).
- Deletes DB rows and unlinks stored evidence files when configured.
- Web: added Delete button on Work Order Detail for superadmins with confirmation dialog.
- Wired frontend API client (apiDeleteWorkOrder) and cache invalidation.
- Ran `npx tsc --noEmit` and `npm run lint` after changes.

## 2026-01-31 13:08:38 UTC
- Asset Detail: added CM History tab and CM incident count.
- Implemented cmHistoryQuery using apiListWorkOrders filtered by asset and status.
- Restricted PM History to PM-only by passing maintenanceType="PM".
- Updated stats grid to include CM Incidents card.
- Ran `npx tsc --noEmit` and `npm run lint` after changes.

## 2026-01-31 20:36:41 WITA
- CM Work Orders: removed checklist UI/logic from Work Order detail.
- Added ResolutionNotes column to PMTasks schema.
- Implemented backend endpoint POST /api/work-orders/:taskId/resolution to save free-text notes.
- Extended work order detail API to return resolutionNotes.
- Updated web UI Resolution card with editable Textarea and Save action.
- Ran `npx tsc --noEmit` and `npm run lint`; both passed.

## Friday, January 23, 2026 5:18:16 PM
- Web: added Replace buttons for checklist attachments and task evidence in Task Detail.
- Renamed attachment action label from Preview to View for clarity.
- Confirmed attachment uploads happen immediately to the server when files are attached.
- Ran `npm run lint` and `npx tsc --noEmit`; both passed.

## Friday, January 23, 2026 5:22:50 PM
- Mobile: added apiDownloadChecklistEvidence and apiDeleteChecklistEvidence in mobile client.
- Fixed type predicate in TaskDetailPage for checklist evidence mapping.
- Verified mobile lint (warnings only) and typecheck passes.

## 2026-01-23 10:05:57 +08:00
- Updated docker-compose FRONTEND_ORIGIN to allow mobile dev origins (http://localhost:8081) and Capacitor (capacitor://localhost) via env default.
- This resolves CORS preflight failures when the mobile app calls ngrok-hosted API.
- Next: restart api service to apply env change; verify /api/auth/login preflight succeeds.
## 2026-01-23 16:59:41 +08:00
- Mobile: enabled starting overdue tasks on TaskDetailPage and added refetch after start/pause/resume/cancel.
- Fixed JSX variable scope by moving action gating booleans out of render.
- Ran mobile lint and typecheck; warnings only, no errors.
- Audited web PM Tasks: Start allowed for open/scheduled; parity confirmed.
## Thursday, January 22, 2026 3:02:02 PM
- Implemented Phase 1 PM backend validation updates (category enforcement, assignment fallback, PM Now errors).
- Standardized error responses for PM-related endpoints to use code and details fields.
- Ran `npm run db:verify`, `npm run lint`, and `npx tsc --noEmit`.

## 2026-01-22 14:10:00
- Added CM reporting backend for breakdowns, MTTR, and monthly incidents.
- Extended compliance and overdue reports with PM/CM maintenance type filter and CSV exports.
- Implemented CM Metrics card and overview widget on Reports page with Shadcn UI.
- Wired CM metrics CSV export on web and documented Reports behavior in README.

## 2026-01-22 13:08:59 PM
- Added CM reported by/channel and downtime fields to Work Order detail response and UI.
- Added Close Downtime action in Work Order detail.
- Updated README with downtime detail note.

## 2026-01-22 12:57:50 PM
- Fixed backdateMode scope ordering in Work Order detail to satisfy TypeScript.

## 2026-01-22 12:52:04 PM
- Wired Work Orders list row click and View button to the detail route.
- Updated README with Work Order detail route notes.
- Ran `npm run lint` (ESLintIgnoreWarning about .eslintignore) and `npx tsc --noEmit`.

## 2026-01-22 12:36:58 PM
- Added PM Task Enhancement Plan document with phased roadmap and specs.
## Sun Jan 25 12:57:05 WITA 2026
- Updated scheduling day and calendar projections to respect asset broken state and frozen schedules.
- Ensured projected events are suppressed for broken assets and frozen schedules while existing tasks remain visible.
- Ran `npm run lint` and `npx tsc --noEmit` in repo root.
## Sun Jan 25 20:08:46 WITA 2026
- Extended GET /api/scheduling/day to include per-item estimatedMinutes based on template EstimatedDurationMinutes with a 60-minute fallback when null.
- Verified asset, facility, and projected occurrences return estimatedMinutes for capacity calculations.
- Ran `npm run lint` and `npx tsc --noEmit` after backend changes.
## Sun Jan 25 20:29:44 WITA 2026
- Extended GET /api/scheduling/calendar to compute CapacityMinutes per date using the same estimated duration rules as the day API.
- Calendar response items now include capacityMinutes alongside bucketed counts for each date.
- Ran `npm run lint` and `npx tsc --noEmit` after calendar capacity changes.
## Sun Jan 25 21:40:26 WITA 2026
- Updated Scheduling page to display per-day capacity badges in the calendar based on total estimated minutes versus an 8-hour threshold.
- Added a capacity summary card for the selected date showing used versus threshold minutes and overall utilization.
- Exposed per-task estimatedMinutes in the day view and updated README to document the new capacity overlays.
## 2026-01-22 13:00:12
- Added PM Now idempotency settings with env fallback and system endpoints.
- Enforced PM Now idempotency checks for assets and facilities.
- Added unique indexes to prevent duplicate PM tasks per due time.
- Verified with `npm run lint`, `npx tsc --noEmit`, and `npm --prefix backend run typecheck`.


## 2026-01-22 12:42:16 PM

## 2026-01-22 12:42:16 PM
- Expanded PM Task Enhancement Plan with detailed phase breakdowns and rollout checklist.

## 2026-01-21 05:44:31 WITA
- Mounted CM Work Orders API router at /api/work-orders (backend).
- Extended OpenAPI docs with Work Orders schemas and endpoints.
- Verified repo lint and typecheck (frontend + backend).

## Wed Jan 21 06:04:05 WITA 2026
- Added Work Orders web page (`/work-orders`) with filters and list layout.
- Registered Work Orders route and sidebar navigation entry.
- Implemented reusable Report Breakdown dialog component.
- Integrated Report Breakdown into Asset Detail and Facility Detail pages.
- Ran `npm run lint` and `npx tsc --noEmit` locally to validate.

## 2026-01-20 23:47:57 WITA
- Split PM checklist attachments into Enable Attachment vs Attachment Required flags.
- Updated template DB schema, backend APIs, and web UI to expose both flags.
- Enforced mandatory checklist items to require non-skip outcomes with notes.
- Adjusted task completion validation and UI to respect new attachment semantics.
- Verified with `npm run lint` and `npx tsc --noEmit`.

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
## 2026-01-31 13:21:56 UTC
- Verified CM work order delete feature (backend + web).
- Confirmed superadmin-only delete button with confirmation dialog in Work Order Detail.
- Ran `npx tsc --noEmit` and `npm run lint`; both passed.
## 2026-02-01 00:25:28 UTC
- Work Order: Report Breakdown dialog now queries Notification Channels.
- Added Select of active channels with Custom entry fallback.
- wired apiListNotificationChannels and updated payload pass-through.
- Ran `npx tsc --noEmit` and `npm run lint`; both passed.
## 2026-02-01 00:37:53 UTC
- Refined Report Breakdown channel picker per clarifications.
- Shows only active channels; defaults to "web" if available, else first active.
- Removed custom and none options; labels use channelType strictly.
- Ran `npx tsc --noEmit` and `npm run lint`; both passed.
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

## Sun Jan 25 11:43:35 WITA 2026
- Added PM Task Enhancement Delta Plan document capturing concrete implementation gaps and next steps.
- Documented facility scheduling job work, broken/frozen behavior, capacity overlays, and OpenAPI deltas.
- No code changes yet; this is a planning-only update.

## Sun Jan 25 12:05:11 WITA 2026
- Extended schedule calculation job to create facility PM tasks using facility candidates.
- Implemented facility-aware assignment resolution and IF NOT EXISTS guard aligned with facility unique index.
- Verified repository lint and TypeScript typecheck with `npm run lint` and `npx tsc --noEmit`.

## Sun Jan 25 12:22:45 WITA 2026
- Extended schedule calculation job to maintain FacilityPMSchedules and FacilityPMSettings for facilities.
- Mirrored Scheduling recalc endpoint logic: MERGE pm.FacilityPMSchedules and update LastPMCompletedAt/NextPMDueAt via pm.FacilityPMSettings.
- Ran `npm run lint` and `npx tsc --noEmit`; both completed successfully.

## Sun Jan 25 12:40:07 WITA 2026
- Updated schedule calculation job asset candidate query to exclude broken and archived assets.
- Used pm.Assets.AssetOperationalStatus to filter out `broken` and `archived` while keeping existing PMEnabled and IsArchived filters.
- Re-ran `npm run lint` and `npx tsc --noEmit`; both passed.

## Sun Jan 25 12:44:05 WITA 2026
- Taught schedule calculation job and manual recalc endpoint to respect Frozen flags in pm.PMSchedules and pm.FacilityPMSchedules.
- Asset and facility candidate queries now join to schedules and skip rows where Frozen = 1, preventing new tasks and schedule/NextPMDueAt updates while frozen.
- Verified with `npm run lint` and `npx tsc --noEmit` for the full repo.

## Sun Jan 25 11:14:50 WITA 2026
- Installed frontend dependencies including pdf-lib and qrcode to support Label Designer.
- Resolved Vite module resolution errors for LabelDesigner imports.
- Ran `npm run lint` and `npx tsc --noEmit`; both completed successfully.

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

## 2026-01-19 23:31:09 WITA
- Added ngrok/ngrok.yml (version 3) defining api tunnel to api:5056.
- Updated docker-compose ngrok-api service to use `start --all --config /etc/ngrok/ngrok.yml` and mount config.

## 2026-01-22 16:37:54 +08:00

## Sun Jan 25 20:29:50 WITA 2026
- Extended GET /api/scheduling/calendar to compute daily CapacityMinutes using EstimatedDurationMinutes per occurrence.
- Updated backend calendar endpoint to return capacityMinutes per date alongside scheduled/due/overdue counts.
- Aligned web and mobile scheduling API client types with new capacityMinutes field.
- Ran `npm run lint` and `npx tsc --noEmit` in repo root; both completed successfully.
- Added Facilities clone feature (backend + frontend).
- Backend: POST /api/facilities/{facilityId}/clone with optional name and includePmSettings.
- Frontend: apiCloneFacility and Clone dialog on Facilities page.
- Ensures unique names and optional PM settings copy.
- Verified with `npm run lint`, `npx tsc --noEmit`, and backend typecheck.
- Started dev servers; frontend available at http://localhost:8082/.
- Kept NGROK_AUTHTOKEN in .env (no secrets in repo) and passed to container.
- Guidance: ensure only one ngrok agent session (stop local dev agent) to avoid ERR_NGROK_108.
- Verified repo lint and typecheck.

## 2026-01-19 23:39:57 WITA
- Added gist-watcher service to docker-compose to update discovery Gist from server ngrok API.
- Uses node:22-alpine, mounts repo read-only, and reads credentials from .env.
- Configures NGROK_API_URL=http://ngrok-api:4040/api/tunnels with poll interval override.
- Verified repo lint and typecheck; warnings only.

## 2026-01-19 23:43:10 WITA
- Removed dotenv dependency from gist-watcher; use envs provided by docker compose.
- Fixed container failure (ERR_MODULE_NOT_FOUND for dotenv) in server environment.
- Re-ran repo lint and typecheck; passed.

## 2026-01-20 05:40:44 WITA
- Added health-check loop to gist-watcher to log ngrok API reachability and status codes.
- Verified repo lint and typecheck; passed.

## 2026-01-05 16:19
- Re-verified bulk PM template assignment and Asset Detail PM history wiring.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## 2026-01-05 17:28
- Implemented backdated evidence importer job (file move + task/evidence creation + duplicate handling).
- Added System Settings UI to run evidence import with template and duplicate options.
- Added system endpoint to trigger evidence import and new env/scheduler toggles.
## Sun Jan 25 11:41:09 WITA 2026
- Mobile: added Push Notifications Debug section on Profile page to register device tokens.
- Uses Capacitor PushNotifications to request permissions, register, and call /devices/register.
- Exposes FCM token in-app so backend or Firebase console can send test pushes.
- Updated mobile README with steps to test push notifications.
## Sun Jan 25 11:59:15 WITA 2026
- Mobile: changed Push Notifications Debug to reuse stored push_token from login instead of calling PushNotifications again.
- AuthProvider now saves the FCM token to Preferences/localStorage at registration time.
- Profile page button now reads stored token and only calls /devices/register, avoiding native crashes.
- Fixed backend import path resolution for evidence import job wiring.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## 2026-01-05 18:09
- Configured evidence import and storage roots in .env for Docker-mounted share.

## 2026-01-05 18:43
- Added Dockerfiles and docker-compose for web (9102) and api (5056).

## 2026-01-05 18:51
- Added CIFS-based docker compose override for mounting SMB share in Docker.

## Wed Jan 21 06:36:47 WITA 2026
- Updated Task Detail checklist progress to track in-dialog checklist draft outcomes.
- Fixed evidence upload backend to support facility-level PM tasks (no required AssetId).
- Ran `npm run lint` and `npx tsc --noEmit` after changes.

## Wed Jan 21 06:30:09 WITA 2026
- Fixed backend Work Orders list handler missing @assigned parameter input.

## Sun Feb  8 03:54:42 WITA 2026
- Extended pm.Assets schema with ImageUrl column and applied schema to SQL Server.
- Updated Snipe-IT sync job to capture hardware image field into pm.Assets.ImageUrl.
- Exposed imageUrl in assets list and detail APIs and OpenAPI schema.
- Wired web API client types to include Asset.imageUrl.
- Added responsive asset image preview on Asset Detail header card (web).
- Ran `npm run db:apply-schema`, `npm run lint`, and `npx tsc --noEmit`; all succeeded.
- Updated Task Detail dialog to avoid empty Select values (backdate technician, checklist outcomes).
- Verified with `npx tsc --noEmit` and `npm run lint`.

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

## 2026-01-20 23:44:22 WITA
- Fixed backdateMode ReferenceError by scoping backdate state inside TaskDetailDialog.
- Reset backdate form fields whenever the Task Detail dialog opens.
- Ran `npm run lint` successfully.

## 2026-01-21 05:56:57 WITA
- Fixed db/schema.sql EnableAttachment migration block to use EXEC dynamic SQL.
- Successfully ran `npm run db:apply-schema` against SQL Server without errors.
- Verified TypeScript types with `npx tsc --noEmit`.

## 2026-01-21 06:05:51 WITA
- Added technician lookup dropdown to backdate Technician name(s) field in Task Detail.
- Limited lookup options to active users with Technician role.
- Verified with `npm run lint` and `npx tsc --noEmit`.

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

## Sun Feb  8 04:01:11 WITA 2026
- Extended pm.Assets schema with ImageData, ImageContentType, and ImageFileName columns for Snipe-IT images.
- Updated Snipe-IT sync job to download hardware image binaries and store them in pm.Assets.
- Kept ImageUrl string for compatibility while persisting full binary, content type, and file name.
- Re-applied `npm run db:apply-schema` and verified database migration.
- Ran `npm run lint` and `npx tsc --noEmit`; both completed successfully.

## Sun Feb  8 04:11:58 WITA 2026
- Added /api/assets/{assetId}/image endpoint to stream stored asset image binary.
- Updated OpenAPI spec to document asset image download endpoint and binary response type.
- Verified backend changes with `npm run lint` and `npx tsc --noEmit`.

## 2026-01-17 21:24
- Added ngrok GitHub Gist watcher script and npm task
- Exported API_BASE_URL and added apiHealth in web client
- Added Connection Status card in System Settings page
- Updated README with ngrok gist discovery usage

## 2026-01-18 08:31
- Updated ngrok gist watcher to load .env automatically
- Re-ran lint and typecheck; no issues

## 2026-01-18 08:42
- Added ngrok docker-compose sidecar service (ports 4040, depends on api)
- Appended NGROK_AUTHTOKEN entry to .env for container auth
- Verified with `npm run lint` and `npx tsc --noEmit`

## 2026-01-18 08:45
- Added dev script to run ngrok + gist watcher together (ngrok:full)
- Updated README with dev shortcuts for ngrok:full
- Verified with `npm run lint` and `npx tsc --noEmit`

## 2026-01-18 08:49
- Updated ngrok:full to accept NGROK_AUTHTOKEN via --authtoken flag
- Re-verified lint and typecheck

## 2026-01-16 07:49
- Updated PM Tasks stats to exclude cancelled tasks from Due Today and Overdue counts.
- Updated Due Today tab to hide tasks whose backend status is cancelled.
- Added a Cancelled status badge style for cancelled tasks on the PM Tasks list.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## 2026-01-16 07:59
- Added a Cancelled tab on PM Tasks to show historical cancelled tasks.
- Wired Cancelled tab to backend status=cancelled while keeping Due Today/Overdue counts unchanged.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## 2026-01-16 07:52
- Added `AssetOperationalStatus` (operational/broken/archived) to pm.Assets for PM reference.

## 2026-01-20 06:03:02 WITA
- Updated mobile TasksPage mapping to display facility-based PM tasks alongside asset tasks.
- Added optional facilityId filter handling in mobile task list and range-based fetching.
- Ran `npm run lint` and `npx tsc --noEmit` after changes.
- Synced `AssetOperationalStatus` from Snipe-IT status labels and displayed it in Assets + Asset Detail.
- Archived missing assets during Snipe-IT sync to preserve historical PM data.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## 2026-01-16 08:00
- Fixed schema apply failure by deferring `AssetOperationalStatus` references via dynamic SQL.
- Applied schema successfully and verified `pm.Assets.AssetOperationalStatus` exists.

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

## 2026-01-16 08:09
- Added an Operational column filter on Assets table (All/Operational/Broken/Archived).
- Wired Assets list API to accept operationalStatus query and filter by AssetOperationalStatus.
- Updated OpenAPI docs and frontend apiListAssets signature for operationalStatus.

## 2026-01-16 08:10:14 WIB
- Optimized Snipe-IT asset sync to avoid per-asset category/location DB lookups.
- Made Snipe-IT status mapping tolerate labels like "Broken - ..." and "Archived - ...".
- Ensured Snipe-IT sync run rows are completed even if system logging fails.
- Verified with `npm run lint` and `npx tsc --noEmit`.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## 2026-01-16 09:07:39 WIB
- Updated evidence import asset-key detection to treat patterns like "MTI-PC-LAB 001" as distinct from "MTI-PC-LAB 002".
- This prevents backdated evidence for numbered assets from being grouped under a single asset folder.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## 2026-01-16 09:47:11 WIB
- Added per-task Assign/Reassign button on PM Tasks list for managers (Supervisor/Admin/Superadmin).
- Added technician selector dialog filtered to users with Technician role.
- Wired assignment to task assign API and refreshed tasks + stats after save.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## 2026-01-16 09:53:57 WIB
- Users & Roles: displayed mobile phone on user rows (AD phone is sourced from LDAP telephoneNumber).
- Verified with `npm run lint` and `npx tsc --noEmit`.

## 2026-01-16 09:59:46 WIB
- Fixed AD mobile phone mapping to prefer LDAP `mobile` (fallback `telephoneNumber`).
- Users & Roles: always shows a Mobile line for AD users (shows "—" when missing).
- Verified with `npm run lint` and `npx tsc --noEmit`.

## 2026-01-16 15:16:23 WIB
- Improved LDAP phone extraction to handle common AD fields and multi-valued attributes.
- Added per-user action to refresh AD profile and persist phone/email/display name.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## 2026-01-16 15:24:16 WIB
- Added backend test script to refresh LDAP profile and print before/after phone for users.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## 2026-01-16 15:35:28 WIB
- Re-verified lint and typecheck after LDAP mobile phone fixes.

## 2026-01-16 15:49:07 WIB
- Ran bulk LDAP profile refresh test for all AD users in the system.
- Verified mobile phone fields are populated from LDAP and shown in Users & Roles.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## 2026-01-20 06:16:38 WITA
- Fixed Dashboard duplicate React keys by using task id for Recent Tasks entries.
- Eliminated warning about two children with the same key.
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

## 2026-01-16 02:33:19 UTC
- Added Scheduling UI dialog to create, edit, and deactivate auto-assignment rules.
- Added bulk assignment action to set assignee for unassigned open tasks.
- Added audit log entries for task assignment changes and bulk assignment.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## 2026-01-15 17:20
2026-01-15 17:20:33 UTC
- Restricted users to exactly one role
- Frontend: switched Edit User roles to single-select RadioGroup
- Backend: enforced single role via UpdateUserRolesSchema length(1)
- Ran `npm run lint` and `npx tsc --noEmit`: OK

## 2026-01-07 13:38:26 WIB
- Implemented JWT refresh tokens on backend (sign/verify, env REFRESH_TOKEN_EXPIRES_IN).

## 2026-01-25 22:49:13 WITA
- Added unified Report Breakdown bottom sheet component for the Field-Ready mobile app.
- HomePage: surfaced a Report Breakdown quick action that opens the unified sheet.
- AssetDetailPage: wired the Corrective Maintenance card to reuse the unified sheet with the current asset pre-selected.
- Unified flow supports both asset and facility breakdowns and routes to Work Order detail after creation.
- Verified with `npm run lint`.
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

## 2026-01-16 16:19:13 WIB
- Enabled `task_assigned` as an Event option when creating/editing notification rules.
- Updated Notifications UI to label `task_assigned` rules as "On Assignment" and clarify timing behavior.
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

## 2026-01-16 16:43:50 WIB
- Added `{{technicianNumber}}` placeholder to notification rule templates, populated from the assigned technician's phone.
- Updated Notifications UI helper text and README to document `{{technicianNumber}}` and show an @{{technicianNumber}} WhatsApp mention example.
- Verified with `npm run lint` and `npx tsc --noEmit`.
- Bumped API version to 1.0.1 in Swagger info.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## 2026-01-16 09:27:48 WIB
- Added backend DELETE /api/tasks/{taskId} to remove mistaken PM tasks and evidence.
- Added frontend apiDeleteTask and Asset Detail PM History delete action for managers.
- Verified with `npm run lint` and `npx tsc --noEmit`.

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

## Sun Jan 18 19:30:13 WITA 2026
- Investigated mismatch between web Dashboard overdue stats and mobile Home overdue count.
- Updated mobile HomePage task mapping to treat cancelled tasks as "cancelled" instead of overdue and exclude them from overdue/today/week stats.
- Extended mobile StatusBadge/TaskCard to support paused/cancelled statuses and verified with npm run lint and npx tsc --noEmit.

## 2026-01-16 16:49:10 WIB
- Enabled editing for reminder notification rules on the Notifications page using the same rule dialog as escalation rules.
- Added inline edit icon next to Reminder rule timing badge so users can update templates like @{{technicianNumber}} without recreating rules.
- Verified with `npm run lint` and `npx tsc --noEmit`.

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

## 2026-01-21 06:13:06 WITA
- Added Create Work Order action in PM Task Detail dialog to report breakdowns directly.
- Integrated ReportBreakdownDialog to pre-fill asset or facility from the PM task.
- Updated backend task detail response to include maintenanceType and facility fields.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## 2026-01-21 06:16:33 WITA
- Fixed Select components to avoid empty string values in items (Radix Select requirement).
- Updated Work Orders filters and Report Breakdown dialog to use sentinel values and map to cleared selections.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## 2026-01-16 01:19:26 WIB
- Added Task Detail Reopen action for managers to restore cancelled tasks to `open`.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## 2026-01-16 15:31:59 WIB
- Updated reminder job to target assigned technicians via their email and WhatsApp number, falling back to global recipients when no assignee is present.
- Added UI help text for notification templates, listing supported placeholders and how the per-rule message is rendered.
- Clarified the Notification Channel "Config (JSON or text)" field as optional metadata for integrator notes or external IDs (not required for the built-in reminder job).

## 2026-01-16 15:43:39 WIB
- Refined Notifications page copy with a "How notifications work" panel explaining reminder/escalation flow, technician targeting, and placeholder rendering.
- Enhanced rule Message Template helper text with available placeholders and a concrete example matching the backend default template.

## Thursday, January 22, 2026 8:20:37 AM
- Switched local main branch to commit fc4f527 (feat: PM→CM workflow and facility support).
- Forced updated origin/main to fc4f527 per request.
- Verified backend typecheck and frontend lint/build after switch.

## Thursday, January 22, 2026 8:22:58 AM
- Added git utility script to force origin/main to a specified commit.
- Script: `npm run git:force-main -- <commit>` with optional flags `--remote`, `--branch`, `--dry-run`.
- Ran repository lint to validate changes.

## Thursday, January 22, 2026 8:33:27 AM
- Fixed git force-main script to handle current HEAD on target branch using `git reset --hard`.
- Validated with dry-run and live run; origin/main now points to a275986.

## Thursday, January 22, 2026 11:10:46 AM
- Fixed PM Task Detail dialog cropping by restructuring layout: flex column container, scrollable body, wrapped header actions.
- Verified with lint and development build.

## 2026-01-22 11:39
- Added "Sync Categories from Snipe-IT" button on Settings → Categories page.
- Triggered backend job via POST /api/system/jobs/snipe-sync/run using apiRunJob.
- Superadmin-only access; shows success/error notifications; invalidates lookups after start.
- Verified with `npm run lint` and `npx tsc --noEmit`.
 - Added delayed re-fetches (3s, 7s) post-start to surface updated categories.

## 2026-01-22 11:53
- Updated Snipe-IT sync job to deactivate missing categories.
- Backend marks categories with SnipeCategoryId not in the latest Snipe list as Inactive.
- Logged deactivatedCategories count to system logs for visibility.
- Verified backend typecheck with `npm run typecheck --prefix backend`.

## 2026-01-22 13:14:52 +08:00
- Added SQL due-date primitive `pm.fn_CalculateNextDueAt` and routed schedule calc + calendar/day queries through it.
- Applied schema and verified via `npm run db:apply-schema` and `npm run db:verify`.
- Verified with `npm run lint` and `npx tsc --noEmit`.
\
## 2026-01-23 19:04:33 WITA
- Mobile: enforced PM-only filter by adding `maintenanceType=PM` to all `/tasks` requests in TasksPage.
- Backend: confirmed `/api/tasks` supports `maintenanceType` query with SQL condition `(@maintenanceType IS NULL OR t.MaintenanceType = @maintenanceType)`.
- Ensured overdue counts on mobile exclude CM tasks and align with backend reports.
- Ran mobile lint and typecheck (`npm run lint`, `npx tsc --noEmit`) and backend typecheck; all passed.

## 2026-01-23 19:08:08 WITA
- Web: fixed type mismatch in Tasks page by annotating `listQueryInput` as `Parameters<typeof apiListTasks>[0]`.
- Web: aligned stats fetching to PM-only by adding `maintenanceType: "PM"` to `apiListTasks` in `statsQuery`.
- Ran web lint and typecheck (`npm run lint`, `npx tsc --noEmit`); passed.

## 2026-01-23 19:12:50 WITA
- Mobile: mapped backend `cancelled` status to UI and excluded cancelled tasks from Today/This Week/Overdue counts.
- Updated TasksPage filters and count computations to ignore cancelled tasks.
- Re-ran mobile lint and typecheck; passed.

## 2026-01-23 19:14:43 WITA
- Mobile: restricted `/tasks` requests to `assigned=me` so the page reflects "My PM Tasks" only.
- Updated range-based fetching to include `assigned=me` for consistency.
- Re-verified lint and typecheck; passed.

## 2026-01-23 19:19:22 WITA
- Mobile: removed invalid date-only `dueFrom/dueTo` attempts in range fetch to avoid backend 400.
- Kept a single valid `dueFrom/dueTo` with ISO timestamps for calendar queries.
- Re-ran mobile lint and typecheck; passed.

## 2026-01-23 19:27:54 +08:00
- Backend: accepted date-only `dueFrom/dueTo` on `/api/tasks` by preprocessing to UTC day start/end.
- OpenAPI: updated `/api/tasks` query params to allow `date` or `date-time` with descriptions.
- Validation: ran web lint and typecheck (`npm run lint`, `npx tsc --noEmit`) and backend typecheck (`npm run typecheck`); passed.
- Outcome: mobile requests like `dueFrom=YYYY-MM-DD&dueTo=YYYY-MM-DD` now return 200 and filter correctly.

## 2026-01-24 09:34:48 +08:00
- Mobile: enhanced Tasks page to merge `assigned=me` and `assigned=unassigned` for list and range queries.
- Purpose: show both personal tasks and unassigned tasks so technicians see available work.
- Validation: ran mobile lint (`npm run lint`) – warnings only – and confirmed typecheck at repo root (`npx tsc --noEmit`) passes.

## 2026-01-24 15:51:09 +08:00
- Mobile: reverted HomePage to original task fetch scope to avoid altering Home counters.
- Mobile: added scope toggle on Tasks page (Mine vs All) and defaulted to All to match Home counters; range queries respect scope.
- Validation: ran mobile lint (warnings only) and project typecheck; both pass.

## Sat Jan 31 19:58:01 WITA 2026
- Web: updated Work Orders list to use a ticket-style Subject column combining asset/facility context with the reported symptom.
- Web: updated Work Order detail header to show a ticket-style subject line with a separate ID badge and added a Resolution card summarizing status, timestamps, and resolution notes derived from checklist results.
- Validation: ran `npm run lint` (ESLintIgnoreWarning about `.eslintignore`) and `npx tsc --noEmit` in the repo root; both exited successfully.

## Sun Feb  8 04:28:29 WITA 2026
- Mobile: made the Home notification panel larger for accessibility (bigger tap targets, larger text).
- Mobile: added PM overview summary (overdue, due today, upcoming 7 days) inside the notification panel.

## Sun Feb  8 08:05:34 WITA 2026
- Mobile: PM Task Detail now loads and displays the real asset image via `/api/assets/:assetId/image`.

## Sun Feb  8 08:15:08 WITA 2026
- Mobile: fixed invalid nested button markup in Task Detail checklist rows.
- Mobile: Task Detail now prefers `asset.imageUrl` (falls back to `/api/assets/:assetId/image`).

## Sun Feb  8 08:20:48 WITA 2026
- Mobile: Task Detail asset header image uses white background and `object-contain` (no cropping).

## Sun Feb  8 04:51:56 WITA 2026
- Backend: included asset image URL in dashboard overview recent tasks payload.
- Mobile: show asset thumbnails for recent tasks on Home when image URLs are available.

## Sun Feb  8 04:55:56 WITA 2026
- Backend: added overdue asset context to dashboard overview for home alerts.
- Mobile: added overdue attention card on Home with resolve action.

## Sun Feb  8 04:58:40 WITA 2026
- Backend: fixed overdue assets query to avoid DISTINCT ordering error.

## Sun Feb  8 08:09:29 WITA 2026
- Backend: added PM task status counts endpoint for mobile tab badges.
- Mobile: added PM task status count badges in task tabs.

## Sun Feb  8 08:30:20 WITA 2026
- Mobile: set PM task tab badge colors by status.

## Sun Feb  8 08:45:33 WITA 2026
- Mobile: prioritize ngrok discovery API base with timeout fallback to direct backend.

## Sun Feb  8 09:22:09 WITA 2026
- Mobile: render asset image with img fallback on error.
- Mobile: add attachment preview overlay with close control in Task Detail.

## Sun Feb  8 09:53:41 WITA 2026
- Backend: allow ngrok-free origins for CORS in development.

## Sun Feb  8 10:22:26 WITA 2026
- Mobile (pm-tech): increase bottom navigation size for easier tap targets.

## Sun Feb  8 10:28:07 WITA 2026
- Mobile (pm-tech): increase bottom navigation size slightly.

## Sun Feb  8 11:01:32 WITA 2026
- Mobile (pm-tech): explain PM Now requirements when disabled.

## Sun Feb  8 11:59:34 WITA 2026
- Mobile (pm-tech): set Asset Detail image background to white.

## Sun Feb  8 12:36:54 WITA 2026
- Mobile (pm-tech): handle Android back button to navigate app history.

## Sun Feb  8 13:40:38 WITA 2026
- Mobile (pm-tech): add supervisor assignment sheet for PM tasks and CM work orders.
- Mobile (pm-tech): surface assignee badge and assign/reassign action in headers.

## Sun Feb  8 13:53:48 WITA 2026
- Backend: allow production web origin in CORS allowlist via FRONTEND_ORIGIN.

## Sun Feb  8 20:06:03 WITA 2026
- Backend: include PM Tech role variants for technician push broadcasts.

## Sun Feb  8 20:12:13 WITA 2026
- Mobile (pm-tech): show in-app popup with push title/body when notification is tapped.

## Sun Feb  8 20:24:59 WITA 2026
- Mobile (pm-tech): read push title/body from notification data fallback on tap.
- Backend: include fallback dataTitle/dataBody fields in push payload data.

## Sun Feb  8 20:28:53 WITA 2026
- Mobile (pm-tech): replace login header logo image with banner.png.

## Sun Feb  8 20:30:47 WITA 2026
- Mobile (pm-tech): set login header background image to banner.png.
- Mobile (pm-tech): keep logo tile unchanged.

## Fri Feb 13 20:49:10 WITA 2026
- Templates: switch delete action to permanent delete when unused.
- Templates: block deletion with a clear 409 message when in use.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Fri Feb 13 23:49:08 WITA 2026
- Docker: removed ngrok and gist-watcher services from docker-compose.
- Backend: removed ngrok origin allowance; allow localhost with ports for dev.
- Backend: let CORS reflect requested headers (fewer preflight failures).
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Sat Feb 14 00:04:19 WITA 2026
- Mobile (pm-tech): default production API base to https://preventivepm.justanapi.my.id.
- Mobile (pm-tech): removed default ngrok discovery URL.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Sat Feb 14 22:22:06 WITA 2026
- Mobile (pm-tech): set .env.local to Cloudflare base and disabled discovery.
- Mobile (pm-tech): documented backend URL in mobile README.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Sat Feb 14 22:58:27 WITA 2026
- Backend: app-updates can use store manifest for latest and redirect downloads to store domain.
- Backend: added APP_UPDATE_STORE_BASE_URL and APP_UPDATE_STORE_MANIFEST_URL envs.
- Store (secure_apk): serve /apk/manifest.json with JSON content type.
- Docs: documented store manifest format.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Sat Feb 14 23:09:16 WITA 2026
- Mobile (pm-tech): made Profile update check button label always visible.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Sat Feb 14 23:17:55 WITA 2026
- Mobile (pm-tech): show backend error message for update checks.
- Env: added app update store/signing env keys to root .env.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Sat Feb 14 23:27:34 WITA 2026
- Mobile (pm-tech): improve update install error messages and NOT_ANDROID handling.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Sat Feb 14 23:34:23 WITA 2026
- Mobile (pm-tech Android): ensure AppUpdater plugin resolves and releases async calls.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Sat Feb 14 23:42:47 WITA 2026
- Mobile (pm-tech Android): fix PluginCall.release signature for Capacitor v6.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Sat Feb 14 23:52:30 WITA 2026
- Mobile (pm-tech Android): follow 3xx redirects when downloading APK from store.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Sun Feb 15 00:12:57 WITA 2026
- Mobile (pm-tech): do not suppress startup update prompt when latest check fails.
- Mobile (pm-tech Android): increase updater read timeout and surface download error details.
- Mobile (pm-tech): fix Capacitor back button listener cleanup typing.

## Sun Feb 15 00:19:37 WITA 2026
- Mobile (pm-tech): replace startup update confirm with in-app modal prompt.
- Mobile (pm-tech): add timeout for Android in-app update download/install.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Sun Feb 15 10:06:31 WITA 2026
- Mobile (pm-tech): bump version to 1.0.1.
- Docker (secure_apk): add authenticated upload API and RW CIFS mount.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Sun Feb 15 10:16:01 WITA 2026
- Docker (secure_apk): add rate limiting, env template, and update sample manifest.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Sun Feb 15 10:37:30 WITA 2026
- Repo: add `npm run push:android` to upload versioned APK via secure_apk API.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Sun Feb 15 11:14:20 WITA 2026
- Ops (secure_apk): fix CIFS share root and prefixpath env template.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Sun Feb 15 11:39:10 WITA 2026
- Ops (secure_apk): mount apk subfolder via CIFS prefixpath.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Sun Feb 15 12:34:13 WITA 2026
- Docker (secure_apk): serve and upload from apk subfolder even when prefixpath is ignored.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Sun Feb 15 21:01:10 WITA 2026
- Docker (secure_apk): quote fallback paths in nginx to handle spaces reliably.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Sun Feb 15 21:10:19 WITA 2026
- Docker (secure_apk): serve apk subfolder via server-level root and try_files.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Sun Feb 15 21:29:08 WITA 2026
- Docker (secure_apk): switch nginx to root / with absolute try_files paths.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Sun Feb 15 21:44:03 WITA 2026
- Backend: allow HTTP store base URL when APP_UPDATE_STORE_ALLOW_HTTP=true.
- Mobile (pm-tech Android): allow cleartext traffic in debug builds.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Sun Feb 15 21:48:25 WITA 2026
- Docs: switch push:android SECURE_APK_BASE_URL example to HTTPS without port.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Sun Feb 15 22:17:07 WITA 2026
- Ops: make APP_UPDATE_STORE_ALLOW_HTTP explicit (false) in root .env.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Tue Feb 17 10:09:45 WITA 2026
- Docs: add secure_apk APK publish steps and manifest update guide.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Tue Feb 17 10:45:25 WITA 2026
- Backend: add forced update policy endpoints and app installation reporting.
- DB: add pm.AppInstallations for version tracking by device installation.
- Mobile (pm-tech): block app when backend policy requires update (versionCode-based).
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Tue Feb 17 10:51:10 WITA 2026
- Mobile (pm-tech): align update UX to versionCode policy checks.
- Mobile (pm-tech): remove semver-based startup update prompt to avoid conflicts.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Tue Feb 17 11:18:14 WITA 2026
- Dev tooling: enhance `npm run push:android` to also set forced-update policy.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Tue Feb 17 11:27:12 WITA 2026
- Dev tooling: allow push:android to reuse APP_UPDATE_STORE_BASE_URL for uploads.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Sat Feb 14 22:30:43 WITA 2026
- Mobile (pm-tech): notifications bell view now opens as full-screen overlay.
- Verified with `npm run lint` and `npx tsc --noEmit`.

## Sat Feb 14 22:35:39 WITA 2026
- Mobile (pm-tech): bottom nav active icon is larger than inactive icons.
- Verified with `npm run lint` and `npx tsc --noEmit`.
