import type { ActionFunctionArgs } from "react-router";
import { PDFDocument } from "pdf-lib";
import prisma from "../db.server";
import { uploadImageAsset, uploadImageAssets, uploadPdfAsset } from "../lib/shopify-files.server";
import { isShopifyFileUrl, validateDesign } from "../lib/signature-day.server";
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
      if (form.get("intent") === "assemble_front_batch") {
        const baseUrl = form.get("baseUrl");
        const tiles = form.getAll("tile");
        const previews = form.getAll("preview");
        const geometry = ["x", "y", "width", "height"].map((key) => Number(form.get(key)));
        const [x, y, width, height] = geometry;
        if (!isShopifyFileUrl(baseUrl) || tiles.length < 1 || tiles.length > 4 ||
          previews.length !== tiles.length ||
          [...tiles, ...previews].some((file) => !(file instanceof File) ||
            file.type !== "image/jpeg" || file.size < 100 || file.size > 10 * 1024 * 1024) ||
          [...tiles, ...previews].reduce((sum, file) => sum + (file instanceof File ? file.size : 0), 0) > 20 * 1024 * 1024 ||
          !geometry.every(Number.isFinite) || x < 0 || y < 0 || width <= 0 || height <= 0 ||
          x + width > 2480.01 || y + height > 3508.01) {
          return Response.json({ error: "Invalid A4 print batch" }, { status: 400 });
        }
        const baseResponse = await fetch(baseUrl, { signal: AbortSignal.timeout(30000) });
        if (!baseResponse.ok || Number(baseResponse.headers.get("content-length") || 0) > 15 * 1024 * 1024)
          throw new Error("Could not load the shared A4 collage");
        const baseBytes = await baseResponse.arrayBuffer();
        if (baseBytes.byteLength > 15 * 1024 * 1024) throw new Error("A4 collage is too large");
        const document = await PDFDocument.create();
        const background = await document.embedJpg(baseBytes);
        const pageWidth = 595.28, pageHeight = 841.89;
        for (const file of tiles as File[]) {
          const image = await document.embedJpg(await file.arrayBuffer());
          const page = document.addPage([pageWidth, pageHeight]);
          page.drawImage(background, { x: 0, y: 0, width: pageWidth, height: pageHeight });
          page.drawImage(image, {
            x: x / 2480 * pageWidth,
            y: (3508 - y - height) / 3508 * pageHeight,
            width: width / 2480 * pageWidth,
            height: height / 3508 * pageHeight,
          });
        }
        const bytes = await document.save();
        const pdf = new File([new Uint8Array(bytes)], `signature-day-a4-${crypto.randomUUID()}.pdf`, { type: "application/pdf" });
        const previewFiles = (previews as File[]).map((file) =>
          new File([file], `signature-preview-${crypto.randomUUID()}.jpg`, { type: "image/jpeg" }));
        const [printAsset, previewAssets] = await Promise.all([
          uploadPdfAsset(admin, pdf), uploadImageAssets(admin, previewFiles),
        ]);
        return Response.json({ printUrl: printAsset.url, previewUrls: previewAssets.map((asset) => asset.url) },
          { headers: { "Cache-Control": "no-store" } });
      }
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
