---
tags: [setup, deployment]
---

# Setup and Deployment

## Local dev (Windows-specific instructions, `START-HERE-WINDOWS.txt`)

Requirements: Node ≥20.19 (`<22 || >=22.12` per `package.json` engines), Shopify CLI, Chrome/Edge.

```
npm install
npm run setup      # prisma generate && prisma migrate deploy
shopify app dev --use-localhost
```
Press `p` once the CLI shows "Ready, watching for changes." If `npm install` blocks lifecycle scripts:
```
npm install-scripts approve @parcel/watcher @prisma/client @prisma/engines esbuild prisma unrs-resolver
npm run setup
```
When prompted, select the existing **Cartwala Gift Personalizer** app / org / `cartwala-app-test-store.myshopify.com` — do not create a new app (the metafield definitions and `client_id` in `shopify.app.toml` are already tied to this specific app registration).

## Required app scopes

`read_products, write_products, read_files, write_files` (`shopify.app.toml`) — Files access is needed because PSD-derived overlays/masks and custom fonts are uploaded to Shopify Files (see [[Admin App]], [[PSD Import]]).

## Theme setup checklist (once per theme — see [[Merchant Workflow]])

1. Online Store → Themes → Customize → open a product template → add the **Cartwala Personalizer** block.
2. Theme Editor → App embeds → enable **Cartwala cart previews**.
3. Save.

## Final store test (manual, not automated — see [[Verification and Tooling]])

1. Open a configured product, click Customize Now.
2. Fill all required fields, click Preview & Save.
3. Confirm the personalized image replaces the product image.
4. Add to cart; confirm the same personalized image shows in cart drawer and full cart.
5. Place one real test order; confirm original uploaded files + the generated preview appear as line-item properties on the order.

## Production

- `npm run build` → `react-router build`.
- `npm run start` → `react-router-serve ./build/server/index.js`.
- `docker-start` → `npm run setup && npm run start` (used by the provided `Dockerfile`).
- `shopify app deploy` pushes the extension + `shopify.app.toml` config (metafield definition, scopes, webhooks) to Shopify.

## Notable dependency/version pins (see `CHANGELOG.md`)

- React Router pinned to exactly `7.18.2` — `7.18.3` tightened action-origin validation in a way that breaks `shopify app dev` and any TLS-terminating proxy setup (React Router serve never sets Express `trust proxy`). Do not bump without re-checking this.
- `qs` forced to `^6.16.0` via `overrides`/`resolutions`/pnpm `overrides` (three different mechanisms, for npm/yarn/pnpm compatibility) to clear two 2026 CVEs reaching the app transitively through `@react-router/serve → express@4`.
- API version `2025-10`+ line, currently `ApiVersion.July26` in `app/shopify.server.ts` / `shopify.app.toml` webhooks at `2026-07`.
