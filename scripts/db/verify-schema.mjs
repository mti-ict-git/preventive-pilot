import 'dotenv/config';
import sql from 'mssql';
import { readFile } from 'node:fs/promises';
import { parseSchemaContract, creationOrderProblems, compareSchema, readSchemaMetadata } from './schema-contract.mjs';

const source=await readFile(new URL('../../db/schema.sql',import.meta.url),'utf8');
const expected=parseSchemaContract(source);
const orderProblems=creationOrderProblems(expected);
console.log(`Source inventory: ${expected.tables.length} tables, ${expected.columns.length} columns, ${expected.constraints.length} named constraints, ${expected.indexes.length} explicit indexes`);
if(orderProblems.length){console.error(orderProblems.join('\n'));process.exitCode=2;}
else if(process.argv.includes('--source-only')) console.log('Source order check passed; no database connection or live verification performed.');
else {
  const required=name=>{if(!process.env[name])throw Error(`${name} is required`);return process.env[name];};
  const bool=(value,fallback)=>value===undefined||value===''?fallback:['true','1','yes','y'].includes(value.toLowerCase());
  let pool;
  try {
    pool=await new sql.ConnectionPool({server:required('DB_SERVER'),database:required('DB_DATABASE'),user:required('DB_USER'),password:required('DB_PASSWORD'),port:Number(process.env.DB_PORT||1433),connectionTimeout:10000,requestTimeout:10000,options:{encrypt:bool(process.env.DB_ENCRYPT,false),trustServerCertificate:bool(process.env.DB_TRUST_SERVER_CERTIFICATE,true)},pool:{max:2,min:0,idleTimeoutMillis:1000}}).connect();
    const actual=await readSchemaMetadata(pool);
    const problems=compareSchema(expected,actual);
    const extras=actual.tables.filter(t=>!expected.tables.includes(t));
    console.log(`Live inventory: ${actual.tables.length} tables, ${actual.columns.length} columns, ${actual.constraints.length} constraints, ${actual.indexes.length} indexes including PK/unique constraints`);
    if(extras.length)console.log(`Extra tables (informational): ${extras.join(', ')}`);
    if(problems.length){console.error(problems.join('\n'));process.exitCode=2;}
    else console.log('Verification OK: all source inventory objects and checked column shapes/flags match.');
    console.log('LIMIT: constraint expressions, FK endpoints, index key/filter definitions, default expressions, data backfills, permissions and operational behavior are not certified.');
  }catch(error){console.error(`Schema verification failed: ${error.code??'ERROR'}: ${error.message}`);process.exitCode=1;}
  finally {if(pool)await pool.close();}
}
