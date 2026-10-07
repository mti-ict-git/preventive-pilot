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
 const next={...legacy,config:{...config,layout:"companyAsset",logoDataUrl:"data:image/png;base64,AAAA"}};
 assert.equal(schema.parse(next).config.layout,"companyAsset");assert.equal(schema.parse(next).config.logoDataUrl,next.config.logoDataUrl);
 const uploaded = "data:image/png;base64," + "A".repeat(2796204);
 assert(schema.safeParse({...next,config:{...next.config,logoDataUrl:uploaded}}).success);
 assert(parseLabelDraft(JSON.stringify({...next,config:{...next.config,logoDataUrl:uploaded}})));
 assert(!schema.safeParse({...next,config:{...next.config,layout:"bad"}}).success);
 assert(!schema.safeParse({...next,config:{...next.config,logoDataUrl:"data:image/svg+xml;base64,AAAA"}}).success);
 assert(!schema.safeParse({...next,config:{...next.config,logoDataUrl:"x".repeat(2800001)}}).success);
});
