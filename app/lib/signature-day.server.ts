import { createHmac, timingSafeEqual } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import prisma from "../db.server";
import { unauthenticated } from "../shopify.server";

export const DESIGN_ATTRIBUTE = "_Cartwala Signature Day Design";
type Preview = { front: string; back?: string };
type Print = { front: string; back?: string };

export function isShopifyFileUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      (url.hostname === "cdn.shopify.com" || url.hostname.endsWith(".cdn.shopify.com")) &&
      url.pathname.startsWith("/s/files/");
  } catch { return false; }
}

export function validateDesign(input: unknown) {
  if (!input || typeof input !== "object") throw new Error("Invalid design");
  const data = input as Record<string, unknown>;
  const previews = data.previewUrls as Preview[];
  const prints = data.printUrls as Print[];
  const sources = data.sourceUrls as string[];
  const sizes = data.shirtSizes as string[];
  if (!Array.isArray(previews) || previews.length < 1 || previews.length > 100 ||
      !Array.isArray(prints) || prints.length !== previews.length ||
      !Array.isArray(sources) || sources.length !== previews.length ||
      !Array.isArray(sizes) || sizes.length !== previews.length ||
      !sizes.every((size) => ["XS", "S", "M", "L", "XL", "XXL"].includes(size)) ||
      !sources.every(isShopifyFileUrl) ||
      !previews.every((p) => p && isShopifyFileUrl(p.front) && (!p.back || isShopifyFileUrl(p.back))) ||
      !prints.every((p) => p && isShopifyFileUrl(p.front) && (!p.back || isShopifyFileUrl(p.back)))) {
    throw new Error("Incomplete preview or print files");
  }
  const backPrint = data.backPrint === true;
  if (backPrint && (previews.some((p) => !p.back) || prints.some((p) => !p.back)))
    throw new Error("Back print files are missing");
  return { previews, prints, sources, sizes, backPrint };
}

const orderIdPattern = /^gid:\/\/shopify\/Order\/\d+$/;
export async function paidOrderDesigns(shop: string, orderId: string, customerId?: string) {
  if (!orderIdPattern.test(orderId)) return [];
  const { admin } = await unauthenticated.admin(shop);
  const response = await admin.graphql(`#graphql
    query SignatureDayPaidOrder($id: ID!) {
      order(id: $id) {
        id displayFinancialStatus cancelledAt
        customer { id }
        lineItems(first: 100) { nodes { customAttributes { key value } } }
      }
    }`, { variables: { id: orderId } });
  const json = await response.json() as {
    data?: { order?: { displayFinancialStatus: string; cancelledAt: string | null;
      customer?: { id: string } | null; lineItems: { nodes: Array<{ customAttributes: Array<{ key: string; value: string }> }> } } };
    errors?: Array<{ message: string }>;
  };
  if (json.errors?.length) throw new Error("Order lookup failed");
  const order = json.data?.order;
  if (!order || order.displayFinancialStatus !== "PAID" || order.cancelledAt) return [];
  if (customerId && order.customer?.id !== customerId) return [];
  const ids = [...new Set(order.lineItems.nodes.flatMap((line) =>
    line.customAttributes.filter((a) => a.key === DESIGN_ATTRIBUTE &&
      /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(a.value)).map((a) => a.value)))];
  return prisma.signatureDayDesign.findMany({ where: { shop, id: { in: ids } } });
}

function signingSecret() {
  const secret = process.env.SHOPIFY_API_SECRET;
  if (!secret) throw new Error("Signing secret is unavailable");
  return secret;
}
export function signedPdfToken(shop: string, orderId: string, customerId: string) {
  const expiry = Math.floor(Date.now() / 1000) + 5 * 60;
  const payload = Buffer.from(JSON.stringify({ shop, orderId, customerId, expiry })).toString("base64url");
  const signature = createHmac("sha256", signingSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}
export function verifyPdfToken(token: string) {
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra || payload.length > 1000) return null;
  const expected = createHmac("sha256", signingSecret()).update(payload).digest();
  let received: Buffer;
  try { received = Buffer.from(signature, "base64url"); } catch { return null; }
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
  try {
    const result = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof result.shop !== "string" || !/^[-\w]+\.myshopify\.com$/.test(result.shop) ||
        !orderIdPattern.test(result.orderId) || typeof result.customerId !== "string" ||
        !/^gid:\/\/shopify\/Customer\/\d+$/.test(result.customerId) ||
        !Number.isInteger(result.expiry) || result.expiry < Math.floor(Date.now() / 1000)) return null;
    return result as { shop: string; orderId: string; customerId: string };
  } catch { return null; }
}

async function previewBytes(url: string) {
  if (!isShopifyFileUrl(url)) throw new Error("Invalid preview URL");
  const response = await fetch(url, { redirect: "manual" });
  if (!response.ok) throw new Error("Preview unavailable");
  if (!/image\/(jpeg|png)/i.test(response.headers.get("content-type") || ""))
    throw new Error("Invalid preview format");
  const length = Number(response.headers.get("content-length") || 0);
  if (length > 15 * 1024 * 1024) throw new Error("Preview is too large");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length > 15 * 1024 * 1024) throw new Error("Preview is too large");
  return bytes;
}

export async function makeCustomerPdf(designs: Awaited<ReturnType<typeof paidOrderDesigns>>) {
  const pdf = await PDFDocument.create();
  for (const design of designs) {
    const previews = design.previewUrls as Preview[];
    for (const preview of previews) {
      for (const url of [preview.front, preview.back].filter((u): u is string => !!u)) {
        const bytes = await previewBytes(url);
        const image = bytes[0] === 0xff && bytes[1] === 0xd8
          ? await pdf.embedJpg(bytes) : await pdf.embedPng(bytes);
        const page = pdf.addPage([595.28, 841.89]);
        const ratio = Math.min(555 / image.width, 801 / image.height);
        const width = image.width * ratio, height = image.height * ratio;
        page.drawImage(image, { x: (595.28 - width) / 2, y: (841.89 - height) / 2, width, height });
      }
    }
  }
  return pdf.save();
}
