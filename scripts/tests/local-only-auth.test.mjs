import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import ts from 'typescript';
import { createHarness, root, fixtureId } from './desktop-contract-harness.mjs';
const require = createRequire(path.join(root, 'backend/package.json'));
function load(file, dependencies, processValue = process) {
  const module = { exports: {} };
  const js = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  vm.runInThisContext(`(function(require,module,exports,process){${js}\n})`)(s => dependencies[s] ?? require(s), module, module.exports, processValue);
  return module.exports;
}
const base = { JWT_SECRET: 'synthetic-test-secret-only', DB_SERVER: 'unused', DB_DATABASE: 'unused', DB_USER: 'unused', DB_PASSWORD: 'unused', JOBS_ENABLED: 'false' };
const keys = ['LDAP_URL','LDAP_BASE_DN','LDAP_BIND_DN','LDAP_BIND_PASSWORD','LDAP_USER_SEARCH_BASE','LDAP_USER_SEARCH_FILTER','LDAP_GROUP_SEARCH_BASE','LDAP_GROUP_SUPERADMIN'];
function config(extra = {}) {
  return load('backend/src/config/env.ts', { dotenv: { config() {} } }, { env: { ...base, ...extra }, cwd: () => root }).env;
}
test('Q05 environment accepts absent/empty LDAP and rejects partial configuration', () => {
  assert.equal(config().LDAP_URL, '');
  assert.equal(config(Object.fromEntries(keys.map(k => [k, '']))).LDAP_URL, '');
  assert.equal(config({ LDAP_TIMEOUT: '7000' }).LDAP_TIMEOUT, 7000);
  for (const missing of keys) {
    const values = Object.fromEntries(keys.map(k => [k, 'fixture'])); delete values[missing];
    assert.throws(() => config(values), /Required when LDAP is configured/);
  }
  assert.throws(() => config({ JWT_SECRET: 'short' }));
  assert.throws(() => config({ DB_PASSWORD: '' }));
});
test('Q05 configured LDAP preserves directory authentication and cleanup', async () => {
  const env = config(Object.fromEntries(keys.map(k => [k, k === 'LDAP_USER_SEARCH_FILTER' ? '(uid={username})' : 'fixture'])));
  const binds = []; let closed = 0;
  class Client {
    async bind(dn, password) { binds.push([dn, password]); if (password === "wrong") throw new Error("Invalid credentials"); }
    async search(_base, options) { return { searchEntries: options.attributes.includes('cn') ? [{ dn: 'cn=test', cn: 'Test' }] : [] }; }
    async unbind() { closed++; }
  }
  const ldap = load('backend/src/auth/ldap.ts', { '../config/env.js': { env }, ldapts: { Client } });
  const user = await ldap.authenticateWithLdap('test', 'test-password');
  assert.equal(user.username, 'test'); assert.equal(user.isSuperadmin, false);
  assert.deepEqual(binds, [['fixture', 'fixture'], ['cn=test', 'test-password']]); assert.equal(closed, 2);
  await assert.rejects(ldap.authenticateWithLdap('test', 'wrong'), /Invalid credentials/);
  assert.equal(closed, 4);
});
test('Q05 local login and LDAP-unavailable HTTP boundaries without directory access', async t => {
  let clientCount = 0, localCalls = 0;
  const ldap = load('backend/src/auth/ldap.ts', { '../config/env.js': { env: config() }, ldapts: { Client: class { constructor() { clientCount++; throw new Error('Unexpected directory access'); } } } });
  for (const fn of ['authenticateWithLdap', 'lookupLdapUser', 'searchLdapUsers']) await assert.rejects(ldap[fn]('test', 'password'), e => e.code === 'LDAP_NOT_CONFIGURED');
  const h = createHarness({ module: abs => {
    if (abs.endsWith('/config/env.ts')) return { env: config() };
    if (abs.endsWith('/auth/ldap.ts')) return ldap;
    if (abs.endsWith('/db/users.ts')) return { authenticateLocalUser: async ({ password }) => {
      localCalls++; if (password !== 'valid') throw new Error('Invalid credentials');
      return { userId: fixtureId, username: 'local', displayName: 'Local', email: null, roles: ['Superadmin'] };
    } };
  } });
  h.reset({ ldapUser: true });
  const server = h.app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  t.after(() => new Promise(r => server.close(r)));
  async function request(url, body, roles) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/${url}`, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(roles ? { authorization: `Bearer ${h.token(roles)}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: await response.json() };
  }
  const ok = await request('auth/login', { identifier: 'local', password: 'valid', provider: 'local' });
  assert.equal(ok.status, 200); assert(ok.body.accessToken); assert(ok.body.refreshToken);
  assert.equal((await request('auth/login', { identifier: 'local', password: 'wrong', provider: 'local' })).status, 401);
  for (const provider of ['ldap', undefined]) {
    const result = await request('auth/login', { identifier: 'test', password: 'valid', provider });
    assert.equal(result.status, 503); assert.equal(result.body.code, 'LDAP_NOT_CONFIGURED');
  }
  for (const [url, body] of [['system/ldap/search?q=test', undefined], ['system/users/assign-ldap', { identifier: 'test', roleName: 'Viewer' }], [`system/users/${fixtureId}/refresh-ldap`, {}]]) {
    assert.equal((await request(url, body)).status, 401);
    assert.equal((await request(url, body, ['Viewer'])).status, 403);
    const result = await request(url, body, ['Superadmin']);
    assert.equal(result.status, 503, JSON.stringify(result)); assert.equal(result.body.code, 'LDAP_NOT_CONFIGURED');
  }
  assert.equal(localCalls, 2); assert.equal(clientCount, 0);
  assert(!h.calls.some(c => /UPDATE|INSERT|DELETE/.test(c.query)));
});
