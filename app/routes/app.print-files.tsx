import { useMemo, useState } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

type Attribute = { key: string; value: string };
type PrintItem = {
  orderId: string;
  orderName: string;
  createdAt: string;
  financialStatus: string | null;
  lineItemId: string;
  productTitle: string;
  quantity: number;
  attributes: Attribute[];
  config: unknown;
};

type PhotoDesign = { i: string; l: string; x: number; y: number; w: number; h: number; m: string; ox: number; oy: number; s: number; a: number };
type TextDesign = { i: string; l: string; v: string; x: number; y: number; z: number; c: string; f: string };
type Design = { v: number; r: string; o: string; p: PhotoDesign[]; t: TextDesign[] };

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const response = await admin.graphql(`#graphql
    query CartwalaPrintOrders($after: String) {
      orders(first: 50, after: $after, reverse: true, sortKey: CREATED_AT) {
        nodes {
          id
          name
          createdAt
          displayFinancialStatus
          lineItems(first: 100) {
            nodes {
              id
              name
              title
              quantity
              customAttributes { key value }
              product {
                id
                title
                metafield(namespace: "$app", key: "personalizer_config") { jsonValue }
              }
            }
          }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  `);
  const payload = await response.json() as any;
  const items: PrintItem[] = [];
  for (const order of payload?.data?.orders?.nodes || []) {
    for (const line of order?.lineItems?.nodes || []) {
      const attributes: Attribute[] = Array.isArray(line.customAttributes) ? line.customAttributes : [];
      const personalized = attributes.some((attribute) =>
        ["_Cartwala Personalization", "_Cartwala Design ID", "_Personalised Preview", "_Cartwala Design JSON"].includes(attribute.key),
      );
      if (!personalized) continue;
      items.push({
        orderId: order.id,
        orderName: order.name,
        createdAt: order.createdAt,
        financialStatus: order.displayFinancialStatus || null,
        lineItemId: line.id,
        productTitle: line.name || line.title || line.product?.title || "Personalised product",
        quantity: line.quantity || 1,
        attributes,
        config: line.product?.metafield?.jsonValue || null,
      });
    }
  }
  return { items };
};

const attrMap = (attributes: Attribute[]) => Object.fromEntries(attributes.map((attribute) => [attribute.key, attribute.value]));
const numeric = (value: unknown, fallback: number) => {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
};
const safeFile = (value: string) => value.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 90) || "cartwala-print";

function fallbackDesign(configValue: unknown, attributes: Record<string, string>): Design {
  const config = configValue && typeof configValue === "object" ? configValue as any : {};
  const photos = Array.isArray(config.photoFields) ? config.photoFields : [];
  const texts = Array.isArray(config.textFields) ? config.textFields : [];
  return {
    v: 0,
    r: typeof config.canvasRatio === "string" ? config.canvasRatio : "1:1",
    o: typeof config.overlayUrl === "string" ? config.overlayUrl : "",
    p: photos.map((field: any, index: number) => ({
      i: String(field.id ?? index), l: String(field.label || `Photo ${index + 1}`),
      x: numeric(field.x, 50), y: numeric(field.y, 50), w: numeric(field.width, 24), h: numeric(field.height, 24),
      m: String(field.maskUrl || ""), ox: 0, oy: 0, s: 1, a: 0,
    })),
    t: texts.map((field: any, index: number) => ({
      i: String(field.id ?? index), l: String(field.label || `Text ${index + 1}`),
      v: String(attributes[String(field.label || `Text ${index + 1}`)] || field.defaultValue || ""),
      x: numeric(field.x, 50), y: numeric(field.y, 50), z: numeric(field.fontSize, 60),
      c: String(field.color || "#111111"), f: String(attributes[`_${String(field.label || `Text ${index + 1}`)} Font`] || field.fontFamily || "Arial"),
    })).filter((text: TextDesign) => text.v.trim()),
  };
}

function getDesign(item: PrintItem) {
  const attributes = attrMap(item.attributes);
  const raw = attributes["_Cartwala Design JSON"];
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Design;
      if (parsed && Array.isArray(parsed.p) && Array.isArray(parsed.t)) return { design: parsed, exact: true, attributes };
    } catch { /* fall through to legacy config */ }
  }
  return { design: fallbackDesign(item.config, attributes), exact: false, attributes };
}

const documentSize = (ratio: string) => {
  const match = /^(\d{1,5}):(\d{1,5})$/.exec(ratio || "");
  const rw = match ? Math.max(1, Number(match[1])) : 1;
  const rh = match ? Math.max(1, Number(match[2])) : 1;
  const longest = 3000;
  return rw >= rh
    ? { width: longest, height: Math.max(1, Math.round(longest * rh / rw)) }
    : { width: Math.max(1, Math.round(longest * rw / rh)), height: longest };
};

const assetUrl = (url: string) => {
  if (url.startsWith("data:")) return url;
  return `/app/print-asset?url=${encodeURIComponent(url)}`;
};

const loadImage = (url: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error("A print asset could not be loaded."));
  image.src = assetUrl(url);
});

const makeCanvas = (width: number, height: number) => {
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  return canvas;
};

const sourceFor = (attributes: Record<string, string>, label: string) => attributes[`_${label}`] || attributes[label] || "";

async function renderPhotoLayer(photo: PhotoDesign, source: string, width: number, height: number) {
  const layer = makeCanvas(width, height);
  const context = layer.getContext("2d");
  if (!context || !source) return layer;
  const image = await loadImage(source);
  const slotW = width * photo.w / 100;
  const slotH = height * photo.h / 100;
  const slotX = width * photo.x / 100;
  const slotY = height * photo.y / 100;
  context.save();
  context.beginPath();
  context.rect(slotX - slotW / 2, slotY - slotH / 2, slotW, slotH);
  context.clip();
  context.translate(slotX + photo.ox * width, slotY + photo.oy * height);
  context.rotate(photo.a * Math.PI / 180);
  context.scale(photo.s || 1, photo.s || 1);
  const fit = Math.max(slotW / image.naturalWidth, slotH / image.naturalHeight);
  context.drawImage(image, -image.naturalWidth * fit / 2, -image.naturalHeight * fit / 2, image.naturalWidth * fit, image.naturalHeight * fit);
  context.restore();
  if (photo.m) {
    const mask = await loadImage(photo.m);
    context.globalCompositeOperation = "destination-in";
    context.drawImage(mask, slotX - slotW / 2, slotY - slotH / 2, slotW, slotH);
    context.globalCompositeOperation = "source-over";
  }
  return layer;
}

const hexColor = (value: string) => {
  const match = /^#([0-9a-f]{6})$/i.exec(value || "");
  const hex = match?.[1] || "111111";
  return { r: parseInt(hex.slice(0, 2), 16), g: parseInt(hex.slice(2, 4), 16), b: parseInt(hex.slice(4, 6), 16) };
};

async function buildPrint(item: PrintItem) {
  const { design, exact, attributes } = getDesign(item);
  const { width, height } = documentSize(design.r);
  const composite = makeCanvas(width, height);
  const compositeContext = composite.getContext("2d");
  if (!compositeContext) throw new Error("Print canvas is unavailable.");

  const photoLayers: Array<{ name: string; canvas: HTMLCanvasElement }> = [];
  for (const photo of design.p) {
    const source = sourceFor(attributes, photo.l);
    if (!source) continue;
    const canvas = await renderPhotoLayer(photo, source, width, height);
    compositeContext.drawImage(canvas, 0, 0);
    photoLayers.push({ name: photo.l || "Photo", canvas });
  }

  let overlayLayer: { name: string; canvas: HTMLCanvasElement } | null = null;
  if (design.o) {
    const overlay = await loadImage(design.o);
    const canvas = makeCanvas(width, height);
    const context = canvas.getContext("2d");
    if (context) context.drawImage(overlay, 0, 0, width, height);
    compositeContext.drawImage(canvas, 0, 0);
    overlayLayer = { name: "Template / Overlay", canvas };
  }

  for (const text of design.t) {
    if (!text.v.trim()) continue;
    const size = text.z * width / 1200;
    compositeContext.save();
    compositeContext.fillStyle = text.c || "#111111";
    compositeContext.textAlign = "center";
    compositeContext.textBaseline = "middle";
    compositeContext.font = `700 ${size}px "${text.f || "Arial"}", sans-serif`;
    compositeContext.fillText(text.v, width * text.x / 100, height * text.y / 100, width * 0.9);
    compositeContext.restore();
  }

  return { design, exact, attributes, width, height, composite, photoLayers, overlayLayer };
}

const canvasBlob = (canvas: HTMLCanvasElement, type = "image/png", quality?: number) => new Promise<Blob>((resolve, reject) => {
  canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Print file could not be generated.")), type, quality);
});

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = filename; document.body.appendChild(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
};

async function downloadPng(item: PrintItem) {
  const print = await buildPrint(item);
  if (!print.photoLayers.length && print.attributes["_Personalised Preview"]) {
    const response = await fetch(assetUrl(print.attributes["_Personalised Preview"]));
    if (!response.ok) throw new Error("Saved preview could not be downloaded.");
    downloadBlob(await response.blob(), `${safeFile(`${item.orderName}-${item.productTitle}`)}.png`);
    return;
  }
  const blob = await canvasBlob(print.composite, "image/png");
  downloadBlob(blob, `${safeFile(`${item.orderName}-${item.productTitle}`)}.png`);
}

async function downloadPsd(item: PrintItem) {
  const print = await buildPrint(item);
  if (!print.photoLayers.length) throw new Error("Source photo is missing for this order. A layered PSD cannot be created from the flattened preview alone.");
  const { writePsd } = await import("ag-psd");
  const textLayers = print.design.t.filter((text) => text.v.trim()).map((text) => {
    const size = text.z * print.width / 1200;
    return {
      name: text.l || "Text",
      text: {
        text: text.v,
        transform: [1, 0, 0, 1, print.width * text.x / 100, print.height * text.y / 100],
        style: { font: { name: text.f || "Arial" }, fontSize: size, fillColor: hexColor(text.c) },
      },
    };
  });
  const children: any[] = [
    ...textLayers,
    ...(print.overlayLayer ? [print.overlayLayer] : []),
    ...print.photoLayers.slice().reverse(),
  ];
  const bytes = writePsd({ width: print.width, height: print.height, children } as any, { invalidateTextLayers: true } as any);
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes as ArrayBuffer);
  const buffer = view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer;
  downloadBlob(new Blob([buffer], { type: "image/vnd.adobe.photoshop" }), `${safeFile(`${item.orderName}-${item.productTitle}`)}.psd`);
}

export default function PrintFilesPage() {
  const { items } = useLoaderData<typeof loader>();
  const [working, setWorking] = useState("");
  const grouped = useMemo(() => {
    const map = new Map<string, PrintItem[]>();
    for (const item of items) map.set(item.orderName, [...(map.get(item.orderName) || []), item]);
    return [...map.entries()];
  }, [items]);

  const run = async (key: string, task: () => Promise<void>) => {
    if (working) return;
    setWorking(key);
    try { await task(); }
    catch (error) { window.alert(error instanceof Error ? error.message : "Print file generation failed."); }
    finally { setWorking(""); }
  };

  return (
    <s-page heading="Print Files">
      <s-section heading="Personalised orders">
        <s-paragraph>Download a print-ready PNG or an editable layered PSD. PSD keeps customer photos, template/overlay and editable text as separate layers.</s-paragraph>
      </s-section>
      {grouped.length === 0 ? (
        <s-section heading="No personalised orders yet">
          <s-paragraph>Place a personalised test order after this feature is deployed. It will appear here automatically.</s-paragraph>
        </s-section>
      ) : grouped.map(([orderName, orderItems]) => (
        <s-section key={orderName} heading={`${orderName} · ${new Date(orderItems[0].createdAt).toLocaleString()}`}>
          {orderItems.map((item) => {
            const { exact, attributes } = getDesign(item);
            const hasSource = Object.keys(attributes).some((key) => key.startsWith("_") && !key.startsWith("_Cartwala") && key !== "_Personalised Preview" && /^https?:/i.test(attributes[key] || ""));
            const pngKey = `${item.lineItemId}:png`;
            const psdKey = `${item.lineItemId}:psd`;
            return (
              <div key={item.lineItemId} style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16, marginBottom: 12, background: "white" }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>{item.productTitle}</div>
                <div style={{ color: "#666", fontSize: 13, marginBottom: 12 }}>Qty {item.quantity} · {exact ? "Layer data ready" : "Legacy order / default positions"}{!hasSource ? " · source photo missing" : ""}</div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button type="button" onClick={() => run(pngKey, () => downloadPng(item))} disabled={Boolean(working)} style={{ background: "#ff6200", color: "white", border: 0, borderRadius: 8, padding: "11px 18px", fontWeight: 700, cursor: "pointer" }}>
                    {working === pngKey ? "Generating PNG…" : "Download PNG"}
                  </button>
                  <button type="button" onClick={() => run(psdKey, () => downloadPsd(item))} disabled={Boolean(working) || !hasSource} style={{ background: "#111", color: "white", border: 0, borderRadius: 8, padding: "11px 18px", fontWeight: 700, cursor: "pointer", opacity: !hasSource ? 0.45 : 1 }}>
                    {working === psdKey ? "Generating PSD…" : "Download PSD"}
                  </button>
                </div>
              </div>
            );
          })}
        </s-section>
      ))}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
