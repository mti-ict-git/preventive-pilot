# Preventive Maintenance System Implementation Plan

## Goal
Deliver a production-ready PM system with standardized templates, automated scheduling, task execution tracking, reporting/audit evidence, and Snipe-IT asset synchronization.

## Scope of This Plan
- Database foundation (SQL Server)
- Backend services (REST API + background jobs)
- Web UI integration (existing Vite + React app)
- Operational concerns (audit, permissions, notifications)

## Current State
- Web UI exists with route-level pages under `src/pages`.
- Data is currently mocked in the UI; no API layer exists in this repo.
- SQL Server connection settings exist in `.env` (do not commit credentials).

## Phase 0 — Database Foundation
### Deliverables
- Create a dedicated SQL Server schema `pm` and baseline tables for:
  - Assets and PM settings
  - Templates and checklist items
  - Scheduling rules and blackout windows
  - Tasks, checklist results, and evidence
  - Notifications (rules + delivery log)
  - Users/roles and audit/system logs
- Maintain an idempotent `db/schema.sql` as the source of truth.

### Acceptance Criteria
- Schema can be applied to a clean database using the provided runner script.
- Core entities have primary keys, foreign keys, and key indexes.
- No secrets are stored in source control.

## Phase 1 — Backend API (Node.js + Express)
### API Modules
- AuthN/AuthZ: sessions/JWT, role-based access control
- Assets: read-only from Snipe-IT snapshot + PM enable toggle
- Templates: CRUD templates + checklist items
- Scheduling: rule management + schedule recalculation endpoint
- Tasks: list/detail, assignment/reassign, completion, evidence upload metadata
- Reports: compliance and overdue reports (query-based)
- Notifications: configure rules, trigger reminders/escalations via job runner

### Data Access
- Implement an ORM layer (Prisma or Sequelize) mapped to the `pm` schema.
- Add migrations (versioned) after the initial schema stabilizes.

## Phase 2 — Job Scheduler & Snipe-IT Sync
### Jobs
- Snipe-IT sync: categories, locations, assets; store last sync metadata
- Schedule calculation: generate upcoming tasks based on templates + rules
- Reminder/escalation: send notifications based on due dates and policy

### Observability
- Write job outcomes to `pm.SystemLog` and `pm.SnipeSyncRuns`.

## Phase 3 — UI Integration (Web)
### Client Architecture
- Create an API client module and replace mock arrays with React Query calls.
- Keep Dashboard read-only and highly optimized for quick scanning.

### Mapping to Routes
- Dashboard: overview metrics + trend charts
- Assets: list/detail from API + PM enable toggle
- Templates: list + dialogs wired to template endpoints
- Scheduling: rule CRUD + calendar view consuming schedule endpoints
- Tasks: list/detail with checklist submission and evidence upload
- Reports: server-generated exports + audit-friendly filters

## Phase 4 — Security, Audit, and Compliance
- Enforce role permissions for supervisor-only actions.
- Write immutable audit events for sensitive actions (assignment changes, force complete, cancel).
- Ensure timestamps are stored in UTC and presented in local time in the UI.

## Phase 5 — Deployment
- Environment variables managed per environment (dev/staging/prod).
- CI runs: lint + typecheck.
- Database schema applied in controlled rollout steps.

