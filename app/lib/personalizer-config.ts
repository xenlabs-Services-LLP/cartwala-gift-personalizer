// Shared config shape + validation for one product's personalizer template.
//
// This is the server/admin copy. It is intentionally isomorphic (no Node- or
// DOM-only APIs) so it can be imported both from the admin route (server
// action + client component) and, conceptually, mirrored by the storefront
// theme extension's own `normalize()` in
// extensions/cartwala-personalizer/assets/cartwala-personalizer.js.
//
// That storefront copy CANNOT literally `import` this file — it ships as a
// plain script with no build step, so it must stay hand-duplicated. Keep the
// two in sync when changing validation rules; scripts/verify-personalizer.mjs
// guards the storefront copy's behavior.

export const MAX_FIELDS = 200;
export const MAX_FONTS = 50;

export type PhotoField = {
  id: string;
  label: string;
  maskUrl: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotationEnabled: boolean;
  required: boolean;
};

export type TextField = {
  id: string;
  label: string;
  defaultValue: string;
  maxLength: number;
  color: string;
  x: number;
  y: number;
  fontSize: number;
  fontFamily: string;
  allowFontChoice: boolean;
  required: boolean;
};

export type FileField = {
  id: string;
  label: string;
  accept: string;
  maxSizeMb: number;
  required: boolean;
};

export type LinkField = {
  id: string;
  label: string;
  placeholder: string;
  required: boolean;
};

export type CustomFont = { id: string; name: string; url: string };

export type Config = {
  enabled: boolean;
  overlayUrl: string;
  canvasRatio: string;
  photoFields: PhotoField[];
  textFields: TextField[];
  fileFields: FileField[];
  linkFields: LinkField[];
  customFonts: CustomFont[];
};

export const uid = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

export const blankPhoto = (index: number): PhotoField => ({
  id: uid(),
  label: `Photo ${index + 1}`,
  maskUrl: "",
  x: 50,
  y: 50,
  width: 24,
  height: 24,
  rotationEnabled: false,
  required: true,
});

export const blankText = (index: number): TextField => ({
  id: uid(),
  label: `Text ${index + 1}`,
  defaultValue: "",
  maxLength: 100,
  color: "#111111",
  x: 50,
  y: 50,
  fontSize: 60,
  fontFamily: "Arial",
  allowFontChoice: false,
  required: true,
});

export const blankFile = (index: number): FileField => ({
  id: uid(),
  label: `Design file ${index + 1}`,
  accept: ".psd,.pdf,.ai,.eps,.cdr,.zip",
  maxSizeMb: 50,
  required: true,
});

export const blankLink = (index: number): LinkField => ({
  id: uid(),
  label: `Canva link ${index + 1}`,
  placeholder: "Paste the Canva design link",
  required: true,
});

export const emptyConfig: Config = {
  enabled: true,
  overlayUrl: "",
  canvasRatio: "1:1",
  photoFields: [blankPhoto(0)],
  textFields: [],
  fileFields: [],
  linkFields: [],
  customFonts: [],
};

export const clamp = (
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number => {
  const number = Number(value);
  return Math.min(max, Math.max(min, Number.isFinite(number) ? number : fallback));
};

export const safeId = (value: unknown): string =>
  String(value || uid())
    .replace(/[^a-z0-9-]/gi, "")
    .slice(0, 80) || uid();

// Asset URLs (overlay / mask / font) must come from Shopify's own Files CDN.
// Previously any well-formed https:// URL was accepted, which meant a saved
// config could point a customer's browser at an arbitrary third-party host
// on every product-page view. Everything this app writes here comes from its
// own uploadImage()/uploadFont() (both return Shopify-hosted URLs), so this
// is not a behavior change for the normal flow - only for hand-edited or
// legacy values that pointed elsewhere.
const isTrustedAssetHost = (hostname: string): boolean => {
  const host = hostname.toLowerCase();
  return (
    host === "cdn.shopify.com" ||
    host.endsWith(".myshopify.com") ||
    host.endsWith(".shopifycdn.net") ||
    host.endsWith(".shopifycdn.com")
  );
};

export const cleanAssetUrl = (value: unknown): string => {
  const input = String(value ?? "").trim();
  if (!input) return "";
  try {
    const url = new URL(input);
    if (url.protocol !== "https:") return "";
    return isTrustedAssetHost(url.hostname) ? url.toString() : "";
  } catch {
    return "";
  }
};

/**
 * Sanitizes and migrates a raw JSON value (from the product metafield, from
 * a fetcher response, or from a bulk-import row) into a safe Config.
 *
 * Also migrates the pre-V4 shape, where there was one fixed
 * `customizationType` ("photo" | "text" | "photo-text") instead of arbitrary
 * arrays of fields, so metafields saved by older installs keep rendering.
 */
export const normalizeConfig = (value: unknown): Config => {
  const input = value && typeof value === "object" ? (value as Record<string, unknown>) : {};

  let photoFields: PhotoField[];
  if (Array.isArray(input.photoFields)) {
    photoFields = input.photoFields.slice(0, MAX_FIELDS).map((field, index) => {
      const item = field && typeof field === "object" ? (field as Partial<PhotoField>) : {};
      return {
        id: safeId(item.id),
        label: String(item.label || `Photo ${index + 1}`).trim().slice(0, 80),
        maskUrl: cleanAssetUrl(item.maskUrl),
        x: clamp(item.x, 0, 100, 50),
        y: clamp(item.y, 0, 100, 50),
        width: clamp(item.width, 2, 100, 24),
        height: clamp(item.height, 2, 100, 24),
        rotationEnabled: item.rotationEnabled === true,
        required: item.required !== false,
      };
    });
  } else {
    const legacyType = String(input.customizationType || "photo");
    const count = legacyType === "text" ? 0 : clamp(input.photoFields, 0, MAX_FIELDS, 1);
    photoFields = Array.from({ length: count }, (_, index) => ({
      ...blankPhoto(index),
      maskUrl: index === 0 ? cleanAssetUrl(input.maskUrl) : "",
      rotationEnabled: input.rotationEnabled === true,
    }));
  }

  let textFields: TextField[];
  if (Array.isArray(input.textFields)) {
    textFields = input.textFields.slice(0, MAX_FIELDS).map((field, index) => {
      const item = field && typeof field === "object" ? (field as Partial<TextField>) : {};
      return {
        id: safeId(item.id),
        label: String(item.label || `Text ${index + 1}`).trim().slice(0, 80),
        defaultValue: String(item.defaultValue || "").slice(0, 500),
        maxLength: clamp(item.maxLength, 1, 500, 100),
        color: /^#[0-9a-f]{6}$/i.test(String(item.color)) ? String(item.color) : "#111111",
        x: clamp(item.x, 0, 100, 50),
        y: clamp(item.y, 0, 100, 50),
        fontSize: clamp(item.fontSize, 8, 300, 60),
        fontFamily: String(item.fontFamily || "Arial").trim().slice(0, 100),
        allowFontChoice: item.allowFontChoice === true,
        required: item.required !== false,
      };
    });
  } else {
    const legacyType = String(input.customizationType || "photo");
    textFields = legacyType.includes("text")
      ? [
          {
            ...blankText(0),
            label: String(input.textLabel || "Text 1"),
            maxLength: clamp(input.textMaxLength, 1, 500, 100),
            color: /^#[0-9a-f]{6}$/i.test(String(input.textColor)) ? String(input.textColor) : "#111111",
          },
        ]
      : [];
  }

  const fileFields: FileField[] = Array.isArray(input.fileFields)
    ? input.fileFields.slice(0, MAX_FIELDS).map((field, index) => {
        const item = field && typeof field === "object" ? (field as Partial<FileField>) : {};
        return {
          id: safeId(item.id),
          label: String(item.label || `Design file ${index + 1}`).trim().slice(0, 80),
          accept: String(item.accept || ".psd,.pdf,.ai,.eps,.cdr,.zip").trim().slice(0, 200),
          maxSizeMb: clamp(item.maxSizeMb, 1, 200, 50),
          required: item.required !== false,
        };
      })
    : [];

  const linkFields: LinkField[] = Array.isArray(input.linkFields)
    ? input.linkFields.slice(0, MAX_FIELDS).map((field, index) => {
        const item = field && typeof field === "object" ? (field as Partial<LinkField>) : {};
        return {
          id: safeId(item.id),
          label: String(item.label || `Canva link ${index + 1}`).trim().slice(0, 80),
          placeholder: String(item.placeholder || "Paste the Canva design link").trim().slice(0, 150),
          required: item.required !== false,
        };
      })
    : [];

  const customFonts: CustomFont[] = Array.isArray(input.customFonts)
    ? input.customFonts
        .slice(0, MAX_FONTS)
        .map((font, index) => {
          const item = font && typeof font === "object" ? (font as Partial<CustomFont>) : {};
          return {
            id: safeId(item.id),
            name: String(item.name || `Custom font ${index + 1}`).trim().slice(0, 80),
            url: cleanAssetUrl(item.url),
          };
        })
        .filter((font) => font.url)
    : [];

  const canvasRatio = /^\d{1,5}:\d{1,5}$/.test(String(input.canvasRatio))
    ? String(input.canvasRatio)
    : "1:1";

  return {
    enabled: input.enabled !== false,
    overlayUrl: cleanAssetUrl(input.overlayUrl),
    canvasRatio,
    photoFields,
    textFields,
    fileFields,
    linkFields,
    customFonts,
  };
};
