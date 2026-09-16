# TC-01 verification — 2026-09-15

## Scope and result

Implemented TC-01 for PM task checklist validation. The backend now applies one PM checklist-validation baseline to `complete`, `submit-for-approval`, and superadmin checklist correction for shared item-level rules, while keeping the documented privileged exception that only submit/complete require the full mandatory active set. The desktop task flow and template wording were updated to match the resolved `RequiresNotes` boundary.

Outcome:

- Fail always requires nonblank notes.
- Mandatory status alone no longer forces notes on Pass/Done.
- Explicit `RequiresNotes` now remains visible as an intentional Pass/Done requirement instead of a hidden mandatory side effect.
- PM submit now validates checklist membership, duplicates, inactive items, mandatory non-skip outcomes, notes, and attachments before writing approval state.

`submit-for-approval` still does not set lifecycle `Status = completed`; that state boundary remains open under Q-02 and was not changed by TC-01.

## Automated evidence

- `npm run test:tc01`: 8 passing HTTP tests against the real task router, JWT auth, and role middleware with an isolated SQL fixture boundary. Coverage includes:
  - submit rejects Fail without notes,
  - submit accepts Fail with notes,
  - submit still requires every mandatory active item,
  - explicit notes-on-pass configuration is enforced,
  - duplicate and inactive checklist item IDs are rejected,
  - complete allows mandatory Pass without notes,
  - complete still enforces required attachments.
- `npm --prefix backend run typecheck`: passed.
- `npx tsc -p tsconfig.app.json --noEmit`: passed.
- `npm run lint`: passed. Existing ESLint warning about legacy `.eslintignore` remains.
- `npm run build`: passed. Existing Browserslist-age and large-chunk warnings remain.
- `npm --prefix backend run build`: passed.
- `git diff --check`: passed.

## Contract and documentation evidence

- Updated embedded OpenAPI and [`docs/openapi.yaml`](openapi.yaml) for PM complete and submit request bodies plus the missing `403` response on complete.
- Updated [`functional-specification.md`](functional-specification.md), [`open-questions-and-challenges.md`](open-questions-and-challenges.md), and [`implementation-roadmap.md`](implementation-roadmap.md) so TC-01 status, the `RequiresNotes` interpretation, and the remaining Q-02 boundary match the implementation.

## Limits

- No live SQL Server, browser session, or deployed environment was used for TC-01 verification.
- CM work-order completion logic was not changed in this item.
- Unexpected database failure handling during these routes was not expanded in TC-01; this record only covers the documented checklist-validation contract.
