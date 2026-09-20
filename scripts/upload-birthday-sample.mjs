import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const here = path.dirname(fileURLToPath(import.meta.url));
const assets = path.resolve(here, "../assets/birthday-sample");
const apiVersion = "2026-07";
const templateId = "cw-bd-001";

const targets = [
  {
    handle: "personalized-normal-white-photo-mug-11oz",
    title: "Personalized Birthday Photo Mug – Normal White",
    modelTag: "cw-mug-model-white",
    image: "CW-BD-001-normal-mockup.png",
    price: "250.00",
    compareAtPrice: "450.00",
    sku: "CW-MUG-NORMAL",
  },
  {
    handle: "personalized-magic-mug-hot-water-reveal-11oz",
    title: "Personalized Birthday Magic Mug – Hot Water Reveal",
    modelTag: "cw-mug-model-magic",
    image: "CW-BD-001-magic-mockup.png",
    price: "400.00",
    compareAtPrice: "800.00",
    sku: "CW-MUG-MAGIC",
  },
  {
    handle: "personalized-white-love-handle-mug-11oz",
    title: "Personalized Birthday White Love Handle Mug",
    modelTag: "cw-mug-model-love-handle",
    image: "CW-BD-001-love-mockup.png",
    price: "300.00",
    compareAtPrice: "700.00",
    sku: "CW-MUG-LOVE",
  },
  {
    handle: "personalized-inner-colour-red-mug-11oz",
    title: "Personalized Birthday Inner Colour Red Mug",
    modelTag: "cw-mug-model-red",
    image: "CW-BD-001-red-mockup.png",
    price: "300.00",
    compareAtPrice: "700.00",
    sku: "CW-MUG-INNER-RED",
  },
];

const mimeFor = (name) =>
  name.endsWith(".png") ? "image/png" : name.endsWith(".ttf") ? "font/ttf" : "application/octet-stream";

async function main() {
  const sessions = await prisma.session.findMany();
  const session = sessions.find((item) => !item.isOnline && item.accessToken) || sessions.find((item) => item.accessToken);
  if (!session) throw new Error("No stored Shopify Admin session is available.");
  const endpoint = `https://${session.shop}/admin/api/${apiVersion}/graphql.json`;
  const gql = async (query, variables = {}) => {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": session.accessToken,
      },
      body: JSON.stringify({ query, variables }),
    });
    const json = await response.json();
    if (!response.ok || json.errors?.length) throw new Error(json.errors?.map((e) => e.message).join("; ") || `Shopify HTTP ${response.status}`);
    return json.data;
  };

  const products = [];
  for (const target of targets) {
    const data = await gql(`query ProductByHandle($query:String!){products(first:5,query:$query){nodes{id title handle tags variants(first:10){nodes{id}} personalizer:metafield(namespace:"cartwala_personalizer",key:"personalizer_config"){jsonValue} media(first:20){nodes{id alt status}}}}}`, { query: `handle:${target.handle}` });
    const product = data.products.nodes.find((item) => item.handle === target.handle);
    if (!product) throw new Error(`Required existing mug product was not found: ${target.handle}`);
    products.push({ target, product });
  }

  const templateTag = `cw-mug-template-${templateId}`;
  if (products.every(({ product }) => product.tags.includes(templateTag) && product.personalizer?.jsonValue?.enabled === true)) {
    for (const { target, product } of products) {
      if (product.title !== target.title) {
        const renamed = await gql(`mutation RenameProduct($product:ProductUpdateInput!){productUpdate(product:$product){product{id title} userErrors{message}}}`, { product: { id: product.id, title: target.title } });
        const renameError = renamed.productUpdate.userErrors?.[0]?.message;
        if (renameError) throw new Error(renameError);
      }
    }
    console.log(`Birthday sample ${templateId} is already uploaded.`);
    return;
  }

  async function uploadFile(name, resource) {
    const filePath = path.join(assets, name);
    const bytes = fs.readFileSync(filePath);
    const mimeType = mimeFor(name);
    const stage = await gql(`mutation Stage($input:[StagedUploadInput!]!){stagedUploadsCreate(input:$input){stagedTargets{url resourceUrl parameters{name value}} userErrors{message}}}`, { input: [{ filename: name, mimeType, resource, httpMethod: "POST", fileSize: String(bytes.length) }] });
    const stageError = stage.stagedUploadsCreate.userErrors?.[0]?.message;
    const target = stage.stagedUploadsCreate.stagedTargets?.[0];
    if (stageError || !target) throw new Error(stageError || `Could not stage ${name}`);
    const body = new FormData();
    for (const entry of target.parameters) body.append(entry.name, entry.value);
    body.append("file", new Blob([bytes], { type: mimeType }), name);
    const sent = await fetch(target.url, { method: "POST", body });
    if (!sent.ok) throw new Error(`Could not upload ${name}: HTTP ${sent.status}`);
    const created = await gql(`mutation CreateFile($files:[FileCreateInput!]!){fileCreate(files:$files){files{id fileStatus ... on GenericFile{url} ... on MediaImage{image{url}}} userErrors{message}}}`, { files: [{ alt: `Cartwala ${templateId} ${name}`, contentType: resource, originalSource: target.resourceUrl }] });
    const createError = created.fileCreate.userErrors?.[0]?.message;
    const result = created.fileCreate.files?.[0];
    if (createError || !result) throw new Error(createError || `Could not save ${name}`);
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const url = result.url || result.image?.url;
      if (url) return { id: result.id, url };
      await new Promise((resolve) => setTimeout(resolve, 500));
      const status = await gql(`query FileStatus($id:ID!){node(id:$id){... on GenericFile{fileStatus url} ... on MediaImage{fileStatus image{url}}}}`, { id: result.id });
      if (status.node?.fileStatus === "FAILED") throw new Error(`Shopify failed to process ${name}`);
      const polledUrl = status.node?.url || status.node?.image?.url;
      if (polledUrl) return { id: result.id, url: polledUrl };
    }
    throw new Error(`Shopify did not finish processing ${name}`);
  }

  const overlay = await uploadFile("CW-BD-001-personalizer-overlay.png", "IMAGE");
  const mask = await uploadFile("CW-BD-001-personalizer-mask.png", "IMAGE");
  const serif = await uploadFile("DejaVuSerif-Bold.ttf", "FILE");
  const sans = await uploadFile("DejaVuSans.ttf", "FILE");
  const productImages = new Map();
  for (const target of targets) productImages.set(target.handle, await uploadFile(target.image, "IMAGE"));

  const config = {
    enabled: true,
    overlayUrl: overlay.url,
    canvasRatio: "2550:1050",
    photoFields: [{ id: "cw-bd-001-photo-1", label: "Upload Your Photo", maskUrl: mask.url, x: 20.9804, y: 50, width: 28.2353, height: 66.6667, rotationEnabled: false, required: true }],
    textFields: [{ id: "cw-bd-001-name", label: "Your Name", placeholder: "Your Name", defaultValue: "", maxLength: 40, color: "#e8c68e", x: 70, y: 66.5, width: 38, height: 11, alignment: "center", fitToBox: true, fontSize: 42.35, fontFamily: "DejaVu Serif", allowFontChoice: false, movable: false, scalable: false, rotatable: false, allowColorChoice: false, rotation: 0, required: true }],
    fileFields: [], linkFields: [],
    customFonts: [{ id: "cw-dejavu-serif", name: "DejaVu Serif", url: serif.url }, { id: "cw-dejavu-sans", name: "DejaVu Sans", url: sans.url }],
  };

  for (const { target, product } of products) {
    const tags = product.tags.filter((tag) => !tag.startsWith("cw-mug-template-") && !tag.startsWith("cw-mug-model-") && !["cw-mug-birthday","cw-mug-anniversary","cw-mug-love","cw-mug-family","cw-mug-friends","cw-mug-other"].includes(tag));
    tags.push("cw-mug", "cw-mug-birthday", target.modelTag, templateTag, `cw-design-${templateId}`);
    const update = await gql(`mutation UpdateProduct($product:ProductUpdateInput!){productUpdate(product:$product){product{id title tags} userErrors{message}}}`, { product: { id: product.id, title: target.title, tags: [...new Set(tags)], status: "ACTIVE" } });
    const updateError = update.productUpdate.userErrors?.[0]?.message;
    if (updateError) throw new Error(`${target.handle}: ${updateError}`);
    const metafields = await gql(`mutation SaveConfig($metafields:[MetafieldsSetInput!]!){metafieldsSet(metafields:$metafields){userErrors{message}}}`, { metafields: [
      { ownerId: product.id, namespace: "$app", key: "personalizer_config", type: "json", value: JSON.stringify(config) },
      { ownerId: product.id, namespace: "cartwala_personalizer", key: "personalizer_config", type: "json", value: JSON.stringify(config) },
    ] });
    const metafieldError = metafields.metafieldsSet.userErrors?.[0]?.message;
    if (metafieldError) throw new Error(`${target.handle}: ${metafieldError}`);
    if (product.variants.nodes.length) {
      const variants = await gql(`mutation UpdateVariants($productId:ID!,$variants:[ProductVariantsBulkInput!]!){productVariantsBulkUpdate(productId:$productId,variants:$variants){userErrors{message}}}`, { productId: product.id, variants: product.variants.nodes.map((variant, index) => ({ id: variant.id, price: target.price, compareAtPrice: target.compareAtPrice, inventoryItem: { tracked: true, requiresShipping: true, sku: `${target.sku}${index ? `-${index + 1}` : ""}`, measurement: { weight: { unit: "GRAMS", value: 350 } } } })) });
      const variantError = variants.productVariantsBulkUpdate.userErrors?.[0]?.message;
      if (variantError) throw new Error(`${target.handle}: ${variantError}`);
    }
    const image = productImages.get(target.handle);
    const media = await gql(`mutation AttachImage($productId:ID!,$media:[CreateMediaInput!]!){productCreateMedia(productId:$productId,media:$media){media{id alt status} mediaUserErrors{message}}}`, { productId: product.id, media: [{ originalSource: image.url, mediaContentType: "IMAGE", alt: `${target.title} – Left Front Right Views` }] });
    const mediaError = media.productCreateMedia.mediaUserErrors?.[0]?.message;
    const newMedia = media.productCreateMedia.media?.[0];
    if (mediaError || !newMedia) throw new Error(`${target.handle}: ${mediaError || "product image was not attached"}`);
    try {
      await gql(`mutation Reorder($id:ID!,$moves:[MoveInput!]!){productReorderMedia(id:$id,moves:$moves){job{id} mediaUserErrors{message}}}`, { id: product.id, moves: [{ id: newMedia.id, newPosition: "0" }] });
    } catch (error) {
      console.warn(`Image attached to ${target.handle}; featured-image reorder will need a later retry: ${error.message}`);
    }
    console.log(`Uploaded ${templateId} to ${target.handle}`);
  }
}

main().catch((error) => {
  console.error(`Birthday sample upload failed: ${error.stack || error.message}`);
  process.exitCode = 1;
}).finally(async () => prisma.$disconnect());
