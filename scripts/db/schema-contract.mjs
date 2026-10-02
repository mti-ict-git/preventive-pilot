// Source inventory for this repository's explicit DDL, not a general T-SQL parser.
const columnPattern = /^(\w+)\s+(\w+)(?:\((max|\d+)(?:\s*,\s*(\d+))?\))?\s+(?:IDENTITY\([^)]*\)\s+)?(NOT\s+NULL|NULL)\b/i;
function column(table, text) {
  const m = columnPattern.exec(text.trim());
  if (!m) throw new Error(`Unsupported column declaration in ${table}: ${text}`);
  const type=m[2].toLowerCase(), size=m[3]?.toLowerCase();
  return {table,name:m[1],type,nullable:/^NULL$/i.test(m[5]),
    ...(['nvarchar','nchar','varchar','char','varbinary','binary'].includes(type) ? {maxLength:size==='max'?-1:Number(size)*(type.startsWith('n')?2:1)} : {}),
    ...(['datetime2','datetimeoffset','time'].includes(type) ? {scale:size===undefined?7:Number(size)} : {}),
    ...(['decimal','numeric'].includes(type) ? {precision:Number(size??18),scale:Number(m[4]??0)} : {})};
}
export function parseSchemaContract(source) {
  if (/\bDROP\s+(TABLE|COLUMN|CONSTRAINT|INDEX)\b/i.test(source)) throw new Error('DDL removal requires schema-contract parser review');
  const tables=[],columns=new Map(),constraints=new Map(),indexes=new Map(),dependencies=[];
  for(const m of source.matchAll(/CREATE TABLE pm\.(\w+)\s*\(([\s\S]*?)\n {2}\);/g)){
    tables.push(m[1]);
    let depth=0, quoted=false, start=0;
    const definitions=[];
    for(let i=0;i<m[2].length;i++){
      const ch=m[2][i];
      if(ch==="'"){if(quoted&&m[2][i+1]==="'"){i++;continue;}quoted=!quoted;}
      if(quoted)continue;
      if(ch==='(')depth++;
      if(ch===')')depth--;
      if(ch===','&&depth===0){definitions.push(m[2].slice(start,i));start=i+1;}
    }
    definitions.push(m[2].slice(start));
    for(const definition of definitions){
      if(/^\s*CONSTRAINT\b/i.test(definition))continue;
      const c=column(m[1],definition);columns.set(`${c.table}.${c.name}`,c);
    }
    for(const ref of m[2].matchAll(/REFERENCES pm\.(\w+)/g))if(ref[1]!==m[1])dependencies.push({table:m[1],requires:ref[1]});
  }
  const rawCreateCount=[...source.matchAll(/\bCREATE TABLE pm\./g)].length;
  if(tables.length!==rawCreateCount||!tables.length)throw new Error('Unparsed CREATE TABLE declaration');
  for(const m of source.matchAll(/ALTER TABLE pm\.(\w+)\s+(?:WITH CHECK\s+)?(ADD|ALTER COLUMN)\s+([\s\S]*?);/g)){
    if(/^CONSTRAINT\b/.test(m[3].trim()))continue;
    const c=column(m[1],m[3]);const key=`${c.table}.${c.name}`;
    // Conditional ADD must not override a later ALTER COLUMN; repository duplicates agree.
    if(m[2]==='ALTER COLUMN'||!columns.has(key))columns.set(key,c);
  }
  for(const m of source.matchAll(/\bCONSTRAINT ((PK|UQ|FK|CK|DF)_\w+)/g))constraints.set(m[1],{name:m[1],kind:m[2]==='CK'?'C':m[2]==='DF'?'D':m[2]==='FK'?'F':m[2]});
  for(const m of source.matchAll(/CREATE\s+(UNIQUE\s+)?INDEX\s+(\w+)\s+ON\s+pm\.(\w+)/g))indexes.set(`${m[3]}.${m[2]}`,{table:m[3],name:m[2],unique:Boolean(m[1])});
  return {tables,columns:[...columns.values()],constraints:[...constraints.values()],indexes:[...indexes.values()],dependencies};
}
export function creationOrderProblems(contract){return contract.dependencies.filter(d=>contract.tables.indexOf(d.requires)>contract.tables.indexOf(d.table)||!contract.tables.includes(d.requires)).map(d=>`${d.table} references ${d.requires} before creation`);}
export function compareSchema(contract, actual){
  const problems=[];
  for(const table of contract.tables)if(!actual.tables.includes(table))problems.push(`Missing table pm.${table}`);
  for(const c of contract.columns){const found=actual.columns.find(a=>a.table===c.table&&a.name===c.name);if(!found){problems.push(`Missing column pm.${c.table}.${c.name}`);continue;}for(const key of ['type','nullable','maxLength','precision','scale'])if(c[key]!==undefined&&c[key]!==found[key])problems.push(`Column pm.${c.table}.${c.name} ${key}: expected ${c[key]}, got ${found[key]}`);}
  for(const c of contract.constraints){const found=actual.constraints.find(a=>a.name===c.name);if(!found)problems.push(`Missing constraint ${c.name}`);else if(found.kind!==c.kind||found.disabled||found.untrusted)problems.push(`Invalid/disabled/untrusted constraint ${c.name}`);}
  for(const i of contract.indexes){const found=actual.indexes.find(a=>a.table===i.table&&a.name===i.name);if(!found)problems.push(`Missing index ${i.table}.${i.name}`);else if(found.unique!==i.unique||found.disabled)problems.push(`Invalid/disabled index ${i.table}.${i.name}`);}
  return problems;
}
export async function readSchemaMetadata(pool){
  const rows=async query=>(await pool.request().query(query)).recordset;
  const tables=await rows("SELECT name FROM sys.tables WHERE schema_id=SCHEMA_ID(N'pm')");
  const columns=await rows("SELECT t.name AS [table],c.name,TYPE_NAME(c.user_type_id) AS type,c.is_nullable AS nullable,c.max_length AS maxLength,c.precision,c.scale FROM sys.tables t JOIN sys.columns c ON c.object_id=t.object_id WHERE t.schema_id=SCHEMA_ID(N'pm')");
  const constraints=await rows("SELECT o.name,o.type AS kind,COALESCE(f.is_disabled,k.is_disabled,0) AS disabled,COALESCE(f.is_not_trusted,k.is_not_trusted,0) AS untrusted FROM sys.objects o LEFT JOIN sys.foreign_keys f ON f.object_id=o.object_id LEFT JOIN sys.check_constraints k ON k.object_id=o.object_id WHERE o.schema_id=SCHEMA_ID(N'pm') AND o.type IN ('PK','UQ','F','C','D')");
  const indexes=await rows("SELECT t.name AS [table],i.name,i.is_unique AS [unique],i.is_disabled AS disabled FROM sys.tables t JOIN sys.indexes i ON i.object_id=t.object_id WHERE t.schema_id=SCHEMA_ID(N'pm') AND i.name IS NOT NULL");
  return {tables:tables.map(t=>t.name),columns:columns.map(c=>({...c,nullable:Boolean(c.nullable)})),constraints:constraints.map(c=>({...c,kind:c.kind.trim(),disabled:Boolean(c.disabled),untrusted:Boolean(c.untrusted)})),indexes:indexes.map(i=>({...i,unique:Boolean(i.unique),disabled:Boolean(i.disabled)}))};
}
