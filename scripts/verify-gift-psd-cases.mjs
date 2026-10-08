import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { readPsd, writePsd } from "ag-psd";

const route = fs.readFileSync("app/routes/app.print-files.tsx","utf8");
const sourceStart=route.indexOf("const attrMap =");
const sourceEnd=route.indexOf("const documentSize =");
const photosStart=route.indexOf("const sourceFor =");
const photosEnd=route.indexOf("async function renderPhotoLayer(");
assert.ok(sourceStart>=0 && sourceEnd>sourceStart && photosStart>=0 && photosEnd>photosStart);
const script=route.slice(sourceStart,sourceEnd)+"\n"+route.slice(photosStart,photosEnd);
const js=ts.transpileModule(script,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const cx=vm.createContext({});
vm.runInContext(js+"\nthis.getDesign=getDesign;this.sourceFor=sourceFor;this.missingPhotoSources=missingPhotoSources;this.hasPersonalisedPrintContent=hasPersonalisedPrintContent;",cx);

const photo=(i)=>({i,l:"Your photo "+i,x:50,y:50,w:30,h:30,m:"",ox:0,oy:0,s:1,a:0});
const text=(value)=>({i:"name",l:"Name",v:value,x:50,y:75,w:60,h:12,q:"center",b:true,z:38,c:"#222222",f:"Arial"});
const item=(design,attrs)=>({attributes:[{key:"_Cartwala Design JSON",value:JSON.stringify(design)},...attrs],config:null});
const url=(i)=>"https://cdn.shopify.com/s/files/test/image-"+i+".png";
const exact=(photos,texts,attrs)=>cx.getDesign(item({v:1,r:"1:1",o:"",p:photos,t:texts},attrs));

// 1. One-photo gift, with the new opaque ID asset key.
const a=exact([photo("photo-1")],[],[{key:"_Cartwala Source photo-1",value:url("one")}]);
assert.equal(a.exact,true);
assert.equal(cx.sourceFor(a.attributes,"Your photo photo-1","photo-1"),url("one"));
assert.equal(cx.missingPhotoSources(a.design,a.attributes).length,0);
assert.equal(cx.hasPersonalisedPrintContent(a.design),true);

// 2. Three-photo LED collage; one missing original must block Photoshop export.
const b=exact([photo("1"),photo("2"),photo("3")],[],[
  {key:"_Cartwala Source 1",value:url("one")},
  {key:"_Cartwala Source 2",value:url("two")},
  {key:"_Cartwala Source 3",value:url("three")}
]);
assert.equal(cx.missingPhotoSources(b.design,b.attributes).length,0);
const incomplete=exact([photo("1"),photo("2"),photo("3")],[],[
  {key:"_Cartwala Source 1",value:url("one")},
  {key:"_Cartwala Source 3",value:url("three")}
]);
assert.equal(cx.missingPhotoSources(incomplete.design,incomplete.attributes).length,1);
assert.equal(cx.missingPhotoSources(incomplete.design,incomplete.attributes)[0].l,"Your photo 2");

// 3. Name-only personalised gift: no photos required to produce editable text PSD.
const noPhotoConfig={canvasRatio:"1:1",overlayUrl:"",photoFields:[],textFields:[{id:"name",label:"Name",x:50,y:65,width:60,height:13,fontSize:37}]};
const nameOnly=cx.getDesign({attributes:[{key:"_Name",value:"Anaya"}],config:noPhotoConfig});
assert.equal(nameOnly.design.p.length,0);
assert.equal(nameOnly.design.t.length,1);
assert.equal(nameOnly.design.t[0].v,"Anaya");
assert.equal(cx.missingPhotoSources(nameOnly.design,nameOnly.attributes).length,0);
assert.equal(cx.hasPersonalisedPrintContent(nameOnly.design),true);

// 4. Old order recovers its labelled upload when original configured source key is absent.
const legacy=cx.getDesign({attributes:[
 {key:"_Upload your photo",value:url("old")},
 {key:"_Upload your photo Position",value:'{"x":50,"y":50}'}
],config:null});
assert.equal(legacy.exact,false);
assert.equal(legacy.design.p.length,1);
assert.equal(cx.missingPhotoSources(legacy.design,legacy.attributes).length,0);
assert.equal(cx.sourceFor(legacy.attributes,"Upload your photo"),url("old"));

// 5. No photos and no text cannot be claimed as a print-ready custom order.
const empty=exact([],[],[]);
assert.equal(cx.hasPersonalisedPrintContent(empty.design),false);
assert.ok(route.includes("const unavailablePhotos = missingPhotoSources(design, attributes)"));
assert.ok(route.includes('throw new Error("No personalised photo or text was saved for this order.")'));
assert.ok(route.includes("missingPhotoSources(design, attributes).length === 0"));

// 6. Write and parse a genuine PSD with a text layer and no photos.
const textLayer={name:"Customer Name",text:{
 text:"Anaya",
 transform:[1,0,0,1,120,140],
 shapeType:"point",
 pointBase:[0,0],
 style:{font:{name:"Arial"},fontSize:26,fillColor:{r:30,g:30,b:30}},
 paragraphStyle:{justification:"center"}
}};
const bytes=writePsd({width:300,height:300,children:[textLayer]});
const recovered=readPsd(bytes,{skipLayerImageData:true,skipCompositeImageData:true});
assert.equal(recovered.width,300);
assert.equal(recovered.height,300);
assert.ok(recovered.children?.some(layer=>layer.name==="Customer Name"));
console.log("6 gift printing scenarios passed: single photo, multi photo, missing source, text only, legacy, blank order, and text-layer PSD parse.");
