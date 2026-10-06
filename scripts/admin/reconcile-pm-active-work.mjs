import fs from 'node:fs';
import { createRequire } from 'node:module';
const sql=createRequire(new URL('../../backend/package.json',import.meta.url))('mssql');
import assert from 'node:assert/strict';
import { getDb } from '../../backend/dist/db/mssql.js';
import { lockPmContext, retireMissedPmTasks, supersedeUntouchedPmTasks, untouchedPmSql } from '../../backend/dist/db/pmActiveWorkPolicy.js';
import { loadAssetPmScheduleContext, loadFacilityPmScheduleContext, reconcilePmScheduleContext, savePmScheduleAnchor } from '../../backend/dist/db/pmSchedulingPolicy.js';

const apply=process.argv.includes('--apply');
const audit=process.env.PM_REPAIR_AUDIT_DIR;
if (!audit) throw Error('Protected audit directory is required');
if (apply) {
  assert.equal(JSON.parse(fs.readFileSync(audit+'/database-backup.json','utf8')).verifyOnly,'PASS');
  assert.equal(JSON.parse(fs.readFileSync(audit+'/sql-verification.json','utf8')).status,'PASS');
  assert.equal(JSON.parse(fs.readFileSync(audit+'/repair-rehearsal.json','utf8')).status,'PASS');
}
const db=await getDb();const tx=new sql.Transaction(db);let live=false;
const actions=[];
try {
 await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);live=true;
 const all=(await tx.request().query("SELECT * FROM pm.PMTasks WHERE MaintenanceType=N'PM'; SELECT * FROM pm.AssetPMSettings;SELECT * FROM pm.FacilityPMSettings;SELECT * FROM pm.PMMissedOccurrences;SELECT * FROM pm.PMOccurrenceResolutions;")).recordsets;
 const byNumber=new Map(all[0].map(t=>[t.TaskNumber,t]));
 const get=n=>{const t=byNumber.get(n);assert(t,`Missing reviewed task ${n}`);return t;};
 const contextFor=async t=> t.AssetId ? loadAssetPmScheduleContext({executor:tx,assetId:t.AssetId}) : loadFacilityPmScheduleContext({executor:tx,facilityId:t.FacilityId});
 const auditAction=async(t,action,metadata)=>{
  await tx.request().input('id',sql.UniqueIdentifier,t.TaskId).input('action',sql.NVarChar(128),action)
   .input('metadata',sql.NVarChar(sql.MAX),JSON.stringify({requestedBy:'widji.santoso',...metadata}))
   .query("INSERT pm.AuditLog(ActorUserId,Action,EntityType,EntityId,Metadata) VALUES(NULL,@action,N'task',@id,@metadata)");
  actions.push({task:t.TaskNumber,action,...metadata});
 };
 // Reviewed legacy PM Now dates: one ongoing execution, one scheduled period, no fulfillment claim.
 for (const [keeperNumber,periodNumber] of [
  ['PM-NOW-20260312-6A31DEB4','PM-20260317-BB01DA7B'],
  ['PM-NOW-20260821-89517209','PM-20261002-AA3A31A9'],
 ]) {
  const keeper=get(keeperNumber),period=get(periodNumber);
  assert(['in_progress','paused'].includes(keeper.Status));assert(!keeper.CompletedAt);
  assert.equal(keeper.AssetId,period.AssetId);assert.equal(keeper.TemplateId,period.TemplateId);
  await lockPmContext(tx,keeper.AssetId);
  // Preserve raw scheduled execution date because occurrence uniqueness also covers cancelled originals.
  await tx.request().input('id',sql.UniqueIdentifier,keeper.TaskId).input('planned',sql.DateTime2(0),period.PlannedDueAt)
   .query("UPDATE pm.PMTasks SET FulfilledPlannedDueAt=@planned WHERE TaskId=@id");
  const context=await contextFor(keeper);assert(context);
  await savePmScheduleAnchor({executor:tx,context,nextPlannedDueAt:period.PlannedDueAt,nextDueAt:period.ScheduledDueAt});
  const retired=await supersedeUntouchedPmTasks(tx,keeper.TaskId);
  await auditAction(keeper,'pm.reconcile.active-period',{plannedDueAt:period.PlannedDueAt,retired});
 }
 // Approved executions replace already-cancelled original periods; execution/approval timestamps stay intact.
 for (const [sourceNumber,originalNumber,nextDue] of [
  ['PM-NOW-20260313-E80514E6','PM-20260220-624597EE','2026-09-22T00:00:00Z'],
  ['PM-NOW-20260126-50E3B157','PM-20260106-3741F1F3','2026-05-12T00:00:00Z'],
 ]) {
  const source=get(sourceNumber),original=get(originalNumber);
  assert.equal(source.Status,'completed');assert.equal(source.ApprovalStatus,'Approved');assert.equal(original.Status,'cancelled');
  assert.equal(source.AssetId,original.AssetId);assert.equal(source.TemplateId,original.TemplateId);
  await lockPmContext(tx,source.AssetId);
  const work=(await tx.request().input('id',sql.UniqueIdentifier,original.TaskId).query(`SELECT
   (SELECT COUNT(*) FROM pm.PMTaskChecklistResults WHERE TaskId=@id)+
   (SELECT COUNT(*) FROM pm.PMTaskEvidence WHERE TaskId=@id)+
   (SELECT COUNT(*) FROM pm.PMTaskChecklistEvidence WHERE TaskId=@id)+
   (SELECT COUNT(*) FROM pm.TaskWorkSessions WHERE TaskId=@id)+
   (SELECT COUNT(*) FROM pm.TaskDrafts WHERE TaskId=@id) Cnt`)).recordset[0];assert.equal(work.Cnt,0);
  await tx.request().input('source',sql.UniqueIdentifier,source.TaskId).input('original',sql.UniqueIdentifier,original.TaskId)
   .input('planned',sql.DateTime2(0),original.PlannedDueAt).input('due',sql.DateTime2(0),original.ScheduledDueAt)
   .query(`IF NOT EXISTS(SELECT 1 FROM pm.PMOccurrenceResolutions WHERE OriginalTaskId=@original)
    INSERT pm.PMOccurrenceResolutions(OriginalTaskId,FulfilledByTaskId,PlannedDueAt,EffectiveDueAt,Reason)
    VALUES(@original,@source,@planned,@due,N'Reviewed approved PM Now replaces cancelled original planned period');
    UPDATE pm.PMTasks SET FulfilledPlannedDueAt=@planned WHERE TaskId=@source;`);
  const context=await contextFor(source);assert(context);
  await savePmScheduleAnchor({executor:tx,context,nextPlannedDueAt:new Date(nextDue),nextDueAt:new Date(nextDue)});
  await auditAction(source,'pm.reconcile.fulfilled-period',{originalTaskId:original.TaskId,plannedDueAt:original.PlannedDueAt,nextDue});
 }
 // This old-template execution does not fulfill September work under the new default template.
 const ups=get('PM-NOW-20260206-2ABDA9FE');assert.equal(ups.Status,'completed');assert.equal(ups.ApprovalStatus,'Approved');
 await lockPmContext(tx,ups.AssetId);
 await tx.request().input('id',sql.UniqueIdentifier,ups.TaskId).query('UPDATE pm.PMTasks SET FulfilledPlannedDueAt=PlannedDueAt WHERE TaskId=@id');
 const upsPeriod=get('PM-20261002-CA48DB79');assert.notEqual(ups.TemplateId,upsPeriod.TemplateId);
 const upsContext=await contextFor(upsPeriod);assert.equal(upsContext.templateId,upsPeriod.TemplateId);
 await savePmScheduleAnchor({executor:tx,context:upsContext,nextPlannedDueAt:upsPeriod.PlannedDueAt,nextDueAt:upsPeriod.ScheduledDueAt});
 await auditAction(ups,'pm.reconcile.independent-template',{notFulfilledTaskId:upsPeriod.TaskId,plannedDueAt:ups.PlannedDueAt});
 // Retire off-cadence empty rows; no false completed/missed periods are invented.
 for(const [number,keeperNumber]of [
  ['PM-20260712-5364CD5C','PM-20261006-8F9E2EFD'],
  ['PM-FAC-20260213-BB0ACA7D','PM-FAC-20261002-6E3135BD'],
  ['PM-20260626-893D3C66',null],
 ]) {
  const t=get(number);await lockPmContext(tx,t.AssetId??t.FacilityId);
  const keeper=keeperNumber?get(keeperNumber):null;
  const reason=keeper?'PM_AUTO_SUPERSEDED:'+keeper.TaskId:'PM_AUTO_STALE_ANCHOR: replaced by canonical November/May cadence';
  const result=await tx.request().input('id',sql.UniqueIdentifier,t.TaskId).input('reason',sql.NVarChar(1024),reason)
   .query(`UPDATE t SET Status=N'cancelled',CancelledAt=sysutcdatetime(),CancelledByUserId=NULL,CancelledReason=@reason FROM pm.PMTasks t WHERE t.TaskId=@id AND ${untouchedPmSql('t')}`);
  assert.equal(result.rowsAffected[0],1,`Reviewed empty task changed: ${number}`);
  await auditAction(t,'pm.reconcile.stale-anchor',{reason});
 }
 // Process every configured context, including missed sources with category/site blockers.
 const contexts=new Map();for(const t of all[0])contexts.set((t.AssetId??t.FacilityId)+':'+t.TemplateId,t);
 for(const t of contexts.values()) {
  await lockPmContext(tx,t.AssetId??t.FacilityId);
  const missed=await retireMissedPmTasks(tx,t.AssetId??t.FacilityId,t.TemplateId);
  if(missed)actions.push({task:t.TaskNumber,action:'retire-missed',count:missed});
 }
 const settings=(await tx.request().query(`SELECT AssetId ContextId,N'asset' Kind FROM pm.AssetPMSettings WHERE PMEnabled=1
  UNION ALL SELECT FacilityId,N'facility' FROM pm.FacilityPMSettings WHERE PMEnabled=1`)).recordset;
 for(const row of settings) {
  await lockPmContext(tx,row.ContextId);
  const context=row.Kind==='asset'?await loadAssetPmScheduleContext({executor:tx,assetId:row.ContextId}):await loadFacilityPmScheduleContext({executor:tx,facilityId:row.ContextId});
  if(context)await reconcilePmScheduleContext({executor:tx,context});
 }
 const after=(await tx.request().query("SELECT * FROM pm.PMTasks WHERE MaintenanceType=N'PM';SELECT * FROM pm.AssetPMSettings;SELECT * FROM pm.FacilityPMSettings;SELECT * FROM pm.PMMissedOccurrences;SELECT * FROM pm.PMOccurrenceResolutions;")).recordsets;
 // Actual work and all completion/approval metadata must be byte-equivalent to their preimages.
 const protectedKeys=['StartedAt','TechnicianCompletedAt','TechnicianCompletedByUserId','CompletedAt','ApprovalStatus','SupervisorApprovedAt','SuperadminApprovedAt'];
 const later=new Map(after[0].map(t=>[t.TaskId,t]));
 for(const before of all[0])for(const key of protectedKeys)assert.deepEqual(later.get(before.TaskId)[key],before[key],`Preserved ${key} on ${before.TaskNumber}`);
 const proof={status:'PASS',mode:apply?'apply':'rollback-rehearsal',actions,taskCountBefore:all[0].length,taskCountAfter:after[0].length,ledgerBefore:all[4].length,ledgerAfter:after[4].length,workMetadataPreserved:true};
 if(apply){fs.writeFileSync(audit+'/before-images.json',JSON.stringify(all,null,2),{flag:'wx',mode:0o600});await tx.commit();live=false;fs.writeFileSync(audit+'/applied.json',JSON.stringify(proof,null,2),{flag:'wx',mode:0o600});}
 else{fs.writeFileSync(audit+'/reviewed-before-images.json',JSON.stringify(all,null,2),{mode:0o600});await tx.rollback();live=false;fs.writeFileSync(audit+'/repair-rehearsal.json',JSON.stringify(proof,null,2),{mode:0o600});}
 console.log(JSON.stringify(proof));
}finally{if(live)await tx.rollback().catch(()=>{});await db.close();}
