---
tags: [admin, react-router]
---

# Admin App

Route file: `app/routes/app._index.tsx` (loader, action, and the whole editor UI). Parent shell: `app/routes/app.tsx`.

> **V5.0.4 refactor note:** config types/validation, PSD-parsing math, and the Shopify Files upload plumbing that used to be inlined in this one file now live in `app/lib/personalizer-config.ts`, `app/lib/psd-import.ts`, and `app/lib/shopify-files.server.ts` respectively. The route file imports from all three. See [[Data Model]] and [[PSD Import]] for what moved where, and `CHANGELOG.md` (V5.0.4 entry) for the bug fixes that came with the split — most notably that every metafield/file-upload mutation now checks the GraphQL response's top-level `errors`, not just each mutation's own `userErrors`, so a throttled request can no longer be reported as a silent success.

## Shell (`app/routes/app.tsx`)

- `loader`: authenticates (`authenticate.admin`), then pages through **all** shop products (`first: 250` + cursor loop) fetching `id, title, handle` and the `personalizer` metafield's `jsonValue` for each, sorted by `UPDATED_AT desc`. No pagination limit on total products — this is a full-catalog fetch on every admin page load.
- Renders `<AppProvider>` + `<s-app-nav>` (single nav link "Personalizer") + `<Outlet/>`.
- Standard `boundary.error` / `boundary.headers` wiring so React Router surfaces Shopify's auth-redirect responses correctly.

## Index route (`app._index.tsx`)

### Loader
Trivial — the product list actually comes from the parent route's loader via `useRouteLoaderData<typeof appLoader>("routes/app")`.

### Action — five intents multiplexed on one route

All via `useFetcher`, distinguished by `data.get("intent")`:

1. **`uploadFont`** — validates extension (`woff|woff2|ttf|otf`) and size (≤10MB), stages + uploads to Shopify Files as a `GenericFile` (see below), returns `{ id, name, url }` to be appended to `config.customFonts` client-side.
2. **`uploadImage`** — validates extension (`png|jpe?g|webp`) and size (≤25MB), uploads as `MediaImage`, returns `{ url, target }` where `target` is either `"overlay"` or a photo-field id (so the reducer knows whether to set `config.overlayUrl` or a specific field's `maskUrl`).
3. **`psdImport`** — see [[PSD Import]]. Takes a pre-rendered overlay PNG + per-slot mask PNGs (rendered client-side from the parsed PSD) plus the detected field config, uploads all images to Shopify Files, and returns the finished `Config`.
4. **`bulkImport`** — CSV-driven bulk save: takes `entries: [{ productId, config }]` (already resolved to product GIDs and Config objects client-side), batches `metafieldsSet` calls 25 at a time (Shopify's per-call metafield limit), up to 1000 entries total.
5. **default (save)** — validates `productId` starts with `gid://shopify/Product/`, that `config` parses and normalizes, that if `enabled` there's at least one field of any kind, then a single `metafieldsSet` mutation.

### Shopify Files upload pattern (`uploadFont` / `uploadImage`)

Both follow the same three-step GraphQL dance, because Shopify Files require external upload before they can be referenced:
1. `stagedUploadsCreate` → get a signed target URL + form parameters.
2. `fetch(target.url, { method: "POST", body: FormData(...parameters, file) })` — direct upload to Shopify's storage, bypassing the app server.
3. `fileCreate` with `originalSource: target.resourceUrl` → registers the file in Shopify Files. If the returned file has no immediate URL (still processing), poll `node(id)` up to 12× (font, 500ms apart) or 20× (image) before giving up.

This same three-step pattern is reused by [[PSD Import]] to upload the generated overlay and per-slot masks.

### Client state (React component `PersonalizerHome`)

- One `config` state object per selected product, seeded from `normalizeConfig(selected.personalizer.jsonValue ?? emptyConfig)`.
- Five `useFetcher()` instances (save/font/image/bulk/psd), each with a `useEffect` that toasts success/error via `shopify.toast.show(...)` (App Bridge) and folds returned data into `config`.
- `configRef` — a ref mirror of `config`, kept current via effect, used so the PSD-import/save flows can read the *latest* config synchronously inside async upload callbacks without stale-closure bugs (this is the exact bug fixed in `CHANGELOG.md` V5.0.1 — "Save configuration using an older empty field state immediately after PSD auto import").
- Visual artwork editor: drag-position numbered slots on a canvas-like editor, `addCount` state for "add N photo slots at once" (tested up to 50 — see [[Verification and Tooling]]).
- CSV bulk importer: parses `cartwala-personalizer-template.csv`-shaped rows client-side, groups by `product_handle`, resolves handles to product GIDs (must already exist in `products` loader data), builds `entries` and submits via `bulkFetcher`.

## Legacy manual workflow vs PSD workflow

Both produce the same `Config` — the admin UI doesn't force one path. A merchant can:
- **Manual**: upload overlay once, add N photo slots in one action, drag each to position, set exact x/y/w/h, upload/paste a mask URL per slot, add text/file/link fields, upload custom fonts, save.
- **PSD auto-import**: upload one layered PSD; the app derives everything (see [[PSD Import]]) and pre-fills the same editor, which the merchant then reviews/tweaks before saving.
