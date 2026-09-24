import { PDFDocument } from "pdf-lib";

type Shirt = { front: string; back?: string };
type PrintDesign = { printUrls: Shirt[]; shirtSizes: string[] };
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const SIZES = ["S", "M", "L", "XL", "XXL", "XS"];

export function orderedShirts(design: PrintDesign) {
  return design.printUrls.map((shirt, index) => ({ shirt, index, size: design.shirtSizes[index] || "Unknown" }))
    .sort((a, b) => (SIZES.indexOf(a.size) < 0 ? 99 : SIZES.indexOf(a.size)) -
      (SIZES.indexOf(b.size) < 0 ? 99 : SIZES.indexOf(b.size)) || a.index - b.index);
}

function contentBounds(context: CanvasRenderingContext2D, width: number, height: number) {
  const pixels = context.getImageData(0, 0, width, height).data;
  let left = width, top = height, right = 0, bottom = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const offset = (y * width + x) * 4;
    const visible = pixels[offset + 3] > 35 &&
      (pixels[offset] < 245 || pixels[offset + 1] < 245 || pixels[offset + 2] < 245);
    if (visible) { left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y); }
  }
  return right >= left ? { left, top, width: right - left + 1, height: bottom - top + 1 } : null;
}

async function addRasterPage(pdf: PDFDocument, bytes: Uint8Array, isBack: boolean) {
  // Keep full-resolution front artwork in its original encoding.
  if (!isBack && (bytes[0] === 0xff && bytes[1] === 0xd8 ||
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47)) {
    const image = bytes[0] === 0xff ? await pdf.embedJpg(bytes) : await pdf.embedPng(bytes);
    const page = pdf.addPage([PAGE_W, PAGE_H]);
    const scale = Math.min(PAGE_W / image.width, PAGE_H / image.height);
    const width = image.width * scale, height = image.height * scale;
    page.drawImage(image, { x: (PAGE_W - width) / 2, y: (PAGE_H - height) / 2, width, height });
    return;
  }
  const blob = new Blob([new Uint8Array(bytes)]);
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext("2d", { willReadFrequently: isBack });
    if (!context) throw new Error("Could not prepare the print image");
    context.drawImage(bitmap, 0, 0);
    const bounds = isBack ? contentBounds(context, bitmap.width, bitmap.height) : null;
    const crop = bounds || { left: 0, top: 0, width: bitmap.width, height: bitmap.height };
    const imageCanvas = document.createElement("canvas");
    imageCanvas.width = crop.width; imageCanvas.height = crop.height;
    const imageContext = imageCanvas.getContext("2d");
    if (!imageContext) throw new Error("Could not prepare the print image");
    imageContext.fillStyle = "#fff";
    imageContext.fillRect(0, 0, crop.width, crop.height);
    imageContext.drawImage(bitmap, crop.left, crop.top, crop.width, crop.height, 0, 0, crop.width, crop.height);
    const imageBlob = await new Promise<Blob>((resolve, reject) =>
      imageCanvas.toBlob((result) => result ? resolve(result) : reject(new Error("Could not encode the print image")), "image/jpeg", 0.98));
    const image = await pdf.embedJpg(await imageBlob.arrayBuffer());
    const page = pdf.addPage([PAGE_W, PAGE_H]);
    const scale = isBack
      ? Math.min((PAGE_W * 0.94) / image.width, (PAGE_H * 0.88) / image.height)
      : Math.min(PAGE_W / image.width, PAGE_H / image.height);
    const width = image.width * scale, height = image.height * scale;
    page.drawImage(image, { x: (PAGE_W - width) / 2, y: (PAGE_H - height) / 2, width, height });
    canvas.width = canvas.height = imageCanvas.width = imageCanvas.height = 0;
  } finally { bitmap.close(); }
}

export async function buildSignatureDayPrintPdf(design: PrintDesign) {
  const pdf = await PDFDocument.create();
  const cache = new Map<string, Promise<Uint8Array>>();
  for (const { shirt } of orderedShirts(design)) for (const [url, isBack] of [[shirt.front, false], [shirt.back, true]] as const) {
    if (!url) continue;
    const [fileUrl, fragment] = url.split("#");
    if (!cache.has(fileUrl)) cache.set(fileUrl, (async () => {
      const response = await fetch(`/app/print-asset?url=${encodeURIComponent(fileUrl)}`);
      if (!response.ok) throw new Error("A saved print file could not be loaded. Please retry.");
      return new Uint8Array(await response.arrayBuffer());
    })());
    const bytes = await cache.get(fileUrl)!;
    if (bytes[0] === 37 && bytes[1] === 80 && bytes[2] === 68 && bytes[3] === 70) {
      const source = await PDFDocument.load(bytes);
      const number = Number(/(?:^|&)page=(\d+)/.exec(fragment || "")?.[1] || 1);
      if (number < 1 || number > source.getPageCount()) throw new Error("A saved A4 print page is missing.");
      const [page] = await pdf.copyPages(source, [number - 1]);
      pdf.addPage(page);
    } else await addRasterPage(pdf, bytes, isBack);
  }
  if (!pdf.getPageCount()) throw new Error("No saved print pages were found for this design.");
  pdf.setTitle("Cartwala Signature Day T-shirt print files");
  return pdf.save();
}
