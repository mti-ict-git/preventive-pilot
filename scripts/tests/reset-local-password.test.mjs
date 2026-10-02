import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { resetLocalPassword } from '../admin/reset-local-password.mjs';
const require = createRequire(new URL('../../backend/package.json', import.meta.url));
const bcrypt = require('bcryptjs');
test('password reset hashes credentials and restricts update to exact existing local account', async () => {
  const params = {}; let query;
  const pool = { request: () => ({ input(name, _type, value) { params[name] = value; return this; }, async query(text) { query = text; return { recordset: [{ UserId: 'fixture' }] }; } }) };
  await resetLocalPassword(pool, 'tester', 'new-password-123');
  assert.equal(params.username, 'tester');
  assert(await bcrypt.compare('new-password-123', params.passwordHash));
  assert(!await bcrypt.compare('old-password-123', params.passwordHash));
  assert.match(query, /u.Username = @username AND u.ExternalProvider = N'local'/);
  assert(!/INSERT|MERGE|IsActive|UserRoles/.test(query));
  await assert.rejects(resetLocalPassword(pool, 'tester', 'short'), /at least 12/);
  await assert.rejects(resetLocalPassword(pool, 'tester', 'é'.repeat(37)), /72/);
});
test('missing or directory account cannot be converted or created', async () => {
  const pool = { request: () => ({ input() { return this; }, async query() { return { recordset: [] }; } }) };
  await assert.rejects(resetLocalPassword(pool, 'directory-user', 'new-password-123'), /No existing local account/);
});
