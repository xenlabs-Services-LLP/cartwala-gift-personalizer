import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

// ---------------------------------------------------------------------------
// Storefront normalize() - extracted straight out of the shipped source (no
// build step exists for this file, so this is the actual code that runs in
// the browser, not a reimplementation) and exercised at 1/3/10/13/50 slots.
// ---------------------------------------------------------------------------

const storefront = fs.readFileSync("extensions/cartwala-personalizer/assets/cartwala-personalizer.js", "utf8");
const start = storefront.indexOf("const normalize=raw=>");
const end = storefront.indexOf("\n  };", start);
assert.ok(start >= 0 && end > start, "storefront normalizer is present");
const expression = storefront.slice(start + "const normalize=".length, end + 4).replace(/;\s*$/, "");
const normalize = vm.runInNewContext(`(${expression})`, {
  clamp: (value, min, max, fallback) => { const number = Number(value); return Math.min(max, Math.max(min, Number.isFinite(number) ? number : fallback)); },
  array: (value) => Array.isArray(value) ? value : [],
  // MAX_FIELDS/MAX_FONTS are declared just above `normalize` in the real
  // file, outside the slice above, so the sandbox needs them explicitly.
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

// A config over the field cap must still be truncated, not throw or silently
// keep everything - this is the whole point of MAX_FIELDS.
const overCap = normalize({ photoFields: Array.from({ length: 250 }, (_, index) => ({ id: `slot-${index + 1}` })) });
assert.equal(overCap.photos.length, 200);

// ---------------------------------------------------------------------------
// Storefront source pinning - behavior that isn't reachable by calling
// normalize() alone (DOM wiring, purchase gating, cart/add.js contract,
// draft persistence, and the defensive fixes added in this pass).
// ---------------------------------------------------------------------------

assert.match(storefront, /data-cw-save/);
assert.doesNotMatch(storefront, /data-cw-preview/);
assert.match(storefront, /_Personalised Preview/);
assert.match(storefront, /showProductPreview\(previewUrl\)/);
assert.match(storefront, /indexedDB\.open\('cartwala-designs'/);
assert.match(storefront, /putFile\(productForm,state\.field\.label,state\.file\)/);
assert.match(storefront, /cart\/add\.js/);
assert.match(storefront, /new FormData\(productForm\)/);
assert.match(storefront, /zoom\.min='100'/);
assert.match(storefront, /const constrainPhoto=/);
assert.match(storefront, /state\.slot\.hidden=true/);
assert.match(storefront, /hideBuyNow/);
assert.match(storefront, /setPurchaseReady\(false\)/);
assert.match(storefront, /formData\.set\('sections','cart-drawer,cart-icon-bubble'\)/);
assert.match(storefront, /slot\.querySelector\('span'\)\.textContent/);
assert.match(storefront, /state\.card\.hidden=!active/);
assert.match(storefront, /state\.controls\.hidden=!active\|\|!state\.file/);
assert.match(storefront, /const clearPhoto=state=>/);
assert.match(storefront, /state\.file=null/);
assert.match(storefront, /state\.slot\.hidden=false/);
assert.match(storefront, /showCartPreview\(previewUrl,designId\)/);
assert.match(storefront, /flatMap\(form=>\[\.\.\.form\.querySelectorAll\(purchaseSelector\)\]\)/);
assert.match(storefront, /store\.put\(record,`cart:\$\{designId\}`\)/);

// Defensive fixes: a shared field-count constant instead of a bare literal
// repeated at every call site, a crypto.randomUUID() fallback so a missing
// secure context can't hard-crash setup, and one broken product block can no
// longer take down every other personalizer block on the page.
assert.match(storefront, /const MAX_FIELDS=200;const MAX_FONTS=50;/);
assert.match(storefront, /const createId=\(\)=>\{try\{if\(typeof crypto/);
assert.doesNotMatch(storefront, /return createId\(\)\}catch/, "createId() must not call itself - this was a real recursion bug introduced and caught during this refactor");
assert.match(storefront, /root\.dataset\.cwReady='true';\s*\n\s*try\{/);
assert.match(storefront, /\}catch\(error\)\{console\.error\('Cartwala personalizer failed to initialize for this block\.',error\);\}/);

const storefrontCss = fs.readFileSync("extensions/cartwala-personalizer/assets/cartwala-personalizer.css", "utf8");
assert.match(storefrontCss, /--cw-slot-icon/);
assert.match(storefrontCss, /min-width:0/);
assert.doesNotMatch(storefrontCss, /min-width:min\(190px,85%\)/);

const cart = fs.readFileSync("extensions/cartwala-personalizer/assets/cartwala-cart-preview.js", "utf8");
assert.match(cart, /cart\.js/);
assert.match(cart, /_Personalised Preview/);
assert.match(cart, /draftPreview/);
assert.match(cart, /cart-drawer-item/);
assert.match(cart, /rowKey/);
assert.match(cart, /CartDrawer-Item\|CartItem/);
assert.match(cart, /const property=safePreviewUrl/);
assert.match(cart, /return draftPreview/);
assert.match(cart, /if\(matches\.length===1\)return matches\[0\]/);

// ---------------------------------------------------------------------------
// Admin: config validation, PSD import, and Shopify Files upload now live in
// app/lib/*.ts instead of being inlined in the route file. Assert both that
// the route wires them up, and that the specific bugs fixed in this pass
// stay fixed.
// ---------------------------------------------------------------------------

const admin = fs.readFileSync("app/routes/app._index.tsx", "utf8");
assert.match(admin, /from "\.\.\/lib\/personalizer-config"/);
assert.match(admin, /from "\.\.\/lib\/shopify-files\.server"/);
assert.match(admin, /from "\.\.\/lib\/psd-import"/);
assert.match(admin, /import\("ag-psd"\)/);
assert.match(admin, /intent === "psdImport"/);
assert.match(admin, /\^\(PHOTO\|UPLOAD\)/);
assert.match(admin, /maskFiles\.push/);
assert.match(admin, /configRef\.current = imported\.config/);
assert.match(admin, /form\.set\("config", JSON\.stringify\(configRef\.current\)\)/);
assert.match(admin, /firstMetafieldsSetError\(json\)/);
// Unsaved-changes guard: closing the tab mid-template-build used to lose
// everything silently.
assert.match(admin, /addEventListener\("beforeunload", handler\)/);
assert.match(admin, /confirmDiscardIfDirty/);
// CSV bulk import used to silently drop rows whose product_handle didn't
// match any product; merchants only saw a bare success count.
assert.match(admin, /unmatched\.add\(/);
assert.match(admin, /didn't match a Shopify product/);
// Numeric editor inputs must clamp instead of letting a bare Number() cast
// through, which could render a slot/text preview at NaN%.
assert.match(admin, /updateClampedNumber/);

const personalizerConfig = fs.readFileSync("app/lib/personalizer-config.ts", "utf8");
assert.match(personalizerConfig, /export const MAX_FIELDS = 200;/);
assert.match(personalizerConfig, /export const normalizeConfig = /);
// Asset URLs (overlay/mask/font) must be restricted to Shopify's own CDN,
// not any arbitrary https:// host.
assert.match(personalizerConfig, /isTrustedAssetHost/);
assert.match(personalizerConfig, /\.myshopify\.com/);

const shopifyFiles = fs.readFileSync("app/lib/shopify-files.server.ts", "utf8");
assert.match(shopifyFiles, /export async function uploadImage/);
assert.match(shopifyFiles, /export async function uploadFont/);
// The bug this consolidation fixes: only a mutation's own userErrors was
// checked, never the GraphQL response's top-level errors, so a throttled or
// otherwise rejected request could be reported as a silent success.
assert.match(shopifyFiles, /json\.errors\?\.\[0\]\?\.message/);
assert.match(shopifyFiles, /firstMetafieldsSetError/);

const psdImport = fs.readFileSync("app/lib/psd-import.ts", "utf8");
assert.match(psdImport, /Number\(transform\[4\]\) \+ textLeft/);
// CMYK fix: a real 4-channel CMYK color used to be matched by the "only K is
// present" branch and rendered as a flat grayscale, silently dropping C/M/Y.
assert.match(psdImport, /\["c", "m", "y", "k"\]\.every/);

console.log("Personalizer QA passed: dynamic PSD fields, 13/50-slot configs, field-count cap, purchase gating, preview/save persistence, original files, cart drawer/page preview contracts, and the admin-module + bug-fix refactor.");
