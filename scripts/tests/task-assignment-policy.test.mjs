import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createHarness,
  fixtureSecondUserId,
  fixtureTaskId,
  fixtureTechnicianRoleId,
} from './task-checklist-harness.mjs';

test('AS-01 enforces exclusive claim and assignment locks for PM tasks', async t => {
  const h = createHarness();
  const server = h.app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));

  const base = `http://127.0.0.1:${server.address().port}/api/tasks`;
  const request = (method, suffix, body, token) =>
    fetch(base + suffix, {
      method,
      signal: AbortSignal.timeout(5000),
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  await t.test('eligible technician can claim a role-queued PM task once', async () => {
    h.reset({
      assignedToUserId: null,
      assignedToRoleId: fixtureTechnicianRoleId,
      assignedToRoleName: 'Technician',
      taskStatus: 'open',
    });

    const first = await request('POST', `/${fixtureTaskId}/claim`, undefined, h.token(['Technician']));
    assert.equal(first.status, 200, await first.text());
    assert(h.calls.some(call => call.query.includes('SET t.AssignedToUserId = @userId')));

    const second = await request('POST', `/${fixtureTaskId}/claim`, undefined, h.token(['Technician']));
    const secondBody = await second.json();
    assert.equal(second.status, 200);
    assert.equal(secondBody.claimed, false);
  });

  await t.test('another technician in the same role cannot take over an already claimed task', async () => {
    h.reset({
      assignedToUserId: null,
      assignedToRoleId: fixtureTechnicianRoleId,
      assignedToRoleName: 'Technician',
      taskStatus: 'open',
    });

    const claimed = await request('POST', `/${fixtureTaskId}/claim`, undefined, h.token(['Technician']));
    assert.equal(claimed.status, 200, await claimed.text());

    const takeover = await request(
      'POST',
      `/${fixtureTaskId}/claim`,
      undefined,
      h.tokenFor(fixtureSecondUserId, ['Technician']),
    );
    assert.equal(takeover.status, 409, await takeover.text());
  });

  await t.test('role membership no longer grants execution after a personal assignee exists', async () => {
    h.reset({
      assignedToUserId: fixtureSecondUserId,
      assignedToRoleId: fixtureTechnicianRoleId,
      assignedToRoleName: 'Technician',
      taskStatus: 'open',
    });

    const response = await request('POST', `/${fixtureTaskId}/start`, {}, h.token(['Technician']));
    assert.equal(response.status, 403, await response.text());
    assert(!h.calls.some(call => call.query.includes("Status = N'in_progress'")));
  });

  await t.test('manager reassignment is blocked once a PM task is submitted for approval', async () => {
    h.reset({
      approvalStatus: 'PendingSupervisor',
      taskStatus: 'in_progress',
    });

    const response = await request(
      'POST',
      `/${fixtureTaskId}/assign`,
      { assignedToRoleId: fixtureTechnicianRoleId, assignedToUserId: null },
      h.token(['Supervisor']),
    );
    assert.equal(response.status, 409, await response.text());
    assert(!h.calls.some(call => call.query.includes('AssignedToUserId = CASE WHEN @hasAssignedToUserId = 1')));
  });
});
