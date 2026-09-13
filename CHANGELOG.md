# @shopify/shopify-app-template-react-router

## Cartwala V5.0.4 admin code audit and refactor

Structural refactor of the admin app - no intended change to the merchant or customer-facing flows, only to code organization and to the specific bugs listed below. `npm run verify` must be run before deploying; it was not run as part of this change (see project notes).

- Split `app/routes/app._index.tsx` into `app/lib/personalizer-config.ts` (types, constants, `normalizeConfig`), `app/lib/psd-import.ts` (PSD layer/bounds/color helpers), and `app/lib/shopify-files.server.ts` (Shopify Files upload, consolidating the previously duplicated font/image upload-and-poll logic).
- Fixed: `uploadFont`, `uploadImage`, the CSV bulk importer, and the plain save action only checked each GraphQL mutation's own `userErrors` and never the response's top-level `errors`. A throttled or otherwise rejected request could come back reporting success with nothing actually saved.
- Fixed: a real 4-channel CMYK color from a PSD text layer was matched by the "K channel only" branch and rendered as a flat grayscale, silently dropping the C/M/Y channels. CMYK is now converted properly.
- Fixed: `overlayUrl`/`maskUrl`/custom font URLs accepted any `https://` host. They're now restricted to Shopify's own Files/CDN hosts, since every legitimate value already comes from this app's own uploads.
- Added: an unsaved-changes warning (`beforeunload`, plus a confirmation before switching products) - closing the tab mid-build previously lost all in-progress work silently.
- Added: numeric editor inputs (position/size/font size/etc.) now clamp on input instead of passing a bare `Number()` cast through, which could transiently render a slot or text preview at `NaN%`.
- Added: the CSV bulk importer now reports which rows didn't match a Shopify product handle instead of silently dropping them.
- Storefront (`extensions/cartwala-personalizer/assets/cartwala-personalizer.js`): replaced the repeated literal `200`/`50` field-count caps with named `MAX_FIELDS`/`MAX_FONTS` constants; added a `crypto.randomUUID()` fallback so a non-secure context can't hard-crash setup; wrapped each product block's initialization in its own `try/catch` so one broken block can no longer take down every other personalizer block on the page.
- `scripts/verify-personalizer.mjs` updated to match: points its source-pinning assertions at the new `app/lib/*` files, and adds assertions for each fix above.

## Cartwala V5.0.3 selected-photo controls and cart preview fix

- Shows Reset and Change photo only for the photo slot the customer selects.
- Reset now removes only the selected upload and restores its Upload photo prompt.
- Scales the upload icon and label responsively for small and large photo slots.
- Keeps Add to cart hidden until Preview & Save and permanently removes accelerated checkout.
- Stores every completed design preview under its unique design ID so multiple customised copies of the same product retain different cart images.
- Improves exact cart drawer and full cart row matching, with an immediate drawer-image fallback after add to cart.

## Cartwala V5.0.2 PSD text position fix

- Added a fallback for editable PSD text layers whose Photoshop pixel bounds are empty.
- Text position now comes from the PSD text transform and text box bounds.
- Corrected the sample bottle PSD photo order to Photo 1, Photo 2 and Photo 3.

## Cartwala V5.0.1 PSD save hotfix

- Fixed Save configuration using an older empty field state immediately after PSD auto import.
- PSD-imported photo and text fields are now submitted together through a reliable FormData snapshot.

## Cartwala V5 PSD auto templates and reliable cart previews

- Added one-file PSD template import with dynamic PHOTO/UPLOAD layer detection and no fixed photo count.
- Added automatic text-layer fields, original PSD ratio, positions, sizes, default text, fonts and colours.
- Added automatic transparent overlay and per-photo mask generation with Shopify Files upload.
- Changed personalised product purchase flow so Add to cart is hidden until Preview & Save and Buy it now stays removed.
- Improved desktop/mobile selection, drag, pinch/wheel zoom and minimum cover constraints.
- Improved exact personalised thumbnail matching in both cart drawers and full cart pages.

## Cartwala V4 dynamic template builder

- Replaced fixed personalization modes and the 10-field admin limit with add/remove/reorder controls.
- Added independent photo, text, design-file, and Canva-link fields per product.
- Added per-photo required and rotation settings; rotation transforms the uploaded photo only.
- Added mouse/touch dragging, mouse-wheel/pinch zoom, and optional photo rotation.
- Added custom font upload to Shopify Files and customer font selection.
- Added artwork ratios and multi-photo/multi-text preview composition.
- Added product pagination so stores with more than 250 products can be configured.
- Kept Add to cart and dynamic checkout locked until required fields are complete and Preview succeeds.

## 2026.09.03
- [#280](https://github.com/Shopify/shopify-app-template-react-router/pull/280) - Pin the React Router family to 7.18.2. 7.18.3 tightened action-origin validation to compare the full origin, which made every action return `400 Bad Request` under `shopify app dev` and, in production, behind TLS-terminating proxies that forward to the app over plain HTTP (`react-router-serve` never enables Express `trust proxy`). Fixes [#279](https://github.com/Shopify/shopify-app-template-react-router/issues/279).
- [#280](https://github.com/Shopify/shopify-app-template-react-router/pull/280) - Force `qs` to `^6.16.0` to clear [CVE-2026-82562](https://github.com/advisories/GHSA-x5fp-wj9c-mxmx) and [CVE-2026-82417](https://github.com/advisories/GHSA-4mjr-xmp4-gh2g), which reach the app transitively through `@react-router/serve` → `express@4`.

## 2026.02.09
- Add declarative product metafield definition and demonstrate metafield usage in the product creation flow
- Add declarative metaobject definition and demonstrate metaobject upsert in the product creation flow

## 2026.01.08
- [#170](https://github.com/Shopify/shopify-app-template-react-router/pull/170) - Update React Router minimum version to v7.12.0

## 2025.12.11

- [#151](https://github.com/Shopify/shopify-app-template-react-router/pull/151) Update `@shopify/shopify-app-react-router` to v1.1.0 and `@shopify/shopify-app-session-storage-prisma` to v8.0.0, add refresh token fields (`refreshToken` and `refreshTokenExpires`) to Session model in Prisma schema, and adopt the `expiringOfflineAccessTokens` flag for enhanced security through token rotation. See [expiring vs non-expiring offline tokens](https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/offline-access-tokens#expiring-vs-non-expiring-offline-tokens) for more information.

## 2025.10.10

- [#95](https://github.com/Shopify/shopify-app-template-react-router/pull/95) Swap the product link for [admin intents](https://shopify.dev/docs/apps/build/admin/admin-intents).

## 2025.10.02

- [#81](https://github.com/Shopify/shopify-app-template-react-router/pull/81) Add shopify global to eslint for ui extensions

## 2025.10.01

- [#79](https://github.com/Shopify/shopify-app-template-react-router/pull/78) Update API version to 2025-10.
- [#77](https://github.com/Shopify/shopify-app-template-react-router/pull/77) Update `@shopify/shopify-app-react-router` to V1.
- [#73](https://github.com/Shopify/shopify-app-template-react-router/pull/73/files) Rename @shopify/app-bridge-ui-types to @shopify/polaris-types

## 2025.08.30

- [#70](https://github.com/Shopify/shopify-app-template-react-router/pull/70/files) Upgrade `@shopify/app-bridge-ui-types` from 0.2.1 to 0.3.1.

## 2025.08.17

- [#58](https://github.com/Shopify/shopify-app-template-react-router/pull/58) Update Shopify & React Router dependencies.  Use Shopify React Router in graphqlrc, not shopify-api
- [#57](https://github.com/Shopify/shopify-app-template-react-router/pull/57) Update Webhook API version in `shopify.app.toml` to `2025-07`
- [#56](https://github.com/Shopify/shopify-app-template-react-router/pull/56) Remove local CLI from package.json in favor of global CLI installation
- [#53](https://github.com/Shopify/shopify-app-template-react-router/pull/53) Add the Shopify Dev MCP to the template

## 2025.08.16

- [#52](https://github.com/Shopify/shopify-app-template-react-router/pull/52) Use `ApiVersion.July25` rather than `LATEST_API_VERSION` in `.graphqlrc`.

## 2025.07.24

- [14](https://github.com/Shopify/shopify-app-template-react-router/pull/14/files) Add [App Bridge web components](https://shopify.dev/docs/api/app-home/app-bridge-web-components) to the template.

## July 2025

Forked the [shopify-app-template repo](https://github.com/Shopify/shopify-app-template-remix)

# @shopify/shopify-app-template-remix

## 2025.03.18

-[#998](https://github.com/Shopify/shopify-app-template-remix/pull/998) Update to Vite 6

## 2025.03.01

- [#982](https://github.com/Shopify/shopify-app-template-remix/pull/982) Add Shopify Dev Assistant extension to the VSCode extension recommendations

## 2025.01.31

- [#952](https://github.com/Shopify/shopify-app-template-remix/pull/952) Update to Shopify App API v2025-01

## 2025.01.23

- [#923](https://github.com/Shopify/shopify-app-template-remix/pull/923) Update `@shopify/shopify-app-session-storage-prisma` to v6.0.0

## 2025.01.8

- [#923](https://github.com/Shopify/shopify-app-template-remix/pull/923) Enable GraphQL autocomplete for Javascript

## 2024.12.19

- [#904](https://github.com/Shopify/shopify-app-template-remix/pull/904) bump `@shopify/app-bridge-react` to latest
-
## 2024.12.18

- [875](https://github.com/Shopify/shopify-app-template-remix/pull/875) Add Scopes Update Webhook
## 2024.12.05

- [#910](https://github.com/Shopify/shopify-app-template-remix/pull/910) Install `openssl` in Docker image to fix Prisma (see [#25817](https://github.com/prisma/prisma/issues/25817#issuecomment-2538544254))
- [#907](https://github.com/Shopify/shopify-app-template-remix/pull/907) Move `@remix-run/fs-routes` to `dependencies` to fix Docker image build
- [#899](https://github.com/Shopify/shopify-app-template-remix/pull/899) Disable v3_singleFetch flag
- [#898](https://github.com/Shopify/shopify-app-template-remix/pull/898) Enable the `removeRest` future flag so new apps aren't tempted to use the REST Admin API.

## 2024.12.04

- [#891](https://github.com/Shopify/shopify-app-template-remix/pull/891) Enable remix future flags.

## 2024.11.26

- [888](https://github.com/Shopify/shopify-app-template-remix/pull/888) Update restResources version to 2024-10

## 2024.11.06

- [881](https://github.com/Shopify/shopify-app-template-remix/pull/881) Update to the productCreate mutation to use the new ProductCreateInput type

## 2024.10.29

- [876](https://github.com/Shopify/shopify-app-template-remix/pull/876) Update shopify-app-remix to v3.4.0 and shopify-app-session-storage-prisma to v5.1.5

## 2024.10.02

- [863](https://github.com/Shopify/shopify-app-template-remix/pull/863) Update to Shopify App API v2024-10 and shopify-app-remix v3.3.2

## 2024.09.18

- [850](https://github.com/Shopify/shopify-app-template-remix/pull/850) Removed "~" import alias

## 2024.09.17

- [842](https://github.com/Shopify/shopify-app-template-remix/pull/842) Move webhook processing to individual routes

## 2024.08.19

Replaced deprecated `productVariantUpdate` with `productVariantsBulkUpdate`

## v2024.08.06

Allow `SHOP_REDACT` webhook to process without admin context

## v2024.07.16

Started tracking changes and releases using calver
