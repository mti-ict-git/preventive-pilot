import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createHarness,
  fixtureTaskId,
  fixtureTemplateId,
  fixtureWorkOrderId,
  mandatoryItemId,
} from './task-checklist-harness.mjs';

test('EX-01 preserves PM timing, revision reasons, replacement tasks, and finding-linked work orders', async t => {
  const h = createHarness();
  const server = h.app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));

  const origin = `http://127.0.0.1:${server.address().port}`;
  const request = (method, path, body, roles = ['Technician']) =>
    fetch(origin + path, {
      method,
      signal: AbortSignal.timeout(5000),
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${h.token(roles)}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  await t.test('start is idempotent and creates only one open work session', async () => {
    h.reset({ taskStatus: 'open' });

    const first = await request('POST', `/api/tasks/${fixtureTaskId}/start`, {}, ['Technician']);
    assert.equal(first.status, 200, await first.text());

    const second = await request('POST', `/api/tasks/${fixtureTaskId}/start`, {}, ['Technician']);
    assert.equal(second.status, 200, await second.text());

    const state = h.getState();
    assert.equal(state.taskWorkSessions.length, 1);
    assert.equal(state.taskWorkSessions.filter(session => session.EndedAt === null).length, 1);
  });

  await t.test('submit for approval closes the open work session', async () => {
    h.reset({ taskStatus: 'open' });

    const started = await request('POST', `/api/tasks/${fixtureTaskId}/start`, {}, ['Technician']);
    assert.equal(started.status, 200, await started.text());

    const submitted = await request(
      'POST',
      `/api/tasks/${fixtureTaskId}/submit-for-approval`,
      { checklistResults: [{ templateChecklistItemId: mandatoryItemId, outcome: 1 }] },
      ['Technician'],
    );
    assert.equal(submitted.status, 200, await submitted.text());
    assert(h.calls.some(call => call.query.includes('UPDATE pm.TaskWorkSessions')));
  });

  await t.test('revise approval requires a nonblank reason', async () => {
    h.reset({ approvalStatus: 'PendingSupervisor', taskStatus: 'open' });

    const response = await request(
      'POST',
      `/api/tasks/${fixtureTaskId}/revise-approval`,
      { reason: '   ', reopenTask: false },
      ['Supervisor'],
    );
    assert.equal(response.status, 400, await response.text());
  });

  await t.test('reject approval creates one linked replacement task', async () => {
    h.reset({ approvalStatus: 'PendingSupervisor', taskStatus: 'open' });

    const response = await request(
      'POST',
      `/api/tasks/${fixtureTaskId}/reject-approval`,
      { reason: 'Inspection must be repeated' },
      ['Supervisor'],
    );
    const body = await response.json();
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(body.replacementTaskId, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
    assert(h.calls.some(call => call.query.includes("N'PM-RWK-'")));
  });

  await t.test('failed finding work order creation reuses the existing linked work order', async () => {
    h.reset({
      checklistResults: [
        {
          TemplateChecklistItemId: mandatoryItemId,
          TaskChecklistResultId: `result-${mandatoryItemId}`,
          Outcome: 2,
          Notes: 'Bearing failed',
          ResultCompletedAt: new Date('2026-09-16T09:00:00Z'),
          ResultCompletedByUserId: undefined,
        },
      ],
    });

    const first = await request(
      'POST',
      '/api/work-orders',
      {
        assetId: '44444444-4444-4444-8444-444444444444',
        templateId: fixtureTemplateId,
        symptom: 'Mandatory inspection item - Bearing failed',
        sourceTaskId: fixtureTaskId,
        sourceTemplateChecklistItemId: mandatoryItemId,
      },
      ['Technician'],
    );
    const firstBody = await first.json();
    assert.equal(first.status, 201, JSON.stringify(firstBody));
    assert.deepEqual(firstBody, { id: fixtureWorkOrderId, created: true });

    const second = await request(
      'POST',
      '/api/work-orders',
      {
        assetId: '44444444-4444-4444-8444-444444444444',
        templateId: fixtureTemplateId,
        symptom: 'Mandatory inspection item - Bearing failed',
        sourceTaskId: fixtureTaskId,
        sourceTemplateChecklistItemId: mandatoryItemId,
      },
      ['Technician'],
    );
    const secondBody = await second.json();
    assert.equal(second.status, 200, JSON.stringify(secondBody));
    assert.deepEqual(secondBody, { id: fixtureWorkOrderId, created: false });
  });
});
