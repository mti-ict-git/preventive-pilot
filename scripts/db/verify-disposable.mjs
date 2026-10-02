// Explicit opt-in: create a new disposable database; never apply schema to DB_DATABASE.
import 'dotenv/config';
import sql from 'mssql';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { parseSchemaContract, compareSchema, readSchemaMetadata } from './schema-contract.mjs';
if(process.argv[2]!=='--run'||process.argv[3]!==process.env.DB_SERVER)throw Error('Usage: node scripts/db/verify-disposable.mjs --run <configured-server>');
const name='PreventivePilot_D2_'+randomUUID().replaceAll('-','');
const config={server:process.env.DB_SERVER,user:process.env.DB_USER,password:process.env.DB_PASSWORD,port:Number(process.env.DB_PORT||1433),connectionTimeout:10000,requestTimeout:120000,options:{encrypt:['true','1'].includes(process.env.DB_ENCRYPT??''),trustServerCertificate:process.env.DB_TRUST_SERVER_CERTIFICATE!=='false'}};
const source=await readFile(new URL('../../db/schema.sql',import.meta.url),'utf8');
const contract=parseSchemaContract(source);
let admin,db,created=false;
async function apply(){const tx=new sql.Transaction(db);await tx.begin();try{await tx.request().query('SET XACT_ABORT ON; SET LOCK_TIMEOUT 10000;\n'+source);await tx.commit();}catch(e){await tx.rollback().catch(()=>{});throw e;}}
async function verify(){const problems=compareSchema(contract,await readSchemaMetadata(db));assert.deepEqual(problems,[]);}
try{
 admin=await new sql.ConnectionPool({...config,database:'master'}).connect();
 await admin.request().query(`CREATE DATABASE [${name}]`);created=true;console.log(`Created disposable database ${name}`);
 db=await new sql.ConnectionPool({...config,database:name}).connect();
 await apply();await verify();console.log('PASS clean schema application and full inventory checks');
 await apply();await verify();console.log('PASS second schema application and full inventory checks');
 await db.request().query('ALTER TABLE pm.PMTasks DROP CONSTRAINT FK_pm_PMTasks_Facilities; ALTER TABLE pm.PMTasks DROP CONSTRAINT CK_pm_PMTasks_AssetOrFacility;');
 await apply();await verify();console.log('PASS legacy missing context guards restored by upgrade');
 console.log('PASS disposable clean/repeat/upgrade acceptance; no operational database changed');
}catch(e){console.error(`FAILED ${e.code??'ERROR'}: ${e.message}`);for(const p of e.precedingErrors??[])console.error(p.message);process.exitCode=1;}
finally{
 if(db)await db.close();
 if(created){await admin.request().query(`ALTER DATABASE [${name}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [${name}];`);console.log(`CLEANUP dropped ${name}`);}
 if(admin)await admin.close();
}
