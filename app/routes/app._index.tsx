import { useEffect, useMemo, useRef, useState } from "react";
import type { ActionFunctionArgs, HeadersFunction } from "react-router";
import { useFetcher, useRouteError, useRouteLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import type { loader as appLoader } from "./app";
import {
  MAX_FIELDS,
  blankFile,
  blankLink,
  blankPhoto,
  blankText,
  clamp,
  emptyConfig,
  normalizeConfig,
  uid,
  type Config,
  type FileField,
  type LinkField,
  type PhotoField,
  type TextField,
} from "../lib/personalizer-config";
import { uploadFont, uploadImage, firstMetafieldsSetError } from "../lib/shopify-files.server";
import {
  canvasBlob,
  canvasHasPixels,
  drawPsdLayer,
  psdColor,
  psdDrawableLayers,
  psdLayerBounds,
  psdLayerLabel,
  type PsdCanvasLayer,
} from "../lib/psd-import";

type Product = { id: string; title: string; handle: string; personalizer?: { jsonValue?: unknown } | null };

// Every action intent returns this same shape (with only the fields relevant
// to that intent populated) so `typeof action` gives useFetcher<typeof action>
// one concrete, precise type instead of TypeScript widening/narrowing the
// union down to whichever handler it can see most directly (which is what
// caused each fetcher's `.data?.xyzUpload` access to fail to typecheck when
// the five intents were split into separate named handler functions below).
type ActionResult = {
  ok: boolean;
  error?: string;
  fontUpload?: { id: string; name: string; url: string };
  imageUpload?: { url: string; target: string };
  psdImport?: { config: Config; photos: number; texts: number };
  bulkSaved?: number;
};

// ---------------------------------------------------------------------------
// Action - five intents on one route, dispatched by `intent`.
// ---------------------------------------------------------------------------

export const action = async ({ request }: ActionFunctionArgs): Promise<ActionResult> => {
  const { admin } = await authenticate.admin(request);
  const data = await request.formData();
  const intent = data.get("intent");

  if (intent === "uploadFont") return handleUploadFont(admin, data);
  if (intent === "uploadImage") return handleUploadImage(admin, data);
  if (intent === "psdImport") return handlePsdImport(admin, data);
  if (intent === "bulkImport") return handleBulkImport(admin, data);
  return handleSave(admin, data);
};

async function handleUploadFont(admin: Awaited<ReturnType<typeof authenticate.admin>>["admin"], data: FormData): Promise<ActionResult> {
  const file = data.get("fontFile");
  if (!(file instanceof File) || !file.size) return { ok: false, error: "Choose a font file first." };
  try {
    const url = await uploadFont(admin, file);
    return { ok: true, fontUpload: { id: uid(), name: file.name.replace(/\.[^.]+$/, ""), url } };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Font upload failed." };
  }
}

async function handleUploadImage(admin: Awaited<ReturnType<typeof authenticate.admin>>["admin"], data: FormData): Promise<ActionResult> {
  const file = data.get("imageFile");
  if (!(file instanceof File) || !file.size) return { ok: false, error: "Choose an image first." };
  try {
    const url = await uploadImage(admin, file);
    return { ok: true, imageUpload: { url, target: String(data.get("target") || "overlay") } };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Image upload failed." };
  }
}

async function handlePsdImport(admin: Awaited<ReturnType<typeof authenticate.admin>>["admin"], data: FormData): Promise<ActionResult> {
  try {
    const overlayFile = data.get("overlayFile");
    const maskFiles = data.getAll("maskFiles");
    const imported = JSON.parse(String(data.get("config") || "{}")) as Config;
    if (!(overlayFile instanceof File) || !overlayFile.size) throw new Error("The PSD overlay could not be generated.");
    if (!Array.isArray(imported.photoFields) || imported.photoFields.length !== maskFiles.length) {
      throw new Error("The PSD photo layers could not be matched with their masks.");
    }
    if (imported.photoFields.length + (Array.isArray(imported.textFields) ? imported.textFields.length : 0) > MAX_FIELDS) {
      throw new Error(`A PSD can contain at most ${MAX_FIELDS} editable fields.`);
    }

    const overlayUrl = await uploadImage(admin, overlayFile);
    const maskUrls: string[] = [];
    for (const maskFile of maskFiles) {
      if (!(maskFile instanceof File) || !maskFile.size) throw new Error("One of the PSD photo masks is empty.");
      maskUrls.push(await uploadImage(admin, maskFile));
    }

    const config = normalizeConfig({
      ...imported,
      overlayUrl,
      photoFields: imported.photoFields.map((field, index) => ({ ...field, maskUrl: maskUrls[index] })),
    });
    return { ok: true, psdImport: { config, photos: config.photoFields.length, texts: config.textFields.length } };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "PSD import failed." };
  }
}

async function handleBulkImport(admin: Awaited<ReturnType<typeof authenticate.admin>>["admin"], data: FormData): Promise<ActionResult> {
  try {
    const entries = JSON.parse(String(data.get("entries") || "[]")) as Array<{ productId: string; config: unknown }>;
    if (!Array.isArray(entries) || !entries.length || entries.length > 1000) {
      throw new Error("The CSV contains no valid products or is too large.");
    }
    let saved = 0;
    for (let offset = 0; offset < entries.length; offset += 25) {
      const metafields = entries.slice(offset, offset + 25).map((entry) => {
        if (!entry.productId.startsWith("gid://shopify/Product/")) throw new Error("The CSV contains an invalid product.");
        return { ownerId: entry.productId, key: "personalizer_config", type: "json", value: JSON.stringify(normalizeConfig(entry.config)) };
      });
      const response = await admin.graphql(
        `#graphql
        mutation BulkSaveCartwalaPersonalizer($metafields: [MetafieldsSetInput!]!) {
          metafieldsSet(metafields: $metafields) { userErrors { field message code } }
        }`,
        { variables: { metafields } },
      );
      const json = await response.json();
      const error = firstMetafieldsSetError(json);
      if (error) throw new Error(error);
      saved += metafields.length;
    }
    return { ok: true, bulkSaved: saved };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "CSV import failed." };
  }
}

async function handleSave(admin: Awaited<ReturnType<typeof authenticate.admin>>["admin"], data: FormData): Promise<ActionResult> {
  const productId = String(data.get("productId") || "");
  let config: Config;
  try {
    config = normalizeConfig(JSON.parse(String(data.get("config") || "{}")));
  } catch {
    return { ok: false, error: "The personalizer configuration is invalid." };
  }
  if (!productId) return { ok: false, error: "Choose a product first." };
  if (!productId.startsWith("gid://shopify/Product/")) return { ok: false, error: "The selected product is invalid." };
  if (config.enabled && config.photoFields.length + config.textFields.length + config.fileFields.length + config.linkFields.length === 0) {
    return { ok: false, error: "Add at least one customer field." };
  }
  const response = await admin.graphql(
    `#graphql
    mutation SaveCartwalaPersonalizer($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) { metafields { id key jsonValue } userErrors { field message code } }
    }`,
    { variables: { metafields: [{ ownerId: productId, key: "personalizer_config", type: "json", value: JSON.stringify(config) }] } },
  );
  const json = await response.json();
  const error = firstMetafieldsSetError(json);
  return error ? { ok: false, error } : { ok: true };
}

// ---------------------------------------------------------------------------
// Admin UI
// ---------------------------------------------------------------------------

type FieldKind = "photoFields" | "textFields" | "fileFields" | "linkFields";

export default function PersonalizerHome() {
  const { products } = useRouteLoaderData<typeof appLoader>("routes/app")!;
  const saveFetcher = useFetcher<typeof action>();
  const fontFetcher = useFetcher<typeof action>();
  const imageFetcher = useFetcher<typeof action>();
  const bulkFetcher = useFetcher<typeof action>();
  const psdFetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
  const [selected, setSelected] = useState<Product | null>(products[0] ?? null);
  const [config, setConfig] = useState<Config>(normalizeConfig(selected?.personalizer?.jsonValue ?? emptyConfig));
  const [fontKey, setFontKey] = useState(0);
  const [imageKey, setImageKey] = useState(0);
  const [psdKey, setPsdKey] = useState(0);
  const [psdStatus, setPsdStatus] = useState("");
  const [activeSlot, setActiveSlot] = useState<string | null>(config.photoFields[0]?.id ?? null);
  const [addCount, setAddCount] = useState(1);
  const [dirty, setDirty] = useState(false);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const configRef = useRef<Config>(config);
  // Set to true right before a setConfig() call that represents a *saved*
  // state (choosing a product, applying a save's own echo) so the dirty
  // tracker below doesn't treat it as an unsaved edit.
  const skipNextDirtyCheck = useRef(true);
  const systemFonts = useMemo(() => ["Arial", "Georgia", "Times New Roman", "Verdana", "Trebuchet MS", "Courier New"], []);

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  // Unsaved-changes tracking: any setConfig() call marks the template dirty
  // unless the caller opted out via skipNextDirtyCheck (see chooseProduct).
  useEffect(() => {
    if (skipNextDirtyCheck.current) {
      skipNextDirtyCheck.current = false;
      return;
    }
    setDirty(true);
  }, [config]);

  // Warn before closing/refreshing the tab with an unsaved template - a
  // 50-slot PSD import or manual build can take many minutes of work.
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  useEffect(() => {
    if (saveFetcher.data?.ok) {
      shopify.toast.show("Personalizer settings saved");
      setDirty(false);
    }
    if (saveFetcher.data?.error) shopify.toast.show(saveFetcher.data.error, { isError: true });
  }, [saveFetcher.data, shopify]);

  useEffect(() => {
    if (fontFetcher.data?.fontUpload) {
      setConfig((current) => ({ ...current, customFonts: [...current.customFonts, fontFetcher.data!.fontUpload!] }));
      setFontKey((value) => value + 1);
      shopify.toast.show("Font uploaded. Save the product configuration.");
    }
    if (fontFetcher.data?.error) shopify.toast.show(fontFetcher.data.error, { isError: true });
  }, [fontFetcher.data, shopify]);

  useEffect(() => {
    const upload = imageFetcher.data?.imageUpload;
    if (upload) {
      if (upload.target === "overlay") setConfig((current) => ({ ...current, overlayUrl: upload.url }));
      else setConfig((current) => ({ ...current, photoFields: current.photoFields.map((field) => (field.id === upload.target ? { ...field, maskUrl: upload.url } : field)) }));
      setImageKey((value) => value + 1);
      shopify.toast.show("Image uploaded to Shopify Files. Save the configuration.");
    }
    if (imageFetcher.data?.error) shopify.toast.show(imageFetcher.data.error, { isError: true });
  }, [imageFetcher.data, shopify]);

  useEffect(() => {
    if (bulkFetcher.data?.bulkSaved) shopify.toast.show(`${bulkFetcher.data.bulkSaved} product templates imported. Reload to view them.`);
    if (bulkFetcher.data?.error) shopify.toast.show(bulkFetcher.data.error, { isError: true });
  }, [bulkFetcher.data, shopify]);

  useEffect(() => {
    const imported = psdFetcher.data?.psdImport;
    if (imported) {
      configRef.current = imported.config;
      setConfig(imported.config);
      setActiveSlot(imported.config.photoFields[0]?.id ?? null);
      setPsdKey((value) => value + 1);
      setPsdStatus(`Detected ${imported.photos} photo upload layers and ${imported.texts} editable text layers. Review and save the configuration.`);
      shopify.toast.show("PSD template imported. Review it, then save the configuration.");
    }
    if (psdFetcher.data?.error) {
      setPsdStatus("");
      shopify.toast.show(psdFetcher.data.error, { isError: true });
    }
  }, [psdFetcher.data, shopify]);

  const confirmDiscardIfDirty = (message: string) => !dirty || window.confirm(message);

  const chooseProduct = async () => {
    if (!confirmDiscardIfDirty("You have unsaved changes for this product. Switch products and discard them?")) return;
    const selection = await shopify.resourcePicker({ type: "product", multiple: false, action: "select" });
    const product = products.find((item) => item.id === selection?.[0]?.id) ?? null;
    if (product) {
      const next = normalizeConfig(product.personalizer?.jsonValue ?? emptyConfig);
      skipNextDirtyCheck.current = true;
      setSelected(product);
      setConfig(next);
      setActiveSlot(next.photoFields[0]?.id ?? null);
      setDirty(false);
    }
  };

  const save = () => {
    if (!selected) return;
    const form = new FormData();
    form.set("productId", selected.id);
    form.set("config", JSON.stringify(configRef.current));
    saveFetcher.submit(form, { method: "POST" });
  };

  const updatePhoto = (id: string, changes: Partial<PhotoField>) =>
    setConfig((current) => ({ ...current, photoFields: current.photoFields.map((field) => (field.id === id ? { ...field, ...changes } : field)) }));
  const updateText = (id: string, changes: Partial<TextField>) =>
    setConfig((current) => ({ ...current, textFields: current.textFields.map((field) => (field.id === id ? { ...field, ...changes } : field)) }));
  const updateFile = (id: string, changes: Partial<FileField>) =>
    setConfig((current) => ({ ...current, fileFields: current.fileFields.map((field) => (field.id === id ? { ...field, ...changes } : field)) }));
  const updateLink = (id: string, changes: Partial<LinkField>) =>
    setConfig((current) => ({ ...current, linkFields: current.linkFields.map((field) => (field.id === id ? { ...field, ...changes } : field)) }));
  const remove = (kind: FieldKind, id: string) => setConfig((current) => ({ ...current, [kind]: current[kind].filter((field) => field.id !== id) }));
  const move = (kind: FieldKind, index: number, direction: -1 | 1) =>
    setConfig((current) => {
      const fields = [...current[kind]];
      const target = index + direction;
      if (target < 0 || target >= fields.length) return current;
      [fields[index], fields[target]] = [fields[target], fields[index]];
      return { ...current, [kind]: fields };
    });

  // Every numeric editor field goes through this instead of a bare Number()
  // cast, so an empty/invalid input can't transiently render a slot or text
  // preview at NaN% - it snaps back to the field's current value instead.
  const updateClampedNumber = (kind: FieldKind, id: string, key: string, min: number, max: number, fallback: number, rawValue: string) => {
    const value = clamp(rawValue, min, max, fallback);
    setConfig((current) => ({ ...current, [kind]: current[kind].map((field) => (field.id === id ? { ...field, [key]: value } : field)) }));
  };

  const fieldActions = (kind: FieldKind, id: string, index: number, length: number) => (
    <s-stack direction="inline" gap="base">
      <s-button disabled={index === 0} onClick={() => move(kind, index, -1)}>Move up</s-button>
      <s-button disabled={index === length - 1} onClick={() => move(kind, index, 1)}>Move down</s-button>
      <s-button tone="critical" onClick={() => remove(kind, id)}>Remove</s-button>
    </s-stack>
  );

  const ratioStyle = (() => {
    const [w, h] = config.canvasRatio.split(":").map(Number);
    return { aspectRatio: `${w}/${h}` };
  })();

  const beginSlotDrag = (event: React.PointerEvent<HTMLButtonElement>, field: PhotoField) => {
    event.preventDefault();
    setActiveSlot(field.id);
    const rect = editorRef.current?.getBoundingClientRect();
    if (!rect) return;
    const move = (pointer: PointerEvent) =>
      updatePhoto(field.id, {
        x: clamp(((pointer.clientX - rect.left) / rect.width) * 100, 0, 100, field.x),
        y: clamp(((pointer.clientY - rect.top) / rect.height) * 100, 0, 100, field.y),
      });
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
  };

  const addPhotos = () =>
    setConfig((current) => ({
      ...current,
      photoFields: [...current.photoFields, ...Array.from({ length: clamp(addCount, 1, MAX_FIELDS - current.photoFields.length, 1) }, (_, offset) => blankPhoto(current.photoFields.length + offset))],
    }));

  const importCsv = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    const rawText = await file.text();
    const bomStripped = rawText.charCodeAt(0) === 0xfeff ? rawText.slice(1) : rawText;
    const lines = bomStripped.split(/\r?\n/).filter((line) => line.trim());
    const split = (line: string) => {
      const cells: string[] = [];
      let value = "";
      let quoted = false;
      for (let i = 0; i < line.length; i += 1) {
        const char = line[i];
        if (char === '"' && quoted && line[i + 1] === '"') {
          value += '"';
          i += 1;
        } else if (char === '"') quoted = !quoted;
        else if (char === "," && !quoted) {
          cells.push(value.trim());
          value = "";
        } else value += char;
      }
      cells.push(value.trim());
      return cells;
    };
    const headers = split(lines.shift() || "").map((header) => header.toLowerCase());
    const grouped = new Map<string, Config>();
    const unmatched = new Set<string>();
    for (const line of lines) {
      const values = split(line);
      const row = Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]));
      const product = products.find((item) => item.handle === row.product_handle || item.id === row.product_id);
      if (!product) {
        unmatched.add(row.product_handle || row.product_id || "(row with no product_handle)");
        continue;
      }
      const current = grouped.get(product.id) ?? { ...normalizeConfig(product.personalizer?.jsonValue ?? emptyConfig), photoFields: [] };
      current.enabled = row.enabled !== "false";
      if (row.overlay_url) current.overlayUrl = row.overlay_url;
      if (/^(1:1|2:3|3:2|4:5|5:4)$/.test(row.ratio)) current.canvasRatio = row.ratio;
      if (row.slot_label || row.mask_url) {
        current.photoFields.push({
          ...blankPhoto(current.photoFields.length),
          label: row.slot_label || `Photo ${current.photoFields.length + 1}`,
          maskUrl: row.mask_url || "",
          x: clamp(row.x, 0, 100, 50),
          y: clamp(row.y, 0, 100, 50),
          width: clamp(row.width, 2, 100, 24),
          height: clamp(row.height, 2, 100, 24),
          required: row.required !== "false",
          rotationEnabled: row.rotation === "true",
        });
      }
      grouped.set(product.id, current);
    }
    const entries = [...grouped].map(([productId, imported]) => ({ productId, config: imported }));
    if (unmatched.size) {
      const sample = [...unmatched].slice(0, 8).join(", ");
      shopify.toast.show(`${unmatched.size} CSV row(s) didn't match a Shopify product and were skipped: ${sample}${unmatched.size > 8 ? "…" : ""}`, { isError: true });
    }
    if (!entries.length) {
      if (!unmatched.size) shopify.toast.show("No CSV rows matched a Shopify product handle.", { isError: true });
      return;
    }
    bulkFetcher.submit({ intent: "bulkImport", entries: JSON.stringify(entries) }, { method: "POST" });
  };

  const importPsd = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    if (!/\.psd$/i.test(file.name) || file.size > 250 * 1024 * 1024) {
      shopify.toast.show("Choose a PSD file smaller than 250 MB.", { isError: true });
      event.currentTarget.value = "";
      return;
    }
    setPsdStatus("Reading PSD layers and generating masks…");
    try {
      const { readPsd } = await import("ag-psd");
      const psd = readPsd(await file.arrayBuffer(), { skipThumbnail: true }) as unknown as PsdCanvasLayer & { width: number; height: number };
      if (!psd.width || !psd.height || !psd.children?.length) throw new Error("The PSD does not contain readable layers.");
      const layers = psdDrawableLayers(psd.children);
      const photos = layers.filter((layer) => /^(PHOTO|UPLOAD)(?:[\s_-]|\d|$)/i.test(String(layer.name || "")) && psdLayerBounds(layer).right > psdLayerBounds(layer).left);
      const texts = layers.filter((layer) => layer.text && !/^(STATIC|LOCKED)(?:[\s_-]|$)/i.test(String(layer.name || "")));
      if (!photos.length && !texts.length) throw new Error("No PHOTO/UPLOAD layers or editable Photoshop text layers were found.");
      if (photos.length + texts.length > MAX_FIELDS) throw new Error(`The PSD contains more than ${MAX_FIELDS} editable fields.`);

      const excluded = new Set<PsdCanvasLayer>([...photos, ...texts]);
      const overlayCanvas = document.createElement("canvas");
      overlayCanvas.width = psd.width;
      overlayCanvas.height = psd.height;
      const overlayContext = overlayCanvas.getContext("2d");
      if (!overlayContext) throw new Error("The browser could not render this PSD.");
      [...psd.children].reverse().forEach((layer) => drawPsdLayer(overlayContext, layer, excluded, psd.width, psd.height));
      if (!canvasHasPixels(overlayCanvas) && psd.canvas) {
        overlayContext.drawImage(psd.canvas, 0, 0, psd.width, psd.height);
        [...photos, ...texts].forEach((layer) => {
          const bounds = psdLayerBounds(layer);
          overlayContext.clearRect(bounds.left, bounds.top, bounds.right - bounds.left, bounds.bottom - bounds.top);
        });
      }

      const maskFiles: File[] = [];
      const photoFields: PhotoField[] = [];
      for (const [index, layer] of photos.entries()) {
        const bounds = psdLayerBounds(layer);
        const documentCanvas = document.createElement("canvas");
        documentCanvas.width = psd.width;
        documentCanvas.height = psd.height;
        const documentContext = documentCanvas.getContext("2d");
        if (!documentContext) throw new Error("A PSD photo mask could not be rendered.");
        drawPsdLayer(documentContext, layer, new Set(), psd.width, psd.height);
        const sourceWidth = Math.max(1, Math.round(bounds.right - bounds.left));
        const sourceHeight = Math.max(1, Math.round(bounds.bottom - bounds.top));
        const maskCanvas = document.createElement("canvas");
        maskCanvas.width = 1000;
        maskCanvas.height = 1000;
        const maskContext = maskCanvas.getContext("2d", { willReadFrequently: true });
        if (!maskContext) throw new Error("A PSD photo mask could not be created.");
        maskContext.drawImage(documentCanvas, bounds.left, bounds.top, sourceWidth, sourceHeight, 0, 0, 1000, 1000);
        const pixels = maskContext.getImageData(0, 0, 1000, 1000);
        for (let offset = 0; offset < pixels.data.length; offset += 4) {
          const alpha = pixels.data[offset + 3];
          pixels.data[offset] = 255;
          pixels.data[offset + 1] = 255;
          pixels.data[offset + 2] = 255;
          pixels.data[offset + 3] = alpha;
        }
        maskContext.putImageData(pixels, 0, 0);
        maskFiles.push(new File([await canvasBlob(maskCanvas)], `psd-photo-mask-${index + 1}.png`, { type: "image/png" }));
        photoFields.push({
          ...blankPhoto(index),
          label: psdLayerLabel(String(layer.name || ""), `Photo ${index + 1}`),
          x: clamp(((bounds.left + bounds.right) * 50) / psd.width, 0, 100, 50),
          y: clamp(((bounds.top + bounds.bottom) * 50) / psd.height, 0, 100, 50),
          width: clamp(((bounds.right - bounds.left) * 100) / psd.width, 2, 100, 24),
          height: clamp(((bounds.bottom - bounds.top) * 100) / psd.height, 2, 100, 24),
        });
      }

      const textFields = texts.map((layer, index): TextField => {
        const bounds = psdLayerBounds(layer);
        const style = layer.text?.style || layer.text?.styleRuns?.[0]?.style || {};
        const text = String(layer.text?.text || "").replace(/\r/g, "\n").trim();
        return {
          ...blankText(index),
          label: psdLayerLabel(String(layer.name || ""), `Text ${index + 1}`),
          defaultValue: text.slice(0, 500),
          maxLength: clamp(Math.max(30, text.length * 2), 1, 500, 100),
          color: psdColor(style.fillColor),
          x: clamp(((bounds.left + bounds.right) * 50) / psd.width, 0, 100, 50),
          y: clamp(((bounds.top + bounds.bottom) * 50) / psd.height, 0, 100, 50),
          fontSize: clamp((Number(style.fontSize) * 1200) / psd.width, 8, 300, 60),
          fontFamily: String(style.font?.name || "Arial").slice(0, 100),
        };
      });
      const imported: Config = { ...config, enabled: true, overlayUrl: "", canvasRatio: `${psd.width}:${psd.height}`, photoFields, textFields };
      const form = new FormData();
      form.append("intent", "psdImport");
      form.append("config", JSON.stringify(imported));
      form.append("overlayFile", new File([await canvasBlob(overlayCanvas)], `${file.name.replace(/\.psd$/i, "")}-overlay.png`, { type: "image/png" }));
      maskFiles.forEach((mask) => form.append("maskFiles", mask));
      setPsdStatus(`Uploading the generated overlay and ${maskFiles.length} masks to Shopify Files…`);
      psdFetcher.submit(form, { method: "POST", encType: "multipart/form-data" });
    } catch (error) {
      setPsdStatus("");
      setPsdKey((value) => value + 1);
      shopify.toast.show(error instanceof Error ? error.message : "PSD import failed.", { isError: true });
    }
  };

  return (
    <s-page heading="Cartwala Personalizer V5" inlineSize="large">
      <s-button slot="primary-action" variant="primary" onClick={save} loading={saveFetcher.state !== "idle"}>Save configuration</s-button>
      <s-section heading="Product template"><s-stack direction="block" gap="base">
        <s-paragraph>Build each product independently. Add as many photo, text, design-file and Canva-link fields as its artwork needs.</s-paragraph>
        <s-button onClick={chooseProduct}>Choose product</s-button>
        {selected && <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued"><s-text type="strong">{selected.title}</s-text></s-box>}
        <s-switch label="Enable personalization" checked={config.enabled} onChange={(event) => setConfig({ ...config, enabled: event.currentTarget.checked })} />
        <s-grid gridTemplateColumns="2fr 1fr" gap="base"><s-url-field label="Transparent product overlay PNG URL" value={config.overlayUrl} placeholder="https://cdn.shopify.com/..." onInput={(event) => setConfig({ ...config, overlayUrl: event.currentTarget.value })} /><s-select label="Artwork ratio" value={config.canvasRatio} onChange={(event) => setConfig({ ...config, canvasRatio: event.currentTarget.value })}>{!["1:1", "2:3", "3:2", "4:5", "5:4"].includes(config.canvasRatio) && <s-option value={config.canvasRatio}>PSD original ({config.canvasRatio})</s-option>}<s-option value="1:1">1:1 square</s-option><s-option value="2:3">2:3 portrait</s-option><s-option value="3:2">3:2 landscape</s-option><s-option value="4:5">4:5 portrait</s-option><s-option value="5:4">5:4 landscape</s-option></s-select></s-grid>
        <imageFetcher.Form method="post" encType="multipart/form-data"><input type="hidden" name="intent" value="uploadImage" /><input type="hidden" name="target" value="overlay" /><input key={`overlay-${imageKey}`} type="file" name="imageFile" accept=".png,.jpg,.jpeg,.webp" required /> <s-button type="submit" loading={imageFetcher.state !== "idle"}>Upload product artwork / overlay</s-button></imageFetcher.Form>
        <s-stack direction="inline" gap="base"><s-number-field label="Number of photo slots" min={1} max={Math.max(1, MAX_FIELDS - config.photoFields.length)} value={String(addCount)} onInput={(event) => setAddCount(clamp(event.currentTarget.value, 1, Math.max(1, MAX_FIELDS - config.photoFields.length), 1))} /><s-button onClick={addPhotos}>Add photo slots</s-button><s-button onClick={() => setConfig({ ...config, textFields: [...config.textFields, blankText(config.textFields.length)] })}>Add text field</s-button><s-button onClick={() => setConfig({ ...config, fileFields: [...config.fileFields, blankFile(config.fileFields.length)] })}>Add design-file field</s-button><s-button onClick={() => setConfig({ ...config, linkFields: [...config.linkFields, blankLink(config.linkFields.length)] })}>Add Canva-link field</s-button></s-stack>
      </s-stack></s-section>

      <s-section heading="PSD auto template import"><s-stack direction="block" gap="base">
        <s-paragraph>Upload one layered PSD. Every PHOTO or UPLOAD layer becomes a customer photo slot, and every editable Photoshop text layer becomes a text field. Positions, sizes, masks, fonts and colours are imported automatically.</s-paragraph>
        <input key={psdKey} type="file" accept=".psd,image/vnd.adobe.photoshop" onChange={importPsd} disabled={Boolean(psdStatus) || psdFetcher.state !== "idle"} />
        {(psdStatus || psdFetcher.state !== "idle") && <s-paragraph>{psdStatus || "Finishing PSD import…"}</s-paragraph>}
      </s-stack></s-section>

      <s-section heading="Visual artwork editor"><s-stack direction="block" gap="base">
        <s-paragraph>Each numbered box is the exact customer upload position. Drag a box to move it; select it to change its size or upload its own transparent PNG mask.</s-paragraph>
        <div ref={editorRef} style={{ ...ratioStyle, position: "relative", width: "min(100%, 720px)", overflow: "hidden", background: "#eceff3", border: "1px solid #8c9196", margin: "0 auto", touchAction: "none" }}>
          {config.photoFields.map((field, index) => <button key={field.id} type="button" onPointerDown={(event) => beginSlotDrag(event, field)} onClick={() => setActiveSlot(field.id)} style={{ position: "absolute", left: `${field.x}%`, top: `${field.y}%`, width: `${field.width}%`, height: `${field.height}%`, transform: "translate(-50%, -50%)", border: activeSlot === field.id ? "3px solid #005bd3" : "2px solid #458fff", background: field.maskUrl ? `#fff8 url(${field.maskUrl}) center/100% 100% no-repeat` : "#ffffff99", color: "#111", fontWeight: 700, cursor: "move", zIndex: 2 }}>{index + 1}<br/><small>{field.label}</small></button>)}
          {config.textFields.map((field) => <div key={field.id} style={{ position: "absolute", left: `${field.x}%`, top: `${field.y}%`, transform: "translate(-50%,-50%)", color: field.color, fontFamily: field.fontFamily, fontSize: `${Math.max(10, field.fontSize / 3)}px`, fontWeight: 700, zIndex: 3 }}>{field.defaultValue || field.label}</div>)}
          {config.overlayUrl && <img src={config.overlayUrl} alt="Product artwork overlay" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", pointerEvents: "none", zIndex: 4 }} />}
        </div>
      </s-stack></s-section>

      <s-section heading="Custom fonts"><s-stack direction="block" gap="base">
        <s-paragraph>Upload WOFF, WOFF2, TTF or OTF fonts. Uploaded fonts become available to every text field in this product.</s-paragraph>
        <fontFetcher.Form method="post" encType="multipart/form-data"><input type="hidden" name="intent" value="uploadFont" /><input key={fontKey} type="file" name="fontFile" accept=".woff,.woff2,.ttf,.otf" required /> <s-button variant="primary" type="submit" loading={fontFetcher.state !== "idle"}>Upload font</s-button></fontFetcher.Form>
        {config.customFonts.map((font) => <s-box key={font.id} padding="small-400" borderWidth="base" borderRadius="base"><s-stack direction="inline" gap="base" alignItems="center"><s-text>{font.name}</s-text><s-button tone="critical" onClick={() => setConfig({ ...config, customFonts: config.customFonts.filter((item) => item.id !== font.id) })}>Remove</s-button></s-stack></s-box>)}
      </s-stack></s-section>

      <s-section heading="Bulk CSV product templates"><s-stack direction="block" gap="base">
        <s-paragraph>Import many products and photo slots together. Use one row per photo slot. Product handles must match Shopify.</s-paragraph>
        <a download="cartwala-personalizer-template.csv" href={'data:text/csv;charset=utf-8,' + encodeURIComponent('product_handle,enabled,ratio,overlay_url,slot_label,x,y,width,height,mask_url,required,rotation\nbaby-photo-frame,true,1:1,https://cdn.shopify.com/overlay.png,Photo 1,25,25,20,20,https://cdn.shopify.com/mask-1.png,true,false')}>Download CSV sample</a>
        <input type="file" accept=".csv,text/csv" onChange={importCsv} disabled={bulkFetcher.state !== "idle"} />
        {bulkFetcher.state !== "idle" && <s-paragraph>Importing product templates…</s-paragraph>}
      </s-stack></s-section>

      {config.photoFields.map((field, index) => <s-section key={field.id} heading={`Photo slot ${index + 1}: ${field.label}`}><s-stack direction="block" gap="base">
        <s-text-field label="Customer-facing label" value={field.label} onInput={(event) => updatePhoto(field.id, { label: event.currentTarget.value })} />
        <s-grid gridTemplateColumns="1fr 1fr 1fr 1fr" gap="base"><s-number-field label="Left / X (%)" min={0} max={100} value={String(field.x)} onInput={(event) => updateClampedNumber("photoFields", field.id, "x", 0, 100, field.x, event.currentTarget.value)} /><s-number-field label="Top / Y (%)" min={0} max={100} value={String(field.y)} onInput={(event) => updateClampedNumber("photoFields", field.id, "y", 0, 100, field.y, event.currentTarget.value)} /><s-number-field label="Slot width (%)" min={2} max={100} value={String(field.width)} onInput={(event) => updateClampedNumber("photoFields", field.id, "width", 2, 100, field.width, event.currentTarget.value)} /><s-number-field label="Slot height (%)" min={2} max={100} value={String(field.height)} onInput={(event) => updateClampedNumber("photoFields", field.id, "height", 2, 100, field.height, event.currentTarget.value)} /></s-grid>
        <s-url-field label="This slot's transparent PNG mask URL" value={field.maskUrl} placeholder="Optional transparent mask" onInput={(event) => updatePhoto(field.id, { maskUrl: event.currentTarget.value })} />
        <imageFetcher.Form method="post" encType="multipart/form-data"><input type="hidden" name="intent" value="uploadImage" /><input type="hidden" name="target" value={field.id} /><input key={`${field.id}-${imageKey}`} type="file" name="imageFile" accept=".png,.jpg,.jpeg,.webp" required /> <s-button type="submit" loading={imageFetcher.state !== "idle"}>Upload mask for slot {index + 1}</s-button></imageFetcher.Form>
        <s-stack direction="inline" gap="base"><s-button onClick={() => { setActiveSlot(field.id); editorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); }}>Show slot on artwork</s-button><s-switch label="Required" checked={field.required} onChange={(event) => updatePhoto(field.id, { required: event.currentTarget.checked })} /><s-switch label="Allow customer photo rotation" checked={field.rotationEnabled} onChange={(event) => updatePhoto(field.id, { rotationEnabled: event.currentTarget.checked })} /></s-stack>{fieldActions("photoFields", field.id, index, config.photoFields.length)}
      </s-stack></s-section>)}

      {config.textFields.map((field, index) => <s-section key={field.id} heading={`Text field ${index + 1}`}><s-stack direction="block" gap="base"><s-grid gridTemplateColumns="1fr 1fr" gap="base"><s-text-field label="Customer-facing label" value={field.label} onInput={(event) => updateText(field.id, { label: event.currentTarget.value })} /><s-text-field label="Default text from PSD" value={field.defaultValue} onInput={(event) => updateText(field.id, { defaultValue: event.currentTarget.value })} /></s-grid><s-grid gridTemplateColumns="1fr 1fr 1fr" gap="base"><s-number-field label="Maximum characters" min={1} max={500} value={String(field.maxLength)} onInput={(event) => updateClampedNumber("textFields", field.id, "maxLength", 1, 500, field.maxLength, event.currentTarget.value)} /><s-color-field label="Text color" value={field.color} onInput={(event) => updateText(field.id, { color: event.currentTarget.value })} /><s-number-field label="Font size" min={8} max={300} value={String(field.fontSize)} onInput={(event) => updateClampedNumber("textFields", field.id, "fontSize", 8, 300, field.fontSize, event.currentTarget.value)} /></s-grid><s-grid gridTemplateColumns="1fr 1fr 1fr" gap="base"><s-number-field label="Horizontal position (%)" min={0} max={100} value={String(field.x)} onInput={(event) => updateClampedNumber("textFields", field.id, "x", 0, 100, field.x, event.currentTarget.value)} /><s-number-field label="Vertical position (%)" min={0} max={100} value={String(field.y)} onInput={(event) => updateClampedNumber("textFields", field.id, "y", 0, 100, field.y, event.currentTarget.value)} /><s-select label="Default font" value={field.fontFamily} onChange={(event) => updateText(field.id, { fontFamily: event.currentTarget.value })}>{[...new Set([...systemFonts, ...config.customFonts.map((font) => font.name), field.fontFamily])].map((font) => <s-option key={font} value={font}>{font}</s-option>)}</s-select></s-grid><s-stack direction="inline" gap="base"><s-switch label="Required" checked={field.required} onChange={(event) => updateText(field.id, { required: event.currentTarget.checked })} /><s-switch label="Let customer choose a font" checked={field.allowFontChoice} onChange={(event) => updateText(field.id, { allowFontChoice: event.currentTarget.checked })} /></s-stack>{fieldActions("textFields", field.id, index, config.textFields.length)}</s-stack></s-section>)}

      {config.fileFields.map((field, index) => <s-section key={field.id} heading={`Design-file field ${index + 1}`}><s-stack direction="block" gap="base"><s-text-field label="Customer-facing label" value={field.label} onInput={(event) => updateFile(field.id, { label: event.currentTarget.value })} /><s-grid gridTemplateColumns="2fr 1fr" gap="base"><s-text-field label="Allowed file extensions" value={field.accept} onInput={(event) => updateFile(field.id, { accept: event.currentTarget.value })} /><s-number-field label="Maximum file size (MB)" min={1} max={200} value={String(field.maxSizeMb)} onInput={(event) => updateClampedNumber("fileFields", field.id, "maxSizeMb", 1, 200, field.maxSizeMb, event.currentTarget.value)} /></s-grid><s-switch label="Required" checked={field.required} onChange={(event) => updateFile(field.id, { required: event.currentTarget.checked })} />{fieldActions("fileFields", field.id, index, config.fileFields.length)}</s-stack></s-section>)}

      {config.linkFields.map((field, index) => <s-section key={field.id} heading={`Canva-link field ${index + 1}`}><s-stack direction="block" gap="base"><s-text-field label="Customer-facing label" value={field.label} onInput={(event) => updateLink(field.id, { label: event.currentTarget.value })} /><s-text-field label="Placeholder" value={field.placeholder} onInput={(event) => updateLink(field.id, { placeholder: event.currentTarget.value })} /><s-switch label="Required" checked={field.required} onChange={(event) => updateLink(field.id, { required: event.currentTarget.checked })} />{fieldActions("linkFields", field.id, index, config.linkFields.length)}</s-stack></s-section>)}

      <s-section heading="Configuration summary"><s-paragraph>{config.photoFields.length} photos · {config.textFields.length} texts · {config.fileFields.length} design files · {config.linkFields.length} Canva links · {config.customFonts.length} custom fonts{dirty ? " · Unsaved changes" : ""}</s-paragraph></s-section>
    </s-page>
  );
}

export function ErrorBoundary() { return boundary.error(useRouteError()); }
export const headers: HeadersFunction = (args) => boundary.headers(args);
