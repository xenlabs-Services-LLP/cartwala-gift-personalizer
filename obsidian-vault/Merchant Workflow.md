---
tags: [workflow]
---

# Merchant Workflow

Two ways to configure a product's template — see [[Admin App]] and [[PSD Import]] for the mechanics behind each step.

## Fast path: PSD auto-import

1. Open the app, choose a product.
2. Upload one layered PSD.
3. Layer naming conventions drive everything:
   - `PHOTO_1`, `PHOTO_2`, … or `UPLOAD_1`, `UPLOAD_2`, … → photo slots (that layer's own alpha = the slot's mask).
   - Any other visible text layer → an editable text field automatically.
   - `STATIC_…` / `LOCKED_…` text → stays fixed, baked into the overlay.
4. Review the auto-generated template in the same visual editor the manual path uses, adjust anything, click **Save configuration**.

Full authoring rules: [[PSD Import]] and `PSD-LAYER-GUIDE.txt`.

## Manual path (still fully supported)

1. Upload the transparent product artwork/overlay PNG.
2. Add the required number of photo slots in one action (the app is explicitly tested at 13 and 50 slots — see [[Verification and Tooling]]).
3. Drag numbered slots on the visual artwork editor; set exact X/Y/width/height where pixel precision matters.
4. Upload a transparent mask per slot, or paste its Shopify CDN URL directly.
5. Add text / design-file / Canva-link fields as needed; upload custom fonts if the storefront needs to render a non-system typeface exactly.
6. Save configuration.

## Bulk setup

`cartwala-personalizer-template.csv` is the accepted shape — **one row per photo slot**, grouped by `product_handle`:

```
product_handle,enabled,ratio,overlay_url,slot_label,x,y,width,height,mask_url,required,rotation
baby-photo-frame,true,1:1,https://cdn.shopify.com/overlay.png,Photo 1,25,25,20,20,https://cdn.shopify.com/mask-1.png,true,false
```

Imported via the admin UI's bulk importer → `intent=bulkImport` action, batched 25 metafields per GraphQL call, up to 1000 rows total in one import.

## Theme setup (one-time per theme)

Two **separate** theme app extension blocks must both be enabled — forgetting either breaks the feature silently:
1. Add the **"Cartwala Personalizer"** section block to the product template (Theme Editor → the product page → Add block).
2. Enable the **"Cartwala cart previews"** app embed (Theme Editor → App embeds).

See [[Setup and Deployment]] for the full first-time setup checklist.
