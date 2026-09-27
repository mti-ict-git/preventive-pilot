# CM-01 verification

Date: 2026-09-17.

## Scope

CM-01 local verification for supervisor-verified corrective-maintenance closure, same-WO correction return, independent restoration timing, repeated downtime intervals before closure, linked recurrence work orders after closure, desktop detail-page wiring, and API/documentation parity.

## Changed areas

- `db/schema.sql`
- `backend/src/routes/workOrders.ts`
- `backend/src/routes/tasks.ts`
- `backend/src/index.ts`
- `src/lib/api.ts`
- `src/pages/WorkOrders.tsx`
- `src/pages/WorkOrderDetail.tsx`
- `scripts/tests/task-checklist-harness.mjs`
- `scripts/tests/work-order-cm01.test.mjs`
- `package.json`
- `docs/openapi.yaml`
- `docs/api-coverage.md`
- `docs/functional-specification.md`
- `docs/security-and-access-model.md`
- `docs/database-schema-specification.md`
- `docs/open-questions-and-challenges.md`
- `docs/implementation-roadmap.md`

## Verification evidence

1. Backend typecheck

```bash
npm --prefix backend run typecheck
```

Result: passed.

2. Frontend production build

```bash
npm run build
```

Result: passed. Vite reported the pre-existing large-chunk warning only.

3. Frontend lint

```bash
npm run lint
```

Result: passed. ESLint reported the existing `.eslintignore` deprecation warning only.

4. Targeted CM-01 route tests

```bash
npm run test:cm01
```

Result: passed. Coverage includes:

- technician repair submission moves CM work to `pending_review`
- repair performer cannot verify-close their own work order
- return-for-correction rejects blank reasons and reopens the same WO
- restoration closes the active downtime interval before verify-close succeeds
- repeated downtime before closure stays on the same WO
- recurrence after closure creates a new linked WO

5. Shared-harness regressions after CM-01 additions

```bash
npm run test:as01
npm run test:ex01
```

Result:

- `test:as01` passed
- `test:ex01` passed

6. Documentation/OpenAPI parity

```bash
node scripts/docs/check-docs.mjs --write-api
node scripts/docs/check-docs.mjs
git diff --check
```

Result:

- Embedded OpenAPI export and `docs/openapi.yaml` refresh passed.
- Documentation checker passed after the CM-01 contract and status updates.
- `git diff --check` reported no whitespace or merge-marker issues.

## Notes

- Verification is local/static plus isolated route-harness coverage; no live SQL Server execution, browser walkthrough, or deployment acceptance is claimed in this record.
- `docs/openapi.yaml` and `backend/src/index.ts` were synchronized in the same work item because CM-01 changes backend routes, request bodies, detail payloads, and status semantics.
