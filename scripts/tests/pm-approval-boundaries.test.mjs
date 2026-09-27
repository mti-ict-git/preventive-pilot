import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createHarness,
  fixtureSecondUserId,
  fixtureTaskId,
  fixtureUserId,
  mandatoryItemId,
} from './task-checklist-harness.mjs';

test('Q-02 and current Q-03 PM approval boundaries stay explicit', async t => {
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

  await t.test('submit-for-approval preserves lifecycle state and blocks repeated submission', async () => {
    h.reset({ taskStatus: 'in_progress', approvalStatus: 'None' });

    const submitted = await request(
      'POST',
      `/api/tasks/${fixtureTaskId}/submit-for-approval`,
      { checklistResults: [{ templateChecklistItemId: mandatoryItemId, outcome: 1 }] },
    );
    assert.equal(submitted.status, 200, await submitted.text());

    const state = h.getState();
    assert.equal(state.approvalStatus, 'PendingSupervisor');
    assert.equal(state.taskStatus, 'in_progress');
    assert.equal(state.technicianCompletedByUserId, fixtureUserId);

    const repeated = await request(
      'POST',
      `/api/tasks/${fixtureTaskId}/submit-for-approval`,
      { checklistResults: [{ templateChecklistItemId: mandatoryItemId, outcome: 1 }] },
    );
    assert.equal(repeated.status, 400, await repeated.text());
  });

  await t.test('supervisor-stage approval accepts Supervisor, Admin, and Superadmin reviewers', async () => {
    for (const roles of [['Supervisor'], ['Admin'], ['Superadmin']]) {
      h.reset({
        taskStatus: 'in_progress',
        approvalStatus: 'PendingSupervisor',
        technicianCompletedByUserId: fixtureUserId,
      });

      const response = await request(
        'POST',
        `/api/tasks/${fixtureTaskId}/approve-by-supervisor`,
        undefined,
        h.tokenFor(fixtureSecondUserId, roles),
      );
      assert.equal(response.status, 200, `${roles.join(',')}: ${await response.text()}`);
      assert.equal(h.getState().approvalStatus, 'PendingSuperadmin');
    }
  });

  await t.test('supervisor-stage approval blocks same-user own-work approval', async () => {
    for (const roles of [['Supervisor'], ['Admin'], ['Superadmin'], ['Technician', 'Supervisor']]) {
      h.reset({
        taskStatus: 'in_progress',
        approvalStatus: 'PendingSupervisor',
        technicianCompletedByUserId: fixtureUserId,
      });

      const response = await request(
        'POST',
        `/api/tasks/${fixtureTaskId}/approve-by-supervisor`,
        undefined,
        h.token(roles),
      );
      assert.equal(response.status, 403, `${roles.join(',')}: ${await response.text()}`);
      assert.equal(h.getState().approvalStatus, 'PendingSupervisor');
    }
  });

  await t.test('revise-approval rejects Admin but accepts Supervisor and Superadmin', async () => {
    h.reset({ taskStatus: 'in_progress', approvalStatus: 'PendingSupervisor' });

    const adminAttempt = await request(
      'POST',
      `/api/tasks/${fixtureTaskId}/revise-approval`,
      { reason: 'Need correction', reopenTask: false },
      h.tokenFor(fixtureSecondUserId, ['Admin']),
    );
    assert.equal(adminAttempt.status, 403, await adminAttempt.text());

    for (const roles of [['Supervisor'], ['Superadmin']]) {
      h.reset({ taskStatus: 'in_progress', approvalStatus: 'PendingSupervisor' });
      const response = await request(
        'POST',
        `/api/tasks/${fixtureTaskId}/revise-approval`,
        { reason: 'Need correction', reopenTask: false },
        h.tokenFor(fixtureSecondUserId, roles),
      );
      assert.equal(response.status, 200, `${roles.join(',')}: ${await response.text()}`);
      assert.equal(h.getState().approvalStatus, 'None');
    }
  });

  await t.test('review actions block same-user PM performers at both approval stages', async () => {
    h.reset({
      taskStatus: 'in_progress',
      approvalStatus: 'PendingSupervisor',
      technicianCompletedByUserId: fixtureUserId,
    });
    const reviseSupervisor = await request(
      'POST',
      `/api/tasks/${fixtureTaskId}/revise-approval`,
      { reason: 'Need correction', reopenTask: false },
      h.token(['Supervisor']),
    );
    assert.equal(reviseSupervisor.status, 403, await reviseSupervisor.text());

    h.reset({
      taskStatus: 'in_progress',
      approvalStatus: 'PendingSupervisor',
      technicianCompletedByUserId: fixtureUserId,
    });
    const rejectSupervisor = await request(
      'POST',
      `/api/tasks/${fixtureTaskId}/reject-approval`,
      { reason: 'Need rework' },
      h.token(['Supervisor']),
    );
    assert.equal(rejectSupervisor.status, 403, await rejectSupervisor.text());

    h.reset({
      taskStatus: 'in_progress',
      approvalStatus: 'PendingSuperadmin',
      technicianCompletedByUserId: fixtureUserId,
    });
    const reviseSuperadmin = await request(
      'POST',
      `/api/tasks/${fixtureTaskId}/revise-approval`,
      { reason: 'Need correction', reopenTask: false },
      h.token(['Superadmin']),
    );
    assert.equal(reviseSuperadmin.status, 403, await reviseSuperadmin.text());

    h.reset({
      taskStatus: 'in_progress',
      approvalStatus: 'PendingSuperadmin',
      technicianCompletedByUserId: fixtureUserId,
    });
    const rejectSuperadmin = await request(
      'POST',
      `/api/tasks/${fixtureTaskId}/reject-approval`,
      { reason: 'Need rework' },
      h.token(['Superadmin']),
    );
    assert.equal(rejectSuperadmin.status, 403, await rejectSuperadmin.text());
  });

  await t.test('final approval route rejects non-Superadmin reviewers', async () => {
    for (const roles of [['Supervisor'], ['Admin']]) {
      h.reset({
        taskStatus: 'in_progress',
        approvalStatus: 'PendingSuperadmin',
        technicianCompletedByUserId: fixtureUserId,
      });

      const response = await request(
        'POST',
        `/api/tasks/${fixtureTaskId}/approve-by-superadmin`,
        undefined,
        h.tokenFor(fixtureSecondUserId, roles),
      );
      assert.equal(response.status, 403, `${roles.join(',')}: ${await response.text()}`);
    }
  });
});
