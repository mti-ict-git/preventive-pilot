# D1 Regression Verification

Date: 2026-09-27. Source checkpoint: `1a50d88` plus existing uncommitted Q-04 work and this repair.

## Findings and repair

The initial whole-suite run reported 84 passes and 7 failures out of 91 counted tests, including failed parent tests. The failures came from three fixture mismatches, not evidence of seven independent application defects:

- The status-only reopen fixture omitted `MaintenanceType`, so the real PM route rejected the request before the broken-asset guard. Return the selected maintenance type.
- A broad CM task-query matcher intercepted full task-detail reads and omitted approval/submission fields, making legacy checklist provenance appear live. Exclude detail queries with `TaskNumber` so the complete detail row is used.
- The PM completion fixture required a technician-identity column that the actual completion query does not select. Match the actual timestamp/template query so completion validation executes.

Existing behavioral assertions were retained. The fixture repair itself changes no application route or business policy; the separately described partial-update fix below changes the facility settings route. Pre-existing Q-04 harness and documentation edits were preserved.

## Executed evidence

- Targeted AF-01/TC-01/TC-02 run: 18/18 passing tests.
- Full suite after fixture repair: 91/91 passing. After the facility partial-update regression was added, `node --test scripts/tests/*.test.mjs` passed 99/99 with no failures/cancellations/skips, including Q-04 parity.
- Frontend app/tooling typechecks, backend typecheck/build, and ESLint passed. ESLint retains its existing `.eslintignore` deprecation warning.
- Documentation checker/OpenAPI parity and `git diff --check` passed. Coverage remains 90/141 operations; the inventory does not close the 51 contract gaps.

## Facility partial-update correction

Source review also found that `PUT /api/facilities/{facilityId}/pm-settings` cleared omitted template/due fields. The route now uses explicit field-presence flags in its atomic MERGE, matching the established asset partial-update semantics. Toggle-only requests preserve template and due dates. Explicit null clears remain supported; supplying a template without a due date resets dates for recalculation. Existing role permissions, insert defaults, and task lifecycle remain unchanged.

`facility-pm-settings.test.mjs` passes 8/8 counted tests covering omitted fields, explicit clears, date/template combinations, unchanged task/master boundaries, empty input, and forbidden technician writes. These are real HTTP/router checks with captured SQL bindings and preservation branches, not live SQL execution.

## Documentation reconciliation

Updated stale CM-01 next-action text, Q-14 permission wording, the historical map banner, and regression instructions. The [remaining boundary review](d1-boundary-review.md) classifies all 51 uncovered routes and records current asset/facility behavior separately from pending decisions. Q-01 and applicable Q-12/Q-14/Q-15 boundaries remain open; D2/D3 are not complete.

## Contract review and limits

Reviewed the relevant task/facility routes and OpenAPI. Updated the embedded facility PM-settings operation description and regenerated `docs/openapi.yaml` in the same work item to describe omitted-field preservation, explicit clears, template-triggered recalculation, and unchanged existing-task behavior. No schema migration is required. No real SQL Server, LDAP, upstream inventory, notification recipient, browser acceptance, or deployed service was exercised.
