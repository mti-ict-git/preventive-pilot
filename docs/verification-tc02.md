# TC-02 verification — 2026-09-16

## Scope and result

Implemented TC-02 for PM checklist-definition preservation. Successful technician `submit-for-approval` now captures an additive `PMTaskChecklistSnapshots` record set in the same transaction as the approval transition, and later PM readers prefer that frozen definition over live template rows.

Outcome:

- First successful PM technician submission freezes sort order, item text, requirement flags, active state, and source template version.
- Failed submissions do not leave a committed misleading snapshot because snapshot creation and approval transition share one transaction.
- Returned/reopened PM work retains the original submitted snapshot instead of silently switching to later template edits.
- PM task detail, checklist evidence labeling, checklist progress counts, and PDF export now read the frozen definition when present.
- Legacy historical tasks without a preserved snapshot fall back to the current template, but the API/UI/PDF note that this is a live fallback rather than original historical certainty.

## Automated evidence

- `npm run test:tc02`: 4 passing HTTP tests against the real task router with an isolated SQL fixture boundary. Coverage includes:
  - snapshot creation on successful submit,
  - rollback behavior on failed submit,
  - returned/resubmitted work continuing to validate against the frozen snapshot instead of edited live template rows,
  - task detail returning frozen text/order plus explicit legacy fallback provenance.
- `npm run test:tc01`: passed regression after TC-02 changes.
- `npm --prefix backend run typecheck`: passed.
- `npx tsc -p tsconfig.app.json --noEmit`: passed.

## Contract and documentation evidence

- Updated [`db/schema.sql`](../db/schema.sql) and [`scripts/db/verify-schema.mjs`](../scripts/db/verify-schema.mjs) to add `PMTaskChecklistSnapshots` to the additive schema model and verification inventory.
- Updated [`functional-specification.md`](functional-specification.md), [`database-schema-specification.md`](database-schema-specification.md), [`open-questions-and-challenges.md`](open-questions-and-challenges.md), and [`implementation-roadmap.md`](implementation-roadmap.md) so snapshot cutoff, returned-work behavior, and legacy fallback handling match the implementation.
- Updated embedded OpenAPI and [`docs/openapi.yaml`](openapi.yaml) to describe the snapshot capture behavior and task-detail checklist provenance fields.

## Limits

- No live SQL Server migration/application, browser session, or deployed environment was used for TC-02 verification.
- Legacy historical tasks still cannot recover the true original checklist if no snapshot was ever captured before this change; the implementation makes that uncertainty explicit instead of reconstructing from unavailable data.
- Template deletion/import/reset compatibility beyond the active PM task readers implemented here was not expanded in TC-02.
