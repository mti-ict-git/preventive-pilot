# AF-01 Verification

Date: 2026-09-16

## Scope

Verify that broken assets cancel unfinished PM work without deleting history, keep new PM work blocked, and avoid affecting CM or completed PM records.

## Result

Passed locally.

## Automated evidence

- `npm run test:af01`
  - 5 passing HTTP regression tests covering:
    - submit-for-approval on a broken asset returns `409 ASSET_BROKEN` and auto-cancels the PM task
    - repeated blocked task actions stay idempotent after the first cancellation
    - reopen stays blocked while the related asset remains broken
    - PM Now rejects broken assets before creating a task
- `npm run test:tc01`
  - confirmed the shared PM checklist validation flow still passes after the broken-asset guards
- `npm run test:tc02`
  - confirmed checklist snapshot behavior still passes after the broken-asset guards

## Static/build evidence

- `npm --prefix backend run typecheck`
- `npm --prefix backend run build`
- `npm run build`
- `npm run lint`

## Contract/documentation evidence

- Updated `backend/src/index.ts` and `docs/openapi.yaml` for:
  - `409` broken-asset conflicts on PM Now, start, pause, resume, complete, and submit-for-approval
  - documented `POST /api/tasks/{taskId}/reopen`
- Updated:
  - `docs/functional-specification.md`
  - `docs/database-schema-specification.md`
  - `docs/open-questions-and-challenges.md`
  - `docs/implementation-roadmap.md`

## Behavioral evidence captured by implementation

- Snipe-IT sync now auto-cancels unfinished PM asset tasks when the synchronized operational status becomes `broken`
- cancellation is recorded through:
  - `PMTasks.Status = cancelled`
  - `PMTasks.CancelledAt`
  - `PMTasks.CancelledReason`
  - system `AuditLog` rows with `task.cancel.asset-broken`
- completed/cancelled PM history remains intact
- CM work orders are not auto-cancelled by this policy
- schedule insertion and PM Now both recheck asset eligibility at mutation time
- lifecycle actions that would make PM work actionable again are blocked while the asset remains broken

## Limits

- Verification used isolated router/harness boundaries and local builds only; no live SQL Server, Snipe-IT environment, or deployed browser session was used for this work item.
- Reporting denominator decisions under Q-09 remain open; AF-01 verification only confirms cancellation behavior, not final compliance metric policy.
