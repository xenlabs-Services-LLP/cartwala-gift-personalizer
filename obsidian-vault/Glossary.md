---
tags: [reference]
---

# Glossary

- **Personalizer config** — the single JSON document (`Config` type) describing one product's template: photo/text/file/link fields, overlay, canvas ratio, fonts. See [[Data Model]].
- **`$app:personalizer_config`** — the product metafield namespace/key holding the personalizer config. Admin read/write, storefront public-read.
- **Overlay** — a transparent PNG drawn on top of all customer content at render time (the product's decorative frame/branding).
- **Photo slot / photo field** — a positioned, optionally masked area the customer uploads a photo into.
- **Mask** — a transparency PNG applied to a photo slot via `destination-in` compositing so the uploaded photo takes the slot's exact shape.
- **Design ID** — a `crypto.randomUUID()` minted per completed Preview & Save, correlating a cart line's `_Cartwala Design ID` property to an IndexedDB draft record, and to the same product page across "Edit Again" sessions.
- **Draft** — an IndexedDB record (`cartwala-designs` DB, `drafts` store) holding a design's files, transform state (x/y/scale/angle), text, and rendered blob. Two keys point at the same record: a path+product+config key (for Edit Again) and `cart:<designId>` (for the cart-preview embed's immediate fallback).
- **PSD auto-import** — uploading one layered Photoshop file to auto-generate the whole template. See [[PSD Import]].
- **`normalizeConfig` / `normalize`** — the two independently-maintained (admin TS vs storefront vanilla JS) functions that sanitize/clamp/migrate raw config JSON into a safe `Config`. Must be kept behaviorally identical by hand.
- **App embed vs section block** — two different theme-extension surfaces used here: the personalizer editor is a *section block* placed once per product template; the cart-preview patcher is a *body app embed* enabled once per theme, independent of any specific template.
- **Line-item property** — Shopify's mechanism for attaching arbitrary key/value data (including files) to a cart/order line. Properties prefixed `_` are hidden from customer-facing cart/order displays by Shopify convention. This app stores nearly everything (original files, text, preview, design ID) this way rather than in its own database.
- **Staged upload** — Shopify's two-step upload protocol (`stagedUploadsCreate` → direct POST to the returned signed URL → `fileCreate`) required to get any file into Shopify Files from server-side code.
