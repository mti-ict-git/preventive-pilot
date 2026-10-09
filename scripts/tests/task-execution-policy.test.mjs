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


test('single active PM rejects competing start, resume, submission and force-completion before checklist writes', async t=>{
 const h=createHarness({query(query){if(query.includes('SELECT TOP(1) other.TaskId'))return {recordset:[{TaskId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'}],rowsAffected:[]};}});
 const server=h.app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const origin=`http://127.0.0.1:${server.address().port}`;
 for(const action of ['start','resume','submit-for-approval','complete']){
  h.reset({taskStatus:'open'});
  const response=await fetch(`${origin}/api/tasks/${fixtureTaskId}/${action}`,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${h.token(['Supervisor'])}`},body:JSON.stringify({checklistResults:[{templateChecklistItemId:mandatoryItemId,outcome:1}]})});
  assert.equal(response.status,409,`${action}: ${await response.text()}`);
  assert(!h.calls.some(c=>c.query.includes('MERGE pm.PMTaskChecklistResults')));
  assert(!h.txEvents.includes('commit'));
 }
});

test('retired PM cannot be submitted after a stale editor remains open',async t=>{
 const h=createHarness();h.reset({taskStatus:'cancelled'});const server=h.app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const response=await fetch(`http://127.0.0.1:${server.address().port}/api/tasks/${fixtureTaskId}/submit-for-approval`,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${h.token(['Technician'])}`},body:JSON.stringify({checklistResults:[{templateChecklistItemId:mandatoryItemId,outcome:1}]})});
 assert.equal(response.status,409,await response.text());assert(!h.calls.some(c=>c.query.includes('MERGE pm.PMTaskChecklistResults')));
});


test('PM submission requires started and currently running work before result writes',async t=>{
 for(const status of ['open','paused']) {
  const h=createHarness();h.reset({taskStatus:status});const server=h.app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  try {const response=await fetch(`http://127.0.0.1:${server.address().port}/api/tasks/${fixtureTaskId}/submit-for-approval`,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${h.token(['Technician'])}`},body:JSON.stringify({checklistResults:[{templateChecklistItemId:mandatoryItemId,outcome:1}]})});assert.equal(response.status,409);assert.equal((await response.json()).code,'TASK_NOT_STARTED');assert(!h.calls.some(c=>c.query.includes('MERGE pm.PMTaskChecklistResults')));assert(!h.txEvents.includes('commit'));} finally {await new Promise(r=>server.close(r));}
 }
});


test('duplicate replacement insert rolls back reject and returns controlled conflict without terminating API',async t=>{
 const h=createHarness({query(sql){if(sql.includes('INSERT INTO pm.PMTasks (') && sql.includes('@sourceTaskId'))throw Object.assign(new Error('duplicate fixture'),{number:2601});}});h.reset({approvalStatus:'PendingSupervisor',taskStatus:'in_progress'});
 const server=h.app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
 const origin=`http://127.0.0.1:${server.address().port}`;
 const response=await fetch(`${origin}/api/tasks/${fixtureTaskId}/reject-approval`,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${h.token(['Supervisor'])}`},body:JSON.stringify({reason:'Repeat work',reopenTask:false})});assert.equal(response.status,409);assert.equal((await response.json()).code,'PM_OCCURRENCE_CONFLICT');assert(h.txEvents.includes('rollback'));assert(!h.txEvents.includes('commit'));
 const alive=await fetch(`${origin}/api/tasks/${fixtureTaskId}/reject-approval`,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${h.token(['Supervisor'])}`},body:JSON.stringify({reason:'Repeat work',reopenTask:true})});assert.equal(alive.status,400);
});
