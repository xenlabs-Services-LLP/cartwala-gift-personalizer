---
tags: [storefront, theme-extension, liquid]
---

# Storefront Extension — Personalizer Block

Files: `extensions/cartwala-personalizer/blocks/personalizer.liquid`, `assets/cartwala-personalizer.js`, `assets/cartwala-personalizer.css`. Theme app extension block, `target: "section"`, `enabled_on: { templates: ["product"] }`.

This is a **hand-written vanilla-JS IIFE** — no React, no bundler, no npm deps at runtime (the whole thing must ship as static assets a theme can load directly). It re-implements its own copy of `normalize()` (see [[Data Model]]) and is regression-tested by string-matching against `scripts/verify-personalizer.mjs`.

## Liquid block

- Reads `product.metafields['$app'].personalizer_config.value` (public-read, no auth needed).
- Forces `personalizer_enabled = true` when `request.design_mode` (i.e. inside the theme editor) so merchants can preview the block even on unconfigured products.
- If enabled, renders: a config-carrying hidden `<div data-cw-config>` (the JSON, escaped), an "open editor" button, and a `<dialog>` containing the photo/text stage, a fields list, and a Preview & Save button — all built out with empty containers that JS populates (`data-cw-photo-layers`, `data-cw-text-layers`, `data-cw-editor-fields`, etc.).
- All customer-facing copy is translated via theme locale keys (`personalizer.*` in `locales/en.default.json`), passed to JS as `data-label-*` attributes rather than looked up in JS.
- One block setting: `accent_color` (CSS custom property `--cw-accent`).

## JS boot sequence (`initialize()`, runs on `DOMContentLoaded`-equivalent + re-run for section reloads)

1. Guards against double-init per root (`dataset.cwReady`).
2. Parses and `normalize()`s the inline JSON config.
3. Sets CSS vars for accent color and aspect ratio (`--cw-ratio`).
4. Injects `@font-face` rules for every custom font.
5. Locates the theme's actual add-to-cart `<form action*="/cart/add">` (searched from the block's containing section outward, falling back to `document`) and force-sets `enctype="multipart/form-data"` (required because file properties are attached).
6. **Hides "Buy it now" / accelerated checkout permanently** for this product's form: a `MutationObserver` re-hides it if the theme re-renders it (themes often lazy-mount the dynamic checkout button).
7. **Locks the normal Add-to-cart button(s)** until a successful preview: `setPurchaseReady(false)` on load, re-armed to `true` only after a completed Preview & Save. A `MutationObserver` on the form re-applies the lock if the theme swaps in a fresh button (e.g. on variant change).
8. Intercepts the form's `submit` event in the **capture phase** (`{ capture: true }`) — always calls `preventDefault()`/`stopImmediatePropagation()`. If not yet `saved`, it just opens the dialog instead of submitting. If saved, it builds its own `FormData`, sets `sections=cart-drawer,cart-icon-bubble` + `sections_url`, and POSTs to `cart/add.js` itself (bypassing the theme's normal add-to-cart JS entirely), then re-renders any returned `sections` HTML in place, opens the cart drawer, and pushes the just-added design's preview into the cart UI at three staggered delays (80ms/350ms/900ms) to outrace the theme's own async re-render — see [[Cart Preview]].

## Per-field UI construction

- **Photo slots**: each gets a masked `<div>` viewport positioned by percentage (`left/top/width/height` from field x/y/w/h, using CSS `mask-image` from the field's `maskUrl` when present), an `<img>` inside it, a numbered upload-prompt "slot" button positioned over the *product's own image area* (`positionSlots()`, recalculated on resize), and a settings card with Reset / Zoom slider (100–500%) / optional Rotation slider (±180°, only shown if `rotationEnabled`) / Change-photo control. Only the currently `selectPhoto()`-ed slot's card and controls are visible — this is the V5.0.3 fix ("Shows Reset and Change photo only for the photo slot the customer selects").
- **Text fields**: a live-updating absolutely-positioned preview span on the stage, sized responsively (`fontSize * stage.clientWidth / 1200`), plus a text input and (if `allowFontChoice`) a font `<select>` populated from six built-in system fonts + any custom fonts.
- **File / link fields**: plain file input / URL input, each with its own required-field validation.

## Drag / zoom / rotate interaction

Pointer-event based (works for mouse + touch uniformly):
- `pointerdown` on the stage selects the tapped photo slot and starts a **gesture**: `drag` for a single pointer, `pinch` for two.
- `pointermove` updates `state.x/y` (drag) or `state.scale` (pinch, ratio of current to initial two-finger distance) live.
- Mouse wheel also adjusts zoom directly (`stage.addEventListener('wheel', ...)`, ±0.08 per tick, clamped 1–5×).
- `constrainPhoto()` recomputes cover-fit bounds so the photo can never be dragged to reveal empty space around its viewport (accounts for the image's natural aspect ratio vs the slot's aspect ratio).
- There is **no visible zoom slider control shown by default in the description** — actually there *is* a zoom `<input type=range>` in the controls card; the README's "without a visible zoom slider" line refers to the *pinch/wheel* gesture path not requiring the slider, not its absence. Rotation range only renders when `field.rotationEnabled`.

## Preview compositing (`attach()`, invoked by clicking Preview & Save)

Runs entirely on an offscreen `<canvas>` sized by `canvasDimensions()` (longest edge 1600px, aspect from `config.ratio`):
1. For each photo with a file: draws a clipped, transformed (translate/rotate/scale) copy of the uploaded image into the slot rectangle, then (if the slot has a mask) applies it via `globalCompositeOperation = 'destination-in'`.
2. For each text field with a value: loads the font (`document.fonts.load`), draws centered text at the configured position/size/color.
3. Draws the transparent overlay PNG on top of everything, if configured.
4. Serializes the canvas to a PNG blob; if the config changed mid-render (`revision` counter incremented by `invalidate()`), aborts with "Design changed while rendering."
5. Attaches every original file, every `_<field> Position`/`_<field> Font` metadata string, the composed preview blob (`_Personalised Preview`), and a fresh `_Cartwala Design ID` (`crypto.randomUUID()`) as hidden inputs on the real add-to-cart form via `putFile`/`putText` helpers.
6. Persists a full draft (files, positions, text, blob) to **IndexedDB** (`persist()`), swaps the product's main gallery image to the preview (`showProductPreview`), unlocks the Add-to-cart button, and closes the dialog.

## Draft restore

On load, before rendering the empty editor, it looks up an IndexedDB record keyed by `location.pathname + productId + JSON.stringify(rawConfig)` — if found and less than 7 days old, it **restores** the previous session's photos/text/files/links/preview without the customer re-uploading anything, and re-arms the form fields so Add to cart is usable immediately (this is the "Edit Again" flow referenced in the README).
