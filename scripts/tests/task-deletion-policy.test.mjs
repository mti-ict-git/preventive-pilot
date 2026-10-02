import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { createHarness, fixtureTaskId, root } from './task-checklist-harness.mjs';

test('D1 task deletion preserves boundaries and transaction order', async t => {
  let kind, missing, referenced, fail;
  const result = (recordset = [], rowsAffected = [1]) => ({recordset, rowsAffected});
  const h = createHarness({ query(query) {
    if (query.includes('FROM pm.PMTasks t WITH (XLOCK, HOLDLOCK)')) {
      const matches = query.includes(`t.MaintenanceType = N'${kind}'`);
      return result(missing || !matches ? [] : [{TaskId:fixtureTaskId, TaskNumber:'TEST-1'}]);
    }
    if (query.includes('task-deletion: references')) return result([{HasReferences:referenced ? 1 : 0}]);
    if (query.includes('SELECT StoragePath')) return result();
    if (query.includes('task-deletion: owned rows')) {
      if (fail === 'delete') throw new Error('Synthetic deletion failure');
      return result();
    }
    if (query.includes('INSERT INTO pm.AuditLog')) {
      assert.deepEqual(h.txEvents,['begin'],'Audit must run before commit');
      if (fail === 'audit') throw new Error('Synthetic audit failure');
      return result();
    }
    return undefined;
  }});
  h.app.use((err, req, res, next) => { if (res.headersSent) return next(err); res.status(500).json({message:err.message}); });
  const server = h.app.listen(0,'127.0.0.1');
  await new Promise(resolve => server.once('listening',resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const request = (route,roles,id=fixtureTaskId) => fetch(`http://127.0.0.1:${server.address().port}/api/${route}/${id}`,{method:'DELETE',headers: roles ? {authorization:`Bearer ${h.token(roles)}`} : {},signal:AbortSignal.timeout(5000)});
  const reset = type => {h.reset();kind=type;missing=false;referenced=false;fail=null;};
  for (const [route,type,allowed] of [['tasks','PM',['Supervisor','Admin','Superadmin']],['work-orders','CM',['Superadmin']]]) {
    await t.test(`${route}: authentication and role guards perform no deletion`,async()=>{
      for (const roles of [null,['Technician'],...(type==='CM'?[['Supervisor'],['Admin']]:[])]) {
        reset(type);const r=await request(route,roles);assert.equal(r.status,roles?403:401);assert.equal(h.txEvents.length,0);assert(!h.calls.some(c=>c.query.includes('DELETE FROM')));
      }
    });
    await t.test(`${route}: invalid, missing and wrong maintenance type`,async()=>{
      reset(type);assert.equal((await request(route,['Superadmin'],'bad-id')).status,400);assert.equal(h.txEvents.length,0);
      for(const other of [false,true]) {reset(other?(type==='PM'?'CM':'PM'):type);missing=!other;assert.equal((await request(route,['Superadmin'])).status,404);assert.deepEqual(h.txEvents,['begin','rollback']);assert(!h.calls.some(c=>c.query.includes('SELECT StoragePath')||c.query.includes('DELETE FROM')));}
    });
    await t.test(`${route}: referenced task returns conflict without mutation`,async()=>{
      reset(type);referenced=true;const r=await request(route,['Superadmin']);assert.equal(r.status,409);assert.equal((await r.json()).code,'TASK_REFERENCED');assert.deepEqual(h.txEvents,['begin','rollback']);assert(!h.calls.some(c=>c.query.includes('DELETE FROM')||c.query.includes('INSERT INTO pm.AuditLog')));
    });
    await t.test(`${route}: owned rows deleted before audit and commit`,async()=>{
      for(const role of allowed){reset(type);const r=await request(route,[role]);assert.equal(r.status,200,await r.text());assert.deepEqual(h.txEvents,['begin','commit']);const queries=h.calls.map(c=>c.query);const deletion=queries.findIndex(q=>q.includes('task-deletion: owned rows'));assert(deletion>queries.findIndex(q=>q.includes('SELECT StoragePath')));assert(deletion<queries.findIndex(q=>q.includes('INSERT INTO pm.AuditLog')));}
    });
    await t.test(`${route}: deletion or audit failure rolls transaction back`,async()=>{
      for(const step of ['delete','audit']) {reset(type);fail=step;assert.equal((await request(route,['Superadmin'])).status,500);assert.deepEqual(h.txEvents,['begin','rollback']);}
    });
  }
});

test('Deletion policy accounts for every current incoming PMTasks foreign key',()=>{
  const schema=fs.readFileSync(path.join(root,'db/schema.sql'),'utf8');
  const policy=fs.readFileSync(path.join(root,'backend/src/db/taskDeletionPolicy.ts'),'utf8');
  const constraints=[...schema.matchAll(/CONSTRAINT (FK_\w+) FOREIGN KEY \((\w+)\) REFERENCES pm\.PMTasks\(TaskId\)/g)].map(m=>m[1]);
  assert.equal(constraints.length,13,'Review deletion policy when adding an incoming task FK');
  for(const table of ['PMTaskEvidence','PMTaskChecklistEvidence','PMTaskChecklistResults','PMTaskChecklistSnapshots','TaskDrafts','TaskWorkSessions','CMTaskEvents','CMDowntimeIntervals']) assert(policy.includes(`DELETE FROM pm.${table} WHERE TaskId = @taskId;`));
  for(const [table,column] of [['PMMissedOccurrences','SourceTaskId'],['PMSkippedOccurrences','TaskId'],['NotificationLog','TaskId'],['PMTasks','SourceTaskId']]) assert(policy.includes(`FROM pm.${table} WITH (UPDLOCK, HOLDLOCK) WHERE ${column} = @taskId`));
  assert(policy.includes('OR RecurringFromTaskId = @taskId'));
  assert(policy.indexOf('DELETE FROM pm.PMTasks')>policy.indexOf('DELETE FROM pm.TaskWorkSessions'));
});
