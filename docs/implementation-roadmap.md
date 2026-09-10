# Implementation Roadmap

Last reviewed: 2026-09-10.

## Active phase

**D0 — Documentation baseline (complete, 2026-09-10).** This phase reconstructs the documentation baseline for an existing application. It does not represent a new implementation of the product. No application implementation phase is active. D1 is the proposed next phase; D1–D3 have not started and are not authorized application changes in D0.

Historical plans describe earlier intentions; an unchecked historical item is not proof that a feature is missing. Source inspection establishes implementation presence, not runtime correctness.

## D0 — Documentation baseline

### Objective

Establish the English documentation set required by [AGENTS.md](../AGENTS.md), reconcile conflicting guidance, and make verification gaps explicit without changing application behavior.

### Source documents

- [Documentation index](README.md) and the historical sources listed there.
- Existing root/mobile README, implementation plans, PM enhancement plans, mobile plans, journal, and APK publication guide.
- Evidence: backend routes and embedded OpenAPI, `db/schema.sql`, package scripts, Docker files, and available mobile source.

### Checklist

- [x] D0.1 Replace the entry README and publish the eight mandatory documents. [Evidence](documentation-verification.md#d01--mandatory-documents-and-entry-points).
- [x] D0.2 Reconcile architecture, environment, PM/CM workflow, mobile, and deployment guidance; preserve historical context. [Evidence](documentation-verification.md#d02--reconciliation-and-historical-preservation).
- [x] D0.3 Publish a reproducible OpenAPI baseline and record route coverage gaps. [Evidence](documentation-verification.md#d03--openapi-baseline-and-coverage).
- [x] D0.4 Verify documentation links, required sections, contract references, source parity, and schema inventory; record evidence and update this roadmap. [Evidence](documentation-verification.md#d04--structural-verification).

- [x] D0.5 Record the user-directed desktop-first priority and defer mobile-only gates. [Evidence](documentation-verification.md#d05--desktop-first-scope-follow-up).

### Output

An indexed documentation baseline, supporting operational guidance, a documented API snapshot, and an explicit register of unresolved questions.

### Challenge / verification

Record results in [documentation verification](documentation-verification.md). Check for misleading claims of completed runtime verification, missing setup prerequisites, obsolete mobile paths, stale contract exports, and incomplete roadmap phases. Completion requires all D0 checks to pass; application acceptance remains a separate phase.

## Current priority — Desktop/web first

User direction, 2026-09-10: prioritize the browser-based desktop application and its supporting backend/database. Mobile questions Q-06, Q-07, and Q-11 are deferred, not resolved, and do not block desktop acceptance. Mobile-only API operations, APK delivery, native integrations, and mobile verification are excluded from D1–D3 for now. Preserve shared API compatibility when making desktop-related backend changes. Resume mobile work only when explicitly brought back into scope.

## D1 — Contract and workflow reconciliation

Status: proposed; not started.

### Objective

Resolve differences between documented desktop/web behavior, supporting API definitions and routes, and PM approval/scheduling behavior.

### Source documents

[Functional specification](functional-specification.md), [OpenAPI](openapi.yaml), [API coverage](api-coverage.md), [data model](database-schema-specification.md), [access model](security-and-access-model.md), and [open questions](open-questions-and-challenges.md).

### Checklist

- [ ] Agree on completion versus submission semantics and required checklist validation at each transition (Q-02).
- [ ] Verify approval authorization, self-approval policy, and facility/asset scheduling parity (Q-03, Q-04).
- [ ] Identify desktop/web API dependencies and reconcile their request, response, and error schemas (Q-01); retain mobile-only coverage gaps as deferred.
- [ ] Confirm report denominators, approval inclusion, MTTR, and timezone boundaries (Q-09).
- [ ] Record decisions, update implementation only within the agreed scope, and run regression checks.

### Output

A reconciled API/workflow contract and recorded decisions with regression evidence.

### Challenge / verification

Use an isolated test database. Exercise technician, Supervisor, Admin, and Superadmin requests; challenge invalid transitions, missing evidence, repeated submissions, concurrent PM Now calls, broken/frozen schedules, and facility approval. Verify both successful and rejected requests against the contract. Do not close using typecheck alone.

## D2 — Reproducible environment and delivery

Status: proposed; not started; depends on applicable D1 decisions.

### Objective

Make desktop/web and backend fresh-checkout setup and deployment reproducible.

### Source documents

[Technical plan](technical-implementation-plan.md), [deployment](deployment-and-environment.md), [testing](testing-strategy.md), and [open questions](open-questions-and-challenges.md).

### Checklist

- [ ] Decide whether local-only authentication may start without LDAP configuration (Q-05).
- [ ] Validate clean setup, repeatable schema application, and expand schema verification coverage (Q-08).
- [ ] Establish CI commands, environment templates, release evidence, backup/restore ownership, and rollback procedure (Q-10).

### Output

A verified installation and release runbook with reproducible inputs.

### Challenge / verification

Use a fresh checkout and disposable database, apply schema twice, restart services, verify same-origin API routing, and verify the desktop browser application. Verify backup restoration before making recovery claims. Capture actual versions and command results.

## D3 — End-to-end operational acceptance

Status: proposed; not started; depends on D1 and D2.

### Objective

Validate desktop/web CMMS workflows and supporting integrations in a representative staging environment.

### Source documents

[Project plan](project-plan.md), [functional specification](functional-specification.md), [integration contracts](integration-contracts.md), [testing strategy](testing-strategy.md), and [operational runbook](operational-runbook.md).

### Checklist

- [ ] Verify PM and CM execution, evidence, approval, reporting, and role restrictions end to end.
- [ ] Verify Snipe-IT synchronization, desktop-relevant notification behavior, retry behavior, and job observability; defer native mobile push delivery tests.
- [ ] Record business acceptance criteria, owners, remaining limitations, and release decision.

### Output

A dated acceptance report tied to a commit, environment, and test evidence.

### Challenge / verification

Test loss of connectivity, expired credentials, duplicate actions, absent storage, failed external services, rejected approval, and timezone boundaries. External messages must use explicitly authorized test recipients. Close only after evidence is attached and unresolved release blockers are addressed.
