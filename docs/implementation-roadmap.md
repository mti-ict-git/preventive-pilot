# Implementation Roadmap

## Status Legend

- `[ ]` not started
- `[~]` in progress
- `[x]` complete with recorded evidence
- `[!]` blocked or requires a decision

## Active Phase: Phase 0 — Documentation Baseline and Reconciliation

### Objective

Establish the mandatory documentation baseline required by `AGENTS.md`, reconcile it with the implementation, and expose material uncertainty before further feature work.

### Source Documents

- `AGENTS.md`
- Existing `README.md` and historical plans under `docs/`
- `src/`, `backend/src/`, and local `mobile/pm-tech/`
- `db/schema.sql`
- `package*.json`, Dockerfiles, compose files, Nginx, secure APK, and operational scripts

### Checklist

- [x] Inventory tracked application, backend, schema, scripts, deployment, and documentation files.
  - Evidence: 177 tracked files inspected by structure/search; generated dependencies/build outputs excluded.
- [x] Identify mandatory document gaps.
  - Evidence: all eight mandatory `docs/` files were absent at phase start.
- [x] Replace template README with a repository entry point.
- [x] Create project, principles, functional, technical, database, roadmap, and open-question documents.
- [x] Create a version-controlled OpenAPI baseline and record runtime coverage drift.
- [x] Add supporting security, testing, deployment, and operations documents.
- [ ] Validate every OpenAPI operation against handler validation and response shapes.
- [ ] Reconcile historical plan completion claims with executable tests or manual evidence.
- [!] Decide source-control ownership of `mobile/pm-tech`.
- [ ] Resolve high-priority questions in `open-questions-and-challenges.md`.

### Output

A navigable documentation baseline in which facts, target design, historical context, and unresolved decisions are separated.

### Challenge / Verification

- [x] Markdown link targets checked locally.
- [x] Required filename presence checked.
- [x] OpenAPI route inventory matched the implementation: 134 runtime operations and 134 documented operations, with no missing or extra operations.
- [x] `docs/openapi.yaml` parsed successfully as YAML.
- [x] `npm run lint` passed (with the existing ESLint ignore-file migration warning).
- [x] Frontend `npx tsc --noEmit` and backend `npm --prefix backend run typecheck` passed.
- [x] `npm run build` passed (with existing Browserslist-age and large-chunk warnings).
- [ ] OpenAPI schema-level request/response validation.
- [ ] Documentation review with product owner and operations owner.

The phase remains **in progress**. Creation of baseline files does not prove every historical feature claim.

## Phase 1 — Contract and State-Machine Verification

### Objective

Make the API contract and PM/CM lifecycle behavior executable and trustworthy.

### Source Documents

- `docs/functional-specification.md`
- `docs/openapi.yaml`
- `docs/database-schema-specification.md`
- `backend/src/routes/tasks.ts`
- `backend/src/routes/workOrders.ts`

### Checklist

- [ ] Choose one canonical OpenAPI source and remove duplicate-authority drift.
- [ ] Cover every runtime route, method, security rule, parameter, body, and primary response.
- [ ] Define PM status and approval transition tables.
- [ ] Define CM lifecycle and downtime transition tables.
- [ ] Add automated success, forbidden, invalid-transition, duplicate, and missing-record tests.

### Output

Validated contract plus automated lifecycle regression suite.

### Challenge / Verification

- OpenAPI validator passes.
- Route inventory equals documented operations.
- State transition matrix has no undocumented edges.
- Critical tests run against an isolated SQL Server database.

## Phase 2 — Security and Operational Hardening

### Objective

Close secret-management, token, storage, job-concurrency, and recovery gaps.

### Source Documents

- `docs/security-and-access-model.md`
- `docs/deployment-and-environment.md`
- `docs/operational-runbook.md`
- `docs/open-questions-and-challenges.md`

### Checklist

- [ ] Audit tracked/untracked secrets and generated artifacts.
- [ ] Define refresh-token revocation/rotation policy.
- [ ] Verify file path containment and upload content controls.
- [ ] Add readiness and external-dependency diagnostics.
- [ ] Add distributed scheduler locking or enforce one scheduler replica.
- [ ] Test SQL/evidence backup and restore consistency.

### Output

Approved production security and recovery posture.

### Challenge / Verification

- Secret scan passes.
- Authorization matrix tests pass.
- Restore drill passes.
- Parallel job challenge produces no duplicate task/notification effects.

## Phase 3 — Mobile Reproducibility and Release

### Objective

Make field-client source, build, signing, configuration, and release ownership reproducible.

### Source Documents

- `docs/mobile_apps_developmentplan.md`
- `docs/cm-mobile-plan.md`
- `docs/apk-publish.md`
- `docs/deployment-and-environment.md`

### Checklist

- [ ] Decide monorepo vs separate repository.
- [ ] Track only source and safe configuration.
- [ ] Remove local secrets, Pods, native build output, IDE metadata, and generated web bundles.
- [ ] Establish Android/iOS build verification.
- [ ] Test offline replay, push registration, biometric fallback, and forced update.

### Output

Reproducible, security-reviewed mobile build and release workflow.

### Challenge / Verification

- Clean checkout produces web/native builds.
- No secret/generated artifact scan failures.
- Update and offline failure-path tests pass on supported devices.
