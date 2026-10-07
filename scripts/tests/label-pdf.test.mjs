import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import { test } from "node:test";
import ts from "typescript";
import { PDFDocument } from "pdf-lib";
const require = createRequire(import.meta.url);
const load = file => {
  const m = { exports: {} };
  const js = ts.transpileModule(fs.readFileSync(new URL(`../../src/lib/${file}.ts`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  vm.runInThisContext(`(function(require,module,exports){${js}\n})`)((name) => name.startsWith("./") ? load(name.slice(2)) : require(name),m,m.exports);
  return m.exports;
};
const { buildLabelPdf, buildLabelOutput } = load("labelPdf"), { parseLabelDraft, labelDraftKey } = load("labelDraft");
const config = { width:82,height:18,qrSize:13,padding:1,fontSize:8,showAssetTag:true,showAssetName:true,
  showCategory:false,showLocation:false,showCustomText:false,customText:"",showBorder:true,showLogo:false,borderRadius:0,orientation:"landscape" };
const asset = { id:"asset-1",assetTag:"34H6CF3",name:"MTI-PC-005",snipeAssetId:7,category:{name:null},location:{name:null} };
test("unsaved 18mm values produce exact 82x18 PDF; different names never change page size",async()=>{
  const doc=await PDFDocument.load(await buildLabelPdf([asset,{...asset,name:"MTI-PC-006"}],config,"assetTag"));
  assert.equal(doc.getPageCount(),2);
  for(const page of doc.getPages()){assert(Math.abs(page.getWidth()*25.4/72-82)<1e-5);assert(Math.abs(page.getHeight()*25.4/72-18)<1e-5);}
});
test("24mm and portrait PDF dimensions follow current inputs",async()=>{
  for(const height of [18,24]) for(const orientation of ["landscape","portrait"]){
    const doc=await PDFDocument.load(await buildLabelPdf([asset],{...config,height,orientation},"snipeItUrl","https://snipe.example/"));
    const page=doc.getPage(0);assert(Math.abs(page.getWidth()*25.4/72-(orientation==="landscape"?82:height))<1e-5);
    assert(Math.abs(page.getHeight()*25.4/72-(orientation==="landscape"?height:82))<1e-5);
  }
});
test("oversized QR, text and invalid dimensions fail with actionable messages",async()=>{
  await assert.rejects(buildLabelPdf([asset],{...config,qrSize:19},"assetTag"),/QR code and padding do not fit/);
  await assert.rejects(buildLabelPdf([asset],{...config,height:NaN},"assetTag"),/valid label/);
  await assert.rejects(buildLabelPdf([{...asset,name:"x".repeat(200)}],config,"assetTag"),/Text is too wide/);
  await assert.rejects(buildLabelPdf([asset],{...config,fontSize:24},"assetTag"),/Text does not fit/);
});
test("browser draft is user scoped, validates dimensions and rejects corrupted data",()=>{
  const settings={config,gridColumns:3,qrPayloadMode:"assetTag"};assert.deepEqual(parseLabelDraft(JSON.stringify(settings)),settings);
  assert.notEqual(labelDraftKey("a"),labelDraftKey("b"));assert.equal(parseLabelDraft("invalid"),null);
  assert.equal(parseLabelDraft(JSON.stringify({...settings,config:{...config,height:0}})),null);
});

test("preview drawing shares exact PDF geometry and top-down text order",async()=>{
  for(const orientation of ["landscape","portrait"]){
    const output=await buildLabelOutput([asset],{...config,orientation},"assetTag");
    const page=(await PDFDocument.load(output.pdfBytes)).getPage(0),d=output.drawings[0];
    assert.equal(d.width,page.getWidth());assert.equal(d.height,page.getHeight());
    assert.equal(d.lines[0].text,asset.assetTag);assert.equal(d.lines[1].text,asset.name);
    assert(d.lines[0].y>d.lines[1].y);assert(d.lines.every(line=>line.y>=0&&line.y+line.size<=d.height));
    assert(d.qr.x>=0&&d.qr.y>=0&&d.qr.x+d.qr.size<=d.width&&d.qr.y+d.qr.size<=d.height);
    assert.match(d.qr.dataUrl,/^data:image\/png;base64,/);
  }
});

 test("Company Asset 18mm PDF has a bounded logo, right QR and rotated warning",async()=>{
   const cfg={...config,layout:"companyAsset",qrSize:12,showLogo:true};
   const output=await buildLabelOutput([asset],cfg,"assetTag");
   const d=output.drawings[0],page=(await PDFDocument.load(output.pdfBytes)).getPage(0);
   assert.equal(d.width,page.getWidth()); assert.equal(d.height,page.getHeight());
   assert(d.logo && d.logo.x+d.logo.width<d.qr.x);
   assert(d.qr.x>d.width/2);assert(d.lines.some(l=>l.text===asset.name));
   const warning=d.lines.find(l=>l.text==="DON'T REMOVE");assert.equal(warning.rotation,-90);
   assert(d.logo.y>=0&&d.logo.y+d.logo.height<=d.height);
   assert(d.lines.filter(l=>!l.rotation).every(l=>l.x>=0&&l.y>=0&&l.y+l.size<=d.height));
   await assert.rejects(buildLabelPdf([asset],{...cfg,orientation:"portrait"},"assetTag"),/landscape/);
   await assert.rejects(buildLabelPdf([asset],{...cfg,logoDataUrl:"data:image/png;base64,AAAA"},"assetTag"),/logo cannot be read/);
   assert.equal(parseLabelDraft(JSON.stringify({config:cfg,gridColumns:1,qrPayloadMode:"assetTag"})).config.layout,"companyAsset");
   assert.equal(parseLabelDraft(JSON.stringify({config:{...cfg,logoDataUrl:"data:image/svg+xml;base64,AAAA"},gridColumns:1,qrPayloadMode:"assetTag"})),null);
 });

test("backend label schema preserves optional layout/logo while accepting legacy settings",()=>{
 const source=fs.readFileSync(new URL("../../backend/src/routes/system.ts",import.meta.url),"utf8");
 const start=source.indexOf("const LabelDesignerUiSettingsSchema = ");
 const expression=source.slice(start+"const LabelDesignerUiSettingsSchema = ".length,source.indexOf("\nconst WhatsAppSettingsSchema",start)).trim().replace(/;$/,"");
 const schema=vm.runInNewContext(expression,{z:require("zod").z});
 const legacy={config,gridColumns:1,qrPayloadMode:"assetTag"};assert(schema.safeParse(legacy).success);
 const next={...legacy,config:{...config,layout:"companyAsset",printOffsetYmm:0.2,logoSizePercent:60,logoDataUrl:"data:image/png;base64,AAAA"}};
 assert.equal(schema.parse(next).config.logoSizePercent,60);
 assert.equal(schema.parse(next).config.printOffsetYmm,0.2);
 for(const value of [-1.1,1.1,0.15]) assert(!schema.safeParse({...next,config:{...next.config,printOffsetYmm:value}}).success);
 for(const value of [24,101,50.5]) assert(!schema.safeParse({...next,config:{...next.config,logoSizePercent:value}}).success);
 assert.equal(schema.parse(next).config.layout,"companyAsset");assert.equal(schema.parse(next).config.logoDataUrl,next.config.logoDataUrl);
 const uploaded = "data:image/png;base64," + "A".repeat(2796204);
 assert(schema.safeParse({...next,config:{...next.config,logoDataUrl:uploaded}}).success);
 assert(parseLabelDraft(JSON.stringify({...next,config:{...next.config,logoDataUrl:uploaded}})));
 assert(!schema.safeParse({...next,config:{...next.config,layout:"bad"}}).success);
 assert(!schema.safeParse({...next,config:{...next.config,logoDataUrl:"data:image/svg+xml;base64,AAAA"}}).success);
 assert(!schema.safeParse({...next,config:{...next.config,logoDataUrl:"x".repeat(2800001)}}).success);
});


test("logo size scales visible ink within a fixed safe header and survives persistence",async()=>{
 const cfg={...config,layout:"companyAsset",showLogo:true,qrSize:12};
 const large=await buildLabelOutput([asset],{...cfg,logoSizePercent:100},"assetTag");
 const small=await buildLabelOutput([asset],{...cfg,logoSizePercent:25},"assetTag");
 const a=large.drawings[0],b=small.drawings[0];
 assert(Math.abs(a.logo.width/b.logo.width-4)<1e-8);assert(Math.abs(a.logo.height/b.logo.height-4)<1e-8);
 assert(a.logo.viewport);assert.deepEqual(a.lines,b.lines);assert.deepEqual(a.qr,b.qr);
 assert(a.logo.x+a.logo.width<a.qr.x);assert(a.logo.y>=a.lines.find(x=>x.text==="Company Asset").y+a.lines.find(x=>x.text==="Company Asset").size);
 assert.equal((await PDFDocument.load(large.pdfBytes)).getPageCount(),1);
 for(const value of [25,60,100]) assert.equal(parseLabelDraft(JSON.stringify({config:{...cfg,logoSizePercent:value},gridColumns:1,qrPayloadMode:"assetTag"})).config.logoSizePercent,value);
 for(const value of [24,101,50.5]) {
  assert.equal(parseLabelDraft(JSON.stringify({config:{...cfg,logoSizePercent:value},gridColumns:1,qrPayloadMode:"assetTag"})),null);
  await assert.rejects(buildLabelOutput([asset],{...cfg,logoSizePercent:value},"assetTag"),/Logo size/);
 }
 const legacy=await buildLabelOutput([asset],cfg,"assetTag");assert.equal(legacy.drawings[0].logo.width,a.logo.width);
});


test("uploaded padded PNG/JPG fit visible ink at 100 percent on 45x18 tape",async()=>{
 const upng=require("@pdf-lib/upng").default,jpeg=require("jpeg-js"),{getLogoViewport}=load("logoViewport");
 const width=500,height=200,pixels=new Uint8Array(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const i=(y*width+x)*4;const ink=x>=30&&x<470&&y>=80&&y<120;
  pixels[i]=pixels[i+1]=pixels[i+2]=ink?0:255;pixels[i+3]=255;
 }
 const png="data:image/png;base64,"+Buffer.from(upng.encode([pixels.buffer],width,height,0)).toString("base64");
 const jpg="data:image/jpeg;base64,"+Buffer.from(jpeg.encode({data:pixels,width,height},100).data).toString("base64");
 for(const dataUrl of [png,jpg]){
  const bounds=getLogoViewport(dataUrl);assert(bounds.height<50);assert(bounds.width>430);
  const result=await buildLabelOutput([asset],{...config,width:45,qrSize:10,layout:"companyAsset",showLogo:true,logoDataUrl:dataUrl,logoSizePercent:100},"assetTag");
  const d=result.drawings[0];assert(d.logo.viewport);assert(d.logo.width>d.width*0.4);assert(d.logo.x+d.logo.width<d.qr.x);
  assert(d.logo.y>=d.lines.find(l=>l.text==="Company Asset").y+d.lines.find(l=>l.text==="Company Asset").size);
  assert.equal((await PDFDocument.load(result.pdfBytes)).getPageCount(),1);
 }
 const blank="data:image/png;base64,"+Buffer.from(upng.encode([new Uint8Array(100*100*4).buffer],100,100,0)).toString("base64");
 await assert.rejects(buildLabelOutput([asset],{...config,layout:"companyAsset",showLogo:true,logoDataUrl:blank},"assetTag"),/blank on white/);
});



test("18mm label border and artwork stay inside Brother 15.8mm print height",async()=>{
 for(const layout of ["standard","companyAsset"]){
  const cfg={...config,width:45,qrSize:10,layout,showLogo:layout==="companyAsset",showBorder:true};
  const {drawings,pdfBytes}=await buildLabelOutput([asset],cfg,"assetTag"),d=drawings[0];
  const mm=72/25.4;assert.equal(d.borderInset,1.5*mm);
  assert(d.borderInset-0.4>1.1*mm);assert(d.qr.y>=2*mm);assert(d.qr.y+d.qr.size<=d.height-2*mm);
  if(d.logo){assert(d.logo.y>=2*mm);assert(d.logo.y+d.logo.height<=d.height-2*mm);}
  assert(d.lines.filter(l=>!l.rotation).every(l=>l.y>=2*mm&&l.y+l.size<=d.height-2*mm));
  const pdf=await PDFDocument.load(pdfBytes);assert(Math.abs(pdf.getPage(0).getHeight()/mm-18)<1e-8);assert(Math.abs(pdf.getPage(0).getWidth()/mm-45)<1e-8);
 }
});


test("whole-design vertical calibration matches actual PDF translation and persists",async()=>{
 const {inflateSync}=require("node:zlib");
 for(const layout of ["standard","companyAsset"])for(const offset of [-1,0,0.2,1]){
  const cfg={...config,width:45,qrSize:10,layout,showLogo:layout==="companyAsset",printOffsetYmm:offset};
  const out=await buildLabelOutput([asset],cfg,"assetTag"),drawing=out.drawings[0];
  assert(Math.abs(drawing.verticalOffset-offset*72/25.4)<1e-8);
  const pdf=await PDFDocument.load(out.pdfBytes),page=pdf.getPage(0),stream=pdf.context.lookup(page.node.Contents().get(0));
  const commands=inflateSync(stream.contents).toString();
  const transform=/1 0 0 1 0 ([-.0-9]+) cm/.exec(commands);assert(transform);
  assert(Math.abs(Number(transform[1])+drawing.verticalOffset)<1e-8);
  assert.equal(page.getWidth(),drawing.width);assert.equal(page.getHeight(),drawing.height);
  assert.equal(parseLabelDraft(JSON.stringify({config:cfg,gridColumns:1,qrPayloadMode:"assetTag"})).config.printOffsetYmm,offset);
 }
 for(const value of [-1.1,1.1,0.15])await assert.rejects(buildLabelOutput([asset],{...config,printOffsetYmm:value},"assetTag"),/Print position/);
 await assert.rejects(buildLabelOutput([asset],{...config,height:24,printOffsetYmm:1},"assetTag"),/border outside/);
});


test("calibrated 18mm borders retain clearance and can be disabled", async()=>{
 const mm=72/25.4;
 for(const layout of ["standard","companyAsset"]) for(const offset of [0.7,0.8,-0.8]) {
  const cfg={...config,width:45,qrSize:10,layout,showLogo:true,printOffsetYmm:offset,borderInsetMm:1.5};
  const d=(await buildLabelOutput([asset],cfg,"assetTag")).drawings[0];
  assert(Math.abs(d.borderInset/mm-(1.5+Math.abs(offset)))<1e-8);
  assert(d.borderInset-Math.abs(d.verticalOffset)-0.4>=1.1*mm);
  const off=(await buildLabelOutput([asset],{...cfg,showBorder:false},"assetTag")).drawings[0];
  assert.equal(off.showBorder,false);assert.deepEqual(off.qr,d.qr);assert.deepEqual(off.lines,d.lines);
 }
 const larger=(await buildLabelOutput([asset],{...config,borderInsetMm:3},"assetTag")).drawings[0];assert.equal(larger.borderInset,3*mm);
 for(const value of [0.4,4.1,1.55,NaN])await assert.rejects(buildLabelOutput([asset],{...config,borderInsetMm:value},"assetTag"),/Border inset/);
});

test("shared named paper library validates calibrated settings and legacy omission",()=>{
 const source=fs.readFileSync(new URL("../../backend/src/routes/system.ts",import.meta.url),"utf8"),start=source.indexOf("const LabelDesignerUiSettingsSchema = ");
 const expression=source.slice(start+"const LabelDesignerUiSettingsSchema = ".length,source.indexOf("\nconst WhatsAppSettingsSchema",start)).trim().replace(/;$/,"");
 const schema=vm.runInNewContext(expression,{z:require("zod").z});
 const preset={name:"Brother calibrated",width:45,height:18,qrSize:10,padding:1,orientation:"landscape",showBorder:false,borderInsetMm:2.5,printOffsetYmm:0.8};
 const settings={config:{...config,borderInsetMm:2.5,printOffsetYmm:0.8,showBorder:false},gridColumns:1,qrPayloadMode:"assetTag",paperPresets:[preset]};
 assert.deepEqual(JSON.parse(JSON.stringify(schema.parse(settings).paperPresets)),[preset]);
 assert.equal(parseLabelDraft(JSON.stringify(settings)).config.borderInsetMm,2.5);
 assert(schema.safeParse({...settings,paperPresets:undefined}).success);
 for(const paperPresets of [[preset,{...preset,name:"BROTHER CALIBRATED"}],Array.from({length:21},(_,i)=>({...preset,name:String(i)})),[{...preset,name:" "}],[{...preset,printOffsetYmm:0.85}],[{...preset,borderInsetMm:4.1}]])assert(!schema.safeParse({...settings,paperPresets}).success);
});
