// Isolated browser verification: synthetic data and token; no production credentials or DB.
import os from 'node:os';import fs from 'node:fs/promises';import path from 'node:path';import {createServer} from 'vite';import {createRequire} from 'node:module';import {root} from './task-checklist-harness.mjs';import {createListHarness,dataset} from './task-view-fixtures.mjs';
const require=createRequire(path.join(root,'backend/package.json'));const express=require('express');const app=express();app.use(express.json());const rows=dataset.map(row=>({...row}));const h=createListHarness(rows);
// Assignment fixtures remain entirely in memory, with synthetic identities only.
const secondTechnician='12121212-1212-4212-8212-121212121212';
const technicianRole='45454545-4545-4455-8455-454545454545';
app.get('/__assignment_fixture',(req,res)=>{
 const role=['Supervisor','Admin','Superadmin','Technician'].includes(req.query.role)?req.query.role:'Supervisor';
 res.cookie('assignment_fixture_role',role,{sameSite:'strict'});
 res.cookie('assignment_fixture_options_error',req.query.fail_options==='1'?'1':'0',{sameSite:'strict'});
 res.cookie('assignment_fixture_save_error',req.query.fail_save==='1'?'1':'0',{sameSite:'strict'});
 const row=rows[0];row.Status=typeof req.query.status==='string'?req.query.status:'open';row.ApprovalStatus=typeof req.query.approval==='string'?req.query.approval:'None';row.AssignedToUserId=null;row.AssignedToRoleId=null;row.AssignedToDisplayName=null;
 const url='/tasks?q='+encodeURIComponent(row.TaskNumber)+'&taskId='+row.TaskId;
 res.type('html').send(`<script>localStorage.setItem('pm_access_token',${JSON.stringify(h.token([role]))});location.replace(${JSON.stringify(url)});</script>`);
});
app.get('/api/system/users/for-assignment',(req,res)=>{
 if(req.headers.cookie?.includes('assignment_fixture_options_error=1'))return res.status(503).json({message:'Synthetic assignment options unavailable'});
 res.json({page:1,pageSize:500,total:2,items:[{id:'11111111-1111-4111-8111-111111111111',username:'fixture',displayName:'Fixture Technician',isActive:true,roles:['Technician']},{id:secondTechnician,username:'second-tech',displayName:'Second Technician',isActive:true,roles:['Technician']}]});
});
app.get('/api/system/lookups',(_req,res)=>res.json({roles:[{id:technicianRole,name:'Technician'}],locations:[],categories:[]}));
app.post('/api/tasks/:id/assign',(req,res)=>{
 const roles=JSON.parse(Buffer.from((req.headers.authorization??'').split('.')[1]??'','base64url').toString()).roles??[];
 if(!roles.some(role=>['Supervisor','Admin','Superadmin'].includes(role)))return res.status(403).json({message:'Forbidden'});
 const row=rows.find(row=>row.TaskId===req.params.id);if(!row)return res.status(404).json({message:'Fixture task not found'});
 if(['PendingSupervisor','PendingSuperadmin','Approved'].includes(row.ApprovalStatus))return res.status(409).json({message:'Return task for revision before reassigning'});
 if(req.headers.cookie?.includes('assignment_fixture_save_error=1'))return res.status(409).json({message:'Synthetic assignment conflict; review and retry'});
 row.AssignedToUserId=req.body.assignedToUserId??null;row.AssignedToRoleId=req.body.assignedToRoleId??null;row.AssignedToRoleName=row.AssignedToRoleId?'Technician':null;row.AssignedToDisplayName=row.AssignedToUserId===secondTechnician?'Second Technician':row.AssignedToUserId?'Fixture Technician':null;
 res.json({ok:true});
});
app.get('/__fixture',(req,res)=>{res.cookie('tasks_fixture_failure',req.query.fail==='1'?'1':'0',{sameSite:'strict'});res.type('html').send(`<script>localStorage.setItem('pm_access_token',${JSON.stringify(h.token(['Superadmin']))});location.replace('/tasks');</script>`);});
// Browser-only detail/approval fixture: mutate this process's synthetic rows only.
app.get('/api/tasks/:id/draft',(_req,res)=>res.json({items:[]}));
app.get('/api/tasks/:id',(req,res)=>{
 const row=rows.find(row=>row.TaskId===req.params.id);if(!row)return res.status(404).json({message:'Fixture task not found'});
 res.json({id:row.TaskId,taskNumber:row.TaskNumber,maintenanceType:'PM',status:row.Status,priority:'normal',plannedDueAt:row.PlannedDueAt,scheduledDueAt:row.ScheduledDueAt,createdAt:row.CreatedAt,startedAt:null,completedAt:row.CompletedAt,cancelledAt:null,approvalStatus:row.ApprovalStatus,technicianCompletedAt:row.CompletedAt,supervisorApprovedAt:null,superadminApprovedAt:null,asset:{id:row.AssetId,assetTag:row.AssetTag,name:row.AssetName},facility:null,template:{id:row.TemplateId,name:row.TemplateName},assignedTo:{userId:row.AssignedToUserId,displayName:row.AssignedToDisplayName,roleId:row.AssignedToRoleId??null,roleName:row.AssignedToRoleName??null},checklistItems:[],evidence:[],workSessionSummary:null});
});
for(const [action,from,to]of [['approve-by-supervisor','PendingSupervisor','PendingSuperadmin'],['approve-by-superadmin','PendingSuperadmin','Approved']])app.post('/api/tasks/:id/'+action,(req,res)=>{
 const row=rows.find(row=>row.TaskId===req.params.id);if(!row||row.ApprovalStatus!==from)return res.status(409).json({message:'Fixture approval stage changed'});row.ApprovalStatus=to;if(to==='Approved')row.Status='completed';res.json({ok:true});
});
app.use('/api/tasks',(req,res,next)=>{if(req.headers.cookie?.includes('tasks_fixture_failure=1')&&req.path==='/')return res.status(503).json({message:'Fixture service unavailable'});next();});app.use(h.app);
app.get('/api/auth/me',(_req,res)=>res.json({user:{id:'11111111-1111-4111-8111-111111111111',username:'fixture',displayName:'Tasks Fixture',roles:['Superadmin']}}));
app.get('/api/*',(_req,res)=>res.json({items:[],count:0,stats:{overdueCount:0,dueTodayCount:0,upcoming7DaysCount:0},upcomingTasks:[]}));
const vite=await createServer({configFile:false,envFile:false,cacheDir:await fs.mkdtemp(path.join(os.tmpdir(),'preventive-tasks-vite-')),root,define:{'import.meta.env.VITE_API_BASE_URL':JSON.stringify('')},resolve:{alias:{'@':path.join(root,'src')}},esbuild:{jsx:'automatic'},server:{middlewareMode:true,hmr:false},appType:'custom'});app.use(vite.middlewares);app.use(async(req,res,next)=>{try{res.type('html').send(await vite.transformIndexHtml(req.originalUrl,await fs.readFile(path.join(root,'index.html'),'utf8')))}catch(e){next(e)}});const server=app.listen(4180,'127.0.0.1',()=>console.log('Tasks fixture: http://127.0.0.1:4180/__fixture (?fail=1 for error state)'));process.on('SIGTERM',async()=>{await vite.close();server.close()});
