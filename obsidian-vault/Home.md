---
tags: [overview]
---

# Cartwala Gift Personalizer

A Shopify embedded app that lets a merchant turn any product into a **photo personalization product** — customers upload their own photos/text into a merchant-defined visual template, get a live preview, and that preview + originals travel with the cart line to checkout.

Version in this codebase: **V5.0.3**. Built on the official `shopify-app-template-react-router` scaffold (React Router 7, Prisma, App Bridge, Polaris web components).

## Map of the vault

- [[Architecture]] — the three runtime pieces (admin app, storefront extension, cart-preview embed) and how data flows between them
- [[Data Model]] — where configuration actually lives (a single product metafield) and its shape
- [[Admin App]] — the merchant-facing React Router route that builds/saves the personalizer config
- [[PSD Import]] — the "upload one PSD, get a full template" pipeline
- [[Storefront Extension]] — the customer-facing editor injected into the product page
- [[Cart Preview]] — how the personalized image survives into cart drawer / cart page / checkout
- [[Merchant Workflow]]
- [[Customer Workflow]]
- [[Verification and Tooling]]
- [[Setup and Deployment]]
- [[Glossary]]

## One-paragraph mental model

Everything the app configures is stored as **one JSON blob** in a product metafield (`$app:personalizer_config`). The admin route reads/writes that blob via Shopify Admin GraphQL. The storefront theme extension reads the *same* blob (public-read scope) out of Liquid, renders an editor dialog, and when the customer finishes, it rasterizes a canvas preview client-side, uploads original files + the preview as cart line-item properties, and submits `cart/add.js` itself (intercepting the theme's normal `<form action="/cart/add">` submit). A second, independent theme app-embed block then patches cart/cart-drawer thumbnails to show that saved preview instead of the generic product image, because Shopify's cart UI doesn't know how to render a custom preview on its own.

## Key files

| Concern | File |
|---|---|
| Admin UI + save/upload/PSD-import actions | `app/routes/app._index.tsx` |
| Admin shell / product list loader | `app/routes/app.tsx` |
| Shopify app config, scopes, metafield definition | `shopify.app.toml` |
| Auth/session bootstrap | `app/shopify.server.ts` |
| DB schema (sessions only) | `prisma/schema.prisma` |
| Customer-facing editor (theme block) | `extensions/cartwala-personalizer/blocks/personalizer.liquid` + `assets/cartwala-personalizer.js` |
| Cart/cart-drawer preview patcher (app embed) | `extensions/cartwala-personalizer/blocks/cart-preview.liquid` + `assets/cartwala-cart-preview.js` |
| CI-less regression test | `scripts/verify-personalizer.mjs` |
| Bulk CSV template import format | `cartwala-personalizer-template.csv` |
