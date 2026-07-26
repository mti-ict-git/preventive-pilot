# Preventive Pilot

Preventive Pilot is a maintenance operations system for preventive maintenance (PM) and corrective maintenance (CM). It combines an operations web application, a REST API, Microsoft SQL Server persistence, scheduled jobs, external asset synchronization, notifications, evidence storage, and a Capacitor field application.

## Start Here

The documentation under [`docs/`](docs/) is the source of truth:

- [Project plan](docs/project-plan.md) — goals, scope, stakeholders, and delivery boundaries.
- [Product principles](docs/product-principles.md) — durable product and engineering decisions.
- [Functional specification](docs/functional-specification.md) — roles, workflows, and expected behavior.
- [Technical implementation plan](docs/technical-implementation-plan.md) — architecture and component responsibilities.
- [OpenAPI contract](docs/openapi.yaml) — version-controlled API contract.
- [Database specification](docs/database-schema-specification.md) — logical data model and invariants.
- [Implementation roadmap](docs/implementation-roadmap.md) — active phase, checklists, and verification evidence.
- [Open questions and challenges](docs/open-questions-and-challenges.md) — unresolved ambiguity and known gaps.

Read [`AGENTS.md`](AGENTS.md) before making non-trivial changes. Older feature plans and the journal remain useful historical evidence, but the mandatory documents above take precedence.

## Repository Map

| Path | Responsibility |
| --- | --- |
| `src/` | React web client, routes, pages, API client, and reusable UI |
| `backend/src/` | Express API, authentication, authorization, jobs, integrations, and data access |
| `db/schema.sql` | Idempotent SQL Server schema and migrations |
| `mobile/pm-tech/` | Capacitor field application; currently present locally but not tracked by Git |
| `scripts/` | Local development, schema, publishing, and operational helpers |
| `secure_apk/` | APK manifest, download host, and authenticated uploader |
| `docs/` | Product, contract, architecture, roadmap, operations, and historical documentation |
| `docker-compose*.yml` | Web/API deployment and evidence-volume variants |

## Technology

- Web: React 18, TypeScript, Vite, TanStack Query, React Router, Tailwind, shadcn/Radix UI.
- API: Node.js, Express, TypeScript, Zod, JWT, LDAP.
- Data: Microsoft SQL Server via `mssql`.
- Mobile: React 19, Capacitor 6, Android/iOS wrappers, barcode scanning, push notifications, native biometric support.
- Integrations: Snipe-IT, Microsoft Graph, Firebase/FCM, SMB/CIFS or bind-mounted evidence storage.

## Local Development

Prerequisites:

- Node.js and npm.
- Reachable Microsoft SQL Server database.
- LDAP configuration, even when primarily using local authentication, because the current environment schema requires LDAP variables.

Install dependencies:

```sh
npm install
npm --prefix backend install
```

Create a root `.env` with the variables described in [Deployment and environment](docs/deployment-and-environment.md), then initialize/verify the database:

```sh
npm run db:apply-schema
npm run db:verify-schema
```

Run web and API together:

```sh
npm run dev:full
```

Default development endpoints:

- Web: Vite URL printed by the development command.
- API: `http://localhost:3001`.
- Health: `GET http://localhost:3001/health`.
- Swagger UI: `http://localhost:3001/api/docs`.

## Verification

Run the baseline checks before handing off changes:

```sh
npm run lint
npx tsc --noEmit
npm --prefix backend run typecheck
npm run build
```

For database, mobile, integration, or deployment changes, also run the area-specific verification recorded in the active roadmap checklist.

## Safe Change Rules

- Do not rewrite published history; this repository is connected to Lovable.
- Do not implement from assumptions when a source document exists.
- Review `docs/openapi.yaml` for every backend change.
- Synchronize workflow, schema, API, and roadmap documents in the same work item.
- Never commit secrets, `.env` files, service-account JSON, generated native build output, or evidence files.

## Deployment

The default compose stack builds the API and Nginx-served web application. Evidence storage can use:

- `docker-compose.bind.yml` for a host bind mount.
- `docker-compose.cifs.yml` for an SMB/CIFS volume.

See [Deployment and environment](docs/deployment-and-environment.md) and [Operational runbook](docs/operational-runbook.md) before deploying.
