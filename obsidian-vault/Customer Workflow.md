---
tags: [workflow]
---

# Customer Workflow

Backed by [[Storefront Extension]] and [[Cart Preview]].

1. Product page loads with the **normal** product image; a **Customize Now** button appears (only if `personalizer_config.enabled` and the block is placed on this template).
2. Clicking it opens a `<dialog>` editor. Every photo slot appears as a numbered upload prompt positioned directly over its mapped location on the artwork.
3. Customer uploads a photo per slot; can drag to reposition and pinch/mouse-wheel to zoom (1×–5×), with rotation available only where the merchant enabled it for that slot. Cover-fit constraints prevent dragging empty space into view.
4. Text fields, design-file uploads, and Canva-link fields (whichever the merchant configured) are filled in alongside.
5. **Add to cart is completely hidden** (and dynamic **Buy it now** permanently removed) until every required field is satisfied and a preview has been generated — enforced by `setPurchaseReady`/`isReady()` in the storefront JS.
6. **Preview & Save**: composites everything into one PNG client-side, replaces the product's main image with it, closes the dialog, and unlocks Add to cart.
7. Add to cart: the storefront script itself submits to `cart/add.js` (not the theme's default handler), attaching the original photo(s), text, design files, Canva link(s), a design ID, and the preview PNG as line-item properties, then opens the cart drawer and immediately tries to show the personalized thumbnail there.
8. **Edit Again**: reopening the editor on the same product/session restores the exact prior design (photos, positions, zoom, rotation, text, files, links) from an IndexedDB draft valid for 7 days — no re-uploading required.
9. In the cart and cart drawer, the independent cart-preview app embed continuously keeps each personalized line's thumbnail in sync with its saved preview (or the IndexedDB draft, if the durable upload hasn't resolved yet).
10. At checkout / in the order, the original uploaded photo(s)/files, customer text, Canva link(s), the design ID, and the generated preview are all present as line-item properties for fulfillment.
