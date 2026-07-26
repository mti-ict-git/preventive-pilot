# Deployment and Environment

## Deployment Units

- `web`: Vite production bundle served by Nginx; `/api` is proxied to the API.
- `api`: compiled Node/Express application.
- SQL Server: external database.
- Evidence volume: bind mount or CIFS volume.
- Optional `secure_apk`: Nginx APK host plus authenticated uploader.

## Environment Variables

### Required API Startup

| Group | Variables |
| --- | --- |
| Core | `JWT_SECRET`; optional `BACKEND_PORT`, `FRONTEND_ORIGIN`, token TTLs |
| SQL Server | `DB_SERVER`, `DB_DATABASE`, `DB_USER`, `DB_PASSWORD`; optional port/encryption/trust flags |
| LDAP | `LDAP_URL`, `LDAP_BASE_DN`, `LDAP_BIND_DN`, `LDAP_BIND_PASSWORD`, user/group search settings, superadmin group; optional timeouts/TLS flag |

The current schema requires LDAP values even if only local login is intended.

### Jobs and Integrations

- Jobs: `JOBS_ENABLED`, per-job enable/interval variables, horizon and PM Now window.
- Snipe-IT: `SNIPEIT_BASE_URL`, `SNIPEIT_API_TOKEN`.
- Evidence: `EVIDENCE_STORAGE_ROOT`, import root/max/interval settings.
- Microsoft Graph: tenant/client/secret/scope/sender/default recipients/templates.
- Firebase: service-account path or base64 JSON; legacy `FCM_SERVER_KEY`.
- App update: storage/config/signing secret/store URLs/proxy/TTL.
- Web build: `VITE_API_BASE_URL`.

Use `backend/src/config/env.ts` as the exhaustive implementation list until environment-schema documentation is generated automatically.

## Compose

Default:

```sh
docker compose up --build
```

Bind evidence storage:

```sh
docker compose -f docker-compose.yml -f docker-compose.bind.yml up --build
```

CIFS evidence storage:

```sh
docker compose -f docker-compose.yml -f docker-compose.cifs.yml up --build
```

Validate resolved configuration before launch:

```sh
docker compose -f docker-compose.yml -f docker-compose.bind.yml config
```

## Secret Handling

- Keep `.env`, LDAP/database credentials, Graph secrets, service-account JSON, CIFS passwords, APK upload tokens, and signing secrets outside Git.
- Mount secret files read-only.
- Do not paste secret-bearing resolved compose output into issues or logs.
- Rotate any value found in local mobile/native configuration before onboarding that tree to Git.

## Production Checklist

1. Apply and verify schema.
2. Confirm one scheduler-active API replica unless distributed locking exists.
3. Verify evidence volume read/write and backup.
4. Verify LDAP login plus a controlled local recovery account.
5. Check `/health`, authenticated `/api/system/status`, web routing, and Swagger access policy.
6. Test Snipe-IT, notification, push, and update integrations that are enabled.
7. Confirm CORS origins, TLS termination, request-size limits, and proxy timeouts.
8. Record image tags/commit, schema verification, and rollback inputs.

## Rollback

- Application: redeploy the previously verified image/commit without rewriting Git history.
- Schema: additive changes should remain backward-compatible; destructive rollback requires an approved migration and backup.
- Evidence: never roll back SQL independently of file storage without reconciliation.
