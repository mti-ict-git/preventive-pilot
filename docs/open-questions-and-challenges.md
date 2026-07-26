# Open Questions and Challenges

This file records ambiguity that must not be silently converted into implementation assumptions.

## P0 — Resolve Before Production or Broad Collaboration

### OQ-001: Where is the canonical OpenAPI contract?

- **Observed:** `backend/src/index.ts` contains an embedded OpenAPI object; `AGENTS.md` requires `docs/openapi.yaml`.
- **Risk:** Runtime Swagger, clients, and reviewed documentation drift.
- **Smallest decision:** Make `docs/openapi.yaml` canonical and load/generate runtime docs from it, or define a generator that deterministically creates both.
- **Owner:** Backend lead.

### OQ-002: Is `mobile/pm-tech` part of this repository?

- **Observed:** A substantial mobile application exists locally, but `git ls-files mobile/pm-tech` returns zero.
- **Risk:** Builds are not reproducible; local secrets/generated Android/iOS artifacts may be lost or exposed.
- **Smallest decision:** Track a sanitized source-only mobile tree here or move it to a named separate repository and update all links.
- **Owner:** Product/engineering owner.

### OQ-003: Have mobile secrets been exposed?

- **Observed:** The local tree includes `.env.local`, `android/app/google-services.json`, iOS Pods, IDE state, and generated native/web output.
- **Risk:** Credentials/configuration leakage and oversized commits.
- **Smallest decision:** Perform a secret audit and rotate any sensitive value before source-control onboarding.
- **Owner:** Security/operations.

### OQ-004: What are the authoritative PM and approval state transitions?

- **Observed:** Behavior is spread across a large task route module, schema additions, UI logic, README history, and feature plans.
- **Risk:** Invalid transition, role bypass, inconsistent filtering/reporting.
- **Smallest decision:** Approve a state-transition table and encode it in tests.
- **Owner:** Product owner and backend lead.

## P1 — Resolve During Baseline Hardening

### OQ-005: Which historical plans remain active?

- **Observed:** Multiple PM, CM, mobile, push, delta, and implementation plans overlap; completion evidence is inconsistent.
- **Risk:** Agents implement stale requirements or mark work complete from prose alone.
- **Proposal:** Treat them as historical/supporting documents. Move only verified unfinished work into the active roadmap.

### OQ-006: Can jobs run in more than one API replica?

- **Observed:** In-process flags prevent overlap only within one Node process.
- **Risk:** Duplicate schedule, reminder, import, or sync side effects in multi-replica deployments.
- **Proposal:** One scheduler replica until a SQL/application distributed lock is implemented.

### OQ-007: What is the refresh-token security policy?

- **Observed:** Access and refresh tokens use the same secret; no persisted revocation, rotation, or token version was found.
- **Risk:** Stolen refresh tokens remain usable until expiry.
- **Decision needed:** Session table/rotation design or explicitly accepted risk and short TTL.

### OQ-008: What are supported production origins and public URLs?

- **Observed:** Defaults and compose values mention multiple localhost and public domains.
- **Risk:** CORS mistakes, incorrect docs/update URLs, and environment drift.
- **Decision needed:** Environment matrix for development, staging, and production.

### OQ-009: What is the evidence retention and recovery policy?

- **Observed:** Filesystem content and SQL metadata are separate.
- **Risk:** Orphans or metadata/file mismatch after restore, replacement, or failed writes.
- **Decision needed:** Retention, backup consistency point, reconciliation job, and restore drill.

### OQ-010: Is WhatsApp an approved integration?

- **Observed:** System routes expose WhatsApp settings/test behavior, but environment/schema documentation is less explicit than Graph/FCM.
- **Risk:** Unsupported operational dependency or undocumented secret handling.
- **Decision needed:** Approve, document provider/contract, or remove/feature-flag.

## P2 — Quality and Maintainability

### OQ-011: What automated test baseline is required?

- **Observed:** Lint/typecheck/build scripts exist; no tracked unit/integration/E2E suite was found.
- **Risk:** Large route/schema changes depend on manual regression.
- **Proposal:** Prioritize auth/authorization, PM/CM state machines, scheduling idempotency, evidence, and approval.

### OQ-012: Should API error envelopes be standardized?

- **Observed:** Most handlers provide `message`, but codes/details and status usage vary.
- **Risk:** Clients rely on message text and inconsistent failure handling.
- **Proposal:** Standard `{ message, code, details?, requestId? }` contract.

### OQ-013: Should large route modules be decomposed?

- **Observed:** Task, system, work-order, and embedded OpenAPI code are large.
- **Risk:** Review difficulty and coupled business logic.
- **Proposal:** Extract domain services incrementally behind regression tests; no broad rewrite.

### OQ-014: What is the exact product/Lovable project identifier?

- **Observed:** The prior README contained a placeholder project URL.
- **Risk:** Broken onboarding and unclear sync ownership.
- **Decision needed:** Record the correct project/link or intentionally omit it.

## Documentation Reconciliation Rules

- Do not mark a feature complete solely because a historical plan or journal says so.
- Prefer route/schema behavior for the current-state description, but record conflicts rather than silently blessing accidental behavior.
- A resolved question must update the relevant source documents and roadmap checklist in the same change.
