# Cartwala Gift Personalizer V5

Shopify product personalizer for photo gifts. Each product has its own visual template with any mix of photo slots, text fields, print-file uploads and Canva links.

## Merchant workflow

1. Open the app and choose a Shopify product.
2. Upload one layered PSD to create every photo slot, transparent mask, text field and the product overlay automatically. There is no fixed photo/text count.
3. Name replaceable photo or smart-object layers `PHOTO_1`, `PHOTO_2`, `UPLOAD_1`, and so on. All visible Photoshop text layers become editable; prefix decorative text with `STATIC_` or `LOCKED_`.
4. Review the imported visual template and save it.

The original manual workflow remains available:

1. Upload the transparent product artwork/overlay.
2. Add the required number of photo slots in one action (tested with 13 and 50 slots).
3. Drag numbered slots on the visual artwork editor. Set exact X, Y, width and height values where needed.
4. Upload a transparent mask for each slot or paste its Shopify CDN URL.
5. Add text, design-file and Canva-link fields. Upload custom fonts when needed.
6. Save configuration.

The CSV importer accepts one row per photo slot and groups rows by `product_handle`. See `cartwala-personalizer-template.csv`.

## Customer workflow

- The normal product image appears first.
- **Customize Now** opens the editor.
- Every photo upload button appears in its mapped artwork slot.
- Customers can drag photos and use pinch/mouse-wheel zoom without a visible zoom slider. Rotation appears only when enabled for that slot.
- **Preview & Save** generates the preview, saves the draft, closes the editor and replaces the product image with the personalised preview.
- **Edit Again** restores the design.
- Add to cart is completely hidden until required fields are complete and **Preview & Save** succeeds. Dynamic **Buy it now** is always removed on personalised products.
- Original photo/design files, customer text, Canva links, design ID and the generated preview are attached as line-item properties.
- The cart-preview app embed maps line keys, variants and cart positions so both full-cart and cart-drawer thumbnails use the exact personalised preview.

## Verification

`npm run verify` runs lint, TypeScript checks, the 13/50-slot contract test, JavaScript syntax checks and the production build.

Use a development store for the final theme-specific cart and checkout test. Cart markup varies between themes; the included cart embed covers common Shopify cart rows and can be extended for a custom theme.
