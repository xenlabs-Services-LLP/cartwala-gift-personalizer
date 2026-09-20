import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

// ---------------------------------------------------------------------------
// Storefront normalize() - extracted straight out of the shipped source (no
// build step exists for this file, so this is the actual code that runs in
// the browser, not a reimplementation) and exercised at 1/3/10/13/50 slots.
// ---------------------------------------------------------------------------

const storefront = fs.readFileSync(
  "extensions/cartwala-personalizer/assets/cartwala-personalizer.js",
  "utf8",
);
const normalizePrefix = "const normalize = (raw) =>";
const start = storefront.indexOf(normalizePrefix);
const end = storefront.indexOf("\n  };", start);
assert.ok(start >= 0 && end > start, "storefront normalizer is present");
const expression = storefront
  .slice(start + "const normalize = ".length, end + 4)
  .replace(/;\s*$/, "");
const normalize = vm.runInNewContext(`(${expression})`, {
  clamp: (value, min, max, fallback) => {
    const number = Number(value);
    return Math.min(
      max,
      Math.max(min, Number.isFinite(number) ? number : fallback),
    );
  },
  array: (value) => (Array.isArray(value) ? value : []),
  // MAX_FIELDS/MAX_FONTS are declared just above `normalize` in the real
  // file, outside the slice above, so the sandbox needs them explicitly.
  MAX_FIELDS: 200,
  MAX_FONTS: 50,
});

for (const count of [1, 3, 10, 13, 50]) {
  const raw = {
    canvasRatio: "1:1",
    photoFields: Array.from({ length: count }, (_, index) => ({
      id: `slot-${index + 1}`,
      label: `Photo ${index + 1}`,
      x: (index % 10) * 10 + 5,
      y: Math.floor(index / 10) * 15 + 10,
      width: 9,
      height: 12,
      maskUrl: `https://cdn.shopify.com/mask-${index + 1}.png`,
      required: true,
    })),
  };
  const config = normalize(raw);
  assert.equal(config.photos.length, count);
  assert.equal(config.photos[count - 1].id, `slot-${count}`);
  assert.equal(config.photos[count - 1].width, 9);
}

const textConfig = normalize({
  canvasRatio: "1080:1350",
  textFields: [
    {
      id: "text-1",
      label: "Name",
      defaultValue: "Your Name",
      x: 50,
      y: 80,
      fontSize: 54,
    },
  ],
});
assert.equal(textConfig.ratio, "1080:1350");
assert.equal(textConfig.texts[0].placeholder, "Your Name");
assert.equal(textConfig.texts[0].defaultValue, "");
assert.equal(textConfig.texts[0].movable, false);
assert.equal(textConfig.texts[0].allowColorChoice, false);
const editableText = normalize({
  textFields: [
    {
      id: "text-2",
      movable: true,
      scalable: true,
      rotatable: true,
      allowColorChoice: true,
      rotation: 30,
    },
  ],
}).texts[0];
assert.deepEqual(
  {
    movable: editableText.movable,
    scalable: editableText.scalable,
    rotatable: editableText.rotatable,
    allowColorChoice: editableText.allowColorChoice,
    rotation: editableText.rotation,
  },
  {
    movable: true,
    scalable: true,
    rotatable: true,
    allowColorChoice: true,
    rotation: 30,
  },
);

// A config over the field cap must still be truncated, not throw or silently
// keep everything - this is the whole point of MAX_FIELDS.
const overCap = normalize({
  photoFields: Array.from({ length: 250 }, (_, index) => ({
    id: `slot-${index + 1}`,
  })),
});
assert.equal(overCap.photos.length, 200);

// ---------------------------------------------------------------------------
// Storefront source pinning - behavior that isn't reachable by calling
// normalize() alone (DOM wiring, purchase gating, cart/add.js contract,
// draft persistence, and the defensive fixes added in this pass).
// ---------------------------------------------------------------------------

for (const token of [
  "data-cw-save",
  "_Personalised Preview",
  "showProductPreview(previewUrl)",
  "cartwala-designs",
  "putFile(productForm, state.field.label, state.file)",
  "cart/add.js",
  "new FormData(productForm)",
  "const constrainPhoto",
  "hideBuyNow",
  "setPurchaseReady(false)",
  "cart-drawer,cart-icon-bubble",
  "showCartPreview(previewUrl, designId)",
  "allowColorChoice",
  "cw-personalizer__text-handle--rotate",
  "field?.movable === true",
  "const initializeMugPreview = (root) =>",
  "cartwala:preview-ready",
  "const panelCount = 56",
])
  assert.ok(
    storefront.includes(token),
    `Storefront behavior token is present: ${token}`,
  );
assert.doesNotMatch(storefront, /data-cw-preview/);

// Defensive fixes: a shared field-count constant instead of a bare literal
// repeated at every call site, a crypto.randomUUID() fallback so a missing
// secure context can't hard-crash setup, and one broken product block can no
// longer take down every other personalizer block on the page.
assert.match(storefront, /const MAX_FIELDS = 200;/);
assert.match(storefront, /const MAX_FONTS = 50;/);
assert.match(storefront, /const createId = \(\) =>/);
assert.doesNotMatch(
  storefront,
  /return createId\(\)\}catch/,
  "createId() must not call itself - this was a real recursion bug introduced and caught during this refactor",
);
assert.match(storefront, /root\.dataset\.cwReady = "true";/);
assert.match(
  storefront,
  /Cartwala personalizer failed to initialize for this block\./,
);

const storefrontCss = fs.readFileSync(
  "extensions/cartwala-personalizer/assets/cartwala-personalizer.css",
  "utf8",
);
assert.match(storefrontCss, /--cw-slot-icon/);
assert.match(storefrontCss, /min-width: 0/);
assert.doesNotMatch(storefrontCss, /min-width:min\(190px,85%\)/);
assert.match(storefrontCss, /\.cw-mug-preview__panel/);
assert.match(storefrontCss, /perspective: 900px/);
assert.match(storefrontCss, /\.cw-mug-gallery-host > :not\(\.cw-mug-preview\)/);
assert.match(storefrontCss, /--cw-mug-handle-colour/);
assert.match(storefrontCss, /--cw-mug-rim-colour/);
assert.doesNotMatch(
  storefrontCss,
  /\.cw-mug-preview__rim[\s\S]{0,500}translateZ\(/,
  "Mug rim must stay attached to the rotating mug instead of moving in depth",
);
assert.match(storefront, /const mountPreviewInGallery = \(\) =>/);
assert.match(storefront, /mugModel === "love-handle"/);
assert.match(storefront, /root\.dataset\.productKind === "mug"/);

const personalizerBlock = fs.readFileSync(
  "extensions/cartwala-personalizer/blocks/personalizer.liquid",
  "utf8",
);
assert.match(personalizerBlock, /product\.tags contains 'cw-mug'/);
assert.match(personalizerBlock, /data-cw-mug-preview/);
assert.match(personalizerBlock, /document\.getElementById\('cw-mug-dialog-/);

const mugGallery = fs.readFileSync(
  "extensions/cartwala-personalizer/blocks/mug-design-gallery.liquid",
  "utf8",
);
assert.match(mugGallery, /paginate collection\.products/);
assert.match(mugGallery, /cw-mug-birthday/);
assert.match(mugGallery, /mug_gallery\.start_design/);
assert.match(mugGallery, /cartwala-mug-gallery\.css/);

const adminHome = fs.readFileSync("app/routes/app._index.tsx", "utf8");
assert.match(adminHome, /Mug product setup/);
assert.match(adminHome, /productVariantsBulkUpdate/);
assert.match(adminHome, /MUG_CATEGORY_TAGS/);
assert.match(adminHome, /8\.5 × 3\.5 inches/);

const cart = fs.readFileSync(
  "extensions/cartwala-personalizer/assets/cartwala-cart-preview.js",
  "utf8",
);
assert.match(cart, /cart\.js/);
assert.match(cart, /_Personalised Preview/);
assert.match(cart, /draftPreview/);
assert.match(cart, /cart-drawer-item/);
assert.match(cart, /rowKey/);
assert.match(cart, /CartDrawer-Item\|CartItem/);
assert.match(cart, /const property=safePreviewUrl/);
assert.match(cart, /return draftPreview/);
assert.match(cart, /if\(matches\.length===1\)return matches\[0\]/);

const selectionBox = fs.readFileSync(
  "extensions/cartwala-personalizer/assets/cartwala-selection-box.js",
  "utf8",
);
assert.match(selectionBox, /const coverScale=Math\.max\(vw\/nw,vh\/nh\)/);
assert.match(selectionBox, /const photoWidth=nw\*coverScale\*zoom/);
assert.match(selectionBox, /const photoHeight=nh\*coverScale\*zoom/);

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
assert.match(
  admin,
  /form\.set\("config", JSON\.stringify\(configRef\.current\)\)/,
);
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
// PSD replacement is transactional: newly uploaded assets are rolled back on
// failure, while one prior working revision is retained for recovery.
assert.match(admin, /personalizer_asset_registry/);
assert.match(admin, /if \(!committed && uploadedIds\.length\)/);
assert.match(
  admin,
  /previous: oldRegistry\.current \?\? legacyVersion\(oldConfig\)/,
);
assert.match(
  admin,
  /const newlyRetired = retireAssets\(oldRegistry\.previous\)/,
);
assert.match(admin, /Date\.parse\(retired\.deleteAfter\) > Date\.now\(\)/);
assert.match(admin, /intent === "restorePsdRevision"/);
assert.match(admin, /Previous PSD template restored safely/);
assert.match(admin, /Restore previous PSD template/);
assert.match(admin, /placeholder: \(text \|\| "Your Text"\)/);
assert.match(admin, /matchUploadedFont/);
assert.match(admin, /Upload the missing font file/);

assert.match(storefront, /state\.field\.placeholder \|\| state\.field\.label/);
assert.match(storefront, /classList\.toggle\(\s*"is-placeholder"/);
assert.match(storefront, /font-display:swap/);

const printMetadata = fs.readFileSync(
  "extensions/cartwala-personalizer/assets/cartwala-print-metadata.js",
  "utf8",
);
assert.doesNotMatch(printMetadata, /field\.defaultValue/);

const liquid = fs.readFileSync(
  "extensions/cartwala-personalizer/blocks/personalizer.liquid",
  "utf8",
);
const publicNamespace =
  "product.metafields.cartwala_personalizer.personalizer_config.value";
const appNamespace =
  "product.metafields['app--340764327937'].personalizer_config.value";
assert.ok(
  liquid.indexOf(publicNamespace) >= 0 &&
    liquid.indexOf(publicNamespace) < liquid.indexOf(appNamespace),
  "The stable storefront namespace must be read before the legacy app namespace",
);

const personalizerConfig = fs.readFileSync(
  "app/lib/personalizer-config.ts",
  "utf8",
);
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
assert.match(shopifyFiles, /export async function deleteShopifyFiles/);
assert.match(shopifyFiles, /fileDelete\(fileIds: \$fileIds\)/);

const assetRegistry = fs.readFileSync(
  "app/lib/personalizer-assets.server.ts",
  "utf8",
);
assert.match(assetRegistry, /schemaVersion: 1/);
assert.match(assetRegistry, /current: PersonalizerAssetVersion \| null/);
assert.match(assetRegistry, /previous: PersonalizerAssetVersion \| null/);
assert.match(assetRegistry, /export const RETIRED_ASSET_DAYS = 30/);

const psdImport = fs.readFileSync("app/lib/psd-import.ts", "utf8");
assert.match(psdImport, /Number\(transform\[4\]\) \+ textLeft/);
assert.match(psdImport, /const psdLayerAlphaBounds/);
assert.match(psdImport, /if \(alphaUsesDocumentCoordinates\) return alpha/);
// CMYK fix: a real 4-channel CMYK color used to be matched by the "only K is
// present" branch and rendered as a flat grayscale, silently dropping C/M/Y.
assert.match(psdImport, /\["c", "m", "y", "k"\]\.every/);

console.log(
  "Personalizer QA passed: dynamic PSD fields, 13/50-slot configs, field-count cap, purchase gating, preview/save persistence, original files, cart drawer/page preview contracts, and the admin-module + bug-fix refactor.",
);
