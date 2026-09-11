# Preventive Pilot

Preventive Pilot is a maintenance management system (CMMS) centered on preventive maintenance, with corrective work orders for asset and facility breakdowns. It covers maintenance templates, scheduling, execution, evidence, approval, reporting, and notifications.

## Start here

- Read the [documentation index](docs/README.md) for the current source-of-truth documents.
- Read [AGENTS.md](AGENTS.md) for the repository working method.
- **Start work at [implementation-roadmap.md](docs/implementation-roadmap.md): the single work reference containing the next action and complete ordered backlog.**
- Review [open questions](docs/open-questions-and-challenges.md) rather than assuming historical plans match implementation.

The current documentation baseline was reviewed on 2026-09-10 through source inspection. Application runtime, database, integration, and device acceptance remain separate verification work.

## Current priority

Focus first on the browser-based desktop application and its supporting backend/database. Mobile uncertainties and mobile-specific delivery/testing are deferred, not resolved, and do not block desktop work. See the [roadmap](docs/implementation-roadmap.md) for scope and priorities.

## Product scope

- Assets synchronized from Snipe-IT and locally managed facilities.
- PM templates, ordered checklists, assignment, recurring scheduling, blackouts, and PM Now.
- Technician execution, attachments, supervisor review, and superadmin approval.
- CM work orders with breakdown context, impact, downtime, and resolution.
- Reports, task PDF/CSV outputs, mail/WhatsApp/push integration, and background jobs.
- PM Tech mobile source is available in this local workspace; its version-control/delivery status is unresolved because `mobile` is ignored by Git.

See the [functional specification](docs/functional-specification.md) for workflow semantics and known differences between product intent and existing behavior.

## Repository layout

| Path | Purpose |
| --- | --- |
| `src/` | React + Vite web application, shadcn-ui, Tailwind, React Query |
| `backend/` | Express + TypeScript API, JWT/LDAP/local auth, jobs, and explicit SQL through mssql |
| `db/schema.sql` | SQL Server schema creation and conditional evolution |
| `scripts/` | Development, schema, discovery, and documentation utilities |
| `docs/` | Maintained product, workflow, architecture, API, data, and operational documentation |
| `mobile/pm-tech/` | Locally available React + Capacitor client; see Q-06 |
| `nginx/` and Compose files | Web/API container delivery and optional storage overlays |

## Local development

Prerequisites: Node.js/npm, a reachable SQL Server database, and backend configuration. Docker uses Node 22. Root and backend dependencies must be installed separately:

```sh
npm ci
npm ci --prefix backend
```

Configure the root `.env` using [deployment and environment](docs/deployment-and-environment.md). Database credentials, `JWT_SECRET`, and the currently mandatory LDAP fields are required. Preserve any existing environment configuration.

After confirming the intended database target:

```sh
npm run db:apply-schema
npm run db:verify
npm run dev:full
```

Schema application mutates the configured database. The backend can start enabled jobs. For bootstrap account creation and isolated verification settings, follow the deployment guide.

Web development defaults to port 8080; backend defaults to 3001. Root Docker Compose exposes web on 9102 and API on 5056, with same-origin `/api/` proxying. SQL Server is not provisioned by the supplied root Compose stack.

## Documentation and verification

The eight mandatory documents are linked from the [documentation index](docs/README.md). API documentation is versioned in [docs/openapi.yaml](docs/openapi.yaml), with known coverage gaps in [API coverage](docs/api-coverage.md). The running backend serves its embedded definition at `/api/docs` and `/api/docs.json`.

```sh
node scripts/docs/check-docs.mjs
```

See [testing strategy](docs/testing-strategy.md) for application checks and [documentation verification](docs/documentation-verification.md) for the baseline evidence. A successful documentation check is not a production-readiness certification.

## Deployment and history

Use the [deployment guide](docs/deployment-and-environment.md), [operational runbook](docs/operational-runbook.md), and [APK publication notes](docs/apk-publish.md). The repository is connected to Lovable; preserve published Git history as required by AGENTS.md.

Earlier plans and journal entries are retained as historical references with explicit banners. The [previous README](docs/archive/readme-before-baseline.md) is archived; its placeholder project links and old setup instructions are not active guidance.
