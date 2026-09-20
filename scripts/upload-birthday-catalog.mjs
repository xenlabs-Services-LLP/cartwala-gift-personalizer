import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const here = path.dirname(fileURLToPath(import.meta.url));
const assets = path.resolve(here, "../assets/birthday-catalog");
const apiVersion = "2026-07";
const mugCollectionHandle = "customised-mugs";

const designs = [
  { code: "CW-BD-001", slug: "burgundy-gold", name: "Burgundy Gold", nameColor: "#e8c68e" },
  { code: "CW-BD-002", slug: "royal-blue-stars", name: "Royal Blue Stars", nameColor: "#f7c84b" },
  { code: "CW-BD-003", slug: "pink-floral", name: "Pink Floral", nameColor: "#ffffff" },
  { code: "CW-BD-004", slug: "black-gold-luxury", name: "Black Gold Luxury", nameColor: "#d6ae54" },
  { code: "CW-BD-005", slug: "sky-balloons", name: "Sky Balloons", nameColor: "#ffdc82" },
  { code: "CW-BD-006", slug: "purple-party", name: "Purple Party", nameColor: "#e5b9ff" },
  { code: "CW-BD-007", slug: "green-botanical", name: "Green Botanical", nameColor: "#e9cf85" },
  { code: "CW-BD-008", slug: "red-bold", name: "Red Bold", nameColor: "#fff3d6" },
  { code: "CW-BD-009", slug: "peach-cake", name: "Peach Cake", nameColor: "#fff3e9" },
  { code: "CW-BD-010", slug: "rainbow-celebration", name: "Rainbow Celebration", nameColor: "#ffd6a5" },
];

const models = [
  { key: "normal", label: "Normal White", modelTag: "cw-mug-model-white", price: "250.00", compareAtPrice: "450.00", sku: "CW-MUG-NORMAL" },
  { key: "magic", label: "Magic Hot Water Reveal", modelTag: "cw-mug-model-magic", price: "400.00", compareAtPrice: "800.00", sku: "CW-MUG-MAGIC" },
  { key: "love", label: "White Love Handle", modelTag: "cw-mug-model-love-handle", price: "300.00", compareAtPrice: "700.00", sku: "CW-MUG-LOVE" },
  { key: "red", label: "Inner Colour Red", modelTag: "cw-mug-model-red", price: "300.00", compareAtPrice: "700.00", sku: "CW-MUG-INNER-RED" },
];

const originalHandles = {
  normal: "personalized-normal-white-photo-mug-11oz",
  magic: "personalized-magic-mug-hot-water-reveal-11oz",
  love: "personalized-white-love-handle-mug-11oz",
  red: "personalized-inner-colour-red-mug-11oz",
};

const productByHandleQuery = `query ProductByHandle($query:String!){products(first:5,query:$query){nodes{id title handle tags variants(first:10){nodes{id}} personalizer:metafield(namespace:"cartwala_personalizer",key:"personalizer_config"){jsonValue} media(first:40){nodes{id alt status}}}}}`;
const createProductMutation = `mutation CreateProduct($product:ProductCreateInput!){productCreate(product:$product){product{id title handle tags variants(first:10){nodes{id}} media(first:10){nodes{id alt status}}} userErrors{field message}}}`;

const mimeFor = (name) => name.endsWith(".png") ? "image/png" : name.endsWith(".ttf") ? "font/ttf" : "application/octet-stream";
const productHandle = (design, model) => design.code === "CW-BD-001" ? originalHandles[model.key] : `personalized-birthday-${design.slug}-${model.key}-mug`;
const productTitle = (design, model) => `Personalized ${design.name} Birthday Mug – ${model.label}`;

async function main() {
  const sessions = await prisma.session.findMany();
  const session = sessions.find((item) => !item.isOnline && item.accessToken) || sessions.find((item) => item.accessToken);
  if (!session) throw new Error("No stored Shopify Admin session is available.");
  const endpoint = `https://${session.shop}/admin/api/${apiVersion}/graphql.json`;
  const gql = async (query, variables = {}) => {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": session.accessToken },
      body: JSON.stringify({ query, variables }),
    });
    const json = await response.json();
    if (!response.ok || json.errors?.length) throw new Error(json.errors?.map((error) => error.message).join("; ") || `Shopify HTTP ${response.status}`);
    return json.data;
  };

  const collectionData = await gql(`query CollectionByHandle($query:String!){collections(first:5,query:$query){nodes{id handle products(first:250){nodes{id}}}}}`, { query: `handle:${mugCollectionHandle}` });
  const collection = collectionData.collections.nodes.find((item) => item.handle === mugCollectionHandle);
  if (!collection) throw new Error(`Required mug collection was not found: ${mugCollectionHandle}`);
  const collectionProductIds = new Set(collection.products.nodes.map((item) => item.id));

  async function getProduct(handle) {
    const result = await gql(productByHandleQuery, { query: `handle:${handle}` });
    return result.products.nodes.find((item) => item.handle === handle);
  }

  async function createProduct(design, model) {
    const handle = productHandle(design, model);
    const result = await gql(createProductMutation, { product: {
      title: productTitle(design, model),
      handle,
      descriptionHtml: `<p>Personalize this ${model.label.toLowerCase()} mug with one photo and a name. Birthday design: ${design.name}.</p>`,
      productType: "Customised Mug",
      vendor: "Cartwala",
      status: "ACTIVE",
      tags: ["cw-mug", "cw-mug-birthday", model.modelTag, `cw-mug-template-${design.code.toLowerCase()}`, `cw-design-${design.code.toLowerCase()}`],
    } });
    const error = result.productCreate.userErrors?.[0];
    if (error) throw new Error(`${handle}: ${error.field?.join(".") || "product"}: ${error.message}`);
    console.log(`Created ${handle}`);
    return result.productCreate.product;
  }

  async function uploadFile(name, resource) {
    const filePath = path.join(assets, name);
    const bytes = fs.readFileSync(filePath);
    const mimeType = mimeFor(name);
    const staged = await gql(`mutation Stage($input:[StagedUploadInput!]!){stagedUploadsCreate(input:$input){stagedTargets{url resourceUrl parameters{name value}} userErrors{field message}}}`, { input: [{ filename: name, mimeType, resource, httpMethod: "POST", fileSize: String(bytes.length) }] });
    const stageError = staged.stagedUploadsCreate.userErrors?.[0];
    const target = staged.stagedUploadsCreate.stagedTargets?.[0];
    if (stageError || !target) throw new Error(`${name}: ${stageError?.message || "could not create staged upload"}`);
    const body = new FormData();
    for (const entry of target.parameters) body.append(entry.name, entry.value);
    body.append("file", new Blob([bytes], { type: mimeType }), name);
    const sent = await fetch(target.url, { method: "POST", body });
    if (!sent.ok) throw new Error(`${name}: upload failed with HTTP ${sent.status}`);
    const created = await gql(`mutation CreateFile($files:[FileCreateInput!]!){fileCreate(files:$files){files{id fileStatus ... on GenericFile{url} ... on MediaImage{image{url}}} userErrors{field message}}}`, { files: [{ alt: `Cartwala ${name}`, contentType: resource, originalSource: target.resourceUrl }] });
    const createError = created.fileCreate.userErrors?.[0];
    const result = created.fileCreate.files?.[0];
    if (createError || !result) throw new Error(`${name}: ${createError?.message || "could not save uploaded file"}`);
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const url = result.url || result.image?.url;
      if (url) return { id: result.id, url };
      await new Promise((resolve) => setTimeout(resolve, 500));
      const status = await gql(`query FileStatus($id:ID!){node(id:$id){... on GenericFile{fileStatus url} ... on MediaImage{fileStatus image{url}}}}`, { id: result.id });
      if (status.node?.fileStatus === "FAILED") throw new Error(`${name}: Shopify processing failed`);
      const polledUrl = status.node?.url || status.node?.image?.url;
      if (polledUrl) return { id: result.id, url: polledUrl };
    }
    throw new Error(`${name}: Shopify did not finish processing the file`);
  }

  const allProducts = [];
  for (const design of designs) {
    for (const model of models) {
      const handle = productHandle(design, model);
      const product = await getProduct(handle) || await createProduct(design, model);
      allProducts.push({ design, model, product });
    }
  }

  const missingCollectionIds = allProducts.map(({ product }) => product.id).filter((id) => !collectionProductIds.has(id));
  for (let offset = 0; offset < missingCollectionIds.length; offset += 25) {
    const productIds = missingCollectionIds.slice(offset, offset + 25);
    const added = await gql(`mutation AddMugsToCollection($id:ID!,$productIds:[ID!]!){collectionAddProducts(id:$id,productIds:$productIds){collection{id handle} userErrors{field message}}}`, { id: collection.id, productIds });
    const error = added.collectionAddProducts.userErrors?.[0];
    if (error) throw new Error(`Collection: ${error.message}`);
  }

  const catalogAlreadyReady = allProducts.every(({ design, model, product }) =>
    product.personalizer?.jsonValue?.enabled === true
    && product.tags.includes(`cw-mug-template-${design.code.toLowerCase()}`)
    && product.tags.includes("cw-mug-birthday")
    && product.tags.includes(model.modelTag)
    && product.media.nodes.some((media) => media.alt === `${design.code} ${model.label} Birthday Mug – Left Front Right Views`)
  );
  if (catalogAlreadyReady && missingCollectionIds.length === 0) {
    console.log("Birthday catalog is already complete: 10 designs × 4 models = 40 products.");
    return;
  }

  const configuredProduct = allProducts.find(({ product }) => product.personalizer?.jsonValue?.customFonts?.length)?.product;
  const configuredFonts = configuredProduct?.personalizer?.jsonValue?.customFonts;
  const customFonts = configuredFonts?.length ? configuredFonts : [
    { id: "cw-dejavu-serif", name: "DejaVu Serif", url: (await uploadFile("DejaVuSerif-Bold.ttf", "FILE")).url },
    { id: "cw-dejavu-sans", name: "DejaVu Sans", url: (await uploadFile("DejaVuSans.ttf", "FILE")).url },
  ];

  for (const design of designs) {
    const rows = allProducts.filter((row) => row.design.code === design.code);
    const alreadyConfigured = rows.find(({ product }) => product.personalizer?.jsonValue?.enabled && product.tags.includes(`cw-mug-template-${design.code.toLowerCase()}`));
    const overlay = alreadyConfigured ? { url: alreadyConfigured.product.personalizer.jsonValue.overlayUrl } : await uploadFile(`${design.code}-personalizer-overlay.png`, "IMAGE");
    const mask = alreadyConfigured ? { url: alreadyConfigured.product.personalizer.jsonValue.photoFields?.[0]?.maskUrl } : await uploadFile(`${design.code}-personalizer-mask.png`, "IMAGE");
    const photoLayout = design.code === "CW-BD-001"
      ? { x: 20.9804, y: 50, width: 28.2353, height: 66.6667 }
      : { x: 25.098, y: 50, width: 40, height: 77.143 };
    const nameLayout = design.code === "CW-BD-001"
      ? { x: 70, y: 66.5, width: 38 }
      : { x: 75.686, y: 64, width: 31 };
    const config = {
      enabled: true,
      overlayUrl: overlay.url,
      canvasRatio: "2550:1050",
      photoFields: [{ id: `${design.code.toLowerCase()}-photo-1`, label: "Upload Your Photo", maskUrl: mask.url, ...photoLayout, rotationEnabled: false, required: true }],
      textFields: [{ id: `${design.code.toLowerCase()}-name`, label: "Your Name", placeholder: "Your Name", defaultValue: "", maxLength: 40, color: design.nameColor, ...nameLayout, height: 11, alignment: "center", fitToBox: true, fontSize: 42.35, fontFamily: "DejaVu Serif", allowFontChoice: false, movable: false, scalable: false, rotatable: false, allowColorChoice: false, rotation: 0, required: true }],
      fileFields: [],
      linkFields: [],
      customFonts,
    };

    for (const row of rows) {
      const { model } = row;
      let { product } = row;
      const templateTag = `cw-mug-template-${design.code.toLowerCase()}`;
      const tags = product.tags.filter((tag) => !tag.startsWith("cw-mug-template-") && !tag.startsWith("cw-design-") && !tag.startsWith("cw-mug-model-") && !["cw-mug-anniversary", "cw-mug-love", "cw-mug-family", "cw-mug-friends", "cw-mug-other"].includes(tag));
      tags.push("cw-mug", "cw-mug-birthday", model.modelTag, templateTag, `cw-design-${design.code.toLowerCase()}`);
      const updated = await gql(`mutation UpdateProduct($product:ProductUpdateInput!){productUpdate(product:$product){product{id title handle tags variants(first:10){nodes{id}} media(first:40){nodes{id alt status}}} userErrors{field message}}}`, { product: { id: product.id, title: productTitle(design, model), tags: [...new Set(tags)], status: "ACTIVE" } });
      const updateError = updated.productUpdate.userErrors?.[0];
      if (updateError) throw new Error(`${product.handle}: ${updateError.message}`);
      product = updated.productUpdate.product;

      const metafields = await gql(`mutation SaveConfig($metafields:[MetafieldsSetInput!]!){metafieldsSet(metafields:$metafields){userErrors{field message}}}`, { metafields: [
        { ownerId: product.id, namespace: "$app", key: "personalizer_config", type: "json", value: JSON.stringify(config) },
        { ownerId: product.id, namespace: "cartwala_personalizer", key: "personalizer_config", type: "json", value: JSON.stringify(config) },
      ] });
      const metafieldError = metafields.metafieldsSet.userErrors?.[0];
      if (metafieldError) throw new Error(`${product.handle}: ${metafieldError.message}`);

      if (product.variants.nodes.length) {
        const variants = await gql(`mutation UpdateVariants($productId:ID!,$variants:[ProductVariantsBulkInput!]!){productVariantsBulkUpdate(productId:$productId,variants:$variants){userErrors{field message}}}`, { productId: product.id, variants: product.variants.nodes.map((variant, index) => ({ id: variant.id, price: model.price, compareAtPrice: model.compareAtPrice, inventoryItem: { tracked: true, requiresShipping: true, sku: `${model.sku}-${design.code.slice(-3)}${index ? `-${index + 1}` : ""}`, measurement: { weight: { unit: "GRAMS", value: 350 } } } })) });
        const variantError = variants.productVariantsBulkUpdate.userErrors?.[0];
        if (variantError) throw new Error(`${product.handle}: ${variantError.message}`);
      }

      const imageAlt = `${design.code} ${model.label} Birthday Mug – Left Front Right Views`;
      const existingMedia = product.media.nodes.find((media) => media.alt === imageAlt);
      if (!existingMedia) {
        const image = await uploadFile(`${design.code}-${model.key}-mockup.png`, "IMAGE");
        const media = await gql(`mutation AttachImage($productId:ID!,$media:[CreateMediaInput!]!){productCreateMedia(productId:$productId,media:$media){media{id alt status} mediaUserErrors{field message}}}`, { productId: product.id, media: [{ originalSource: image.url, mediaContentType: "IMAGE", alt: imageAlt }] });
        const mediaError = media.productCreateMedia.mediaUserErrors?.[0];
        const newMedia = media.productCreateMedia.media?.[0];
        if (mediaError || !newMedia) throw new Error(`${product.handle}: ${mediaError?.message || "product image was not attached"}`);
        try {
          await gql(`mutation Reorder($id:ID!,$moves:[MoveInput!]!){productReorderMedia(id:$id,moves:$moves){job{id} mediaUserErrors{field message}}}`, { id: product.id, moves: [{ id: newMedia.id, newPosition: "0" }] });
        } catch (error) {
          console.warn(`${product.handle}: image attached; featured order retry required: ${error.message}`);
        }
      }
      console.log(`Configured ${design.code} for ${model.key}`);
    }
  }

  console.log(`Birthday catalog ready: ${designs.length} designs × ${models.length} models = ${allProducts.length} products.`);
}

main().catch((error) => {
  console.error(`Birthday catalog upload failed: ${error.stack || error.message}`);
  process.exitCode = 1;
}).finally(async () => prisma.$disconnect());
