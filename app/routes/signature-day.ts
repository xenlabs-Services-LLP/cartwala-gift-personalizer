import type { ActionFunctionArgs } from "react-router";
import prisma from "../db.server";
import { uploadImageAsset, uploadImageAssets } from "../lib/shopify-files.server";
import { validateDesign } from "../lib/signature-day.server";
import { authenticate } from "../shopify.server";

// Storefront requests arrive through Shopify's signed app proxy. The page only
// receives an opaque design ID; a later paid order must contain that ID.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.public.appProxy(request);
  if (!admin || !session) return Response.json({ error: "App is not installed" }, { status: 503 });
  try {
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      if (form.get("intent") === "upload_batch") {
        const files = form.getAll("file");
        if (!files.length || files.length > 4 || files.some((file) =>
          !(file instanceof File) || !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
          file.size < 100 || file.size > 15 * 1024 * 1024,
        ) || files.reduce((size, file) => size + (file instanceof File ? file.size : 0), 0) > 20 * 1024 * 1024) {
          return Response.json({ error: "Upload up to four print images, 20 MB total" }, { status: 400 });
        }
        const safeFiles = (files as File[]).map((file) => {
          const extension = file.type === "image/jpeg" ? "jpg" : file.type === "image/png" ? "png" : "webp";
          return new File([file], `signature-print-${crypto.randomUUID()}.${extension}`, { type: file.type });
        });
        const assets = await uploadImageAssets(admin, safeFiles);
        return Response.json({ urls: assets.map((asset) => asset.url) }, { headers: { "Cache-Control": "no-store" } });
      }
      if (form.get("intent") !== "upload") return Response.json({ error: "Invalid upload" }, { status: 400 });
      const file = form.get("file");
      if (!(file instanceof File) || !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
          file.size < 100 || file.size > 15 * 1024 * 1024) {
        return Response.json({ error: "Choose a JPG, PNG or WebP under 15 MB" }, { status: 400 });
      }
      const extension = file.type === "image/jpeg" ? "jpg" : file.type === "image/png" ? "png" : "webp";
      const safeFile = new File([file], `signature-day-${crypto.randomUUID()}.${extension}`, { type: file.type });
      const asset = await uploadImageAsset(admin, safeFile);
      return Response.json({ url: asset.url }, { headers: { "Cache-Control": "no-store" } });
    }
    if (!contentType.includes("application/json")) return Response.json({ error: "Invalid request" }, { status: 415 });
    const data = validateDesign(await request.json());
    const saved = await prisma.signatureDayDesign.create({ data: {
      shop: session.shop, previewUrls: data.previews, printUrls: data.prints,
      sourceUrls: data.sources, shirtSizes: data.sizes, backPrint: data.backPrint,
    } });
    return Response.json({ designId: saved.id }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not save design" }, { status: 400 });
  }
};
