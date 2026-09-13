---
tags: [admin, psd, ag-psd]
---

# PSD Import

The headline V5 feature: upload **one layered `.psd`** and get a complete personalizer template — every photo slot, its transparent mask, every text field, and the flattened product overlay — with no fixed photo/text count (up to `MAX_FIELDS = 200` combined).

All of this runs **client-side in the browser** (inside `app._index.tsx`, dynamically `import("ag-psd")`) — the PSD file itself never reaches the server. Only the *derived* PNGs (overlay + per-slot masks) and the derived JSON config are sent to the `psdImport` action for upload to Shopify Files (see [[Admin App]]).

## Pipeline

1. **Parse** — `ag-psd` reads the PSD into a layer tree (`PsdCanvasLayer[]`, each layer carrying its own rendered `HTMLCanvasElement`, bounds, and optional `text` metadata).
2. **Classify layers by name** (regex `^(PHOTO|UPLOAD)`, case-insensitive, from `psdLayerLabel`):
   - Layers/groups named `PHOTO_1`, `PHOTO_2`, `UPLOAD_1`, … become **photo slots**. The label shown to the customer is the name with the prefix stripped and underscores/dashes turned into spaces (e.g. `PHOTO_1_Face` → "1 Face" after trimming — actually the regex strips the full `PHOTO_`/`UPLOAD_` + index token so the remainder is used, falling back to a generated label if empty).
   - Every other **visible Photoshop text layer** becomes an editable **text field** automatically — no naming convention required.
   - Text layers prefixed `STATIC_` or `LOCKED_` are excluded — treated as decorative and baked into the overlay instead.
   - Everything else (background, frame, decorative shapes) is baked into the flattened **overlay**.
3. **Bounds resolution** (`psdLayerBounds`) — handles three cases in priority order:
   - Layer's own pixel bounds (`left/top/right/bottom`), if valid.
   - For text layers with empty/invalid pixel bounds (a real Photoshop quirk — fixed in V5.0.2, see `CHANGELOG.md`): falls back to the text layer's **transform matrix** (`transform[4], transform[5]` = translation) combined with the text box's own `left/top/right/bottom`.
   - For group layers: recursively unions children's bounds.
4. **Mask generation per photo slot** — `psdDrawableLayers` walks each PHOTO/UPLOAD layer's own canvas (respecting nested visibility/`hidden`), and `drawPsdLayer` composites it onto a blank canvas at the slot's position/opacity to produce a **transparent-alpha mask PNG** — this becomes that slot's `maskUrl` after upload. `canvasHasPixels` sanity-checks the result isn't fully empty before accepting it.
5. **Text style extraction** — font size, font family name, and fill color are read from `layer.text.style` (or the first `styleRuns[0].style` if per-character styling is used) via `psdColor()`, which handles three Photoshop color encodings: RGB `{r,g,b}` (0–255), fractional `{fr,fg,fb}` (0–1, scaled ×255), or CMYK `{k}` (grayscale approximation from black channel only — no full CMYK→RGB conversion).
6. **Overlay flattening** — every non-slot, non-excluded layer is drawn (in Photoshop's top-to-bottom-is-front order, hence `[...layer.children].reverse()` when descending groups) onto one full-document canvas → `canvasBlob()` → PNG.
7. **Upload** — overlay PNG + every slot's mask PNG are attached to a `FormData` POST with `intent=psdImport`, plus the derived JSON config (photo count, text fields with position/font/color, canvas ratio = PSD document aspect ratio). The server action (`app._index.tsx`, `action`) re-validates counts match, uploads each image via the same staged-upload → `fileCreate` flow as `uploadImage` (see [[Admin App]]), substitutes the real Shopify CDN URLs into the field list, and runs the whole thing through `normalizeConfig` before handing it back.
8. **Client applies the result** — `psdFetcher.data.psdImport.config` replaces `config` and `configRef.current` in one shot (the V5.0.1 hotfix ensures a `Save` clicked immediately after doesn't race a stale closure).

## Merchant-facing rules (from `PSD-LAYER-GUIDE.txt`)

- One layer/group per photo slot, named `PHOTO_1`, `PHOTO_2`, … or `UPLOAD_1`, `UPLOAD_2`, …
- That layer's own transparency *is* the slot's mask — no separate mask authoring needed.
- Every other visible text layer is auto-editable; prefix with `STATIC_`/`LOCKED_` to keep it fixed.
- RGB, 8-bit recommended; canvas should already be at the final artwork aspect ratio.
- Non-system fonts must additionally be uploaded as a custom font asset if the customer needs to see the *exact* font in-browser (the PSD import extracts the font *name* for reference/matching against system fonts, but doesn't extract embedded font files).

## Guardrails enforced server-side (`action`, `intent === "psdImport"`)

- Rejects if `overlayFile` missing/empty.
- Rejects if `photoFields.length !== maskFiles.length` (client and server must agree on slot count).
- Rejects if `photoFields.length + textFields.length > MAX_FIELDS` (200).
- Any individual empty mask file aborts the whole import with an error naming the problem.
