// Explicitly opted-in live acceptance. No jobs, deployed HTTP server, or real login credentials.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
dotenv.config({path:path.join(root,'.env')});
if(process.argv[2]!=='--run' || process.argv[3]!==process.env.DB_SERVER || process.argv[4]!==process.env.DB_DATABASE) throw Error('Usage: node scripts/live/task-deletion.mjs --run <configured-server> <configured-database>');
const runId=randomUUID(); const prefix=`LIVE-${runId.slice(0,8)}`;
const storage=await fs.mkdtemp(path.join(os.tmpdir(),'pm-delete-live-'));
Object.assign(process.env,{BACKEND_ENV_FILE:path.join(root,'.env'),JWT_SECRET:randomUUID()+randomUUID(),JOBS_ENABLED:'false',EVIDENCE_STORAGE_ROOT:storage});
const require=createRequire(path.join(root,'backend/package.json'));
const sql=require('mssql');const express=require('express');
const {getDb}=await import('../../backend/dist/db/mssql.js');
const {signAccessToken}=await import('../../backend/dist/auth/jwt.js');
const {tasksRouter}=await import('../../backend/dist/routes/tasks.js');
const {workOrdersRouter}=await import('../../backend/dist/routes/workOrders.js');
const {deleteTaskOwnedRows}=await import('../../backend/dist/db/taskDeletionPolicy.js');
const db=await getDb();const ids={user:randomUUID(),facility:randomUUID(),template:randomUUID(),item:randomUUID(),channel:randomUUID()};
const taskIds=[];const checks=[];const errors=[];let server;
const q=async(text,values={},executor=db)=>{const r=executor.request();for(const[k,v]of Object.entries(values))r.input(k,v);return r.query(text);};
const record=(name)=>{checks.push(name);console.log(`PASS ${name}`);};
const tables=['CMTaskEvents','CMDowntimeIntervals','PMTaskEvidence','PMTaskChecklistEvidence','PMTaskChecklistResults','PMTaskChecklistSnapshots','TaskDrafts','TaskWorkSessions'];
async function seed(kind,owned=false){const id=randomUUID();taskIds.push(id);await q(`INSERT INTO pm.PMTasks(TaskId,TaskNumber,FacilityId,TemplateId,PlannedDueAt,ScheduledDueAt,MaintenanceType,Status,CancelledAt) VALUES(@id,@number,@facility,@template,@due,@due,@kind,N'cancelled',sysutcdatetime())`,{id,number:`${prefix}-${taskIds.length}`,facility:ids.facility,template:ids.template,kind,due:new Date(Date.UTC(2099,0,taskIds.length))});if(owned){await fs.writeFile(path.join(storage,id+'.txt'),'isolated live fixture');await fs.writeFile(path.join(storage,id+'-check.txt'),'isolated checklist fixture');await q(`
INSERT INTO pm.PMTaskChecklistResults(TaskId,TemplateChecklistItemId,Outcome) VALUES(@id,@item,1);
INSERT INTO pm.PMTaskChecklistSnapshots(TaskId,TemplateChecklistItemId,SortOrder,ItemText,IsMandatory,RequiresNotes,RequiresPassFail,EnableAttachment,RequiresAttachment,IsActive) VALUES(@id,@item,1,N'Live fixture',0,0,1,1,0,1);
INSERT INTO pm.TaskDrafts(TaskId,TemplateChecklistItemId,SavedByUserId) VALUES(@id,@item,@user);
INSERT INTO pm.TaskWorkSessions(TaskId,StartedAt,StartedByUserId,EndedAt,EndedByUserId) VALUES(@id,sysutcdatetime(),@user,sysutcdatetime(),@user);
INSERT INTO pm.PMTaskEvidence(TaskId,Uri,StoragePath) VALUES(@id,N'fixture',@file);
INSERT INTO pm.PMTaskChecklistEvidence(TaskId,TemplateChecklistItemId,Uri,StoragePath) VALUES(@id,@item,N'fixture',@checkfile);
INSERT INTO pm.CMTaskEvents(TaskId,EventType,OccurredAt,ActorUserId) VALUES(@id,N'reported',sysutcdatetime(),@user);
INSERT INTO pm.CMDowntimeIntervals(TaskId,StartedAt,EndedAt) VALUES(@id,sysutcdatetime(),sysutcdatetime());`,{id,item:ids.item,user:ids.user,file:id+'.txt',checkfile:id+'-check.txt'});}return id;}
async function count(table,id){return (await q(`SELECT COUNT(*) AS n FROM pm.${table} WHERE TaskId=@id`,{id})).recordset[0].n;}
try{
 await q(`INSERT INTO pm.Users(UserId,Username,DisplayName,IsActive) VALUES(@user,@name,N'Isolated live verification',0);
 INSERT INTO pm.Facilities(FacilityId,Name,IsActive) VALUES(@facility,@name,0);
 INSERT INTO pm.PMTemplates(TemplateId,Name,IntervalDays,IsActive) VALUES(@template,@name,30,0);
 INSERT INTO pm.PMTemplateChecklistItems(TemplateChecklistItemId,TemplateId,SortOrder,ItemText) VALUES(@item,@template,1,N'Live fixture');
 INSERT INTO pm.NotificationChannels(ChannelId,ChannelName,ChannelType,IsActive) VALUES(@channel,@name,N'email',0);`,{...ids,name:prefix});
 const app=express();app.use(express.json());app.use('/api/tasks',tasksRouter);app.use('/api/work-orders',workOrdersRouter);
 app.use((err,req,res,next)=>{if(res.headersSent)return next(err);errors.push({number:err.number,message:err.message});res.status(500).json({message:'Live fixture error'});});
 server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const remove=async(route,id,role='Superadmin',actor=ids.user)=>{const token=role?signAccessToken({sub:actor,username:prefix,roles:[role]}):null;const r=await fetch(`http://127.0.0.1:${server.address().port}/api/${route}/${id}`,{method:'DELETE',headers:token?{authorization:`Bearer ${token}`}:{},signal:AbortSignal.timeout(15000)});return {status:r.status,body:await r.json()};};
 for(const [kind,route,role]of [['PM','tasks','Supervisor'],['CM','work-orders','Superadmin']]){
  const id=await seed(kind,true);
  assert.equal((await remove(route,id,null)).status,401);assert.equal((await remove(route,id,'Technician')).status,403);
  assert.equal((await remove(kind==='PM'?'work-orders':'tasks',id)).status,404);
  if(kind==='CM')assert.equal((await remove(route,id,'Supervisor')).status,403);
  assert.equal(await count('PMTasks',id),1);record(`${kind} authentication, roles and wrong-type isolation`);
  const before=errors.length;assert.equal((await remove(route,id,'Superadmin',randomUUID())).status,500);assert.equal(errors.length,before+1);assert.equal(errors.at(-1).number,547);
  for(const table of [...tables,'PMTasks'])assert.equal(await count(table,id),1,`${table} rollback`);
  assert.equal((await q('SELECT COUNT(*) n FROM pm.AuditLog WHERE EntityId=@id',{id})).recordset[0].n,0);
  await fs.access(path.join(storage,id+'.txt'));record(`${kind} actual audit FK failure rolls all rows back and retains files`);
  assert.equal((await remove(route,id,role)).status,200);
  for(const table of [...tables,'PMTasks'])assert.equal(await count(table,id),0,`${table} deletion`);
  assert.equal((await q('SELECT COUNT(*) n FROM pm.AuditLog WHERE EntityId=@id AND ActorUserId=@user',{id,user:ids.user})).recordset[0].n,1);
  await assert.rejects(fs.access(path.join(storage,id+'.txt')));await assert.rejects(fs.access(path.join(storage,id+'-check.txt')));
  assert.equal((await remove(route,id)).status,404);record(`${kind} full owned-row cleanup, committed audit, file removal and retry`);
 }
 for(const reference of ['SourceTaskId','RecurringFromTaskId','missed','skipped','notification']){
  const kind=reference==='RecurringFromTaskId'?'CM':'PM';const id=await seed(kind);let linked;
  if(reference.endsWith('TaskId')){linked=await seed(kind);await q(`UPDATE pm.PMTasks SET ${reference}=@id WHERE TaskId=@linked`,{id,linked});}
  else if(reference==='missed')await q("INSERT INTO pm.PMMissedOccurrences(FacilityId,TemplateId,PlannedDueAt,EffectiveDueAt,SourceTaskId) VALUES(@facility,@template,'2099-02-01','2099-02-01',@id)",{...ids,id});
  else if(reference==='skipped')await q("INSERT INTO pm.PMSkippedOccurrences(FacilityId,TemplateId,PlannedDueAt,EffectiveDueAt,TaskId,SkipReason,SkippedByUserId) VALUES(@facility,@template,'2099-03-01','2099-03-01',@id,N'Live fixture',@user)",{...ids,id});
  else await q("INSERT INTO pm.NotificationLog(TaskId,ChannelId,Status) VALUES(@id,@channel,N'fixture')",{id,channel:ids.channel});
  const r=await remove(kind==='PM'?'tasks':'work-orders',id);assert.equal(r.status,409);assert.equal(r.body.code,'TASK_REFERENCED');assert.equal(await count('PMTasks',id),1);if(linked)assert.equal(await count('PMTasks',linked),1);record(`${reference} blocks deletion and preserves referenced records`);
 }
 // Reproduce the production parent lock with a separate SQL connection/transaction.
 const lockId=await seed('PM');const linked=await seed('CM');const tx=new sql.Transaction(db);await tx.begin();
 try{await q('SELECT TaskId FROM pm.PMTasks WITH (XLOCK,HOLDLOCK) WHERE TaskId=@id',{id:lockId},tx);
  for(const mode of ['evidence','reference']){const concurrent=new sql.Transaction(db);await concurrent.begin();try{await assert.rejects(q('SET LOCK_TIMEOUT 750; '+(mode==='evidence'?"INSERT INTO pm.PMTaskEvidence(TaskId,Uri) VALUES(@id,N'fixture')":'UPDATE pm.PMTasks SET SourceTaskId=@id WHERE TaskId=@linked'),{id:lockId,linked},concurrent),e=>e.number===1222);}finally{await concurrent.rollback();}}
 }finally{await tx.rollback();}
 record('parent lock blocks concurrent evidence insertion and incoming source references');
 console.log(JSON.stringify({runId,checks:checks.length,expectedAuditFailures:errors.length,status:'PASS'}));
}finally{
 await cleanupRun();
}
async function cleanupRun(){
 if(server)await new Promise(resolve=>server.close(resolve));
 // Delete only IDs generated by this run, preserving all independent operational rows.
 const cleanup=new sql.Transaction(db);await cleanup.begin();try{
  for(const id of taskIds){await q('UPDATE pm.PMTasks SET SourceTaskId=NULL,RecurringFromTaskId=NULL WHERE TaskId=@id; DELETE FROM pm.PMMissedOccurrences WHERE SourceTaskId=@id; DELETE FROM pm.PMSkippedOccurrences WHERE TaskId=@id; DELETE FROM pm.NotificationLog WHERE TaskId=@id;',{id},cleanup);}
  for(const id of taskIds){await deleteTaskOwnedRows(cleanup,id);await q('DELETE FROM pm.AuditLog WHERE EntityId=@id AND ActorUserId=@user',{id,user:ids.user},cleanup);}
  await q('DELETE FROM pm.NotificationChannels WHERE ChannelId=@channel; DELETE FROM pm.PMTemplateChecklistItems WHERE TemplateChecklistItemId=@item; DELETE FROM pm.PMTemplates WHERE TemplateId=@template; DELETE FROM pm.Facilities WHERE FacilityId=@facility; DELETE FROM pm.Users WHERE UserId=@user;',ids,cleanup);await cleanup.commit();
  for(const id of taskIds){for(const table of [...tables,'PMTasks'])assert.equal(await count(table,id),0);}
  const left=await q("SELECT (SELECT COUNT(*) FROM pm.Users WHERE UserId=@user)+(SELECT COUNT(*) FROM pm.Facilities WHERE FacilityId=@facility)+(SELECT COUNT(*) FROM pm.PMTemplates WHERE TemplateId=@template)+(SELECT COUNT(*) FROM pm.PMTemplateChecklistItems WHERE TemplateChecklistItemId=@item)+(SELECT COUNT(*) FROM pm.NotificationChannels WHERE ChannelId=@channel)+(SELECT COUNT(*) FROM pm.AuditLog WHERE ActorUserId=@user) AS n",ids);assert.equal(left.recordset[0].n,0);

 }catch(e){await cleanup.rollback().catch(()=>{});console.error('CLEANUP FAILED '+runId);throw e;}finally{await db.close();}
 await fs.rm(storage,{recursive:true,force:true});console.log(`CLEANUP committed for ${taskIds.length} fixture task IDs; zero remaining fixture rows verified; temporary storage removed; run=${runId}`);
}
