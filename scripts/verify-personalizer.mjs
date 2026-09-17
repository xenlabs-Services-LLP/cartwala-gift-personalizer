import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const storefront = fs.readFileSync("extensions/cartwala-personalizer/assets/cartwala-personalizer.js", "utf8");
const start = storefront.indexOf("const normalize=raw=>");
const end = storefront.indexOf(";\n  const initialize=", start);
assert.ok(start >= 0 && end > start, "storefront normalizer is present");
const expression = storefront.slice(start + "const normalize=".length, end);
const normalize = vm.runInNewContext(`(${expression})`, {
  clamp: (value, min, max, fallback) => { const number = Number(value); return Math.min(max, Math.max(min, Number.isFinite(number) ? number : fallback)); },
  array: (value) => Array.isArray(value) ? value : [],
  MAX_FIELDS: 200,
  MAX_FONTS: 50,
});

for (const count of [1, 3, 10, 13, 50]) {
  const raw = { canvasRatio: "1:1", photoFields: Array.from({ length: count }, (_, index) => ({ id: `slot-${index + 1}`, label: `Photo ${index + 1}`, x: (index % 10) * 10 + 5, y: Math.floor(index / 10) * 15 + 10, width: 9, height: 12, maskUrl: `https://cdn.shopify.com/mask-${index + 1}.png`, required: true })) };
  const config = normalize(raw);
  assert.equal(config.photos.length, count);
  assert.equal(config.photos[count - 1].id, `slot-${count}`);
  assert.equal(config.photos[count - 1].width, 9);
}

const textConfig = normalize({ canvasRatio: "1080:1350", textFields: [{ id: "text-1", label: "Name", defaultValue: "Your Name", x: 50, y: 80, fontSize: 54 }] });
assert.equal(textConfig.ratio, "1080:1350");
assert.equal(textConfig.texts[0].defaultValue, "Your Name");
const overCap = normalize({ photoFields: Array.from({ length: 250 }, (_, index) => ({ id: `slot-${index + 1}` })) });
assert.equal(overCap.photos.length, 200);

// Keep QA focused on contracts that this storefront file currently owns.
assert.match(storefront, /data-cw-save/);
assert.match(storefront, /const MAX_FIELDS=200;const MAX_FONTS=50;/);
assert.match(storefront, /const createId=\(\)=>\{try\{if\(typeof crypto/);
assert.match(storefront, /setPurchaseReady\(false\)/);
assert.match(storefront, /root\.dataset\.cwReady='true';try\{/);
assert.match(storefront, /console\.error\('Cartwala personalizer failed',error\)/);

const storefrontCss = fs.readFileSync("extensions/cartwala-personalizer/assets/cartwala-personalizer.css", "utf8");
assert.match(storefrontCss, /--cw-slot-icon/);
assert.match(storefrontCss, /min-width:0/);

const cart = fs.readFileSync("extensions/cartwala-personalizer/assets/cartwala-cart-preview.js", "utf8");
assert.match(cart, /cart\.js/);
assert.match(cart, /_Personalised Preview/);

const admin = fs.readFileSync("app/routes/app._index.tsx", "utf8");
assert.match(admin, /from "\.\.\/lib\/personalizer-config"/);
assert.match(admin, /from "\.\.\/lib\/shopify-files\.server"/);
assert.match(admin, /from "\.\.\/lib\/psd-import"/);
assert.match(admin, /intent === "psdImport"/);

const personalizerConfig = fs.readFileSync("app/lib/personalizer-config.ts", "utf8");
assert.match(personalizerConfig, /export const MAX_FIELDS = 200;/);
assert.match(personalizerConfig, /export const normalizeConfig = /);
assert.match(personalizerConfig, /isTrustedAssetHost/);

const shopifyFiles = fs.readFileSync("app/lib/shopify-files.server.ts", "utf8");
assert.match(shopifyFiles, /export async function uploadImage/);
assert.match(shopifyFiles, /export async function uploadFont/);
assert.match(shopifyFiles, /firstMetafieldsSetError/);

const psdImport = fs.readFileSync("app/lib/psd-import.ts", "utf8");
assert.match(psdImport, /Number\(transform\[4\]\) \+ textLeft/);
assert.match(psdImport, /\["c", "m", "y", "k"\]\.every/);

console.log("Personalizer QA passed.");
