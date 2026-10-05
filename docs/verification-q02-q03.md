# Q-02 / Q-03 Verification

Current policy update (2026-10-05): the user permits Supervisor own-submission approve/revise/reject at PendingSupervisor only. Earlier dated blanket-prohibition evidence is historical; final-stage and CM restrictions remain. See the current correction evidence at the end of this document.

Date: 2026-09-27

## Scope

Local verification for the PM approval boundary discussion after EX-01:

- submission versus lifecycle completion (`submit-for-approval`)
- repeated submission behavior
- current PM approval route-role matrix
- current PM maker-checker prohibition for same-user review actions
- regression coverage for the surrounding PM execution workflow

## Changed areas

- `scripts/tests/task-checklist-harness.mjs`
- `scripts/tests/pm-approval-boundaries.test.mjs`
- `package.json`
- `docs/functional-specification.md`
- `docs/security-and-access-model.md`
- `docs/open-questions-and-challenges.md`
- `docs/implementation-roadmap.md`

## Verification evidence

1. Targeted PM approval boundary tests

```bash
npm run test:q02q03
```

Validated:

- `submit-for-approval` moves PM work into `PendingSupervisor` without forcing lifecycle `Status = completed`
- repeated submission is rejected once the task is already waiting for approval
- supervisor-stage approval accepts `Supervisor`, `Admin`, and `Superadmin`
- supervisor-stage approval rejects same-user own-work approval, including a same-user `Technician + Supervisor` token
- `revise-approval` rejects `Admin` and accepts `Supervisor` / `Superadmin`
- same-user PM performers are rejected when they attempt `revise-approval` or `reject-approval` at either approval stage
- `approve-by-superadmin` rejects non-Superadmin reviewers

2. Regression coverage for related PM execution semantics

```bash
npm run test:ex01
```

Validated that the new approval-boundary harness support does not regress:

- PM work-session closure on submission
- revision reason validation
- rejection replacement-task behavior
- finding-linked work-order reuse

3. Documentation parity and diff hygiene

```bash
node scripts/docs/check-docs.mjs
git diff --check
```

## Notes

- Q-02 is now explicit and locally verified for the current desktop/web PM contract.
- Q-03 is now implemented locally: PM review follows a maker-checker rule and blocks the performer from reviewing the same submitted PM task.
- Backend review-route behavior changed in this step, so `backend/src/index.ts` and `docs/openapi.yaml` were updated together.


## Supervisor own-submission correction — 2026-10-05

User direction supersedes the earlier blanket PM prohibition: a Supervisor may approve, revise or reject their own PM at PendingSupervisor, including Technician/Supervisor users. Existing route roles remain; same-user PendingSuperadmin review, both final approval paths, and CM self-verification remain forbidden.

Backend guards and embedded/canonical OpenAPI descriptions are synchronized. No UI change or SQL/schema migration is required. Local relevant HTTP/policy regression passed 18/18 tests, backend typecheck and documentation/contract checks passed. Final-source Linux checks passed on `802ab79b833430061a7d5bf2e0e9ca4f182dbd43`: all 160 regressions, lint, backend/frontend typechecks and builds, schema-source inventory, and documentation/OpenAPI parity. The subsequent user-authorized production rollout is recorded below.

Authorized production data correction: task `PM-20260106-12D5A750` had submitter `widji.santoso`; only `TechnicianCompletedByUserId` was changed to the existing active `it.support.assistant` / IT Support Assistant [MTI] account, which was already assigned to the task. Serializable transaction, row lock, exact identity/state guards and comparison of every other task column passed. The same transaction inserted `task_submitter.correct` audit metadata preserving the original actor and reason. Status remains completed / PendingSupervisor; submission time, checklist and evidence were not edited; no approval or notification was performed. Protected before/after evidence: `/var/backups/preventive-pilot/submitter-correction-20261005T025346Z/correction.json`.

Release preparation follow-up, 2026-10-05: the first exact-source Linux check passed 159/160 regressions; Windows Git archive conversion exported the deployment shell script with CRLF and Bash rejected `pipefail`. Added `*.sh text eol=lf` in `.gitattributes` to preserve portable shell input. The policy source was unaffected; final-source verification must pass before release.

The second Linux run passed all 160 regressions, lint, backend/frontend typechecks and builds, and schema-source inventory. Its final documentation check exposed the same archive CRLF conversion in generated Markdown equality. Added explicit Markdown LF export alongside the shell rule, and preserved UTF-8 documentation punctuation. These packaging/documentation fixes do not change application behavior; final archive checks are being repeated.


Final candidate preparation: exact-source archive LF/UTF-8 checks and the complete Node 22.23.3 Linux verification sequence passed. Protected candidate audit is `/var/backups/preventive-pilot/own-review-candidate-20261005T030948Z`; only an API candidate was built. Runtime configuration checkpoint and exact CIFS share/nested-root checks passed. Prior API image remains tagged `preventive-pilot-api:rollback-own-review-20261005T030410Z`. No schema migration is needed. Hermes review `run_df4ec84e3af7465b93b4e7a327864c98` found no concrete blocker in supplied policy excerpts; it did not independently fetch the unpublished source or execute production operations. Application policy source is unchanged across the subsequent packaging/documentation corrections.

Authenticated production read-only acceptance confirmed Technician Completed and Workflow Submitted by both display IT Support Assistant [MTI] for the corrected task. Modal close retained Pending Supervisor. No real approval/rejection/revision was performed; during candidate preparation the production API policy still used the previous release. Automatic approval review rejected default-branch push as lacking explicit publication authorization. That initial publication/activation hold was superseded by the user authorization recorded below. Candidate build and read-only/network-isolated compiled guard inspection passed. API image `sha256:b8edc766c92018c58dc7083a620e9cdd1dc697ef10263e5ef55f74c0556b5eff`, tag `preventive-pilot-api:own-review-802ab79-20261005T030948Z`, has exact OCI revision `802ab79b833430061a7d5bf2e0e9ca4f182dbd43`. Audit stage is `candidate-prepared`; actual API/web container IDs and images matched their baseline after build. No active image tag was replaced and no container restarted. The subsequent local commit records documentation-only evidence; it is separate from the candidate image source. Wider D2 recovery/D3 acceptance remains open.


### Authorized API production release

The user explicitly approved push to main and deployment. Local/origin main `ed91297987af9a839f9347fd0916d26513e79bda` was published, and production fast-forwarded from `ef11d0e` while preserving runtime-local Compose and env files. Its difference from the candidate source `802ab79b833430061a7d5bf2e0e9ca4f182dbd43` is documentation-only. Codex executed the existing pinned SSH/sudo relay; Hermes was asked to verify independently, not to execute host Compose.

Activated only `api` using the verified image, the existing `preventive-pilot` Compose project/base/production overlay, and `up -d --no-build --pull never --no-deps --wait --wait-timeout 120 api`. Actual API image/revision matched the candidate and health passed. Web container/image/revision `ce0dbd2` remained unchanged. Env/Compose bytes, Firebase/evidence mounts, exact CIFS share, nested logical evidence root and CIFS startup guard were preserved. No SQL schema migration, repeated data correction, live approval/rejection/revision or test notification was performed. The earlier single submitter correction remains intact.

Post-release gates passed: Nginx-to-API proxy, public HTTPS OpenAPI own-submission description, compiled Supervisor exception count (three), live SQL task read, actual-container CIFS type, authenticated Tasks detail/read and modal close retaining Pending Supervisor. Task `PM-20260106-12D5A750` remains completed/PendingSupervisor with `it.support.assistant`, original technician completion time, and preserved checklist/evidence. Browser proof was captured locally as `preventive-own-review-production-20261005.png`. Final-stage and CM own-work rejection are proven by isolated regressions; no real business approval was attempted to test them in production.

Protected audit `/var/backups/preventive-pilot/own-review-candidate-20261005T030948Z` reached `runtime-verified`; final documentation synchronization records `verified`. Independent Hermes verification `run_2dc8f473cb87418c9259e4b3ea1ff6a0` passed actual API/web identity and health (zero restarts), bind/CIFS filesystem and public HTTPS/proxy contract. Hermes did not independently establish compiled guard normalization, host checkout HEAD, full nested logical evidence-root usage or CM restrictions. Codex separately checked the exact normalized compiled guard count (three), host SHA/configuration and existing nested path; the unchanged final/CM restrictions have isolated regression evidence. These reviewer limits are not a confirmed runtime failure. Prior API rollback tag remains `preventive-pilot-api:rollback-own-review-20261005T030410Z`; image rollback is schema-compatible because no schema change was made. No rollback/restore was exercised, and image rollback would not undo the separately audited submitter correction. Backend/OpenAPI/access/workflow, regression, packaging and roadmap documentation are synchronized. Wider D2 recovery and D3 business acceptance remain open.
