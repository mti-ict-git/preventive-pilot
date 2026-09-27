# Q-01 / Q-09 Verification

Date: 2026-09-17

## Scope

Local verification for the D1 reporting/dashboard boundary:

- desktop-used OpenAPI coverage for dashboard, reports, and system logs
- compliance and overdue report semantics
- CM MTTR definition exposure
- PM-only dashboard KPI queries

## Changed areas

- `backend/src/routes/reports.ts`
- `backend/src/routes/dashboard.ts`
- `backend/src/index.ts`
- `src/lib/api.ts`
- `scripts/tests/reporting-contract-policy.test.mjs`
- `docs/functional-specification.md`
- `docs/open-questions-and-challenges.md`
- `docs/implementation-roadmap.md`

## Verification evidence

1. Targeted reporting/dashboard route policy test

```bash
npm run test:q01q09
```

Validated:

- compliance SQL keeps facility-aware location filtering and excludes cancelled tasks from the denominator
- overdue report JSON and CSV include facility context columns
- CM metrics keep MTTR as `ReportedAt -> CompletedAt`
- dashboard overview KPI queries stay PM-only

2. Backend typecheck

```bash
npm --prefix backend run typecheck
```

3. Frontend build

```bash
npm run build
```

4. OpenAPI export and documentation parity

```bash
node scripts/docs/check-docs.mjs --write-api
node scripts/docs/check-docs.mjs
```

## Notes

- The D1 desktop reporting contract is now explicit in OpenAPI and product docs.
- Broader non-report route inventory in `docs/api-coverage.md` remains a follow-up under Q-01 when those routes are touched.
