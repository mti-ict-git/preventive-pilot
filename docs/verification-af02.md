# AF-02 verification — 2026-09-11

## Scope and result

Implemented facility master permissions on top of source checkpoint b3b11c7 and the existing uncommitted D1 documentation. No database schema or deployment change. AF-02 source implementation is complete with local authorization and browser evidence; D1 as a whole remains active.

| Operation | Backend guard | Desktop coverage |
| --- | --- | --- |
| POST /api/facilities | Admin/Superadmin | Create dialog hidden for other roles |
| PUT /api/facilities/{facilityId} | Admin/Superadmin | Save details, archive and list bulk archive; readable master fields retained |
| POST /api/facilities/{facilityId}/clone | Admin/Superadmin, even with PM settings | Clone menu/dialog hidden for other roles |
| PUT /api/facilities/{facilityId}/pm-settings | Existing requireManager | Supervisor PM controls retained |
| POST /api/facilities/{facilityId}/pm-now | Existing requireManager | Supervisor PM Now retained |
| GET list/detail | Existing authentication | Read access retained |

## Automated evidence

- `node --test scripts/tests/facility-permissions.test.mjs` (also available as `npm run test:facilities`): 37 passing tests (one parent plus 36 subtests). Real Express facility router, JWT verification and role middleware; SQL requests are intercepted by a deterministic test boundary. Tests cover create/edit/archive/activate/clone with/without PM settings for Admin, Superadmin, Supervisor, Technician and Viewer; unauthenticated rejection; readable list/detail for every role; Supervisor PM settings; master-field smuggling through PM settings; role normalization/refreshed grants/failed role lookup; invalid update body.
- PM Now regression checks handler admission with an invalid UUID: Supervisor reaches validation (400), Technician is rejected (403). It does not claim successful PM task generation or execution against SQL Server. Shared requireManager and task/template execution/assignment handlers were not modified.
- `npm run lint`: passed after a narrowly documented suppression for the existing documentation checker's intentional control-character regex. Existing ESLint ignore-file deprecation warning remains.
- Frontend `npx tsc -p tsconfig.app.json --noEmit`, tooling `npx tsc -p tsconfig.node.json --noEmit`, and backend typecheck: passed.
- Frontend and backend production builds: passed. Existing Browserslist-age and large-chunk frontend warnings remain.
- `node scripts/docs/check-docs.mjs`: passed, including embedded OpenAPI parity and 295 references. Coverage now 65/134 operations; 69 unrelated operations remain undocumented.
- `git diff --check`: passed.

## Browser evidence

Used Chrome with the real frontend and real facility router through `scripts/tests/facility-browser-fixture.mjs`. Fixture supplies synthetic SQL results and ancillary reads; it is not a production login/session.

- Supervisor list: no Create Facility or Archive Facilities; row menu contains Set Template but no Clone. Details/PM Now/Toggle PM remain visible.
- Supervisor detail: name/description read-only, location disabled, Save Details and Archive Facility absent; explanatory text shown. PM settings and Save remain enabled. Invoked PM save against fixture.
- Admin list: Create Facility and bulk Archive visible. Create succeeds and closes its dialog, restoring focus to trigger. Clone menu opens, copies PM settings by default and succeeds through fixture.
- Admin detail: editable master fields and Save Details/Archive controls present. Invoked save; archive confirmation initially focuses Cancel. Escape closes confirmation and restores focus to Archive Facility.
- Failure fixture: create returns 403; entered name remains and error is visible inside the dialog. Save becomes available for retry.
- At 640 × 800, the failed-create modal, input, error and Save fit the viewport. Inspected screenshot; restored normal viewport afterward. The existing full application sidebar/table responsive behavior was not redesigned.

## API and supporting documents

Updated embedded OpenAPI and docs/openapi.yaml in the same work item: create authorization description plus previously missing update and clone contracts. Refreshed api-coverage.md. Added DESIGN.md/UX-CONTRACT.md as scoped records of existing visual/interaction owners. Existing API client payload shapes are unchanged.

The supplementary whole-project premium UI audit returned existing ownership/legacy-form findings, not a clean global UI certification. Its two actionless-button findings on Facilities refer to Radix DialogTrigger/DropdownMenuTrigger wrappers verified working in the browser; its Select finding also detects authored Select components. Native create-location and authored detail-location ownership are explicitly recorded in UX-CONTRACT.md. Unrelated native dates, textareas and layout consistency need separate work; no broad UI rewrite was included in AF-02. Raw audit: verification-af02-ui-audit.json.

## Limits

No real SQL Server, LDAP, Snipe-IT, notification delivery, task execution or deployed instance was exercised. No claim of immediate privileged-token revocation: existing middleware semantics are retained. No task/workflow behavior beyond scoped facility master permissions changed. Local tests establish route authorization before business SQL, not persistence or external readiness. TC-01 and remaining roadmap implementation items are still pending.
