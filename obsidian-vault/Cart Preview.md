---
tags: [storefront, theme-extension, cart]
---

# Cart Preview — App Embed

Files: `extensions/cartwala-personalizer/blocks/cart-preview.liquid`, `assets/cartwala-cart-preview.js`. Theme app extension block, `target: "body"` — a **global app embed**, enabled once per theme under Theme Editor → App embeds (not per-product like the personalizer block).

## Why this exists

Shopify's cart / cart-drawer templates render each line item's image from the **product's own image**, not from anything in line-item properties. Since Cartwala's whole point is "the cart should show the customer's personalized version," something has to reach into the rendered cart DOM after the fact and swap the `<img>` src. That's this script's entire job.

## Mechanism

1. Runs a guarded singleton (`window.cartwalaCartPreviewLoaded`) so it never double-attaches even if the embed script is injected more than once.
2. Watches the whole `document.body` with a `MutationObserver` (`childList`, `subtree`) and re-runs on relevant theme events (`shopify:section:load`, `cart:updated`, `cart:refresh`, `product:added`, `pageshow`) — debounced 100ms via `schedule()`, with a `running`/`pending` guard so overlapping updates coalesce instead of racing.
3. On each pass (`update()`):
   - Finds every cart row on the page by a broad selector union (`[data-cart-line-key]`, `[data-line-key]`, `[data-cart-item]`, `cart-drawer-item`, `.cart-item`, `.drawer__cart-item`) — this list of selectors is the "common Shopify cart rows" coverage the README describes; custom themes may need this list extended.
   - Fetches `cart.js` fresh (`cache: 'no-store'`) to get the authoritative current line items.
   - For each DOM row, resolves **which cart line item it represents** (`rowItem`) using a fallback chain: explicit `data-cart-line-key`/`data-line-key` → line `key` match; else variant ID scoped to rows with a *unique* variant match; else product handle parsed out of the row's product link, again only if unique; else positional index as last resort (`rowIndex`, itself smart about nested-row false positives and 1-based `CartDrawer-Item-N`/`CartItem-N` id conventions).
   - Resolves the **preview URL** for that item (`previewValue`): prefers `item.properties['_Personalised Preview']` if it's a safe `https:`/`blob:` URL (`safePreviewUrl` — rejects anything else, e.g. blocks `javascript:`/`data:` injection via a maliciously-set property), else falls back to the **IndexedDB draft** for that item's `_Cartwala Design ID` (`draftPreview`) — this is the bridge for the moment right after add-to-cart, before Shopify's file property upload has actually resolved to a public CDN URL.
   - Swaps the row's `<img>` src (`replaceImage`), stripping `srcset`/`sizes` (including on any wrapping `<picture><source>`) so responsive-image logic can't override the swap, and marks it `data-cw-preview` so it's skipped if already correct.

## Handoff contract with the personalizer block

The two scripts only agree on:
- `_Cartwala Design ID` (line-item property) = IndexedDB key suffix `cart:${designId}` written by `persist()` in the personalizer script.
- `_Personalised Preview` (line-item property) — the durable, Shopify-hosted answer once available.

Everything else (matching a DOM row to a cart line, timing, retry) is this script's independent responsibility — the personalizer script never manipulates the cart page/drawer DOM itself except for the three immediate best-effort attempts right after its own `cart/add.js` call (`showCartPreview` in `cartwala-personalizer.js`), which exists purely to reduce perceived latency before this embed's own MutationObserver-driven pass catches up.

## Known coverage limits (from README + code)

> "Cart markup varies between themes; the included cart embed covers common Shopify cart rows and can be extended for a custom theme."

Concretely, a theme is only covered out of the box if its cart rows match one of the `rowSelector` patterns above and its image lives at `.cart-item__image` or a bare `img` inside that row.
