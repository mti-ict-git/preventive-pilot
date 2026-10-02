import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHarness as createTaskHarness, fixtureTaskId } from './task-checklist-harness.mjs';
import { createHarness, fixtureId, newId } from './facility-harness.mjs';
const siteId = '33333333-3333-4333-8333-333333333333';
const templateId = '44444444-4444-4444-8444-444444444444';

function fixture() {
  let contexts, tasks, snapshot;
  const events = [];
  const fresh = () => ({ PMEnabled: false, DefaultTemplateId: templateId, TemplateIsActive: true,
    LocationId: siteId, CategoryId: null, TemplateCategoryId: null, IsActive: true });
  const reset = (patch = {}) => { contexts = new Map([[fixtureId,{...fresh(),...patch}]]); tasks = []; events.length = 0; };
  reset();
  const h = createHarness({
    begin() { snapshot = structuredClone({contexts,tasks}); events.push('begin'); },
    commit() { events.push('commit'); },
    rollback() { ({contexts,tasks} = structuredClone(snapshot)); events.push('rollback'); },
    query(query, inputs) {
      const result = (recordset = [], rowsAffected = []) => ({recordset,rowsAffected});
      const id = inputs.contextId ?? inputs.assetId ?? inputs.facilityId;
      const c = contexts.get(id);
      if (query.includes('pm-eligibility: activation')) return result(c ? [c] : []);
      if (query.includes('pm-eligibility: cancel-unstarted')) {
        // Challenge the actual SQL protection clauses as well as route orchestration.
        for (const clause of ["t.MaintenanceType = N'PM'", "t.Status = N'open'", 't.StartedAt IS NULL',
          't.TechnicianCompletedAt IS NULL', "ISNULL(t.ApprovalStatus, N'None') = N'None'", 't.RevisedAt IS NULL',
          't.RejectedAt IS NULL', 'NOT EXISTS (SELECT 1 FROM pm.TaskWorkSessions', 't.CompletedAt IS NULL', 't.CancelledAt IS NULL']) assert(query.includes(clause),clause);
        const changed = tasks.filter(t => t.contextId === id && t.kind === 'PM' && t.status === 'open' && !t.started && !t.submitted && !t.sessions && !t.review && !t.revised && !t.rejected);
        for (const t of changed) { t.status = 'cancelled'; t.reason = inputs.reason; }
        return result(changed.map(t=>({TaskId:t.id})),[changed.length]);
      }
      if (query.includes('INSERT INTO pm.AuditLog')) return result([], [1]);
      if (query.includes('AS ExistingCount')) return result([{ExistingCount:Object.keys(inputs).filter(k=>/^id\d+$/.test(k)&&contexts.has(inputs[k])).length}]);
      if (query.includes('MERGE pm.AssetPMSettings') || query.includes('MERGE pm.FacilityPMSettings')) {
        const ids = id ? [id] : Object.keys(inputs).filter(k=>/^id\d+$/.test(k)).map(k=>inputs[k]);
        for (const key of ids) {
          const current=contexts.get(key);
          if (inputs.pmEnabled !== null && inputs.pmEnabled !== undefined) current.PMEnabled=Boolean(inputs.pmEnabled);
          if (inputs.hasDefaultTemplateId || (inputs.defaultTemplateId !== undefined && inputs.hasDefaultTemplateId === undefined)) current.DefaultTemplateId=inputs.defaultTemplateId;
        }
        return result([], [ids.length]);
      }
      if (query.includes('FROM pm.Assets a') && query.includes('AssetCategoryId')) return result([{AssetCategoryId:c.CategoryId,TemplateId:inputs.templateId,TemplateCategoryId:c.TemplateCategoryId}]);
      if (query.includes('FROM pm.Assets a') && query.includes('a.AssetId AS AssetId')) return result(c ? [{AssetId:id,CategoryId:c.CategoryId}] : []);
      if (query.includes('FROM pm.PMTemplates') && query.includes('IsActive = 1')) return result([{TemplateId:inputs.defaultTemplateId}]);
      if (query.includes('UPDATE pm.Facilities')) {
        if (!c) return result([], [0]);
        if (inputs.hasIsActive) c.IsActive=Boolean(inputs.isActive);
        if (inputs.hasLocation) c.LocationId=inputs.locationId;
        return result([], [1]);
      }
      if (query.includes('INSERT INTO pm.Facilities')) {
        contexts.set(newId,{...fresh(),LocationId:inputs.locationId,IsActive:Boolean(inputs.isActive)});
        return result([{FacilityId:newId}],[1]);
      }
      if (query.includes('FROM pm.Facilities f')) return result(c ? [{Name:'UPS',LocationId:c.LocationId,IsActive:c.IsActive}] : []);
      if (query.includes('FROM pm.FacilityPMSettings')) return result(c ? [c] : []);
      if (query.includes('INSERT INTO pm.FacilityPMSettings')) { c.PMEnabled=Boolean(inputs.pmEnabled); c.DefaultTemplateId=inputs.defaultTemplateId; return result([], [1]); }
      return undefined;
    },
  });
  return {h,events,reset,state:()=>contexts, tasks:()=>tasks};
}

test('Q-14/Q-15 activation prerequisites and deactivation transaction boundaries', async t => {
  const f=fixture(), h=f.h;
  const server=h.app.listen(0,'127.0.0.1'); await new Promise(resolve=>server.once('listening',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const request=async (path,body,method='PUT')=>{
    if (path.startsWith('/assets/') && path.endsWith('/pm')) method='PATCH';
    const res=await fetch(`http://127.0.0.1:${server.address().port}/api${path}`,{method,signal:AbortSignal.timeout(5000),headers:{'content-type':'application/json',authorization:`Bearer ${h.token(['Admin'])}`},body:JSON.stringify(body)});
    return {status:res.status,body:await res.json()};
  };
  for (const kind of ['assets','facilities']) {
    const route=`/${kind}/${fixtureId}/${kind==='assets'?'pm':'pm-settings'}`;
    await t.test(`${kind}: activation requires site and active template, rolls back invalid writes`,async()=>{
      for (const patch of [{LocationId:null},{DefaultTemplateId:null},{TemplateIsActive:false}]) {
        f.reset(patch);const r=await request(route,{pmEnabled:true});
        assert.equal(r.status,400,JSON.stringify(r.body));assert.equal(r.body.code,'PM_ACTIVATION_INVALID');
        assert.equal(f.state().get(fixtureId).PMEnabled,false);assert.deepEqual(f.events,['begin','rollback']);
      }
      f.reset();assert.equal((await request(route,{pmEnabled:true})).status,200);
      assert.equal(f.state().get(fixtureId).PMEnabled,true);
    });
    await t.test(`${kind}: disabling cancels only unstarted PM and records audit once`,async()=>{
      f.reset({PMEnabled:true});
      const base={contextId:fixtureId,kind:'PM',status:'open'};
      const variants=[{}, {started:true}, {sessions:true}, {submitted:true}, {review:true}, {revised:true}, {rejected:true}, {status:'paused'}, {status:'in_progress'}, {status:'completed'}, {status:'cancelled'}, {kind:'CM'}];
      f.tasks().push(...variants.map((v,n)=>({...base,...v,id:`task-${n}`})));
      h.calls.length=0;
      assert.equal((await request(route,{pmEnabled:false})).status,200);
      assert.equal(f.tasks()[0].status,'cancelled'); assert.equal(f.tasks()[0].reason,'PM disabled');
      variants.slice(1).forEach((v,n)=>assert.equal(f.tasks()[n+1].status,v.status??'open'));
      assert.equal(h.calls.filter(c=>c.query.includes('INSERT INTO pm.AuditLog')).length,1);
      assert.equal((await request(route,{pmEnabled:false})).status,200);
      assert.equal(h.calls.filter(c=>c.query.includes('INSERT INTO pm.AuditLog')).length,1);
      assert.equal((await request(route,{pmEnabled:true})).status,200);
      assert.equal(f.tasks()[0].status,'cancelled');
    });
    await t.test(`${kind}: enabled template cannot be cleared unless disabled in same request`,async()=>{
      f.reset({PMEnabled:true}); assert.equal((await request(route,{defaultTemplateId:null})).status,400);
      assert.equal(f.state().get(fixtureId).DefaultTemplateId,templateId);
      assert.equal((await request(route,{pmEnabled:false,defaultTemplateId:null})).status,200);
    });
  }
  await t.test('bulk activation rejects entire batch when one asset has no site',async()=>{
    f.reset(); f.state().set(newId,{...f.state().get(fixtureId),LocationId:null});
    const r=await request('/assets/pm/bulk',{assetIds:[fixtureId,newId],pmEnabled:true},'POST');
    assert.equal(r.status,400); assert.equal(f.state().get(fixtureId).PMEnabled,false); assert.equal(f.state().get(newId).PMEnabled,false);
  });
  await t.test('bulk disable applies cancellation to every selected context',async()=>{
    f.reset({PMEnabled:true});f.state().set(newId,{...f.state().get(fixtureId)});
    f.tasks().push(...[fixtureId,newId].map((contextId,n)=>({id:`bulk-${n}`,contextId,kind:'PM',status:'open'})));
    assert.equal((await request('/assets/pm/bulk',{assetIds:[fixtureId,newId],pmEnabled:false},'POST')).status,200);
    assert(f.tasks().every(t=>t.status==='cancelled'));
  });
  await t.test('bulk template removal cannot invalidate enabled contexts',async()=>{
    f.reset({PMEnabled:true});assert.equal((await request('/assets/pm/bulk/template',{assetIds:[fixtureId],defaultTemplateId:null},'POST')).status,400);
    assert.equal(f.state().get(fixtureId).DefaultTemplateId,templateId);
  });
  await t.test('facility archival cancels pending work and site clearing rolls back while PM enabled',async()=>{
    f.reset({PMEnabled:true});assert.equal((await request(`/facilities/${fixtureId}`,{locationId:null})).status,400);
    assert.equal(f.state().get(fixtureId).LocationId,siteId);
    f.tasks().push({id:'archived-task',contextId:fixtureId,kind:'PM',status:'open'});
    assert.equal((await request(`/facilities/${fixtureId}`,{isActive:false})).status,200);
    assert.equal(f.tasks()[0].reason,'Facility archived');assert.equal(f.state().get(fixtureId).IsActive,false);
  });
  await t.test('clone with invalid enabled PM rolls back the newly inserted facility',async()=>{
    f.reset({PMEnabled:true,LocationId:null});
    assert.equal((await request(`/facilities/${fixtureId}/clone`,{name:'Copy',includePmSettings:true},'POST')).status,400);
    assert(!f.state().has(newId));
    assert.equal((await request(`/facilities/${fixtureId}/clone`,{name:'Copy without PM',includePmSettings:false},'POST')).status,201);
  });
  await t.test('asset template category mismatch cannot be enabled',async()=>{
    f.reset({TemplateCategoryId:newId}); assert.equal((await request(`/assets/${fixtureId}/pm`,{pmEnabled:true})).status,400);
  });
  await t.test('task generation SQL rechecks current context at insertion time',async()=>{
    const policy=h.load('backend/src/db/pmSchedulingPolicy.ts');let captured='';
    const executor={request(){return {input(){return this;},async query(q){captured=q;return {recordset:[],rowsAffected:[0]};}};}};
    for (const kind of ['asset','facility']) {
      await policy.createPmTaskForOccurrence({executor,context:{kind,contextId:fixtureId,templateId},occurrence:{plannedDueAt:new Date(),scheduledDueAt:new Date()},assignedToUserId:null,assignedToRoleId:null});
      assert.match(captured,/CONCAT\([\s\S]*?\);\s*INSERT INTO pm.PMTasks/);assert.match(captured,/SELECT\s+@taskNumber,[^;]*WHERE EXISTS \(SELECT 1/);assert.match(captured,/s.PMEnabled = 1 AND tpl.IsActive = 1/);assert.match(captured,/c.LocationId IS NOT NULL/);
      assert(captured.includes(kind==='asset'?'c.IsArchived = 0':'c.IsActive = 1'));
    }
  });
});


test('Q-14/Q-15 reopening and concurrent cancellation do not restart disabled work', async t => {
  const h=createTaskHarness();
  const server=h.app.listen(0,'127.0.0.1'); await new Promise(resolve=>server.once('listening',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const request=async action=>fetch(`http://127.0.0.1:${server.address().port}/api/tasks/${fixtureTaskId}/${action}`,{
    method:'POST',signal:AbortSignal.timeout(5000),headers:{'content-type':'application/json',authorization:`Bearer ${h.token(['Supervisor'])}`},body:'{}',
  });
  for (const patch of [{pmEnabled:false},{templateIsActive:false}]) {
    h.reset({taskStatus:'cancelled',...patch}); const r=await request('reopen');
    assert.equal(r.status,409);assert.equal((await r.json()).code,'PM_CONTEXT_UNAVAILABLE');
    assert.equal(h.getState().taskStatus,'cancelled');
  }
  h.reset({taskStatus:'cancelled'});assert.equal((await request('reopen')).status,200);
  for (const action of ['start','resume']) {
    h.reset({taskStatus: action==='resume'?'paused':'open',rejectStartUpdate:true});
    assert.equal((await request(action)).status,409);
    assert(!h.calls.some(c=>c.query.includes('INSERT INTO pm.TaskWorkSessions')));
    assert.deepEqual(h.txEvents,['begin','rollback']);
  }
});
