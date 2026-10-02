# Q-05: optional LDAP for local-only authentication

Date: 2026-09-29. Phase: D2. The user approved local-only startup without LDAP configuration.

## Implemented contract

- Database configuration and JWT secret remain required. All eight LDAP connection/search fields may be absent or empty. If any is populated, every field must be nonblank; partial configuration fails startup. LDAP timing/TLS settings alone do not enable directory access. Password contents are preserved.
- Local login remains explicitly selected through the existing Local tab or `provider: "local"`. Omitted provider retains the existing LDAP default; there is no credential fallback between providers.
- Directory client creation fails before network access when LDAP is absent. Login, nonblank directory search, LDAP assignment, and LDAP profile refresh translate this condition into HTTP 503 with `{ "message": "LDAP is not configured", "code": "LDAP_NOT_CONFIGURED" }`.
- Existing authentication, roles, input validation, and user lookup rules remain in effect. Blank directory searches still return an empty list. Refreshing a missing or non-LDAP user retains its existing response.
- Existing account bootstrap remains `npm --prefix backend run create-local-superadmin`; use the deployment guide and configured target database. No accounts were created during this verification.

## Verification evidence

`node --test scripts/tests/local-only-auth.test.mjs` passes three groups:

1. Real environment parser with isolated variables: missing/empty LDAP accepted, tuning-only accepted, each partial configuration rejected, short JWT and missing DB password rejected.
2. Real LDAP module with simulated client: configured directory authentication, failed credential binding, and client cleanup.
3. Real Express auth/system routes over loopback HTTP: local token issuance, wrong local password 401, explicit/default LDAP 503, admin search/assignment/refresh 503, anonymous 401, unauthorized role 403. No directory client is created and no database writes occur.

Full regression: `node --test scripts/tests/*.test.mjs` passed **149/149**. The additional wrong-directory-password cleanup assertion was then rerun in the focused suite and passed. `npm run lint` and `npm --prefix backend run build` passed. Lint retains the existing `.eslintignore` deprecation warning. Embedded OpenAPI and `docs/openapi.yaml` include the four new 503 responses; coverage remains 127/141 literal route operations.

These are isolated local tests: local credential storage is stubbed, tokens use the real signer, and directory behavior uses a simulated client. They do not prove production LDAP reachability, real database credential authentication, browser acceptance, deployed runtime behavior, Docker delivery, or backup/restore readiness. No runtime `.env`, live account, deployed service, or external provider was changed.
