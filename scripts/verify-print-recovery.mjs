import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const route = fs.readFileSync("app/routes/app.print-files.tsx", "utf8");
const helpers = route.slice(route.indexOf("const attrMap ="), route.indexOf("const documentSize ="));
const js = ts.transpileModule(helpers, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const context = vm.createContext({});
vm.runInContext(`${js}\nthis.getDesign = getDesign; this.numeric = numeric;`, context);
const attributes = [
  { key: "_Upload your photo", value: "https://cdn.shopify.com/s/files/test/uploads/photo.jpg" },
  { key: "_Upload your photo Position", value: '{"x":null,"y":null,"scale":1}' },
  { key: "_Your name", value: "dfd" },
  { key: "_Your name Style", value: '{"x":29,"y":50,"fontSize":129,"color":"#ffffff"}' },
  { key: "_Your name Font", value: "Arial" },
  { key: "_Personalised Preview", value: "https://cdn.shopify.com/s/files/test/uploads/preview.jpg" },
];
const legacy = context.getDesign({ attributes, config: null });
assert.equal(legacy.exact, false);
assert.equal(legacy.design.p.length, 1);
assert.equal(legacy.design.p[0].l, "Upload your photo");
assert.equal(legacy.design.t[0].v, "dfd");
assert.equal(legacy.design.t[0].z, 129);
assert.equal(context.numeric(null, 50), 50);
const configured = context.getDesign({ attributes, config: { photoFields: [{ label: "Upload your photo" }] } });
assert.equal(configured.design.p.length, 1);
const saved = { v: 1, r: "17:7", o: "", p: [], t: [] };
assert.equal(context.getDesign({ attributes: [{ key: "_Cartwala Design JSON", value: JSON.stringify(saved) }] }).exact, true);
const storefront = fs.readFileSync("extensions/cartwala-personalizer/assets/cartwala-personalizer.js", "utf8");
const persist = storefront.slice(storefront.indexOf("const persist = async"), storefront.indexOf("const persist = async") + 1800);
assert.ok(persist.indexOf("const record =") < persist.indexOf("await database"), "snapshot must precede async database access and dialog close");
assert.ok(storefront.includes("persist(blob, printDesign)"));
assert.ok(storefront.includes("record.printDesign"), "saved layout is restored with the draft");
console.log("Print recovery and layout persistence checks passed");
