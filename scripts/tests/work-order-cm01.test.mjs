import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createHarness,
  fixtureRecurringWorkOrderId,
  fixtureTaskId,
  fixtureUserId,
} from './task-checklist-harness.mjs';

test('CM-01 enforces review, restoration, and downtime recurrence behavior', async t => {
  const h = createHarness();
  const server = h.app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));

  const origin = `http://127.0.0.1:${server.address().port}`;
  const request = (method, path, body, token = h.token(['Technician'])) =>
    fetch(origin + path, {
      method,
      signal: AbortSignal.timeout(5000),
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  await t.test('technician submission moves the CM work order to pending review', async () => {
    h.reset({
      maintenanceType: 'CM',
      taskStatus: 'open',
      technicianCompletedByUserId: null,
    });

    const response = await request('POST', `/api/work-orders/${fixtureTaskId}/complete`, {
      checklistResults: [],
    });
    assert.equal(response.status, 200, await response.text());

    const state = h.getState();
    assert.equal(state.taskStatus, 'pending_review');
    assert.equal(state.technicianCompletedByUserId, fixtureUserId);
  });

  await t.test('repair performer cannot verify-close their own CM work order', async () => {
    h.reset({
      maintenanceType: 'CM',
      taskStatus: 'pending_review',
      technicianCompletedByUserId: fixtureUserId,
      cmDowntimeIntervals: [
        {
          StartedAt: new Date('2026-09-16T07:30:00Z'),
          EndedAt: new Date('2026-09-16T08:30:00Z'),
        },
      ],
    });

    const response = await request(
      'POST',
      `/api/work-orders/${fixtureTaskId}/verify-close`,
      undefined,
      h.token(['Supervisor']),
    );
    assert.equal(response.status, 403, await response.text());
  });

  await t.test('return for correction requires a nonblank reason and reopens the same work order', async () => {
    h.reset({
      maintenanceType: 'CM',
      taskStatus: 'pending_review',
      technicianCompletedByUserId: fixtureUserId,
    });

    const rejectedBlank = await request(
      'POST',
      `/api/work-orders/${fixtureTaskId}/return-for-correction`,
      { reason: '   ' },
      h.tokenFor('13131313-1313-4313-8313-131313131313', ['Supervisor']),
    );
    assert.equal(rejectedBlank.status, 400, await rejectedBlank.text());

    const reopened = await request(
      'POST',
      `/api/work-orders/${fixtureTaskId}/return-for-correction`,
      { reason: 'Please document the final repair steps.' },
      h.tokenFor('13131313-1313-4313-8313-131313131313', ['Supervisor']),
    );
    assert.equal(reopened.status, 200, await reopened.text());
    assert.equal(h.getState().taskStatus, 'open');
  });

  await t.test('restoration closes the active downtime interval and verify-close completes the CM work order', async () => {
    h.reset({
      maintenanceType: 'CM',
      taskStatus: 'pending_review',
      technicianCompletedByUserId: fixtureUserId,
      cmDowntimeIntervals: [
        {
          StartedAt: new Date('2026-09-16T07:30:00Z'),
          EndedAt: null,
        },
      ],
    });

    const blocked = await request(
      'POST',
      `/api/work-orders/${fixtureTaskId}/verify-close`,
      undefined,
      h.tokenFor('14141414-1414-4414-8414-141414141414', ['Supervisor']),
    );
    assert.equal(blocked.status, 409, await blocked.text());

    const restored = await request(
      'POST',
      `/api/work-orders/${fixtureTaskId}/close-downtime`,
      { restoredAt: '2026-09-16T08:15:00.000Z', reason: 'Restored after part replacement' },
      h.token(['Technician']),
    );
    assert.equal(restored.status, 200, await restored.text());
    assert.equal(h.getState().cmDowntimeIntervals[0].EndedAt?.toISOString(), '2026-09-16T08:15:00.000Z');

    const closed = await request(
      'POST',
      `/api/work-orders/${fixtureTaskId}/verify-close`,
      undefined,
      h.tokenFor('14141414-1414-4414-8414-141414141414', ['Supervisor']),
    );
    assert.equal(closed.status, 200, await closed.text());
    assert.equal(h.getState().taskStatus, 'completed');
  });

  await t.test('reopened downtime reuses the same work order before closure', async () => {
    h.reset({
      maintenanceType: 'CM',
      taskStatus: 'pending_review',
      technicianCompletedByUserId: fixtureUserId,
      cmDowntimeIntervals: [
        {
          StartedAt: new Date('2026-09-16T07:30:00Z'),
          EndedAt: new Date('2026-09-16T08:30:00Z'),
        },
      ],
    });

    const response = await request('POST', `/api/work-orders/${fixtureTaskId}/reopen-downtime`, {
      downtimeStartedAt: '2026-09-16T09:00:00.000Z',
      reason: 'Same fault came back',
    });
    assert.equal(response.status, 200, await response.text());

    const state = h.getState();
    assert.equal(state.taskStatus, 'open');
    assert.equal(state.cmDowntimeIntervals.length, 2);
    assert.equal(state.cmDowntimeIntervals[1].EndedAt, null);
  });

  await t.test('recurrence after closure creates a new linked work order', async () => {
    h.reset({
      maintenanceType: 'CM',
      taskStatus: 'completed',
      technicianCompletedByUserId: fixtureUserId,
      cmDowntimeIntervals: [
        {
          StartedAt: new Date('2026-09-16T07:30:00Z'),
          EndedAt: new Date('2026-09-16T08:30:00Z'),
        },
      ],
    });

    const response = await request(
      'POST',
      `/api/work-orders/${fixtureTaskId}/report-recurrence`,
      { downtimeStartedAt: '2026-09-16T10:00:00.000Z', reason: 'Repeat fault after closure' },
      h.token(['Supervisor']),
    );
    const body = await response.json();
    assert.equal(response.status, 201, JSON.stringify(body));
    assert.deepEqual(body, { id: fixtureRecurringWorkOrderId, created: true });
    assert.equal(h.getState().recurringWorkOrderId, fixtureRecurringWorkOrderId);
    assert(h.calls.some(call => call.query.includes('RecurringFromTaskId')));
  });
});
