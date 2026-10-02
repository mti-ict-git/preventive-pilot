// Opt-in live Q-14/Q-15 acceptance with isolated IDs, no jobs or upstream synchronization.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { randomUUID, randomInt } from 'node:crypto';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
dotenv.config({path:path.join(root,'.env')});
if(process.argv[2]!=='--run'||process.argv[3]!==process.env.DB_SERVER||process.argv[4]!==process.env.DB_DATABASE)throw Error('Usage: node scripts/live/pm-eligibility.mjs --run <configured-server> <configured-database>');
const runId=randomUUID(), name=`PM-LIVE-${runId.slice(0,8)}`;
Object.assign(process.env,{BACKEND_ENV_FILE:path.join(root,'.env'),JWT_SECRET:randomUUID()+randomUUID(),JOBS_ENABLED:'false'});
const require=createRequire(path.join(root,'backend/package.json')),sql=require('mssql'),express=require('express');
const {getDb}=await import('../../backend/dist/db/mssql.js');
const {signAccessToken}=await import('../../backend/dist/auth/jwt.js');
const {assetsRouter}=await import('../../backend/dist/routes/assets.js');
const {facilitiesRouter}=await import('../../backend/dist/routes/facilities.js');
const {tasksRouter}=await import('../../backend/dist/routes/tasks.js');
const {createPmTaskForOccurrence}=await import('../../backend/dist/db/pmSchedulingPolicy.js');
const {deleteTaskOwnedRows}=await import('../../backend/dist/db/taskDeletionPolicy.js');
const db=await getDb();const ids=Object.fromEntries(['user','asset','asset2','facility','site','template','category','otherCategory'].map(k=>[k,randomUUID()]));
const taskIds=[],clones=[],checks=[];let server;
const q=async(text,values={},executor=db)=>{const r=executor.request();for(const[k,v]of Object.entries(values))r.input(k,v);return r.query(text);};
const pass=name=>{checks.push(name);console.log(`PASS ${name}`);};
const settings=async(kind)=> (await q(`SELECT * FROM pm.${kind==='asset'?'Asset':'Facility'}PMSettings WHERE ${kind==='asset'?'AssetId':'FacilityId'}=@id`,{id:ids[kind]})).recordset[0];
const state=async(id)=>(await q('SELECT Status,CancelledReason,CancelledByUserId FROM pm.PMTasks WHERE TaskId=@id',{id})).recordset[0];
async function seedTask(kind,label){const id=randomUUID();taskIds.push(id);const column=kind==='asset'?'AssetId':'FacilityId';await q(`INSERT INTO pm.PMTasks(TaskId,TaskNumber,${column},TemplateId,PlannedDueAt,ScheduledDueAt,MaintenanceType,Status,StartedAt,TechnicianCompletedAt,ApprovalStatus,RevisedAt) VALUES(@id,@number,@context,@template,@due,@due,@type,@status,@started,@submitted,@approval,@revised); INSERT INTO pm.PMTaskEvidence(TaskId,Uri) VALUES(@id,N'isolated-fixture')`,{id,number:`${name}-${taskIds.length}`,context:ids[kind],template:ids.template,due:new Date(Date.UTC(2099,0,taskIds.length)),type:label==='cm'?'CM':'PM',status:label==='started'?'in_progress':label==='paused'?'paused':'open',started:['started','paused'].includes(label)?new Date():null,submitted:label==='submitted'?new Date():null,approval:label==='submitted'?'PendingSupervisor':'None',revised:label==='revised'?new Date():null});if(label==='session')await q('INSERT INTO pm.TaskWorkSessions(TaskId,StartedAt,StartedByUserId,EndedAt) VALUES(@id,sysutcdatetime(),@user,sysutcdatetime())',{id,user:ids.user});return id;}
try{
 await q(`INSERT INTO pm.Users(UserId,Username,IsActive) VALUES(@user,@name,0);
 INSERT INTO pm.Locations(LocationId,Name,IsActive) VALUES(@site,@name,1);
 INSERT INTO pm.AssetCategories(CategoryId,Name) VALUES(@category,@name),(@otherCategory,@otherName);
 INSERT INTO pm.PMTemplates(TemplateId,Name,IntervalDays,IsActive,ApplicableCategoryId) VALUES(@template,@name,30,1,@category);
 INSERT INTO pm.Assets(AssetId,SnipeAssetId,Name,CategoryId,IsArchived) VALUES(@asset,@snipe,@name,@category,0),(@asset2,@snipe2,@otherName,@category,0);
 INSERT INTO pm.Facilities(FacilityId,Name,IsActive) VALUES(@facility,@name,1);
 INSERT INTO pm.AssetPMSettings(AssetId,PMEnabled,NextPlannedPMDueAt,NextPMDueAt) VALUES(@asset,0,'2099-01-01','2099-01-01'),(@asset2,0,'2099-01-01','2099-01-01');
 INSERT INTO pm.FacilityPMSettings(FacilityId,PMEnabled,NextPlannedPMDueAt,NextPMDueAt) VALUES(@facility,0,'2099-01-01','2099-01-01');`,{...ids,name,otherName:name+'-other',snipe:-randomInt(1,1000000000),snipe2:-randomInt(1000000001,2000000000)});
 const app=express();app.use(express.json());app.use('/api/assets',assetsRouter);app.use('/api/facilities',facilitiesRouter);app.use('/api/tasks',tasksRouter);
 app.use((err,req,res,next)=>{if(res.headersSent)return next(err);res.status(500).json({message:err.message});});
 server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const request=async(method,url,body,role='Supervisor')=>{const token=signAccessToken({sub:ids.user,username:name,roles:[role]});const r=await fetch(`http://127.0.0.1:${server.address().port}/api${url}`,{method,headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});return {status:r.status,body:await r.json()};};
 for(const kind of ['asset','facility']){
  const url=kind==='asset'?`/assets/${ids.asset}/pm`:`/facilities/${ids.facility}/pm-settings`,method=kind==='asset'?'PATCH':'PUT';
  assert.equal((await request(method,url,{pmEnabled:true})).status,400);assert.equal((await settings(kind)).PMEnabled,false);
  assert.equal((await request(method,url,{pmEnabled:true,defaultTemplateId:ids.template})).status,400);assert.equal((await settings(kind)).DefaultTemplateId,null);
  await q(`UPDATE pm.${kind==='asset'?'Assets':'Facilities'} SET LocationId=@site WHERE ${kind==='asset'?'AssetId':'FacilityId'}=@id; UPDATE pm.PMTemplates SET IsActive=0 WHERE TemplateId=@template`,{site:ids.site,id:ids[kind],template:ids.template});
  assert.equal((await request(method,url,{pmEnabled:true,defaultTemplateId:ids.template})).status,400);assert.equal((await settings(kind)).PMEnabled,false);
  await q('UPDATE pm.PMTemplates SET IsActive=1 WHERE TemplateId=@template',{template:ids.template});
  const enabled=await request(method,url,{pmEnabled:true,defaultTemplateId:ids.template,nextPmDueAt:'2099-01-01T00:00:00.000Z'});assert.equal(enabled.status,200,JSON.stringify(enabled));assert.equal((await settings(kind)).PMEnabled,true);
  assert.equal((await request(method,url,{defaultTemplateId:null})).status,400);assert.equal((await settings(kind)).DefaultTemplateId.toLowerCase(),ids.template);
  pass(`${kind}: missing site/template and inactive template reject atomically; valid activation succeeds; enabled template cannot be cleared`);
  const tasks={};for(const label of ['unstarted','started','paused','session','submitted','revised','cm'])tasks[label]=await seedTask(kind,label);
  assert.equal((await request(method,url,{pmEnabled:false})).status,200);
  for(const[label,id]of Object.entries(tasks)){const row=await state(id);assert.equal(row.Status,label==='unstarted'?'cancelled':label==='started'?'in_progress':label==='paused'?'paused':'open');assert.equal((await q('SELECT COUNT(*) n FROM pm.PMTaskEvidence WHERE TaskId=@id',{id})).recordset[0].n,1);}
  assert.equal((await state(tasks.unstarted)).CancelledReason,'PM disabled');
  const audit=async()=>(await q("SELECT COUNT(*) n FROM pm.AuditLog WHERE EntityId=@id AND Action=N'task.cancel.pm-disabled'",{id:tasks.unstarted})).recordset[0].n;
  assert.equal(await audit(),1);assert.equal((await request(method,url,{pmEnabled:false})).status,200);assert.equal(await audit(),1);
  assert.equal((await request('POST',`/tasks/${tasks.unstarted}/reopen`,{})).status,409);
  assert.equal((await request(method,url,{pmEnabled:true})).status,200);assert.equal((await state(tasks.unstarted)).Status,'cancelled');
  pass(`${kind}: only unstarted PM cancelled; started/paused/session/submitted/revised/CM and evidence retained; audit idempotent; no automatic reopen`);
  // Actual INSERT SELECT SQL is exercised in a rollback-only transaction.
  const tx=new sql.Transaction(db);await tx.begin();try{
   await q(kind==='asset'?'UPDATE pm.Assets SET IsArchived=0 WHERE AssetId=@id':'UPDATE pm.Facilities SET IsActive=1 WHERE FacilityId=@id',{id:ids[kind]},tx);
   const context={kind,contextId:ids[kind],templateId:ids.template};const occurrence={plannedDueAt:new Date('2099-12-01'),scheduledDueAt:new Date('2099-12-01')};
   const input={executor:tx,context,occurrence,assignedToUserId:null,assignedToRoleId:null};
   await q(`UPDATE pm.${kind==='asset'?'Asset':'Facility'}PMSettings SET PMEnabled=0 WHERE ${kind==='asset'?'AssetId':'FacilityId'}=@id`,{id:ids[kind]},tx);assert.equal(await createPmTaskForOccurrence(input),null);
   await q(`UPDATE pm.${kind==='asset'?'Asset':'Facility'}PMSettings SET PMEnabled=1 WHERE ${kind==='asset'?'AssetId':'FacilityId'}=@id`,{id:ids[kind]},tx);assert.equal(typeof await createPmTaskForOccurrence(input),'string');
  }finally{await tx.rollback();}
  pass(`${kind}: real generation SQL blocks disabled settings and inserts eligible occurrence inside rollback-only transaction`);
 }
 // Invalid bulk enable must leave both selected asset settings untouched.
 await request('PATCH',`/assets/${ids.asset}/pm`,{pmEnabled:false});
 const bulk=await request('POST','/assets/pm/bulk',{assetIds:[ids.asset,ids.asset2],pmEnabled:true});assert.equal(bulk.status,400,JSON.stringify(bulk));assert.equal((await settings('asset')).PMEnabled,false);pass('bulk enable rolls back valid first asset when second lacks activation prerequisites');
 const pending=await seedTask('facility','unstarted');
 assert.equal((await request('PUT',`/facilities/${ids.facility}`,{isActive:false},'Admin')).status,200);assert.equal((await state(pending)).Status,'cancelled');assert.equal((await state(pending)).CancelledReason,'Facility archived');
 assert.equal((await request('PUT',`/facilities/${ids.facility}`,{isActive:true},'Admin')).status,200);assert.equal((await state(pending)).Status,'cancelled');pass('facility archive cancels only unstarted PM and reactivation does not reopen it');
 // Legacy invalid source permits a real clone rollback test without modifying operational data.
 await q('UPDATE pm.Facilities SET LocationId=NULL WHERE FacilityId=@facility',ids);
 const cloneName=name+'-clone';const cloned=await request('POST',`/facilities/${ids.facility}/clone`,{name:cloneName,includePmSettings:true},'Admin');if(cloned.body.id)clones.push(cloned.body.id);assert.equal(cloned.status,400,JSON.stringify(cloned));assert.equal((await q('SELECT COUNT(*) n FROM pm.Facilities WHERE Name=@name',{name:cloneName})).recordset[0].n,0);pass('invalid enabled clone rolls back facility and copied settings');
 console.log(JSON.stringify({runId,checks:checks.length,status:'PASS'}));
}finally{await cleanup();}
async function cleanup(){
 if(server)await new Promise(r=>server.close(r));
 const tx=new sql.Transaction(db);await tx.begin();try{
  for(const id of taskIds){await deleteTaskOwnedRows(tx,id);await q('DELETE FROM pm.AuditLog WHERE EntityId=@id AND ActorUserId=@user',{id,user:ids.user},tx);}
  for(const id of clones)await q('DELETE FROM pm.FacilityPMSettings WHERE FacilityId=@id; DELETE FROM pm.Facilities WHERE FacilityId=@id',{id},tx);
  await q(`DELETE FROM pm.AuditLog WHERE ActorUserId=@user;
DELETE FROM pm.AssetPMSettings WHERE AssetId IN (@asset,@asset2); DELETE FROM pm.FacilityPMSettings WHERE FacilityId=@facility;
DELETE FROM pm.Assets WHERE AssetId IN (@asset,@asset2); DELETE FROM pm.Facilities WHERE FacilityId=@facility;
DELETE FROM pm.PMTemplates WHERE TemplateId=@template; DELETE FROM pm.Locations WHERE LocationId=@site;
DELETE FROM pm.AssetCategories WHERE CategoryId IN (@category,@otherCategory); DELETE FROM pm.Users WHERE UserId=@user;`,ids,tx);await tx.commit();
  const remaining=await q(`SELECT (SELECT COUNT(*) FROM pm.PMTasks WHERE FacilityId=@facility OR AssetId IN (@asset,@asset2))+(SELECT COUNT(*) FROM pm.Assets WHERE AssetId IN (@asset,@asset2))+(SELECT COUNT(*) FROM pm.Facilities WHERE FacilityId=@facility)+(SELECT COUNT(*) FROM pm.Users WHERE UserId=@user)+(SELECT COUNT(*) FROM pm.PMTemplates WHERE TemplateId=@template)+(SELECT COUNT(*) FROM pm.Locations WHERE LocationId=@site)+(SELECT COUNT(*) FROM pm.AssetCategories WHERE CategoryId IN (@category,@otherCategory))+(SELECT COUNT(*) FROM pm.AuditLog WHERE ActorUserId=@user) AS n`,ids);assert.equal(remaining.recordset[0].n,0);
  console.log(`CLEANUP: zero fixture rows remain; ${taskIds.length} task IDs; run=${runId}`);
 }catch(e){await tx.rollback().catch(()=>{});console.error(`CLEANUP FAILED run=${runId}`);throw e;}finally{await db.close();}
}
