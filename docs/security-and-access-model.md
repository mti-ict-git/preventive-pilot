# Security and Access Model

Last reviewed: 2026-09-10. This is a scoped description of observed controls, not a security audit certification.

## Authentication

The backend offers local and LDAP login with JWT access tokens and refresh flows. Protected routes use `requireAuth`; operation-specific role and ownership checks follow. Local users can be bootstrapped through the existing superadmin CLI. LDAP configuration is still mandatory at startup under the current environment schema, even if the operator intends to use local login (Q-05).

Credentials and signing keys belong in server-side environment/configuration. Client `VITE_*` settings are public bundle inputs. Do not copy `.env` values or Firebase service-account content into documentation.

## Roles and ownership

The shared role middleware compares normalized role names and can refresh role membership from the database when the token's roles do not satisfy a check. Some route-local checks compare role strings separately; do not infer uniform normalization everywhere.

| Action / guard | Observed eligible roles or condition |
| --- | --- |
| Shared `requireManager` | Superadmin, Admin, Supervisor |
| Shared `requireSuperadmin` | Superadmin |
| PM assign, PM Now, reopen | Manager guard in task routes |
| Task execution/evidence | Task-specific access helper and state checks; managers or permitted assignee/user-role context |
| Supervisor approval | Supervisor, Admin, Superadmin, with `PendingSupervisor` state |
| Final approval | Superadmin, with `PendingSuperadmin` state |
| Revise approval | Supervisor or Superadmin route guard |
| Superadmin checklist correction | Superadmin-specific operation and approval-state checks |
| CM assignment | Manager guard |
| CM deletion | Superadmin guard |

This is not an exhaustive endpoint matrix. [API coverage](api-coverage.md) and Q-03 identify the remaining audit work. Do not generalize a manager permission to every sensitive operation. UI visibility does not prove authorization, and no verified self-approval prohibition is claimed.

## Approval and evidence boundaries

Completion, submission, review, revision, rejection, and final approval have separate rules. Evidence editing is restricted in approval states, with narrowly defined privileged exceptions. Test the direct endpoints as well as the UI. Verify required checklist/evidence validation at submission before claiming an enforced complete review chain (Q-02).

## Mobile session storage

Current `mobile/pm-tech/lib/auth.ts` uses in-memory and localStorage access/refresh-token persistence. Biometric sign-in additionally uses the native biometric credential store. Therefore “all tokens are stored only in secure native storage” would be inaccurate. Target storage and logout behavior remain Q-11.

## Operations and integration boundaries

CORS uses configured origins and special local/native allowances in the backend. It is not an authorization mechanism. Notification broadcasts and tests can send external messages and need authorized recipients. Evidence/API-update paths and signed downloads require path, token-expiry, and access checks.

The supplied Nginx APK stack is a static host with a read-only share, not evidence of an authenticated upload service. TLS, backup, secret rotation, retention, and log-access procedures require environment-specific ownership.

## Verification expectations

Use isolated accounts for each role; challenge expired tokens, stale roles, wrong assignee, invalid transitions, own-work approval, forbidden evidence changes, and arbitrary file/download identifiers. Record actual outcomes in D1/D3. No authorization or security test was executed during D0.
