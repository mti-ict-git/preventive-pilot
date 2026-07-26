# Testing Strategy

## Current Baseline

Tracked scripts provide lint, TypeScript checks, builds, schema apply, and schema verification. No repository-managed unit, API integration, or browser E2E suite was found during the audit.

## Required Layers

1. **Static:** ESLint, frontend/backend TypeScript, OpenAPI validation.
2. **Unit:** due-date calculations, status transitions, authorization decisions, path containment, parsing/mapping.
3. **API integration:** Express handlers against isolated SQL Server plus temporary evidence storage.
4. **Job integration:** idempotency, retry, overlap, blackout/frozen/broken behavior.
5. **Web E2E:** login, task execution, approvals, CM, administration, reporting.
6. **Mobile:** browser-mode flows plus Android/iOS device tests for native features.
7. **Operations:** compose, dependency failure, backup/restore, and update delivery.

## Critical Scenarios

- LDAP/local login, invalid credentials, expired access, refresh success/failure.
- Technician versus manager/superadmin route and record permissions.
- PM generation duplicates, blackout, frozen schedules, broken assets, facility parity.
- Required checklist note/evidence, approval locks, reject/revise/reopen.
- CM report through resolution and downtime close.
- Evidence upload/download/delete, traversal, missing file, storage failure.
- Snipe sync archive behavior and image/responsibility mapping.
- Notification retry/logging and duplicate avoidance.
- App update disabled/optional/forced, invalid signature, upstream failure.

## Evidence Standard

Roadmap evidence records:

- exact command/test name;
- environment or fixture;
- relevant result/count;
- failure path challenged;
- commit or work item.

Passing lint/typecheck alone is not proof of workflow correctness.
