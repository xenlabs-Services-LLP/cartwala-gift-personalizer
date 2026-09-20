/* eslint-disable @typescript-eslint/no-explicit-any, no-empty -- Shopify GraphQL and ag-psd payloads are runtime-normalized below. */
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
type PhotoDesign = {
  i: string;
  l: string;
  x: number;
  y: number;
  w: number;
  h: number;
  m: string;
  ox: number;
  oy: number;
  s: number;
  a: number;
};
type TextDesign = {
  i: string;
  l: string;
  v: string;
  x: number;
  y: number;
  w: number;
  h: number;
  q: "left" | "center" | "right";
  b: boolean;
  z: number;
  c: string;
  f: string;
  a?: number;
};
type Design = {
  v: number;
  r: string;
  o: string;
  p: PhotoDesign[];
  t: TextDesign[];
};
type PhotoLayer = {
  name: string;
  canvas: HTMLCanvasElement;
  mask: HTMLCanvasElement;
  preview: HTMLCanvasElement;
  left: number;
  top: number;
};
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const response = await admin.graphql(`#graphql
 query CartwalaPrintOrders($after: String) { orders(first: 50, after: $after, reverse: true, sortKey: CREATED_AT) { nodes { id name createdAt displayFinancialStatus lineItems(first: 100) { nodes { id name title quantity customAttributes { key value } product { id title metafield(namespace: "$app", key: "personalizer_config") { jsonValue } } } } } pageInfo { hasNextPage endCursor } } }`);
  const payload = (await response.json()) as any;
  const items: PrintItem[] = [];
  for (const order of payload?.data?.orders?.nodes || [])
    for (const line of order?.lineItems?.nodes || []) {
      const attributes: Attribute[] = Array.isArray(line.customAttributes)
        ? line.customAttributes
        : [];
      if (
        !attributes.some((a) =>
          [
            "_Cartwala Personalization",
            "_Cartwala Design ID",
            "_Personalised Preview",
            "_Cartwala Design JSON",
          ].includes(a.key),
        )
      )
        continue;
      items.push({
        orderId: order.id,
        orderName: order.name,
        createdAt: order.createdAt,
        financialStatus: order.displayFinancialStatus || null,
        lineItemId: line.id,
        productTitle:
          line.name ||
          line.title ||
          line.product?.title ||
          "Personalised product",
        quantity: line.quantity || 1,
        attributes,
        config: line.product?.metafield?.jsonValue || null,
      });
    }
  return { items };
};
const attrMap = (a: Attribute[]) =>
  Object.fromEntries(a.map((x) => [x.key, x.value]));
const numeric = (v: unknown, f: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : f;
};
const safeFile = (v: string) =>
  v
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90) || "cartwala-print";
function fallbackDesign(
  value: unknown,
  attributes: Record<string, string>,
): Design {
  const c = value && typeof value === "object" ? (value as any) : {};
  const photos = Array.isArray(c.photoFields) ? c.photoFields : [],
    texts = Array.isArray(c.textFields) ? c.textFields : [];
  return {
    v: 0,
    r: typeof c.canvasRatio === "string" ? c.canvasRatio : "1:1",
    o: typeof c.overlayUrl === "string" ? c.overlayUrl : "",
    p: photos.map((f: any, i: number) => ({
      i: String(f.id ?? i),
      l: String(f.label || `Photo ${i + 1}`),
      x: numeric(f.x, 50),
      y: numeric(f.y, 50),
      w: numeric(f.width, 24),
      h: numeric(f.height, 24),
      m: String(f.maskUrl || ""),
      ox: 0,
      oy: 0,
      s: 1,
      a: 0,
    })),
    t: texts
      .map((f: any, i: number) => ({
        i: String(f.id ?? i),
        l: String(f.label || `Text ${i + 1}`),
        v: String(
          attributes[String(f.label || `Text ${i + 1}`)] || "",
        ),
        x: numeric(f.x, 50),
        y: numeric(f.y, 50),
        w: numeric(f.width, 30),
        h: numeric(f.height, 12),
        q: ["left", "center", "right"].includes(String(f.alignment))
          ? f.alignment
          : "center",
        b: f.fitToBox === true,
        z: numeric(f.fontSize, 60),
        c: String(f.color || "#111111"),
        f: String(
          attributes[`_${String(f.label || `Text ${i + 1}`)} Font`] ||
            f.fontFamily ||
            "Arial",
        ),
      }))
      .filter((t: TextDesign) => t.v.trim()),
  };
}
function getDesign(item: PrintItem) {
  const attributes = attrMap(item.attributes),
    raw = attributes["_Cartwala Design JSON"];
  if (raw)
    try {
      const p = JSON.parse(raw) as Design;
      if (p && Array.isArray(p.p) && Array.isArray(p.t))
        return { design: p, exact: true, attributes };
    } catch {}
  return {
    design: fallbackDesign(item.config, attributes),
    exact: false,
    attributes,
  };
}
const documentSize = (r: string) => {
  const m = /^(\d{1,5}):(\d{1,5})$/.exec(r || "");
  const rw = m ? Math.max(1, Number(m[1])) : 1,
    rh = m ? Math.max(1, Number(m[2])) : 1,
    l = 3000;
  return rw >= rh
    ? { width: l, height: Math.max(1, Math.round((l * rh) / rw)) }
    : { width: Math.max(1, Math.round((l * rw) / rh)), height: l };
};
const assetUrl = (u: string) =>
  u.startsWith("data:") ? u : `/app/print-asset?url=${encodeURIComponent(u)}`;
const loadImage = (u: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("A print asset could not be loaded."));
    i.src = assetUrl(u);
  });
const makeCanvas = (w: number, h: number) => {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
};
const sourceFor = (a: Record<string, string>, l: string) =>
  a[`_${l}`] || a[l] || "";
async function renderPhotoLayer(
  photo: PhotoDesign,
  source: string,
  width: number,
  height: number,
): Promise<PhotoLayer> {
  const preview = makeCanvas(width, height),
    pctx = preview.getContext("2d"),
    empty = makeCanvas(1, 1);
  if (!pctx || !source)
    return {
      name: photo.l || "Photo",
      canvas: empty,
      mask: empty,
      preview,
      left: 0,
      top: 0,
    };
  const image = await loadImage(source),
    sw = (width * photo.w) / 100,
    sh = (height * photo.h) / 100,
    sx = (width * photo.x) / 100,
    sy = (height * photo.y) / 100,
    fit = Math.max(sw / image.naturalWidth, sh / image.naturalHeight),
    scale = Math.max(0.0001, photo.s || 1),
    drawW = image.naturalWidth * fit * scale,
    drawH = image.naturalHeight * fit * scale,
    angle = ((photo.a || 0) * Math.PI) / 180,
    cx = sx + photo.ox * width,
    cy = sy + photo.oy * height,
    boundW =
      Math.abs(drawW * Math.cos(angle)) + Math.abs(drawH * Math.sin(angle)),
    boundH =
      Math.abs(drawW * Math.sin(angle)) + Math.abs(drawH * Math.cos(angle)),
    rawLeft = Math.round(cx - boundW / 2),
    rawTop = Math.round(cy - boundH / 2),
    left = Math.max(0, rawLeft),
    top = Math.max(0, rawTop),
    cropX = Math.max(0, -rawLeft),
    cropY = Math.max(0, -rawTop),
    canvas = makeCanvas(
      Math.min(boundW - cropX, width - left),
      Math.min(boundH - cropY, height - top),
    ),
    ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.translate(boundW / 2 - cropX, boundH / 2 - cropY);
    ctx.rotate(angle);
    ctx.drawImage(image, -drawW / 2, -drawH / 2, drawW, drawH);
  }
  const slotLeft = sx - sw / 2,
    slotTop = sy - sh / 2,
    mask = makeCanvas(canvas.width, canvas.height),
    mctx = mask.getContext("2d");
  if (mctx) {
    mctx.fillStyle = "#000";
    mctx.fillRect(0, 0, mask.width, mask.height);
    mctx.fillStyle = "#fff";
    mctx.fillRect(slotLeft - left, slotTop - top, sw, sh);
    if (photo.m) {
      const shape = await loadImage(photo.m),
        shapeCanvas = makeCanvas(canvas.width, canvas.height),
        sctx = shapeCanvas.getContext("2d");
      if (sctx) {
        sctx.drawImage(shape, slotLeft - left, slotTop - top, sw, sh);
        mctx.globalCompositeOperation = "destination-in";
        mctx.drawImage(shapeCanvas, 0, 0);
        mctx.globalCompositeOperation = "source-over";
      }
    }
  }
  pctx.drawImage(canvas, left, top);
  const fullMask = makeCanvas(width, height),
    fm = fullMask.getContext("2d");
  if (fm) {
    fm.drawImage(mask, left, top);
    pctx.globalCompositeOperation = "destination-in";
    pctx.drawImage(fullMask, 0, 0);
    pctx.globalCompositeOperation = "source-over";
  }
  return { name: photo.l || "Photo", canvas, mask, preview, left, top };
}
const hexColor = (v: string) => {
  const h = /^#([0-9a-f]{6})$/i.exec(v || "")?.[1] || "111111";
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
};
const textLayout = (
  context: CanvasRenderingContext2D,
  text: TextDesign,
  width: number,
  height: number,
) => {
  const boxWidth = (width * numeric(text.w, 30)) / 100,
    boxHeight = (height * numeric(text.h, 12)) / 100,
    baseSize = (numeric(text.z, 60) * width) / 1200,
    family = text.f || "Arial";
  context.font = `700 ${baseSize}px "${family}", sans-serif`;
  const measuredWidth = Math.max(1, context.measureText(text.v).width),
    size = Math.max(
      1,
      baseSize *
        (text.b === true
          ? Math.min(
              1,
              boxWidth / measuredWidth,
              boxHeight / (baseSize * 1.05),
            )
          : 1),
    ),
    alignment = ["left", "center", "right"].includes(String(text.q))
      ? text.q
      : "center";
  return { boxWidth, boxHeight, size, family, alignment };
};
const textCanvas = (text: TextDesign, width: number, height: number) => {
  const c = makeCanvas(width, height),
    x = c.getContext("2d");
  if (!x) return c;
  const { boxWidth, size, family, alignment } = textLayout(x, text, width, height);
  x.save();
  x.translate((width * text.x) / 100, (height * text.y) / 100);
  x.rotate((numeric(text.a, 0) * Math.PI) / 180);
  x.fillStyle = text.c || "#111111";
  x.textAlign = text.b === true ? alignment : "center";
  x.textBaseline = "middle";
  x.font = `700 ${size}px "${family}", sans-serif`;
  x.fillText(
    text.v,
    text.b !== true
      ? 0
      : alignment === "left"
        ? -boxWidth / 2
        : alignment === "right"
          ? boxWidth / 2
          : 0,
    0,
  );
  x.restore();
  return c;
};
const psdTextLayer = (t: TextDesign, width: number, height: number) => {
  const probe = document.createElement("canvas").getContext("2d"),
    layout = probe
      ? textLayout(probe, t, width, height)
      : {
          boxWidth: (width * numeric(t.w, 30)) / 100,
          boxHeight: (height * numeric(t.h, 12)) / 100,
          size: (numeric(t.z, 60) * width) / 1200,
          family: t.f || "Arial",
          alignment: "center" as const,
        },
    measuredWidth = probe?.measureText(t.v).width || layout.size * t.v.length * 0.6,
    tw = Math.max(
      4,
      Math.ceil(t.b === true ? layout.boxWidth : measuredWidth + layout.size * 0.35),
    ),
    th = Math.max(
      4,
      Math.ceil(t.b === true ? layout.boxHeight : layout.size * 1.45),
    ),
    left = Math.max(0, Math.round((width * t.x) / 100 - tw / 2)),
    top = Math.max(0, Math.round((height * t.y) / 100 - th / 2)),
    canvas = makeCanvas(Math.min(tw, width - left), Math.min(th, height - top)),
    c = canvas.getContext("2d");
  if (c) {
    c.fillStyle = t.c || "#111111";
    c.textAlign = t.b === true ? layout.alignment : "center";
    c.textBaseline = "middle";
    c.font = `700 ${layout.size}px "${layout.family}", sans-serif`;
    c.fillText(
      t.v,
      t.b !== true
        ? canvas.width / 2
        : layout.alignment === "left"
        ? 0
        : layout.alignment === "right"
          ? canvas.width
          : canvas.width / 2,
      canvas.height / 2,
    );
  }
  return {
    name: t.l || "Text",
    canvas,
    left,
    top,
    text: {
      text: t.v,
      transform:
        t.b === true
          ? [1, 0, 0, 1, 0, 0]
          : [1, 0, 0, 1, canvas.width / 2, canvas.height / 2],
      ...(t.b === true
        ? {
            left: 0,
            top: 0,
            right: canvas.width,
            bottom: canvas.height,
            shapeType: "box" as const,
            boxBounds: [0, 0, canvas.width, canvas.height],
          }
        : { shapeType: "point" as const, pointBase: [0, 0] }),
      style: {
        font: { name: layout.family },
        fontSize: (layout.size * 72) / 300,
        fillColor: hexColor(t.c),
      },
      paragraphStyle: { justification: layout.alignment },
    },
  };
};
async function buildPrint(item: PrintItem) {
  const { design, exact, attributes } = getDesign(item),
    { width, height } = documentSize(design.r),
    composite = makeCanvas(width, height),
    ctx = composite.getContext("2d");
  if (!ctx) throw new Error("Print canvas is unavailable.");
  const photoLayers: PhotoLayer[] = [];
  for (const photo of design.p) {
    const source = sourceFor(attributes, photo.l);
    if (!source) continue;
    const layer = await renderPhotoLayer(photo, source, width, height);
    ctx.drawImage(layer.preview, 0, 0);
    photoLayers.push(layer);
  }
  let overlayLayer: { name: string; canvas: HTMLCanvasElement } | null = null;
  if (design.o) {
    const overlay = await loadImage(design.o),
      canvas = makeCanvas(width, height),
      c = canvas.getContext("2d");
    if (c) c.drawImage(overlay, 0, 0, width, height);
    ctx.drawImage(canvas, 0, 0);
    overlayLayer = { name: "Template / Overlay", canvas };
  }
  for (const text of design.t)
    if (text.v.trim()) ctx.drawImage(textCanvas(text, width, height), 0, 0);
  return {
    design,
    exact,
    attributes,
    width,
    height,
    composite,
    photoLayers,
    overlayLayer,
  };
}
const canvasBlob = (
  c: HTMLCanvasElement,
  type = "image/png",
  quality?: number,
) =>
  new Promise<Blob>((resolve, reject) =>
    c.toBlob(
      (b) =>
        b
          ? resolve(b)
          : reject(new Error("Print file could not be generated.")),
      type,
      quality,
    ),
  );
const downloadBlob = (blob: Blob, filename: string) => {
  const u = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = u;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 2000);
};
async function downloadPng(item: PrintItem) {
  const p = await buildPrint(item);
  if (!p.photoLayers.length && p.attributes["_Personalised Preview"]) {
    const r = await fetch(assetUrl(p.attributes["_Personalised Preview"]));
    if (!r.ok) throw new Error("Saved preview could not be downloaded.");
    downloadBlob(
      await r.blob(),
      `${safeFile(`${item.orderName}-${item.productTitle}`)}.png`,
    );
    return;
  }
  downloadBlob(
    await canvasBlob(p.composite),
    `${safeFile(`${item.orderName}-${item.productTitle}`)}.png`,
  );
}
async function downloadPsd(item: PrintItem) {
  const p = await buildPrint(item);
  if (!p.photoLayers.length)
    throw new Error(
      "Source photo is missing for this order. A layered PSD cannot be created from the flattened preview alone.",
    );
  const { writePsd } = await import("ag-psd");
  const textLayers = p.design.t
    .filter((t) => t.v.trim())
    .map((t) => psdTextLayer(t, p.width, p.height));
  const photoLayers = p.photoLayers.map((l) => ({
    name: l.name,
    canvas: l.canvas,
    left: l.left,
    top: l.top,
    mask: {
      top: l.top,
      left: l.left,
      bottom: l.top + l.mask.height,
      right: l.left + l.mask.width,
      defaultColor: 0,
      disabled: false,
      positionRelativeToLayer: false,
      fromVectorData: false,
      canvas: l.mask,
    },
  }));
  const children: any[] = [
    ...(p.overlayLayer ? [p.overlayLayer] : []),
    ...photoLayers,
    ...textLayers,
  ];
  const bytes = writePsd(
    {
      width: p.width,
      height: p.height,
      canvas: p.composite,
      imageResources: {
        resolutionInfo: {
          horizontalResolution: 300,
          horizontalResolutionUnit: "PPI",
          widthUnit: "Inches",
          verticalResolution: 300,
          verticalResolutionUnit: "PPI",
          heightUnit: "Inches",
        },
      },
      children,
    } as any,
    { invalidateTextLayers: true } as any,
  );
  const view =
      bytes instanceof Uint8Array
        ? bytes
        : new Uint8Array(bytes as ArrayBuffer),
    buffer = view.buffer.slice(
      view.byteOffset,
      view.byteOffset + view.byteLength,
    ) as ArrayBuffer;
  downloadBlob(
    new Blob([buffer], { type: "image/vnd.adobe.photoshop" }),
    `${safeFile(`${item.orderName}-${item.productTitle}`)}.psd`,
  );
}
export default function PrintFilesPage() {
  const { items } = useLoaderData<typeof loader>();
  const [working, setWorking] = useState("");
  const grouped = useMemo(() => {
    const m = new Map<string, PrintItem[]>();
    for (const i of items)
      m.set(i.orderName, [...(m.get(i.orderName) || []), i]);
    return [...m.entries()];
  }, [items]);
  const run = async (k: string, task: () => Promise<void>) => {
    if (working) return;
    setWorking(k);
    try {
      await task();
    } catch (e) {
      window.alert(
        e instanceof Error ? e.message : "Print file generation failed.",
      );
    } finally {
      setWorking("");
    }
  };
  return (
    <s-page heading="Print Files">
      <s-section heading="Personalised orders">
        <s-paragraph>
          Download a print-ready PNG or an editable layered PSD. PSD keeps full
          customer photos with non-destructive masks, template/overlay and
          editable text as separate layers.
        </s-paragraph>
      </s-section>
      {grouped.length === 0 ? (
        <s-section heading="No personalised orders yet">
          <s-paragraph>
            Place a personalised test order after this feature is deployed. It
            will appear here automatically.
          </s-paragraph>
        </s-section>
      ) : (
        grouped.map(([orderName, orderItems]) => (
          <s-section
            key={orderName}
            heading={`${orderName} · ${new Date(orderItems[0].createdAt).toLocaleString()}`}
          >
            {orderItems.map((item) => {
              const { exact, attributes } = getDesign(item);
              const hasSource = Object.keys(attributes).some(
                (k) =>
                  k.startsWith("_") &&
                  !k.startsWith("_Cartwala") &&
                  k !== "_Personalised Preview" &&
                  /^https?:/i.test(attributes[k] || ""),
              );
              const pk = `${item.lineItemId}:png`,
                sk = `${item.lineItemId}:psd`;
              return (
                <div
                  key={item.lineItemId}
                  style={{
                    border: "1px solid #ddd",
                    borderRadius: 12,
                    padding: 16,
                    marginBottom: 12,
                    background: "white",
                  }}
                >
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>
                    {item.productTitle}
                  </div>
                  <div
                    style={{ color: "#666", fontSize: 13, marginBottom: 12 }}
                  >
                    Qty {item.quantity} ·{" "}
                    {exact
                      ? "Layer data ready"
                      : "Legacy order / default positions"}
                    {!hasSource ? " · source photo missing" : ""}
                  </div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() => run(pk, () => downloadPng(item))}
                      disabled={Boolean(working)}
                      style={{
                        background: "#ff6200",
                        color: "white",
                        border: 0,
                        borderRadius: 8,
                        padding: "11px 18px",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      {working === pk ? "Generating PNG…" : "Download PNG"}
                    </button>
                    <button
                      type="button"
                      onClick={() => run(sk, () => downloadPsd(item))}
                      disabled={Boolean(working) || !hasSource}
                      style={{
                        background: "#111",
                        color: "white",
                        border: 0,
                        borderRadius: 8,
                        padding: "11px 18px",
                        fontWeight: 700,
                        cursor: "pointer",
                        opacity: !hasSource ? 0.45 : 1,
                      }}
                    >
                      {working === sk ? "Generating PSD…" : "Download PSD"}
                    </button>
                  </div>
                </div>
              );
            })}
          </s-section>
        ))
      )}
    </s-page>
  );
}
export const headers: HeadersFunction = (args) => boundary.headers(args);
