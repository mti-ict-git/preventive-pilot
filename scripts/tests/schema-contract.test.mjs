import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseSchemaContract, creationOrderProblems, compareSchema } from '../db/schema-contract.mjs';
const source=fs.readFileSync(new URL('../../db/schema.sql',import.meta.url),'utf8');
const contract=parseSchemaContract(source);
const fixture=()=>structuredClone({...contract,constraints:contract.constraints.map(c=>({...c,disabled:false,untrusted:false})),indexes:contract.indexes.map(i=>({...i,disabled:false}))});
test('schema inventory includes all current tables and evolved task columns',()=>{
 assert.equal(contract.tables.length,40);assert.equal(contract.columns.length,378);
 for(const name of ['SourceTaskId','SourceTemplateChecklistItemId','RecurringFromTaskId'])assert(contract.columns.some(c=>c.table==='PMTasks'&&c.name===name));
 assert.equal(contract.columns.find(c=>c.table==='PMTasks'&&c.name==='PlannedDueAt').nullable,false);
 assert.equal(contract.columns.find(c=>c.table==='PMTasks'&&c.name==='AssetId').nullable,true);
 assert.equal(contract.columns.find(c=>c.table==='Assets'&&c.name==='ImageData').maxLength,-1);
 for(const name of ['OriginalTaskId','FulfilledByTaskId','PlannedDueAt','EffectiveDueAt','Reason','RecordedAt'])assert(contract.columns.some(c=>c.table==='PMOccurrenceResolutions'&&c.name===name));
 assert(contract.constraints.some(c=>c.table==='PMOccurrenceResolutions'&&c.kind==='U'));
});
test('fresh schema creates referenced tables first and catches former facility settings order',()=>{
 assert.deepEqual(creationOrderProblems(contract),[]);
 const invalid=structuredClone(contract);invalid.tables.splice(invalid.tables.indexOf('FacilityPMSettings'),1);invalid.tables.unshift('FacilityPMSettings');
 assert(creationOrderProblems(invalid).includes('FacilityPMSettings references PMTemplates before creation'));
});
test('live metadata comparison rejects omissions that the previous verifier missed',()=>{
 const actual=fixture();assert.deepEqual(compareSchema(contract,actual),[]);
 actual.tables=actual.tables.filter(t=>t!=='Facilities');actual.columns=actual.columns.filter(c=>!(c.table==='PMTasks'&&c.name==='SourceTaskId'));
 actual.constraints=actual.constraints.filter(c=>c.name!=='FK_pm_PMTasks_RecurringFromTask');actual.indexes=actual.indexes.filter(i=>i.name!=='UQ_pm_TaskWorkSessions_OpenSessionPerTask');
 const failures=compareSchema(contract,actual);assert.equal(failures.length,4);assert(failures.some(s=>s.includes('Missing column pm.PMTasks.SourceTaskId')));
});
test('column type, length, nullability and disabled/untrusted constraints are rejected',()=>{
 const actual=fixture();const c=actual.columns.find(c=>c.table==='Assets'&&c.name==='Name');c.type='varchar';c.maxLength=20;c.nullable=true;
 actual.constraints.find(c=>c.kind==='F').untrusted=true;actual.indexes[0].disabled=true;
 assert.equal(compareSchema(contract,actual).length,5);
});
test('DDL parser handles comma-bearing defaults and rejects unsupported removals',()=>{
 const c=parseSchemaContract("CREATE TABLE pm.Example (\n    Id int IDENTITY(1,1) NOT NULL,\n    Text nvarchar(50) NULL CONSTRAINT DF_Example DEFAULT (N'a,b'),\n    Amount decimal(10,2) NOT NULL\n  );");
 assert.equal(c.columns.length,3);assert.equal(c.columns[1].maxLength,100);assert.equal(c.columns[2].scale,2);
 assert.throws(()=>parseSchemaContract(source+'\nDROP TABLE pm.Users;'),/parser review/);
});

test('MaintenanceType exists before filtered planned-occurrence indexes are created',()=>{
 assert(source.indexOf("ADD MaintenanceType") < source.indexOf("CREATE UNIQUE INDEX UQ_pm_PMTasks_AssetTemplatePlannedDue"));
});
