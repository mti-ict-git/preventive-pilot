import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
const sql=createRequire(new URL('../../backend/package.json',import.meta.url))('mssql');
import {getDb} from '../../backend/dist/db/mssql.js';
import {writeAuditLog} from '../../backend/dist/db/auditLog.js';
import {schedulingReadSql} from '../../backend/dist/db/schedulingReadModel.js';
// Reviewed legacy exception, explicitly restricted to these two started-only aliases.
const pairs=[['PM-NOW-20260302-EEEC7150','PM-20260122-F2D04F2A'],['PM-NOW-20260302-5EA1A61C','PM-20260122-BBB0C2E2']];
const mode=process.argv[2],dir=process.argv[3];
if(!['--verify','--apply'].includes(mode)||!dir)throw Error('Usage: node reconcile-started-only-pc.mjs --verify|--apply PRIVATE_AUDIT_DIR');
const backup=JSON.parse(await fs.readFile(dir+'/database-backup.json','utf8'));
if(backup.status!=='PASS'||backup.verifyOnly!=='PASS'||!backup.is_copy_only||!backup.has_backup_checksums)throw Error('Verified backup required');
if(mode==='--apply'&&JSON.parse(await fs.readFile(dir+'/verification.json','utf8')).status!=='verified-rolled-back')throw Error('Exact rollback rehearsal required');
const norm=x=>x instanceof Date?x.toISOString():x??null;
const counts=['ChecklistRows','EvidenceRows','ChecklistEvidenceRows','SessionRows','DraftRows'];
function guard(a,b){
 if(a.MaintenanceType!=='PM'||b.MaintenanceType!=='PM'||a.Status!=='in_progress'||a.ApprovalStatus!=='None'||!a.StartedAt||a.CompletedAt||a.TechnicianCompletedAt||a.CancelledAt||a.SourceTaskId||a.ResolutionNotes||counts.some(k=>a[k]))throw Error('Alias has protected work or state');
 if(b.Status!=='completed'||b.ApprovalStatus!=='Approved'||!b.CompletedAt||norm(b.CompletedAt)!==norm(b.TechnicianCompletedAt)||b.ChecklistRows!==11||b.ChecklistEvidenceRows<1||b.AssetId!==a.AssetId||b.FacilityId!==a.FacilityId||b.TemplateId!==a.TemplateId||b.CompletedAt<a.CreatedAt||b.CompletedAt<a.StartedAt)throw Error('Performing execution mismatch');
 if(norm(b.PlannedDueAt)!=='2026-02-21T00:00:00.000Z'||norm(b.FulfilledPlannedDueAt)!==norm(b.PlannedDueAt)||norm(b.ScheduledDueAt)!==norm(b.PlannedDueAt)||norm(b.CompletedAt).slice(0,10)!=='2026-03-03')throw Error('Reviewed period/completion changed');
}
const db=await getDb(),tx=new sql.Transaction(db);let committed=false;
try{
 await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
 const before=[],changes=[],negativeChecks=[];
 for(const [aliasNumber,executionNumber]of pairs){
  const rows=(await tx.request().input('a',sql.NVarChar(32),aliasNumber).input('b',sql.NVarChar(32),executionNumber).query(`SELECT t.*,
   (SELECT COUNT(*) FROM pm.PMTaskChecklistResults x WITH(HOLDLOCK) WHERE x.TaskId=t.TaskId) ChecklistRows,
   (SELECT COUNT(*) FROM pm.PMTaskEvidence x WITH(HOLDLOCK) WHERE x.TaskId=t.TaskId) EvidenceRows,
   (SELECT COUNT(*) FROM pm.PMTaskChecklistEvidence x WITH(HOLDLOCK) WHERE x.TaskId=t.TaskId) ChecklistEvidenceRows,
   (SELECT COUNT(*) FROM pm.TaskWorkSessions x WITH(HOLDLOCK) WHERE x.TaskId=t.TaskId) SessionRows,
   (SELECT COUNT(*) FROM pm.TaskDrafts x WITH(HOLDLOCK) WHERE x.TaskId=t.TaskId) DraftRows
   FROM pm.PMTasks t WITH(UPDLOCK,HOLDLOCK) WHERE TaskNumber IN(@a,@b)`)).recordset;
  const a=rows.find(t=>t.TaskNumber===aliasNumber),b=rows.find(t=>t.TaskNumber===executionNumber);if(!a||!b)throw Error('Reviewed task absent');guard(a,b);
  for(const patch of [{EvidenceRows:1},{ChecklistEvidenceRows:1},{SessionRows:1},{DraftRows:1},{ApprovalStatus:'PendingSupervisor'}]){let rejected=false;try{guard({...a,...patch},b)}catch{rejected=true}if(!rejected)throw Error('Negative guard failed');negativeChecks.push({alias:aliasNumber,field:Object.keys(patch)[0],rejected:true});}
  const linked=(await tx.request().input('a',sql.UniqueIdentifier,a.TaskId).input('b',sql.UniqueIdentifier,b.TaskId).query('SELECT OriginalTaskId FROM pm.PMOccurrenceResolutions WITH(UPDLOCK,HOLDLOCK) WHERE OriginalTaskId IN(@a,@b) OR FulfilledByTaskId IN(@a,@b)')).recordset;if(linked.length)throw Error('Already resolved or performing task used');
  const ctx=(await tx.request().input('asset',sql.UniqueIdentifier,a.AssetId).input('template',sql.UniqueIdentifier,a.TemplateId).query(`SELECT * FROM pm.PMTasks WITH(UPDLOCK,HOLDLOCK) WHERE AssetId=@asset AND TemplateId=@template;
   SELECT * FROM pm.AssetPMSettings WITH(UPDLOCK,HOLDLOCK) WHERE AssetId=@asset;`)).recordsets;
  const candidates=ctx[0].filter(t=>t.Status==='completed'&&t.ApprovalStatus==='Approved'&&t.CompletedAt>=a.CreatedAt&&t.CompletedAt>=a.StartedAt&&norm(t.PlannedDueAt)==='2026-02-21T00:00:00.000Z');if(candidates.length!==1||candidates[0].TaskId!==b.TaskId)throw Error('Nonunique execution');
  const settings=ctx[1];if(settings.length!==1||norm(settings[0].NextPlannedPMDueAt)!=='2026-08-21T00:00:00.000Z')throw Error('Reviewed cadence changed');
  const august=ctx[0].filter(t=>norm(t.PlannedDueAt)==='2026-08-21T00:00:00.000Z'&&t.Status!=='cancelled');if(august.length!==1||august[0].Status!=='open')throw Error('Reviewed August obligation changed');
  before.push({alias:a,execution:b,settings,august});
  const reason=`Duplicate started-only PM Now; occurrence fulfilled by ${b.TaskNumber}, completed ${b.CompletedAt.toISOString()}. StartedAt retained; user-authorized legacy reconciliation.`;
  await tx.request().input('a',sql.UniqueIdentifier,a.TaskId).input('b',sql.UniqueIdentifier,b.TaskId).input('planned',sql.DateTime2(0),b.PlannedDueAt).input('due',sql.DateTime2(0),b.ScheduledDueAt).input('reason',sql.NVarChar(1024),reason).query(`INSERT pm.PMOccurrenceResolutions(OriginalTaskId,FulfilledByTaskId,PlannedDueAt,EffectiveDueAt,Reason) VALUES(@a,@b,@planned,@due,@reason);
   UPDATE pm.PMTasks SET Status=N'cancelled',CancelledAt=sysutcdatetime(),CancelledByUserId=NULL,CancelledReason=@reason WHERE TaskId=@a AND Status=N'in_progress';`);
  const after=(await tx.request().input('a',sql.UniqueIdentifier,a.TaskId).input('b',sql.UniqueIdentifier,b.TaskId).query('SELECT * FROM pm.PMTasks WHERE TaskId IN(@a,@b)')).recordset;
  for(const prior of [a,b]){const current=after.find(t=>t.TaskId===prior.TaskId);for(const k of Object.keys(current)){if(prior===a&&['Status','CancelledAt','CancelledByUserId','CancelledReason'].includes(k))continue;if(norm(current[k])!==norm(prior[k]))throw Error('Unintended task history change: '+k)}}
  const settingsAfter=(await tx.request().input('asset',sql.UniqueIdentifier,a.AssetId).query('SELECT * FROM pm.AssetPMSettings WHERE AssetId=@asset')).recordset;if(JSON.stringify(settingsAfter)!==JSON.stringify(settings))throw Error('Schedule changed');
  const augustAfter=(await tx.request().input('id',sql.UniqueIdentifier,august[0].TaskId).query('SELECT * FROM pm.PMTasks WHERE TaskId=@id')).recordset;if(JSON.stringify(augustAfter)!==JSON.stringify(august))throw Error('August obligation changed');
  await writeAuditLog({executor:tx,actorUserId:null,action:'pm.history.reconcile.started-only',entityType:'PMTask',entityId:a.TaskId,metadata:{requestedBy:'widji.santoso',aliasNumber,executionNumber,plannedDueAt:b.PlannedDueAt,completedAt:b.CompletedAt,startedAtPreserved:a.StartedAt,scope:'reviewed PC-010/049 only; no approval or recurrence mutation'},ipAddress:null,userAgent:'authorized-legacy-reconciliation'});
  changes.push({alias:aliasNumber,execution:executionNumber,startedAtPreserved:a.StartedAt,nextPeriodUnchanged:settings[0].NextPlannedPMDueAt});
 }
 const march=(await tx.request().input('from',sql.DateTime2(0),new Date('2026-03-02')).input('to',sql.DateTime2(0),new Date('2026-03-03')).query(schedulingReadSql('day'))).recordset;if(march.some(t=>pairs.some(p=>p[0]===t.TaskNumber)))throw Error('March duplicate still visible');
 const feb=(await tx.request().input('from',sql.DateTime2(0),new Date('2026-02-21')).input('to',sql.DateTime2(0),new Date('2026-02-22')).query(schedulingReadSql('day'))).recordset;
 for(const [a,b]of pairs){const t=feb.find(t=>t.TaskNumber===b);if(!t||t.ReplacedTaskNumber!==a||t.Bucket!=='completed-late'||t.EstimatedMinutes!==0)throw Error('February completed history mismatch')}
 const result={status:mode==='--verify'?'verified-rolled-back':'committed',changes,negativeChecks,marchRemaining: march.length,februaryEvidence:feb.filter(t=>pairs.some(p=>p[1]===t.TaskNumber))};
 if(mode==='--verify'){await tx.rollback();await fs.writeFile(dir+'/verification.json',JSON.stringify(result,null,2),{mode:0o600});}
 else{await fs.writeFile(dir+'/before-images.json',JSON.stringify(before,null,2),{mode:0o600,flag:'wx'});await tx.commit();committed=true;await fs.writeFile(dir+'/applied.json',JSON.stringify(result,null,2),{mode:0o600,flag:'wx'});}
 console.log(JSON.stringify({status:result.status,changed:changes.length,marchRemaining:result.marchRemaining,negativeChecks:negativeChecks.length,changes}));
}catch(e){if(!committed)await tx.rollback().catch(()=>{});throw e}finally{await db.close()}
