# Mobile Apps Development Plan — PM Tech ↔ Backend API

## Overview
- App: mobile/pm-tech (Vite + React + React Router, HashRouter)
- Backend: Node.js + Express, JWT auth, MS SQL Server, OpenAPI docs at `/api/docs` and `/api/docs.json`
- Goal: Integrate mobile UI with backend securely, support offline-first, and prepare Android packaging via Capacitor

## Backend Integration Reference
- API base: `http://localhost:3001` (configurable)
- Auth endpoints:
  - `POST /api/auth/login` → `{ accessToken, refreshToken, user }`
  - `POST /api/auth/refresh` → `{ accessToken, refreshToken }`
  - `GET /api/auth/me` → `{ user }` (Bearer required)
- PM Tasks endpoints:
  - `GET /api/tasks` (filters: assigned=me, status, date ranges)
  - `GET /api/tasks/{taskId}`
  - `POST /api/tasks/{taskId}/{start|pause|resume|complete}`
  - `GET /api/tasks/{taskId}/export.pdf`
- Work Orders (CM):
  - `GET /api/work-orders` (filters, pagination)
  - `GET /api/work-orders/{taskId}`
  - `POST /api/work-orders` (create breakdown)
  - `POST /api/work-orders/{taskId}/close-downtime`
- Assets:
  - `GET /api/assets` (search, category, location)
  - `GET /api/assets/{assetId}`
- System & Dashboard:
  - `GET /api/system/lookups` (roles, categories, locations)
  - `GET /api/dashboard/*` (overview cards, counts)
- CORS: `FRONTEND_ORIGIN` must include mobile origins used during dev and release

## Phase 0 — Setup & Hardening
**Objective**: Make pm-tech ready for secure backend calls and mobile packaging.
- Configure API base in mobile:
  - Add `VITE_API_BASE_URL` in `.env.local` (e.g., `http://localhost:3001`)
- Remove secret exposure:
  - In `mobile/pm-tech/vite.config.ts`, remove `define` entries exposing `GEMINI_API_KEY`
- Lock styling to build-time for release:
  - Replace Tailwind CDN with build-time Tailwind in production to avoid runtime CDN dependency
- CORS & dev origins:
  - Set backend `FRONTEND_ORIGIN` to include web dev and mobile dev origins: `http://localhost:3000,http://<your-ip>:3000`
  - For Capacitor dev live-reload: include the dev web URL; for packaged app, use TLS API domain
- Acceptance:
  - Mobile app boots, no secrets in client bundle, API base configurable

## Phase 1 — Auth & Session
**Objective**: Implement secure login and session management.
- API client module `lib/api.ts` in mobile:
  - `apiFetchJson(path, init)` → prepends `VITE_API_BASE_URL`, adds `Authorization` when available
- Login flow:
  - Call `POST /api/auth/login` with `{ identifier|username, password, provider: ldap|local }`
  - Store tokens securely
- Token storage:
  - Use secure storage on mobile (e.g., Capacitor Secure Storage) for `accessToken` and `refreshToken`
  - Keep in-memory copy for Authorization header; avoid localStorage
- Refresh & retry:
  - On 401, call `POST /api/auth/refresh`; retry original request on success; logout on failure
- Route guard:
  - Update ProtectedRoute to check real auth state; redirect to `/` when unauthenticated
- Acceptance:
  - Sign-in redirects to Home; refresh works transparently; logout clears secure storage and state

## Phase 2 — Models & API Client
**Objective**: Define types and common fetch helpers.
- Types: Asset, Task, WorkOrder aligned to backend schemas
- Helpers:
  - `getMe`, `login`, `refresh`
  - `apiGet(path)`, `apiPost(path, body)` with JSON parsing, error normalization
- Errors & loading:
  - Centralize error handling; surface messages in UI; show loading states
- Optional: Generate types from `/api/docs.json` with OpenAPI codegen and place under `mobile/pm-tech/lib/generated/`
- Acceptance:
  - Shared helpers used across screens; typed data flows and consistent errors

## Phase 3 — PM Tasks
**Objective**: Wire Tasks list and Task detail.
- List:
  - `GET /api/tasks?assigned=me&status=` and date filters
- Detail:
  - `GET /api/tasks/{taskId}` for core metadata, checklist items, evidence references
- Lifecycle actions:
  - `POST /api/tasks/{taskId}/{start|pause|resume|complete}` wired to UI buttons
- Acceptance:
  - Tasks screen shows server data; detail updates status and checklist interactions

## Phase 4 — Work Orders (CM)
**Objective**: Implement CM creation and management.
- List & detail:
  - `GET /api/work-orders` and `GET /api/work-orders/{taskId}`
- Report Breakdown:
  - `POST /api/work-orders` payload includes exactly one of `assetId` or `facilityId`, plus `symptom`, optional `impactLevel`, `failureCategory`, `failureCode`, `downtimeStartedAt`, `reportedChannel`
- Lifecycle:
  - Start, pause, resume, complete, cancel, `close-downtime`
- Acceptance:
  - Technicians can create, view, and manage CM work orders end-to-end

## Phase 5 — Assets Search & Detail
**Objective**: Live asset search and detail.
- Search:
  - `GET /api/assets?search=&categoryId=&locationId=`
- Detail:
  - `GET /api/assets/{assetId}` with PM/CM summary and next due
- Quick actions:
  - Open upcoming PM; report breakdown from AssetDetail
- Acceptance:
  - Accurate search and detail views with navigation to PM/CM actions

## Phase 6 — Scheduling (Read-Only)
**Objective**: Show calendar and tasks by day.
- Source:
  - Use dashboard/scheduling endpoints to populate calendar
- Acceptance:
  - Calendar reflects server schedule; links navigate to task detail

## Phase 7 — Evidence Capture
**Objective**: Photos and notes for tasks/work orders.
- Mobile plugins:
  - Use Capacitor Camera and Filesystem to capture/store media
- Upload:
  - Queue uploads while offline; submit evidence when online to task/work-order evidence endpoints
- Acceptance:
  - Evidence captured and synced reliably; UI shows upload status

## Phase 8 — Offline & Sync
**Objective**: Offline-first behaviors.
- Service worker:
  - Add PWA plugin or Workbox to cache static assets and selected API responses
- Data store:
  - Cache tasks, assets, and work orders; queue mutations with conflict resolution
- Sync UI:
  - Add manual sync and status indicators (Online/Offline, last sync)
- Acceptance:
  - Core flows usable offline; data reconciled on reconnect

## Phase 9 — Security & Compliance
**Objective**: Harden client-server interaction.
- CORS:
  - Add explicit mobile origins; avoid `*`; allow only required headers
- TLS:
  - Enforce HTTPS for production; disable cleartext on Android; pin backend domain
- CSP:
  - Use strict CSP once CDNs are removed; limit connect-src to API host
- Tokens:
  - Store in secure storage; short-lived access tokens; refresh rotation; purge on logout
- Rate limiting:
  - Enable backend rate limiting for `/api/auth/login` and sensitive endpoints
- Logging:
  - Server-side structured logs; avoid sensitive data
- Monitoring:
  - Integrate crash/error reporting for mobile; track auth failures and 401s
- Standards:
  - Align with OWASP MASVS, OWASP API Security Top 10, NIST guidance
- Acceptance:
  - Security checks pass; no secrets in bundle; API protected against common threats

## Phase 10 — QA & Release
**Objective**: Verification and rollout.
- Tests:
  - Unit tests for API client; E2E flows for login, tasks, work orders
- CI:
  - Lint and typecheck must pass; OpenAPI drift detected via schema checks
- Android:
  - Package via Capacitor; release build uses TLS API; cleartext disabled
- Acceptance:
  - CI green; manual QA across offline/online transitions and role-gated actions

## Capacitor (Optional) — Android Packaging
- Install: `@capacitor/core`, `@capacitor/android`, `@capacitor/cli`
- Config: `capacitor.config.ts` with `appId`, `appName`, `webDir: 'dist'`
- Dev live reload: set `server.url` to `http://<your-ip>:3000` and `server.cleartext: true` (dev only)
- Build: `npm run build` → `npx cap sync android` → open in Android Studio
- Routing: HashRouter works inside WebView; no deep-link setup required initially

## Dev & Ops Notes
- Local run:
  - Mobile: `npm run dev` in `mobile/pm-tech`
  - Full stack: `npm run dev:full` at repo root
- API base discovery:
  - Use `.env.local` for `VITE_API_BASE_URL`; in mobile releases, point to production API domain
- Docker:
  - Backend container exposes port 5056 in Dockerfile; dev runs on 3001 via env

## Acceptance Summary
- Phases 0–2 establish secure data access and typed client
- Phases 3–5 implement PM tasks, CM work orders, and assets
- Phase 6 adds schedule; 7–8 add evidence and offline
- Phase 9 hardens security; 10 verifies and releases

