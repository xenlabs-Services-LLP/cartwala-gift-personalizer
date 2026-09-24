# Signature Day order downloads

`sections/signature-day-editor.liquid` is the staged product editor for the
unpublished Shopify theme. It is stored here with the app changes so the
storefront, order, customer PDF and admin Print Files integration can be
reviewed together. It is not deployed by this app's theme extension.

Before enabling customer checkout:

1. Deploy the app migration and app proxy; grant its added `write_app_proxy`
   scope and the customer order-status extension's network capability.
2. Create the Signature Day product's size × print-side variants with actual
   prices: front ₹150; front and back ₹180. Configure the 11+ shirt discount
   of ₹20 per shirt for those variants (front ₹130; front and back ₹160).
   Verify the discount works across mixed sizes and both print-side options.
3. Add the section to the correct draft product template in the unpublished
   theme. The `Confirm design` button refuses checkout until matching
   available variants exist.
4. Run a paid test order. Verify the customer order-status PDF after sign-in
   and A4 PNG/JPEG plus originals in the embedded app's Print Files page.

The customer PDF contains shirt mockups; the merchant receives separate A4
2480 × 3508 px print images and original uploads. Shopify's customer-account
extension must be added to the order-status page in checkout editor.
