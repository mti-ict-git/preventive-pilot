# Security and Access Model

## Identity

- LDAP authentication binds/searches the configured directory.
- Local authentication uses stored password hashes.
- JWT access and refresh tokens carry user ID, username, and roles.
- API roles may be refreshed from SQL when an authorization check fails against token claims.

## Authorization Levels

- Authenticated: common read and self-service operations.
- Task actor: assigned user or manager for guarded execution mutations.
- Manager: Supervisor, Admin, or Superadmin.
- System admin: Admin or Superadmin where defined.
- Superadmin: final approval, destructive/high-impact controls.

Every new route must state its authentication, role, record-level access, and audit requirements in OpenAPI and tests.

## Data Classification

| Class | Examples | Controls |
| --- | --- | --- |
| Secret | passwords, JWT secret, LDAP bind, DB/Graph/CIFS tokens | environment/secret store, never log or commit |
| Sensitive operational | evidence, user profile/contact, audit, device token | authenticated access, role/record checks, retention |
| Internal configuration | origins, schedules, templates, integration endpoints | admin controls and audit |
| Public/low sensitivity | health response, signed update download | minimal response, expiring signature where applicable |

## File Security

- Resolve evidence paths beneath the configured root.
- Reject traversal and invalid identifiers.
- Enforce upload limits and approved content policy.
- Store server-generated names/metadata rather than trusting client paths.
- Log deletion/replacement and maintain SQL/file consistency.

## Integration Security

- Use TLS for LDAP, API ingress, Snipe-IT, Graph, Firebase, and APK hosting in production.
- Bound connection/read timeouts.
- Redact secrets and upstream bodies from user-facing errors.
- APK download authorization uses a signing secret and short TTL; upload uses a separate token.

## Known Risks

- Refresh tokens are stateless and lack revocation/rotation persistence.
- Browser tokens are stored in local storage, increasing XSS impact.
- Global API docs exposure and health detail need an explicit production policy.
- Multi-replica scheduled jobs lack distributed locking.
- The untracked mobile tree needs a secret/generated-artifact audit.

## Security Verification

- Authentication success/failure and refresh expiry.
- Role matrix and record-level authorization.
- Path traversal, oversized file, invalid content, and approval-lock challenges.
- SQL injection regression through parameterized endpoints.
- CORS, headers, TLS, rate limiting, and proxy request limits.
- Secret scan across tracked and proposed mobile files.
