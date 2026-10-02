# Q-01 Desktop Contract Verification — 2026-09-27

The historical inventory in `d1-boundary-review.md` found 37 desktop-referenced operations missing from OpenAPI. All 37 are now documented in the embedded spec and exported YAML: 15 core operations and 22 system/device operations. Coverage is 127 of 141 literal route operations. Remaining operations have no static desktop caller or belong to deferred mobile surfaces; absence of a caller is not proof of non-use.

Contracts record actual behavior, including preferences replacement, user/role updates, integration test side effects, raw upload handling, and push delivery limitations. Documentation does not change provider behavior.

`node --test scripts/tests/desktop-contract.test.mjs` passes 14 tests. The harness executes actual routers and auth/role middleware with synthetic SQL and stubbed LDAP, Firebase, jobs and provider fetches. Response checks use the JSON Schema subset of OpenAPI; they do not constitute complete OpenAPI validation or live integration acceptance. No real provider messages were sent.

The task/work-order deletion boundary is now implemented and locally verified: PM-only generic deletion, complete owned-row cleanup, atomic audit and explicit conflicts for incoming history/recurrence references. See [deletion verification](verification-task-deletion.md). Deletion now has live SQL and temporary-storage acceptance through isolated local HTTP routes; Q-01 still retains the 14 remaining contracts and deployed database/storage/provider acceptance; Q-12 mapping remains unresolved.
