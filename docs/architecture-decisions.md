# Architecture Decisions

Last reviewed: 2026-09-10. These entries reconstruct decisions visible in the current repository. They do not imply a prior formal approval record.

## ADR-001 — Shared PM and CM task entity

Status: observed baseline. Source: historical CM plan, `db/schema.sql`, and `backend/src/routes/workOrders.ts`.

PM and CM use `pm.PMTasks`, distinguished by `MaintenanceType`. CM has a dedicated API/UI and additional incident fields. Shared evidence/checklist infrastructure reduces duplication; every task list/report must deliberately choose its maintenance-type population.

## ADR-002 — SQL Server with explicit SQL

Status: observed baseline. Source: `backend/package.json`, `backend/src/db/mssql.ts`, routes/jobs, and `db/schema.sql`.

The backend uses `mssql` and SQL queries rather than Prisma or Sequelize. Evolve DDL and queries together. Historical ORM references do not describe the implementation.

## ADR-003 — React web and Capacitor mobile

Status: observed locally; reproducible mobile source delivery is open (Q-06).

Web and PM Tech use separate React/Vite packages. PM Tech wraps web UI in Capacitor for native capabilities. There is no inspected React Native application. Do not share dependencies or assume framework versions are identical without checking package manifests.

## ADR-004 — Same-origin Docker web/API

Status: observed baseline. Source: root Compose and `nginx/default.conf`.

Nginx serves the web and proxies `/api/` to `api:5056`. SQL Server and external storage/integrations must be provisioned separately. Backend `/health` is not forwarded by the existing `/api/` proxy and is a liveness signal only.

## ADR-005 — Explicit documentation authority and contract parity

Status: established in D0 under AGENTS.md.

The mandatory documents under `docs/` own current scope, workflow, architecture, API, and data-model documentation. Historical plans remain reference inputs with superseded-status banners. The OpenAPI file is initially an exact normalized snapshot of the embedded contract; a check detects divergence. Missing route coverage remains explicit rather than filled with invented schemas.

## ADR-006 — Production API fallback with optional discovery

Status: observed local mobile baseline.

PM Tech has a fixed HTTPS production fallback. A supplied discovery URL can override API selection through existing client logic. Ngrok/Gist scripts remain optional development utilities; they are not prerequisites for normal mobile operation. Deployment-specific API values belong in build configuration.
