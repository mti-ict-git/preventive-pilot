# Mobile Apps Development Plan — PM Tech

## Overview
- Target app: mobile/pm-tech (Vite + React + React Router)
- Purpose: Technician-first PM and CM workflows with offline support and secure backend integration
- Backend: Node.js + Express API with JWT auth; OpenAPI docs exposed at /api/docs
- Web frontend reference: src/lib/api.ts centralizes API calls, models, and auth; reuse patterns

## Current Mobile Architecture Snapshot
- Entrypoint and routing: [index.tsx](file:///Users/widjis/Documents/Projects/Preventive%20Maintenance/preventive-pilot/mobile/pm-tech/index.tsx), [App.tsx](file:///Users/widjis/Documents/Projects/Preventive%20Maintenance/preventive-pilot/mobile/pm-tech/App.tsx)
- Layout and navigation: [Layout.tsx](file:///Users/widjis/Documents/Projects/Preventive%20Maintenance/preventive-pilot/mobile/pm-tech/components/Layout.tsx), [BottomNav.tsx](file:///Users/widjis/Documents/Projects/Preventive%20Maintenance/preventive-pilot/mobile/pm-tech/components/BottomNav.tsx)
- Screens: Home, Tasks, TaskDetail, Schedule, Assets, AssetDetail, WorkOrders, Offline, Profile under pages/
- Styling: Tailwind via CDN configured in [index.html](file:///Users/widjis/Documents/Projects/Preventive%20Maintenance/preventive-pilot/mobile/pm-tech/index.html); Material Symbols icons
- Types: Local mock types in [types.ts](file:///Users/widjis/Documents/Projects/Preventive%20Maintenance/preventive-pilot/mobile/pm-tech/types.ts)
- Observations:
  - Demo-only UI; no API calls yet
  - HashRouter is used to simplify navigation in mobile contexts
  - Vite config exposes GEMINI_API_KEY into client define (remove for security)

## Backend Integration Reference
- API base: API_BASE_URL configurable by VITE_API_BASE_URL; see web README and docker-compose
- OpenAPI: Docs at /api/docs; generate or hand-write TS client models and fetchers
- Web client patterns: [api.ts](file:///Users/widjis/Documents/Projects/Preventive%20Maintenance/preventive-pilot/src/lib/api.ts) centralizes request, token refresh, and models; mirror a minimal subset for mobile

## Phase 0 — Project Setup
- Objective: Ensure pm-tech runs reliably and can connect to backend in dev
- Deliverables:
  - Verify npm run dev, build, preview work on port 3000 (vite.config.ts)
  - Add .env.local with VITE_API_BASE_URL pointing to backend (e.g., http://localhost:5056 or ngrok URL)
  - Remove exposing GEMINI_API_KEY from vite.config.ts define
  - Pin Tailwind usage to build-time in production or ensure CDN is locked to integrity and exact versions
- Acceptance:
  - App boots on / with working navigation
  - No secrets exposed to client build

## Phase 1 — Auth & Session
- Objective: Authenticate technician and manage JWT securely
- Deliverables:
  - Lightweight api client module under mobile/pm-tech/lib/api.ts mirroring web request patterns
  - Implement login (POST /api/auth/login) with provider ldap/local
  - Store tokens using secure storage strategy suitable for PWA/mobile web (in-memory + refresh or cookie-based when possible)
  - Implement 401-triggered refresh (POST /api/auth/refresh) and automatic retry
  - Logout clears tokens and app state
- Acceptance:
  - Successful login redirects to Home; tokens refresh transparently; logout returns to Login

## Phase 2 — API Client & Models
- Objective: Define typed models and fetch helpers based on OpenAPI
- Deliverables:
  - Define minimal TS types for Asset, Task, WorkOrder aligned to backend schemas
  - Implement apiFetchJson base with Authorization header and API_BASE_URL
  - Endpoints implemented initially: system lookups, dashboard overview, assets list/detail, tasks list/detail
  - Optional: generate types from OpenAPI and commit generated types under mobile/pm-tech/lib/generated/
- Acceptance:
  - Data flows render live lists in Tasks and Assets screens; error handling and loading states present

## Phase 3 — Tasks (PM)
- Objective: Wire Tasks list and Task detail to backend PM endpoints
- Deliverables:
  - Tasks list uses GET /api/tasks with filters for assigned=me, status, date ranges
  - Task detail uses GET /api/tasks/{taskId} for core metadata, checklist items, evidence references
  - Lifecycle actions: POST /api/tasks/{taskId}/start, pause, resume, complete
  - Submit for approval action aligned with PM workflow rules
  - UI updates in [Tasks.tsx](file:///Users/widjis/Documents/Projects/Preventive%20Maintenance/preventive-pilot/mobile/pm-tech/pages/Tasks.tsx) and [TaskDetail.tsx](file:///Users/widjis/Documents/Projects/Preventive%20Maintenance/preventive-pilot/mobile/pm-tech/pages/TaskDetail.tsx)
- Acceptance:
  - My PM Tasks show server data; detail supports status transitions and checklist interactions

## Phase 4 — Work Orders (CM)
- Objective: Implement CM Work Orders list and detail; enable breakdown reporting
- Deliverables:
  - Work Orders list: GET /api/work-orders?assigned=me&status=open with pagination
  - Work Order detail: GET /api/work-orders/{taskId}; reuse PM checklist/evidence UI where applicable
  - Breakdown report: POST /api/work-orders with either assetId or facilityId, symptom, impactLevel, optional failure metadata and downtime
  - Lifecycle actions: start, pause, resume, complete, cancel, close-downtime
  - UI updates in [WorkOrders.tsx](file:///Users/widjis/Documents/Projects/Preventive%20Maintenance/preventive-pilot/mobile/pm-tech/pages/WorkOrders.tsx) and quick actions in [AssetDetail.tsx](file:///Users/widjis/Documents/Projects/Preventive%20Maintenance/preventive-pilot/mobile/pm-tech/pages/AssetDetail.tsx)
- Acceptance:
  - Technicians can report breakdowns and manage CM work orders end-to-end; validations mirror web

## Phase 5 — Assets Search & Detail
- Objective: Live asset search with category filters and detail view
- Deliverables:
  - Assets search: GET /api/assets with search, category, location filters
  - Asset detail: GET /api/assets/{assetId} including PM/CM summary and next due
  - Integrate quick actions: report breakdown, open upcoming PM
- Acceptance:
  - Search and detail present authoritative backend data; quick actions navigate correctly

## Phase 6 — Scheduling
- Objective: Read-only scheduling calendar and task list by day
- Deliverables:
  - Calendar view backed by GET /api/scheduling/calendar or /api/scheduling/day
  - List view filters to assigned and date
  - Link calendar cells to Task Detail routes
- Acceptance:
  - Calendar and day list reflect server schedules and navigate to tasks

## Phase 7 — Evidence & Attachments
- Objective: Offline-capable photo capture and upload with checklist validation
- Deliverables:
  - Capture API: POST /api/tasks/{taskId}/checklist-items/{templateChecklistItemId}/evidence/upload
  - File storage integration follows backend rules; evidence metadata saved with audit trail
  - UI controls for photo, notes, pass/fail/skip with required validations
- Acceptance:
  - Evidence capture enforces validations; uploads succeed online; queued offline

## Phase 8 — Offline Mode
- Objective: Cache tasks and assets; queue actions for sync; conflict handling
- Deliverables:
  - IndexedDB or Cache API-based local store for tasks and evidence
  - Background sync and retry logic; conflict detection when server state diverges
  - Offline indicators and manual Sync Now control in [Offline.tsx](file:///Users/widjis/Documents/Projects/Preventive%20Maintenance/preventive-pilot/mobile/pm-tech/pages/Offline.tsx)
- Acceptance:
  - Opening a task caches it; completing offline queues updates; sync resolves without data loss

## Phase 9 — Profile & Settings
- Objective: Basic user profile and settings backed by API
- Deliverables:
  - Profile: GET /api/users/me for profile and preferences; PATCH for updates
  - Settings: theme toggle, notifications toggle persisted to server when appropriate
- Acceptance:
  - Profile renders live data; toggles persist and survive reload

## Phase 10 — Security Hardening
- Objective: Apply secure coding and deployment practices
- Deliverables:
  - Token handling avoids localStorage; prefer in-memory plus refresh and short-lived access tokens; consider cookie-based auth when feasible
  - Remove any client-side exposure of secrets (remove GEMINI_API_KEY defines in vite.config)
  - Strict CORS and allowed origins for mobile; docker-compose includes capacitor://localhost for mobile shells
  - Disable eval and inspect CSP risks; avoid dynamic code from untrusted sources; pin CDN versions or eliminate CDN in production
  - Dependency monitoring via npm audit, Snyk, or Dependabot; track React, Vite, react-router-dom advisories
  - Validate input/output: sanitize user notes, encode outputs to prevent XSS; avoid rendering untrusted HTML
- Acceptance:
  - Security checks pass; no secrets in build; basic OWASP controls verified

## Phase 11 — Observability & QA
- Objective: End-to-end reliability and testing coverage
- Deliverables:
  - Error and performance logging; network failure telemetry; audit significant actions
  - Unit tests for api client and validators; integration tests for key flows; manual test scripts for offline
  - Lint and typecheck scripts run clean; CI integration for build + tests
- Acceptance:
  - Tests cover critical paths; CI green; manual QA passes for offline/online transitions

## Dev & Ops Notes
- Local run: npm run dev in mobile/pm-tech; backend via npm run dev:full at repo root
- API base discovery for mobile: use ngrok + gist watcher per README; mobile fetches gist to set API base dynamically
- Docker dev stack: docker-compose exposes web at 9102 and API at 5056; Nginx proxies /api to backend

## Implementation Order
- Phase 0 → 1 → 2 to establish secure data access
- Phase 3 and 4 for PM tasks and CM work orders
- Phase 5 and 6 for assets and schedule
- Phase 7 and 8 for evidence and offline
- Phase 9–11 for polish, security, and QA

## Links
- Mobile app code: mobile/pm-tech
  - [App.tsx](file:///Users/widjis/Documents/Projects/Preventive%20Maintenance/preventive-pilot/mobile/pm-tech/App.tsx)
  - [BottomNav.tsx](file:///Users/widjis/Documents/Projects/Preventive%20Maintenance/preventive-pilot/mobile/pm-tech/components/BottomNav.tsx)
  - [Tasks.tsx](file:///Users/widjis/Documents/Projects/Preventive%20Maintenance/preventive-pilot/mobile/pm-tech/pages/Tasks.tsx)
  - [TaskDetail.tsx](file:///Users/widjis/Documents/Projects/Preventive%20Maintenance/preventive-pilot/mobile/pm-tech/pages/TaskDetail.tsx)
  - [Assets.tsx](file:///Users/widjis/Documents/Projects/Preventive%20Maintenance/preventive-pilot/mobile/pm-tech/pages/Assets.tsx)
  - [AssetDetail.tsx](file:///Users/widjis/Documents/Projects/Preventive%20Maintenance/preventive-pilot/mobile/pm-tech/pages/AssetDetail.tsx)
  - [WorkOrders.tsx](file:///Users/widjis/Documents/Projects/Preventive%20Maintenance/preventive-pilot/mobile/pm-tech/pages/WorkOrders.tsx)
  - [Offline.tsx](file:///Users/widjis/Documents/Projects/Preventive%20Maintenance/preventive-pilot/mobile/pm-tech/pages/Offline.tsx)
  - [Schedule.tsx](file:///Users/widjis/Documents/Projects/Preventive%20Maintenance/preventive-pilot/mobile/pm-tech/pages/Schedule.tsx)
- Web API reference: [api.ts](file:///Users/widjis/Documents/Projects/Preventive%20Maintenance/preventive-pilot/src/lib/api.ts)
- Backend: [backend/src/index.ts](file:///Users/widjis/Documents/Projects/Preventive%20Maintenance/preventive-pilot/backend/src/index.ts)
