import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
test('production deploy preflight is read-only and failed build prevents container replacement', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-deploy-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'scripts/deploy'), { recursive: true });
  fs.mkdirSync(path.join(root, 'bin'));
  fs.copyFileSync(new URL('../deploy/production.sh', import.meta.url), path.join(root, 'scripts/deploy/production.sh'));
  fs.writeFileSync(path.join(root, '.env'), '');
  // Storage behavior is covered separately; this fixture tests command ordering.
  fs.writeFileSync(path.join(root, 'scripts/deploy/check-share.py'), 'import os, sys\nsys.exit(int(os.environ.get("FAIL_SHARE", "0")))\n');
  const config = { services: { api: { environment: { DB_SERVER: 'fixture', DB_DATABASE: 'fixture', DB_USER: 'fixture', DB_PASSWORD: 'fixture', JWT_SECRET: 'synthetic-test-secret', JOBS_ENABLED: 'false' }, volumes: [] } } };
  fs.writeFileSync(path.join(root, 'config.json'), JSON.stringify(config));
  fs.writeFileSync(path.join(root, 'bin/docker'), `#!/bin/bash
printf '%s\\n' "$*" >> "$TEST_ROOT/calls"
case "$*" in
 *'config --format json'*) cat "$TEST_ROOT/config.json" ;;
 *'build api web'*) exit "\${FAIL_BUILD:-0}" ;;
esac
`, { mode: 0o700 });
  function run(mode, fail = '0', shareFail = '0') {
    fs.writeFileSync(path.join(root, 'calls'), '');
    const result = spawnSync('bash', ['scripts/deploy/production.sh', mode], { cwd: root, encoding: 'utf8', env: { ...process.env, PATH: `${root}/bin:${process.env.PATH}`, TEST_ROOT: root, FAIL_BUILD: fail, FAIL_SHARE: shareFail } });
    return { ...result, calls: fs.readFileSync(path.join(root, 'calls'), 'utf8') };
  }
  let r = run('--deploy', '0', '1'); assert.notEqual(r.status, 0); assert(!r.calls.includes('build api'));
  r = run('--check'); assert.equal(r.status, 0, r.stderr); assert(!r.calls.includes('build api')); assert(!r.calls.includes('up -d'));
  r = run('--deploy', '1'); assert.notEqual(r.status, 0); assert(!r.calls.includes('up -d'));
  r = run('--deploy'); assert.equal(r.status, 0, r.stderr); assert(r.calls.indexOf('build api web') < r.calls.indexOf('up -d')); assert(r.calls.includes('/api/docs.json')); assert(!r.calls.includes('down'));
  config.services.api.environment.LDAP_URL = 'ldap://fixture';
  fs.writeFileSync(path.join(root, 'config.json'), JSON.stringify(config));
  r = run('--deploy'); assert.notEqual(r.status, 0); assert(!r.calls.includes('build api'));
});
