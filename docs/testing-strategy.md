# Testing Strategy

Last reviewed: 2026-09-10. Commands are available checks, not claims that they passed during D0.

## Current delivery scope

The current priority is the desktop/browser application and its backend/database. Mobile-specific work and acceptance are deferred; retained mobile descriptions provide context and do not create desktop release gates. Follow the [desktop-first roadmap](implementation-roadmap.md) for the scoped checklist.

## Documentation verification

After installing root dependencies:

```sh
node scripts/docs/check-docs.mjs
```

The checker uses existing TypeScript and js-yaml dependencies, inspects the embedded OpenAPI without starting the API, checks snapshot parity/local references/path parameters, validates coverage freshness, confirms required documents/roadmap sections/historical banners, verifies local file links, and checks the table inventory against DDL.

When deliberately reconciling the contract:

```sh
node scripts/docs/check-docs.mjs --write-api
node scripts/docs/check-docs.mjs
```

Review changes before accepting an export. The exporter preserves embedded schemas and normalizes `servers` to `/`. A parity pass does not prove that Swagger covers all implementation routes or that responses match declared schemas. This is a focused structural check, not a full OpenAPI standards validator.

## Static and build checks

From the repository root:

```sh
npm run lint
npx tsc -p tsconfig.app.json --noEmit
npx tsc -p tsconfig.node.json --noEmit
npm --prefix backend run typecheck
npm run build
npm --prefix backend run build
```

For available PM Tech source, from `mobile/pm-tech`:

```sh
npx tsc -p tsconfig.json --noEmit
npm run build
```

The root `tsconfig.json` contains project references and an empty `files` list. A plain `npx tsc --noEmit` at the root is not sufficient evidence that web application files were checked. The mobile package does not currently declare a `lint` script. Do not repeat historical “mobile lint passed” claims without identifying the actual command/configuration.

## Database checks

Use a disposable database with explicit configuration. Apply schema twice; run `db:verify`; inspect final columns, constraints, indexes, and relationships beyond the script's partial inventory. Test exclusive asset/facility context, PM/CM type checks, approval values, and uniqueness under competing requests. Schema operations mutate data and were not run during D0.

## Workflow acceptance matrix

| Area | Positive path | Required challenge |
| --- | --- | --- |
| Authentication/roles | Local and LDAP login; role-specific action | Expired token, wrong role, changed roles, wrong assignee |
| PM setup | Asset/facility default template and recurrence | Wrong category, disabled context, inactive template |
| Scheduling | Generate due work and display projections | Broken/archived asset, Frozen, blackout, month boundary, duplicate PM Now |
| Task completion | Checklist, notes, attachment, completion | Required item skipped, missing evidence, oversize upload, invalid/future backdate |
| Approval | Submit, supervisor review, final approval | Invalid transition, repeated submit, missing evidence, own-work policy, returned work |
| Facility approval | Complete and update facility schedule | Compare finalization and next due with equivalent asset workflow |
| CM | Report, assign, execute, close downtime, resolve | PM/CM filter leakage, invalid context, unauthorized update |
| Reports | Known fixture totals and CSV/PDF output | Timezone boundary, cancelled work, approval inclusion, metric denominator |
| Notifications | Intended event reaches test recipient | Missing recipient, stale device token, provider failure, duplicate event |
| Mobile | Login, work, evidence, QR, push, update | Offline replay/conflict, expired refresh, device back, interrupted upload/install |

## Evidence format

Record date, revision, environment, requirement/question ID, command or scenario, expected result, actual result, and limitation. Preserve sanitized output or artifact links. For each completed roadmap item, link to evidence that specifically verifies that item.

Only D0 documentation checks are required for this documentation task. Application builds, integration tests, DB mutation, and device acceptance belong to the respective follow-up phases. Existing journal entries are historical reports, not fresh verification evidence.

## D1 audit-derived verification — 2026-09-11

Use the per-item scenarios in the [technical map](code-implementation-map.md). Prioritize direct endpoint bypasses, concurrent claim/submit/generation, template-edit versus snapshot transactions, retained historical evidence, actor deletion/handoff, multiple downtime intervals and shared PM/CM routes. No dedicated application test script was found in root/backend packages during this audit; introduce focused policy and disposable-SQL workflow coverage with implementation. The existing schema verifier must be extended for new columns, indexes, constraints and migration behavior. Static source findings do not satisfy these runtime checks.

## AF-02 executable checks

Run `npm run test:facilities` for the real Express router, JWT and role middleware with an injected deterministic SQL boundary. The harness never imports backend/index.ts or real env configuration. Run `node scripts/tests/facility-browser-fixture.mjs` for an isolated browser fixture on 127.0.0.1:4179. It explicitly uses same-origin fixture APIs; `/__fixture/Admin` and `/__fixture/Supervisor` select synthetic users, `?detail=1` opens detail and `?fail=1` simulates a refused mutation. Only loopback access is needed. These tests do not certify SQL persistence or deployment. See [evidence](verification-af02.md).
