import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import ts from 'typescript';
const exports = {};
const source=fs.readFileSync(new URL('../../src/lib/taskAssignment.ts',import.meta.url),'utf8');
new Function('exports',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(exports);
const lock=exports.getTaskAssignmentLockReason;
const pm={maintenanceType:'PM',status:'open',approvalStatus:'None'};
test('PM assignment remains available before submission including active and paused work',()=>{
 for(const status of ['open','scheduled','in_progress','paused'])assert.equal(lock({...pm,status}),null,status);
 assert.equal(lock({...pm,approvalStatus:'Rejected'}),null);
});
test('PM review locks explain revision before reassignment, including stale lifecycle labels',()=>{
 for(const approvalStatus of ['PendingSupervisor','PendingSuperadmin','Approved']){
  for(const status of ['open','in_progress','completed'])assert.ok(lock({...pm,status,approvalStatus}),`${status}/${approvalStatus}`);
 }
});
test('closed PM history stays locked while CM assignment behavior is unchanged',()=>{
 for(const status of ['completed','cancelled'])assert.ok(lock({...pm,status}));
 assert.equal(lock({...pm,maintenanceType:'CM',approvalStatus:'PendingSupervisor'}),null);
});
