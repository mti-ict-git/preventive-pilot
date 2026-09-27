import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHarness, fixtureTaskId } from './task-checklist-harness.mjs';

test('AF-01 broken asset policy cancels active PM work and blocks new execution', async t => {
  const h = createHarness();
  const server = h.app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));

  const base = `http://127.0.0.1:${server.address().port}/api/tasks`;
  const request = (method, suffix, body, roles) =>
    fetch(base + suffix, {
      method,
      signal: AbortSignal.timeout(5000),
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${h.token(roles)}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  await t.test('submit-for-approval auto-cancels a broken-asset PM task and rejects the action', async () => {
    h.reset({ assetOperationalStatus: 'broken' });
    const response = await request('POST', `/${fixtureTaskId}/submit-for-approval`, { checklistResults: [] }, ['Technician']);
    const body = await response.json();

    assert.equal(response.status, 409);
    assert.equal(body.code, 'ASSET_BROKEN');
    assert.deepEqual(h.txEvents, ['begin', 'rollback']);
    assert(h.calls.some(call => call.query.includes('UPDATE t') && call.query.includes('AssetOperationalStatus = N\'broken\'')));
    assert(h.calls.some(call => call.query.includes('INSERT INTO pm.AuditLog')));
    assert(!h.calls.some(call => call.query.includes('TechnicianCompletedAt = COALESCE')));
  });

  await t.test('repeated blocked start attempts stay idempotent after the first cancellation', async () => {
    h.reset({ assetOperationalStatus: 'broken', taskStatus: 'open' });

    const first = await request('POST', `/${fixtureTaskId}/start`, {}, ['Technician']);
    assert.equal(first.status, 409, await first.text());

    const second = await request('POST', `/${fixtureTaskId}/start`, {}, ['Technician']);
    assert.equal(second.status, 409, await second.text());

    const auditInsertCount = h.calls.filter(call => call.query.includes('INSERT INTO pm.AuditLog')).length;
    assert.equal(auditInsertCount, 1);
  });

  await t.test('reopen stays blocked while the related asset is still broken', async () => {
    h.reset({ assetOperationalStatus: 'broken', taskStatus: 'cancelled' });
    const response = await request('POST', `/${fixtureTaskId}/reopen`, {}, ['Supervisor']);
    const body = await response.json();

    assert.equal(response.status, 409);
    assert.equal(body.code, 'ASSET_BROKEN');
    assert(!h.calls.some(call => call.query.includes("Status = N'open'")));
  });

  await t.test('PM Now rejects broken assets before creating a task', async () => {
    h.reset({ assetOperationalStatus: 'broken' });
    const response = await request('POST', '/pm-now', { assetId: '44444444-4444-4444-8444-444444444444' }, ['Supervisor']);
    const body = await response.json();

    assert.equal(response.status, 409);
    assert.equal(body.code, 'ASSET_BROKEN');
    assert(!h.calls.some(call => call.query.includes("N'PM-NOW-'")));
  });
});
