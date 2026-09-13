---
tags: [architecture]
---

# Architecture

# Three independent runtimes

Cartwala is not one app in the "single server" sense — it's a Shopify app with **three separate execution contexts** that never talk to each other directly. They only agree on one shared contract: the JSON shape of the personalizer config, stored in a metafield.

```
┌─────────────────────────┐        writes/reads         ┌────────────────────────────┐
│   Admin app (Node/SSR)   │ ───────────────────────────▶│ Product metafield          │
│  app/routes/app._index   │      $app:personalizer_     │ $app:personalizer_config   │
│  React Router + Polaris  │      config (JSON)          │ (admin: rw, storefront: r) │
└─────────────────────────┘                              └────────────────────────────┘
                                                                       │
                                                            reads via Liquid at render
                                                                       ▼
┌───────────────────────────────────────┐   canvas raster,   ┌──────────────────────┐
│ Storefront theme block (browser JS)    │   cart/add.js       │ Shopify cart          │
│ personalizer.liquid + .js (per-product)│ ───────────────────▶│ (line item properties)│
└───────────────────────────────────────┘                     └──────────────────────┘
                                                                       │
                                                          polls cart.js, patches DOM
                                                                       ▼
                                                        ┌──────────────────────────────┐
                                                        │ Cart-preview app embed (body) │
                                                        │ cart-preview.liquid + .js     │
                                                        └──────────────────────────────┘
```

1. **Admin app** — a normal embedded Shopify app screen. Merchant picks a product, builds a template (manually or via PSD import), the config is normalized server-side and written to the product's `personalizer_config` metafield via `metafieldsSet`.
2. **Storefront personalizer block** (`target: "section"`, theme app extension) — added once per product template in the theme editor. At page render, Liquid pulls the *same* metafield (public-read) and inlines it as a `data-cw-config` JSON attribute. Vanilla JS (`cartwala-personalizer.js`, no framework, no build step — it's a hand-written IIFE) builds the editor dialog, drag/zoom/rotate interactions, canvas compositing, and hijacks the theme's add-to-cart form submit.
3. **Cart-preview app embed** (`target: "body"`, theme app extension, added once per theme in "App embeds") — a MutationObserver-driven script that runs everywhere in the storefront, polls `cart.js`, matches DOM cart rows to cart line items, and swaps in the personalized preview image (from the line-item property URL, or from IndexedDB for very fresh adds).

Both storefront pieces live in the **same extension** (`extensions/cartwala-personalizer`) but are two separate theme blocks with two separate `{% schema %}` targets — the merchant must enable both independently (see `START-HERE-WINDOWS.txt`).

## Why "config is just JSON in a metafield" matters

- No app database table for product config — [[Data Model]] shows Prisma only stores Shopify `Session` rows (OAuth), not personalizer data.
- The admin UI and the storefront JS **each carry their own copy of the config normalizer** (`normalizeConfig` in `app._index.tsx` vs `normalize` in `cartwala-personalizer.js`). They must be kept in sync by hand — there's no shared module because the storefront asset is a plain script with no bundler. `scripts/verify-personalizer.mjs` guards this by literally `vm.runInNewContext`-ing the storefront's `normalize` function out of the raw JS source and asserting on its behavior — see [[Verification and Tooling]].
- Because the metafield is `storefront: public_read`, anyone can read a product's personalizer config unauthenticated (it's not secret — masks/overlay URLs are public CDN images anyway).

## Cross-cutting technique: canvas compositing happens client-side, twice conceptually

The storefront JS builds the **customer-visible preview** entirely in a `<canvas>` in the browser: draws each photo layer (with mask via CSS `clip`+`globalCompositeOperation: destination-in`), draws text layers with the configured font/color/position, then draws the transparent overlay PNG on top. That flattened PNG becomes:
- the new product-page hero image (`showProductPreview`)
- a blob attached to the cart form as a hidden file input property `_Personalised Preview`
- a record persisted to **IndexedDB** (`cartwala-designs` DB, `drafts` store) keyed by design ID, so the cart-preview embed can show it immediately after add-to-cart, before Shopify's CDN has processed the uploaded property image.

See [[Storefront Extension]] for the full render/compose pipeline and [[Cart Preview]] for how the two extensions hand off the same design via `_Cartwala Design ID`.
