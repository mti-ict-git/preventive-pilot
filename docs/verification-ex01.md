# EX-01 Verification

Date: 2026-09-16

## Scope

EX-01 implements timed PM execution, failed-finding work-order linkage, and distinct revise versus reject return-to-work semantics.

Validated behaviors:

- PM Start/Resume opens at most one active persisted work session per task.
- PM Submit, Complete, Cancel, Revise, Reject, and final approval close any open PM work session.
- Revision requires a nonblank reason.
- Rejection preserves the original PM task and creates or reuses one linked replacement PM task.
- Failed PM findings can create a CM work order explicitly and reuse the existing linked work order on repeated requests.
- Task detail exposes additive PM work-session summary data.

## Verification Evidence

### Targeted EX-01 tests

Command:

```bash
npm run test:ex01
```

Result:

- Passed `start is idempotent and creates only one open work session`
- Passed `submit for approval closes the open work session`
- Passed `revise approval requires a nonblank reason`
- Passed `reject approval creates one linked replacement task`
- Passed `failed finding work order creation reuses the existing linked work order`

### Regression checks

Commands:

```bash
npm run test:tc01
npm run test:tc02
npm run test:af01
npm run test:as01
npm run test:sc01
```

Result:

- `test:tc01` passed
- `test:tc02` passed
- `test:af01` passed
- `test:as01` passed
- `test:sc01` passed

### Static/build verification

Commands:

```bash
npm --prefix backend run typecheck
npm run build
node scripts/docs/check-docs.mjs --write-api
git diff --check
```

Result:

- Backend typecheck passed.
- Frontend production build passed.
- Documentation checker passed and refreshed `docs/api-coverage.md`.
- `git diff --check` reported no whitespace or merge-marker issues.

## Notes

- Verification used the local route-level harness and static build/typecheck checks; no live database deployment or browser acceptance run is claimed in this record.
- EX-01 documentation and contract updates were synchronized in `docs/openapi.yaml`, `backend/src/index.ts`, the roadmap, functional specification, open questions, and database schema specification.
