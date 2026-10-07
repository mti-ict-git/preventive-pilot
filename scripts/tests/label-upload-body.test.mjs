import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {createRequire} from "node:module";
const require=createRequire(new URL("../../backend/package.json",import.meta.url));
const express=require("express");
test("label logo request accepts 2MB base64 while unrelated routes retain 1MB",async()=>{
 const source=fs.readFileSync(new URL("../../backend/src/index.ts",import.meta.url),"utf8");
 const scoped='app.use("/api/system/ui-settings/label-designer", express.json({ limit: "3mb" }));';
 const global='app.use(express.json({ limit: "1mb" }));';
 assert(source.includes(scoped));assert(source.indexOf(scoped)<source.indexOf(global));
 const app=express();app.use("/api/system/ui-settings/label-designer",express.json({limit:"3mb"}));app.use(express.json({limit:"1mb"}));
 app.put("/api/system/ui-settings/label-designer",(req,res)=>res.json({length:req.body.logo.length}));
 app.put("/other",(req,res)=>res.json({ok:true}));
 app.use((err,req,res,next)=>res.status(err.status||500).end());
 const server=app.listen(0,"127.0.0.1");await new Promise(resolve=>server.once("listening",resolve));
 try { const url=`http://127.0.0.1:${server.address().port}`;
 const body=JSON.stringify({logo:"data:image/png;base64,"+"A".repeat(2796204)});
 const send=(path,data)=>fetch(url+path,{method:"PUT",headers:{"Content-Type":"application/json"},body:data});
 const accepted=await send("/api/system/ui-settings/label-designer",body);assert.equal(accepted.status,200);assert.equal((await accepted.json()).length,2796226);
 assert.equal((await send("/other",body)).status,413);
 assert.equal((await send("/api/system/ui-settings/label-designer",JSON.stringify({logo:"A".repeat(3200000)}))).status,413);
 } finally {await new Promise(resolve=>server.close(resolve));}
});
