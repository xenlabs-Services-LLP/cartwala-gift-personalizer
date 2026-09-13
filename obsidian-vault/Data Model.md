---
tags: [data, metafields, prisma]
---

# Data Model

## Prisma / SQLite: only Shopify session data

`prisma/schema.prisma` defines a single model:

```prisma
model Session {
  id, shop, state, isOnline, scope, expires, accessToken,
  userId, firstName, lastName, email, accountOwner, locale,
  collaborator, emailVerified, refreshToken, refreshTokenExpires
}
```

This is the stock `PrismaSessionStorage` table the Shopify App template needs for OAuth session persistence (`app/db.server.ts` → `app/shopify.server.ts`). **No personalizer data is stored in the app's own database at all.** There is no `Product`, `Template`, or `Design` table.

## The real data store: a product metafield

Declared in `shopify.app.toml`:

```toml
[product.metafields.app.personalizer_config]
type = "json"
name = "Cartwala Personalizer Configuration"
[product.metafields.app.personalizer_config.access]
admin = "merchant_read_write"
storefront = "public_read"
```

- Namespace/key at runtime: `$app` / `personalizer_config` (the `$app` shorthand resolves to this app's namespace both in GraphQL (`metafield(namespace: "$app", key: "personalizer_config")`) and in Liquid (`product.metafields['$app'].personalizer_config.value`)).
- One JSON document per product. No per-variant config.
- `admin` app writes it via `metafieldsSet` (single product save, or up to 1000 rows in batches of 25 for CSV bulk import — [[Admin App]]).
- Storefront theme reads it directly in Liquid — no app-proxy or API call needed at page-render time, because the metafield is public-read.

## Config shape (the `Config` type)

Defined independently (and kept manually in sync) in two places:
- `app/routes/app._index.tsx` — TypeScript `Config` type + `normalizeConfig()`
- `extensions/cartwala-personalizer/assets/cartwala-personalizer.js` — untyped `normalize()`

```ts
type Config = {
  enabled: boolean;
  overlayUrl: string;        // transparent PNG drawn on top of everything, from Shopify Files
  canvasRatio: string;       // "W:H", validated /^\d{1,5}:\d{1,5}$/, default "1:1"
  photoFields: PhotoField[]; // up to 200
  textFields: TextField[];   // up to 200
  fileFields: FileField[];   // design-file upload fields (PSD/PDF/AI/EPS/CDR/ZIP), up to 200
  linkFields: LinkField[];   // free-text Canva-link fields, up to 200
  customFonts: CustomFont[]; // up to 50, uploaded WOFF/WOFF2/TTF/OTF
};

type PhotoField = { id, label, maskUrl, x, y, width, height, rotationEnabled, required };
type TextField  = { id, label, defaultValue, maxLength, color, x, y, fontSize, fontFamily, allowFontChoice, required };
type FileField  = { id, label, accept, maxSizeMb, required };
type LinkField  = { id, label, placeholder, required };
type CustomFont = { id, name, url };
```

Coordinates (`x`, `y`, `width`, `height`) are **percentages of the canvas**, clamped to `[0,100]`, so the same config renders correctly at any actual pixel resolution — the render-time canvas size comes from `canvasRatio` (`canvasDimensions()` in the storefront JS: longest side = 1600px).

## Normalization rules worth knowing (both copies enforce these)

- Hard cap: `MAX_FIELDS = 200` per field type; `customFonts` capped at 50.
- `overlayUrl` / mask / font URLs are only accepted if they parse as `https:` URLs (`cleanAssetUrl` — silently drops anything else, including `http:`).
- Text `color` must match `/^#[0-9a-f]{6}$/i` or falls back to `#111111`.
- IDs are sanitized to `[a-z0-9-]` (admin side) — used as DOM keys and as label fallbacks.
- **Legacy config migration is built into `normalizeConfig`/`normalize`**: if `photoFields`/`textFields` arrays aren't present, it falls back to an old `customizationType` + `photoFields` (as a *count*, not array) + `maskUrl` + `textLabel`/`textMaxLength`/`textColor` shape from an earlier app version. This means old saved metafields from pre-V4 installs still render correctly without a migration script.

## Line-item properties (the other place "data" lives)

Nothing is written back to Shopify metafields or any database when a customer personalizes a product — the customer's design lives **entirely as Shopify cart/order line-item properties**, set client-side by the storefront JS before it calls `cart/add.js`:

| Property | Meaning |
|---|---|
| `properties[<Photo label>]` | the original uploaded photo file (per photo field) |
| `properties[_<Photo label> Position]` | human-readable offset/zoom/rotation string, for order fulfillment reference |
| `properties[<Text label>]` | the customer's text value |
| `properties[_<Text label> Font]` | which font was used, if `allowFontChoice` |
| `properties[<File label>]` | uploaded design file (PSD/PDF/etc., per file field) |
| `properties[<Link label>]` | pasted Canva link |
| `properties[_Personalised Preview]` | the composited PNG blob, as a `File` |
| `properties[_Cartwala Design ID]` | a `crypto.randomUUID()` correlating this cart line to its IndexedDB draft |
| `properties[_Cartwala Personalization]` | literal string `"Completed"` |

Properties prefixed `_` are Shopify's convention for "hidden from the customer-facing cart display" — see [[Storefront Extension]].
