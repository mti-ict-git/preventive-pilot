#!/usr/bin/env bash
# Run on the production Docker host from the intended release checkout.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MODE="${1:---check}"
case "$MODE" in
  --check|--deploy) ;;
  --help) echo 'Usage: bash scripts/deploy/production.sh [--check|--deploy]'; exit 0 ;;
  *) echo 'Use --check or --deploy.' >&2; exit 2 ;;
esac
[[ $# -le 1 ]] || { echo 'Too many arguments.' >&2; exit 2; }
cd "$ROOT"
command -v docker >/dev/null || { echo 'Docker is required.' >&2; exit 1; }
command -v python3 >/dev/null || { echo 'Python 3 is required for configuration validation.' >&2; exit 1; }
if docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose)
elif command -v docker-compose >/dev/null && docker-compose version --short | grep -Eq '^v?2\.'; then
  COMPOSE=(docker-compose)
else
  echo 'Docker Compose v2 is required (plugin or standalone).' >&2; exit 1
fi
[[ -f .env ]] || { echo 'Prepare the production .env first; no configuration was changed.' >&2; exit 1; }
# Preserve the existing Compose project identity. Set COMPOSE_PROJECT_NAME in
# the host environment when the existing installation uses a custom name.
COMPOSE+=(--project-directory "$ROOT" --env-file "$ROOT/.env" -f "$ROOT/docker-compose.yml" -f "$ROOT/docker-compose.production.yml")
umask 077
CONFIG="$(mktemp)"
trap 'rm -f "$CONFIG"' EXIT
"${COMPOSE[@]}" config --format json > "$CONFIG"
python3 - "$CONFIG" <<'PY'
import json, pathlib, sys
c = json.load(open(sys.argv[1]))
a = c['services']['api']; e = a['environment']
errors = []
for key in ['DB_SERVER', 'DB_DATABASE', 'DB_USER', 'DB_PASSWORD', 'JWT_SECRET']:
    if not e.get(key) or 'REPLACE_WITH' in str(e[key]): errors.append(f'{key} must be configured')
if len(e.get('JWT_SECRET', '')) < 16: errors.append('JWT_SECRET must have at least 16 characters')
ldap = ['LDAP_URL', 'LDAP_BASE_DN', 'LDAP_BIND_DN', 'LDAP_BIND_PASSWORD', 'LDAP_USER_SEARCH_BASE', 'LDAP_USER_SEARCH_FILTER', 'LDAP_GROUP_SEARCH_BASE', 'LDAP_GROUP_SUPERADMIN']
if any(e.get(k) for k in ldap) and not all(str(e.get(k, '')).strip() for k in ldap): errors.append('LDAP configuration must be complete or entirely empty')
for mount in a.get('volumes', []):
    if mount.get('type') != 'bind': continue
    source = pathlib.Path(mount['source'])
    if mount['target'] == '/app/shared-documents':
        if not source.is_dir(): errors.append('Prepare the evidence-storage directory before deployment')
    elif not source.is_file(): errors.append(f"Missing runtime file for {mount['target']}")
if e.get('EVIDENCE_STORAGE_ROOT', '/app/shared-documents') != '/app/shared-documents':
    errors.append('This deployment script requires EVIDENCE_STORAGE_ROOT=/app/shared-documents (or omitted)')
if errors:
    sys.exit('\n'.join(errors))
print('Configuration and runtime bind sources validated. Credentials were not printed.')
print('Jobs setting:', e.get('JOBS_ENABLED', 'true (backend default)'))
PY
docker info >/dev/null
"${COMPOSE[@]}" ps
python3 "$ROOT/scripts/deploy/check-share.py" "$CONFIG" "$MODE"
if [[ "$MODE" == '--check' ]]; then
  echo 'Preflight passed. No images built or containers changed.'
  exit 0
fi
echo 'Building both services before replacing running containers...'
"${COMPOSE[@]}" build api web
python3 "$ROOT/scripts/deploy/check-share.py" "$CONFIG" "$MODE"
echo 'Starting the production services (no schema migration or volume deletion)...'
"${COMPOSE[@]}" up -d --no-build --wait --wait-timeout 120 api web
# Check the actual Nginx -> API path from inside the web container.
"${COMPOSE[@]}" exec -T web wget -q -O /dev/null http://127.0.0.1/api/docs.json
"${COMPOSE[@]}" ps
echo 'Containers healthy and same-origin API proxy responds. Verify public HTTPS, login, database and evidence workflows separately.'
