import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source = fs.readFileSync(new URL('../../src/lib/approvalQueue.ts', import.meta.url), 'utf8');
const exports = {};
vm.runInNewContext(ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText, {exports});
const {loadWaitingSubmissions} = exports;
test('Waiting Submit reaches records after the first 200 in the user scope', async () => {
  const calls = [];
  const rows = Array.from({length:405}, (_,i)=>({id:String(i), assignedTo:{userId:'me'}, approvalStatus:i===404?'None':'PendingSuperadmin', technicianCompletedAt:'2026-10-05'}));
  const found = await loadWaitingSubmissions(async input=>{
    calls.push(input);
    return {total:rows.length,pageSize:200,items:rows.slice((input.page-1)*200,input.page*200)};
  }, 'me', 'needle');
  assert.equal(found.length,1);assert.equal(found[0].id,'404');assert.equal(calls.length,3);
  for(const call of calls){assert.equal(call.assigned,'me');assert.equal(call.q,'needle');}
});
test('Waiting Submit rejects other assignees and absent completion; no identity means no request', async()=>{
  let called=false;
  assert.equal((await loadWaitingSubmissions(async()=>{called=true;},null,'')).length,0);assert.equal(called,false);
  const items=[{assignedTo:{userId:'other'},approvalStatus:'None',technicianCompletedAt:'now'},{assignedTo:{userId:'me'},approvalStatus:'None',technicianCompletedAt:null}];
  assert.equal((await loadWaitingSubmissions(async()=>({total:2,pageSize:200,items}),'me','')).length,0);
});

test('Finalized, rejected and cancelled records do not return to Waiting Submit', async()=>{
 const items=['Approved','Rejected','None'].map((approvalStatus,i)=>({assignedTo:{userId:'me'},approvalStatus,status:i===2?'cancelled':'completed',technicianCompletedAt:'now'}));
 assert.equal((await loadWaitingSubmissions(async()=>({total:3,pageSize:200,items}),'me','')).length,0);
});
