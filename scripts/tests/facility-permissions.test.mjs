import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHarness, fixtureId } from './facility-harness.mjs';

test('AF-02 real HTTP router/auth/role matrix with isolated database boundary', async t => {
  const h = createHarness();
  const server = h.app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api/facilities`;
  const request = (method, suffix, body, roles) => fetch(base + suffix, {
    method, signal: AbortSignal.timeout(5000), headers: { 'content-type': 'application/json', ...(roles ? { authorization: `Bearer ${h.token(roles)}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const master = [
    ['create', 'POST', '', { name: 'Test facility' }, 201],
    ['edit', 'PUT', `/${fixtureId}`, { name: 'Renamed' }, 200],
    ['archive', 'PUT', `/${fixtureId}`, { isActive: false }, 200],
    ['activate', 'PUT', `/${fixtureId}`, { isActive: true }, 200],
    ['clone with PM', 'POST', `/${fixtureId}/clone`, { name: 'Test copy', includePmSettings: true }, 201],
    ['clone without PM', 'POST', `/${fixtureId}/clone`, { name: 'Test copy', includePmSettings: false }, 201],
  ];
  for (const role of ['Admin', 'Superadmin', 'Supervisor', 'Technician', 'Viewer']) {
    for (const [name, method, suffix, body, success] of master) {
      await t.test(`${role}: ${name}`, async () => {
        h.reset([role]);
        const response = await request(method, suffix, body, [role]);
        const allowed = ['Admin', 'Superadmin'].includes(role);
        assert.equal(response.status, allowed ? success : 403, await response.text());
        if (!allowed) assert(h.calls.every(c => c.query.includes('FROM pm.UserRoles')), 'Forbidden request reached facility SQL');
        else assert(h.calls.some(c => /INSERT INTO pm.Facilities|UPDATE pm.Facilities/.test(c.query)));
      });
    }
  }
  await t.test('missing authentication is rejected before any DB access', async () => {
    for (const [, method, suffix, body] of master) {
      h.reset(); assert.equal((await request(method, suffix, body)).status, 401); assert.equal(h.calls.length, 0);
    }
  });
  await t.test('all authenticated roles retain facility list/detail reads', async () => {
    for (const role of ['Admin', 'Superadmin', 'Supervisor', 'Technician', 'Viewer']) {
      h.reset([role]);
      assert.equal((await request('GET', '', undefined, [role])).status, 200);
      assert.equal((await request('GET', `/${fixtureId}`, undefined, [role])).status, 200);
    }
  });
  await t.test('Supervisor retains PM settings, cannot smuggle master fields through it', async () => {
    h.reset(['Supervisor']);
    assert.equal((await request('PUT', `/${fixtureId}/pm-settings`, { pmEnabled: true, name: 'Forged', isActive: false }, ['Supervisor'])).status, 200);
    assert(h.calls.some(c => c.query.includes('MERGE pm.FacilityPMSettings')));
    assert(!h.calls.some(c => c.query.includes('UPDATE pm.Facilities')));
  });
  await t.test('PM Now admits Supervisor to validation, while Technician is forbidden', async () => {
    h.reset(['Supervisor']);
    assert.equal((await request('POST', '/not-a-uuid/pm-now', {}, ['Supervisor'])).status, 400);
    h.reset(['Technician']);
    assert.equal((await request('POST', '/not-a-uuid/pm-now', {}, ['Technician'])).status, 403);
  });
  await t.test('normalized roles and refreshed grants use existing middleware semantics', async () => {
    h.reset(); assert.equal((await request('POST', '', { name: 'Normalized' }, [' admin '])).status, 201);
    h.reset(['Admin']); assert.equal((await request('POST', '', { name: 'Refreshed' }, ['Supervisor'])).status, 201);
    h.reset([], true); assert.equal((await request('POST', '', { name: 'Denied' }, ['Supervisor'])).status, 403);
  });
  await t.test('authorized invalid update is rejected without mutation', async () => {
    h.reset(['Admin']); assert.equal((await request('PUT', `/${fixtureId}`, {}, ['Admin'])).status, 400); assert.equal(h.calls.length, 0);
  });
});
