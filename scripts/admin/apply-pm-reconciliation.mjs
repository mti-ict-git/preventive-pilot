import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {getDb} from '../../backend/dist/db/mssql.js';
import {applyPmBlackout,advancePmPlannedDueAt,loadPmScheduleContextByTask,savePmScheduleAnchor} from '../../backend/dist/db/pmSchedulingPolicy.js';
import {writeAuditLog} from '../../backend/dist/db/auditLog.js';
const require=createRequire(new URL('../../backend/package.json',import.meta.url)),sql=require('mssql');
// Explicit application only; never approve work or erase evidence/missed history.
const verify=process.argv[2]==='--verify';
if(!['--apply','--verify'].includes(process.argv[2])||!process.argv[3]||!process.argv[4])throw new Error('Usage: node apply-pm-reconciliation.mjs --apply|--verify REVIEWED_PLAN.json PRIVATE_AUDIT_DIR [DDL_FOR_ROLLBACK_VERIFICATION]');
const plan=JSON.parse(await fs.readFile(process.argv[3],'utf8')),audit=process.argv[4],db=await getDb();
const tx=new sql.Transaction(db),before=[],changes=[];
const stable=['TaskId','TaskNumber','AssetId','FacilityId','TemplateId','Status','ApprovalStatus','ScheduledDueAt','PlannedDueAt','FulfilledPlannedDueAt','StartedAt','TechnicianCompletedAt','CompletedAt','CancelledAt','SourceTaskId'];
const norm=x=>x instanceof Date?x.toISOString():x??null;
try{
 await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
 const exists=await tx.request().query("SELECT OBJECT_ID(N'pm.PMOccurrenceResolutions',N'U') Ledger");if(!exists.recordset[0].Ledger){if(!verify||!process.argv[5])throw new Error('Ledger migration missing');await tx.request().batch(await fs.readFile(process.argv[5],'utf8'));}
 for(const p of plan.plans){
  const rows=(await tx.request().input('a',sql.UniqueIdentifier,p.original.TaskId).input('b',sql.UniqueIdentifier,p.execution.TaskId).query(`SELECT t.*,
   (SELECT COUNT(*) FROM pm.PMTaskChecklistResults x WITH(HOLDLOCK) WHERE x.TaskId=t.TaskId) ChecklistRows,
   (SELECT COUNT(*) FROM pm.PMTaskEvidence x WITH(HOLDLOCK) WHERE x.TaskId=t.TaskId) EvidenceRows,
   (SELECT COUNT(*) FROM pm.PMTaskChecklistEvidence x WITH(HOLDLOCK) WHERE x.TaskId=t.TaskId) ChecklistEvidenceRows,
   (SELECT COUNT(*) FROM pm.TaskWorkSessions x WITH(HOLDLOCK) WHERE x.TaskId=t.TaskId) SessionRows,
   (SELECT COUNT(*) FROM pm.TaskDrafts x WITH(HOLDLOCK) WHERE x.TaskId=t.TaskId) DraftRows
   FROM pm.PMTasks t WITH(UPDLOCK,HOLDLOCK) WHERE t.TaskId IN(@a,@b)`)).recordset;
  for(const expected of [p.original,p.execution]){
   const actual=rows.find(t=>t.TaskId===expected.TaskId);if(!actual)throw new Error('Task missing');
   for(const k of stable)if(norm(actual[k])!==norm(expected[k]))throw new Error('Concurrent task drift: '+expected.TaskNumber+' '+k);
   for(const k of ['ChecklistRows','EvidenceRows','SessionRows','DraftRows'])if(actual[k]!==expected[k])throw new Error('Concurrent work drift');
  }
  const original=rows.find(t=>t.TaskId===p.original.TaskId),execution=rows.find(t=>t.TaskId===p.execution.TaskId);
  if(original.MaintenanceType!=='PM'||execution.MaintenanceType!=='PM')throw new Error('Maintenance type drift');
  if(original.Status!=='open'||original.ApprovalStatus!=='None'||original.StartedAt||original.CompletedAt||original.ChecklistEvidenceRows||original.ChecklistRows||original.EvidenceRows||original.SessionRows||original.DraftRows)throw new Error('Protected duplicate');
  if(execution.Status!=='completed'||execution.ApprovalStatus!=='Approved'||!execution.CompletedAt||execution.AssetId!==original.AssetId||execution.FacilityId!==original.FacilityId||execution.TemplateId!==original.TemplateId)throw new Error('Execution/context mismatch');
  const prior=(await tx.request().input('a',sql.UniqueIdentifier,original.TaskId).input('b',sql.UniqueIdentifier,execution.TaskId).query('SELECT * FROM pm.PMOccurrenceResolutions WITH(UPDLOCK,HOLDLOCK) WHERE OriginalTaskId=@a OR FulfilledByTaskId=@b')).recordset;if(prior.length)throw new Error('Plan already applied or overlapping mapping; rescan');
  const context=await loadPmScheduleContextByTask({executor:tx,taskId:execution.TaskId});
  if(p.repairAnchor&&(!context||context.intervalDays!==p.execution.IntervalDays))throw new Error('Schedule/template interval drift');
  if(p.setting&&context){for(const [field,key] of [['nextPlannedDueAt','NextPlannedPMDueAt'],['nextDueAt','NextPMDueAt'],['lastPmCompletedAt','LastPMCompletedAt']])if(norm(context[field])!==p.setting[key])throw new Error('Concurrent schedule drift');}
  before.push({original,execution,context});
  const reason=`Occurrence fulfilled by ${execution.TaskNumber}; actual completion ${execution.CompletedAt.toISOString()}. Authorized legacy reconciliation.`;
  await tx.request().input('a',sql.UniqueIdentifier,original.TaskId).input('b',sql.UniqueIdentifier,execution.TaskId).input('planned',sql.DateTime2(0),new Date(p.plannedDueAt)).input('due',sql.DateTime2(0),new Date(p.effectiveDueAt)).input('reason',sql.NVarChar(1024),reason).query(`INSERT pm.PMOccurrenceResolutions(OriginalTaskId,FulfilledByTaskId,PlannedDueAt,EffectiveDueAt,Reason) VALUES(@a,@b,@planned,@due,@reason);
   UPDATE pm.PMTasks SET Status=N'cancelled',CancelledAt=sysutcdatetime(),CancelledByUserId=NULL,CancelledReason=@reason WHERE TaskId=@a;
   UPDATE pm.PMTasks SET FulfilledPlannedDueAt=@planned WHERE TaskId=@b;`);
  let anchor=null;
  if(p.repairAnchor&&context){
   const protectedWork=(await tx.request().input('context',sql.UniqueIdentifier,context.contextId).input('template',sql.UniqueIdentifier,context.templateId).query(`SELECT TOP(1) TaskId FROM pm.PMTasks WITH(UPDLOCK,HOLDLOCK) WHERE ${context.kind==='asset'?'AssetId':'FacilityId'}=@context AND TemplateId=@template AND (Status IN(N'in_progress',N'paused') OR ApprovalStatus IN(N'PendingSupervisor',N'PendingSuperadmin'))`)).recordset;
   if(protectedWork.length)throw new Error('Protected context changed; rescan');
   const next=advancePmPlannedDueAt(new Date(p.plannedDueAt),context.intervalDays),effective=await applyPmBlackout({executor:tx,plannedDueAt:next});
   await savePmScheduleAnchor({executor:tx,context,nextPlannedDueAt:next,nextDueAt:effective,lastPmCompletedAt:execution.CompletedAt});anchor={nextPlannedDueAt:next,nextDueAt:effective};
  }
  await writeAuditLog({executor:tx,actorUserId:null,action:'pm.history.reconcile',entityType:'PMTask',entityId:original.TaskId,metadata:{requestedBy:'widji.santoso',executor:'Codex established SSH relay',originalTaskNumber:original.TaskNumber,fulfilledByTaskId:execution.TaskId,fulfilledByTaskNumber:execution.TaskNumber,previousFulfilledPlannedDueAt:p.execution.FulfilledPlannedDueAt,plannedDueAt:p.plannedDueAt,effectiveDueAt:p.effectiveDueAt,completedAt:execution.CompletedAt,anchor,protectedContext:p.protectedContext,run:plan.run},ipAddress:null,userAgent:'authorized-pm-history-reconciliation'});
  changes.push({original:original.TaskNumber,execution:execution.TaskNumber,plannedDueAt:p.plannedDueAt,anchor,protectedContext:p.protectedContext});
 }
 if(verify){
  if(process.argv[6]){
   const reads=JSON.parse(await fs.readFile(process.argv[6],'utf8')),from=new Date('2026-02-21T00:00:00Z'),to=new Date('2026-02-22T00:00:00Z');
   const day=(await tx.request().input('from',sql.DateTime2(0),from).input('to',sql.DateTime2(0),to).query(reads.day)).recordset;
   const example=day.find(x=>x.TaskNumber==='PM-NOW-20260302-5F12BE0A');
   if(plan.plans.some(p=>p.execution.TaskNumber==='PM-NOW-20260302-5F12BE0A')&&(!example||example.Bucket!=='completed-late'||example.ReplacedTaskNumber!=='PM-20260122-0896D108'||example.EstimatedMinutes!==0))throw new Error('Calendar example parity failed');
   if(reads.reopen){const originalId=plan.plans.find(p=>p.execution.TaskNumber==='PM-NOW-20260302-5F12BE0A')?.original.TaskId;if(originalId){const blocked=await tx.request().input('taskId',sql.UniqueIdentifier,originalId).query(reads.reopen);if(blocked.rowsAffected.some(n=>n!==0))throw new Error('Resolved reopen SQL mutated history');}}
   const month=(await tx.request().input('from',sql.DateTime2(0),new Date('2026-02-01')).input('to',sql.DateTime2(0),new Date('2026-03-01')).query(reads.calendar)).recordset;
   await fs.writeFile(audit+'/calendar-verification.json',JSON.stringify({day,month},null,2),{mode:0o600});
  }
  await fs.writeFile(audit+'/verification-preview.json',JSON.stringify({changes},null,2),{mode:0o600});
  await tx.rollback();console.log(JSON.stringify({status:'verified-rolled-back',changed:changes.length,changes}));
 }else{
 await fs.writeFile(audit+'/before-images.json',JSON.stringify(before,null,2),{mode:0o600,flag:'wx'});
 await tx.commit();await fs.writeFile(audit+'/applied.json',JSON.stringify({run:plan.run,changes,exceptions:plan.exceptions},null,2),{mode:0o600,flag:'wx'});
 console.log(JSON.stringify({status:'committed',run:plan.run,changed:changes.length,changes,exceptions:plan.exceptions}));
 }
}catch(e){await tx.rollback().catch(()=>{});throw e;}finally{await db.close();}
