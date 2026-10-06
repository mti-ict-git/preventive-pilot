import assert from 'node:assert/strict';
import {test} from 'node:test';
import {buildPlan,advance} from '../admin/pm-reconciliation-plan.mjs';
const base={AssetId:'a',FacilityId:null,TemplateId:'t',IntervalDays:180,ApprovalStatus:'None',Status:'open',CreatedAt:'2026-01-22T00:00:00.000Z',ScheduledDueAt:'2026-02-21T00:00:00.000Z',PlannedDueAt:'2026-02-21T00:00:00.000Z',StartedAt:null,CompletedAt:null,TechnicianCompletedAt:null,CancelledAt:null,FulfilledPlannedDueAt:null,SourceTaskId:null,ChecklistRows:0,EvidenceRows:0,SessionRows:0,DraftRows:0};
const original={...base,TaskId:'o',TaskNumber:'PM-OLD'};
const execution={...base,TaskId:'e',TaskNumber:'PM-NOW-NEW',Status:'completed',ApprovalStatus:'Approved',CreatedAt:'2026-03-02T00:00:00.000Z',ScheduledDueAt:'2026-03-02T00:00:00.000Z',PlannedDueAt:'2026-03-02T00:00:00.000Z',CompletedAt:'2026-03-03T00:00:00.000Z',TechnicianCompletedAt:'2026-03-03T00:00:00.000Z',FulfilledPlannedDueAt:'2026-08-21T00:00:00.000Z'};
const plan=tasks=>buildPlan({tasks,settings:[]});
test('reconciliation picks overdue period before next future and preserves actual execution',()=>{
 const p=plan([original,{...original,TaskId:'f',TaskNumber:'PM-FUTURE',PlannedDueAt:'2026-08-21T00:00:00.000Z',ScheduledDueAt:'2026-08-21T00:00:00.000Z'},execution]);assert.equal(p.plans.length,1);assert.equal(p.plans[0].original.TaskId,'o');assert.equal(p.plans[0].plannedDueAt,original.PlannedDueAt);assert.equal(p.plans[0].execution.CompletedAt,execution.CompletedAt);
});
test('early execution fulfils only next occurrence including later-generated normal work',()=>{
 const n={...execution,CreatedAt:'2026-02-11T00:00:00.000Z',ScheduledDueAt:'2026-02-11T00:00:00.000Z'};const o={...original,CreatedAt:'2026-02-20T00:00:00.000Z'};assert.equal(plan([o,n]).plans[0].plannedDueAt,o.PlannedDueAt);
});
test('protected closest occurrence is not bypassed by mapping a later future period',()=>{
 const protectedTask={...original,Status:'in_progress',StartedAt:'2026-02-22T00:00:00.000Z'};const future={...original,TaskId:'f',PlannedDueAt:'2026-08-21T00:00:00.000Z',ScheduledDueAt:'2026-08-21T00:00:00.000Z'};assert.equal(plan([protectedTask,future,execution]).plans.length,0);
});
test('different template/site, evidence, and conflicting completion dates are excluded',()=>{
 for(const altered of [{TemplateId:'other'},{AssetId:'other'},{ChecklistRows:1},{DraftRows:1}])assert.equal(plan([{...original,...altered},execution]).plans.length,0);
 assert.equal(plan([original,{...execution,TechnicianCompletedAt:'2026-03-04T00:00:00.000Z'}]).plans.length,0);
});
test('one execution cannot consume multiple missed periods or another completed record',()=>{
 const oldest={...original,TaskId:'oldest',PlannedDueAt:'2025-09-01T00:00:00.000Z',ScheduledDueAt:'2025-09-01T00:00:00.000Z'};assert.equal(plan([oldest,original,execution]).plans.length,1);assert.equal(plan([{...original,Status:'completed'},execution]).plans.length,0);
});
test('future active work preserves context anchor during historical fulfilment repair',()=>{
 const active={...original,TaskId:'active',TaskNumber:'PM-NOW-ACTIVE',Status:'paused'};assert.equal(plan([original,execution,active]).plans[0].repairAnchor,false);
});
test('monthly cadence clamps month ends and leap days',()=>{assert.equal(advance('2026-01-31T00:00:00.000Z',30).toISOString(),'2026-02-28T00:00:00.000Z');assert.equal(advance('2024-02-29T00:00:00.000Z',365).toISOString(),'2025-02-28T00:00:00.000Z');});
