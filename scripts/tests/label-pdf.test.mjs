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
  vm.runInThisContext(`(function(require,module,exports){${js}\n})`)(require,m,m.exports);
  return m.exports;
};
const { buildLabelPdf } = load("labelPdf"), { parseLabelDraft, labelDraftKey } = load("labelDraft");
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
