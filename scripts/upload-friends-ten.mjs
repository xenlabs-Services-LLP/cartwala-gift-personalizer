import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import prismaPackage from "@prisma/client";
const { PrismaClient } = prismaPackage;

const prisma = new PrismaClient();
const here = path.dirname(fileURLToPath(import.meta.url));
const assetRevision = "friends-quotes-v1";
const assets = path.resolve(here, "../assets/friends-ten-live");
const apiVersion = "2026-07";
const mugCollectionHandle = "customised-mugs";

const originalDesigns = [
  {
    code: "CW-LV-001", slug: "blush-love-always", name: "Blush Love Always", photos: 1,
    textLabel: "Your Names", textPlaceholder: "Your Names", textColor: "#97543e",
    photoLayouts: [{ x: 30.294, y: 48.524, width: 39.412, height: 78.381 }],
    textLayout: { x: 70.392, y: 79.048, width: 33.333, height: 11.429 },
  },
  {
    code: "CW-LV-002", slug: "written-in-the-stars", name: "Written in the Stars", photos: 2,
    textLabel: "Special Date", textPlaceholder: "Special Date", textColor: "#ebc269",
    photoLayouts: [
      { x: 18.255, y: 43.857, width: 27.490, height: 66.762 },
      { x: 81.588, y: 43.857, width: 27.490, height: 66.762 },
    ],
    textLayout: { x: 50, y: 81.190, width: 31.373, height: 10 },
  },
  {
    code: "CW-LV-003", slug: "grow-old-with-me", name: "Grow Old With Me", photos: 3,
    textLabel: "Your Names", textPlaceholder: "Your Names", textColor: "#917031",
    photoLayouts: [
      { x: 18.843, y: 49.333, width: 21.608, height: 70.095 },
      { x: 72.667, y: 45.762, width: 14.745, height: 52.476 },
      { x: 89.431, y: 45.762, width: 15.333, height: 52.476 },
    ],
    textLayout: { x: 49.020, y: 80.952, width: 35.294, height: 10.476 },
  },
];

const designs = JSON.parse(fs.readFileSync(path.join(assets, "manifest.json"), "utf8"));
const mockupExtension = "jpg";

const models = [
  { key: "normal", label: "Classic White Mug", modelTag: "cw-mug-model-white", price: "250.00", compareAtPrice: "450.00", sku: "CW-MUG-NORMAL" },
  { key: "magic", label: "Magic Hot Water Reveal Mug", modelTag: "cw-mug-model-magic", price: "400.00", compareAtPrice: "800.00", sku: "CW-MUG-MAGIC" },
  { key: "love", label: "White Love Handle Mug", modelTag: "cw-mug-model-love-handle", price: "300.00", compareAtPrice: "700.00", sku: "CW-MUG-LOVE" },
  { key: "red", label: "Inner Colour Red Mug", modelTag: "cw-mug-model-red", price: "300.00", compareAtPrice: "700.00", sku: "CW-MUG-INNER-RED" },
];

const handleFor = (design, model) => `personalized-friends-${design.slug}-${model.key}-mug`;
const titleFor = (design, model) => `Personalized ${design.name} Friends Mug – ${model.label}`;
const mimeFor = (name) => name.endsWith(".png") ? "image/png" : name.endsWith(".jpg") ? "image/jpeg" : "application/octet-stream";

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

  const requiredAssets = designs.flatMap((design) => [
    `${design.code}-overlay.png`,
    ...design.photoLayouts.map((_, index) => `${design.code}-photo-${index + 1}-mask.png`),
    ...models.map((model) => `${design.code}-${model.key}-mockup.${mockupExtension}`),
  ]);
  for (const name of requiredAssets) if (!fs.existsSync(path.join(assets, name))) throw new Error(`Missing asset ${name}`);

  const collectionData = await gql(`query CollectionByHandle($query:String!){collections(first:5,query:$query){nodes{id handle products(first:250){nodes{id}}}}}`, { query: `handle:${mugCollectionHandle}` });
  const collection = collectionData.collections.nodes.find((item) => item.handle === mugCollectionHandle);
  if (!collection) throw new Error(`Required collection not found: ${mugCollectionHandle}`);
  const collectionProductIds = new Set(collection.products.nodes.map((item) => item.id));

  const getProduct = async (handle) => {
    const data = await gql(`query ProductByHandle($query:String!){products(first:5,query:$query){nodes{id title handle tags variants(first:10){nodes{id}} personalizer:metafield(namespace:"cartwala_personalizer",key:"personalizer_config"){jsonValue} media(first:40){nodes{id alt status}}}}}`, { query: `handle:${handle}` });
    return data.products.nodes.find((item) => item.handle === handle);
  };

  const createProduct = async (design, model) => {
    const title = titleFor(design, model);
    const result = await gql(`mutation CreateProduct($product:ProductCreateInput!){productCreate(product:$product){product{id title handle tags variants(first:10){nodes{id}} media(first:10){nodes{id alt status}}} userErrors{field message}}}`, { product: {
      title,
      handle: handleFor(design, model),
      descriptionHtml: `<p>Celebrate a special friendship with the ${design.name} personalised ${model.label.toLowerCase()}. Upload one favourite photo and add your names to create a meaningful friendship gift.</p><ul><li>One exact-fit editable photo area</li><li>Editable names</li><li>Unique friendship quote</li><li>High-quality full-wrap printing</li><li>Live preview before adding to cart</li><li>Carefully packed for safe delivery</li></ul><p>For the best print result, upload a clear, high-resolution photo.</p>`,
      productType: "Customised Mug",
      vendor: "Cartwala",
      status: "ACTIVE",
      seo: { title: `${design.name} Personalised Friends Mug | Cartwala`, description: `Create a personalised friendship mug with your photo, editable names and a meaningful friend quote. Preview online and order from Cartwala.` },
      tags: ["cw-mug", "cw-mug-friends", model.modelTag, `cw-mug-template-${design.code.toLowerCase()}`, `cw-design-${design.code.toLowerCase()}`],
    } });
    const error = result.productCreate.userErrors?.[0];
    if (error) throw new Error(`${handleFor(design, model)}: ${error.message}`);
    console.log(`Created ${handleFor(design, model)}`);
    return result.productCreate.product;
  };

  const uploadFile = async (name) => {
    const bytes = fs.readFileSync(path.join(assets, name));
    const mimeType = mimeFor(name);
    const staged = await gql(`mutation Stage($input:[StagedUploadInput!]!){stagedUploadsCreate(input:$input){stagedTargets{url resourceUrl parameters{name value}} userErrors{field message}}}`, { input: [{ filename: name, mimeType, resource: "IMAGE", httpMethod: "POST", fileSize: String(bytes.length) }] });
    const target = staged.stagedUploadsCreate.stagedTargets?.[0];
    const error = staged.stagedUploadsCreate.userErrors?.[0];
    if (!target || error) throw new Error(`${name}: ${error?.message || "staging failed"}`);
    const body = new FormData();
    for (const entry of target.parameters) body.append(entry.name, entry.value);
    body.append("file", new Blob([bytes], { type: mimeType }), name);
    const sent = await fetch(target.url, { method: "POST", body });
    if (!sent.ok) throw new Error(`${name}: upload HTTP ${sent.status}`);
    const made = await gql(`mutation MakeFile($files:[FileCreateInput!]!){fileCreate(files:$files){files{id fileStatus ... on MediaImage{image{url}}} userErrors{field message}}}`, { files: [{ alt: `Cartwala ${name}`, contentType: "IMAGE", originalSource: target.resourceUrl }] });
    const file = made.fileCreate.files?.[0];
    if (!file) throw new Error(`${name}: ${made.fileCreate.userErrors?.[0]?.message || "fileCreate failed"}`);
    for (let attempt = 0; attempt < 80; attempt += 1) {
      if (file.image?.url) return file.image.url;
      await new Promise((resolve) => setTimeout(resolve, 500));
      const poll = await gql(`query FileStatus($id:ID!){node(id:$id){... on MediaImage{fileStatus image{url}}}}`, { id: file.id });
      if (poll.node?.fileStatus === "FAILED") throw new Error(`${name}: Shopify processing failed`);
      if (poll.node?.image?.url) return poll.node.image.url;
    }
    throw new Error(`${name}: Shopify processing timed out`);
  };

  const rows = [];
  for (const design of designs) {
    for (const model of models) {
      const handle = handleFor(design, model);
      const product = await getProduct(handle) || await createProduct(design, model);
      rows.push({ design, model, product });
    }
  }

  const missingIds = rows.map((row) => row.product.id).filter((id) => !collectionProductIds.has(id));
  if (missingIds.length) {
    const added = await gql(`mutation AddProducts($id:ID!,$productIds:[ID!]!){collectionAddProducts(id:$id,productIds:$productIds){collection{id handle} userErrors{field message}}}`, { id: collection.id, productIds: missingIds });
    const error = added.collectionAddProducts.userErrors?.[0];
    if (error) throw new Error(`Collection: ${error.message}`);
  }

  for (const design of designs) {
    const designRows = rows.filter((row) => row.design.code === design.code);
    const configured = designRows.find((row) =>
      row.product.personalizer?.jsonValue?.enabled &&
      row.product.personalizer?.jsonValue?.assetRevision === assetRevision
    )?.product.personalizer?.jsonValue;
    const overlayUrl = configured?.overlayUrl || await uploadFile(`${design.code}-overlay.png`);
    const maskUrls = [];
    for (let index = 0; index < design.photos; index += 1) {
      maskUrls.push(configured?.photoFields?.[index]?.maskUrl || await uploadFile(`${design.code}-photo-${index + 1}-mask.png`));
    }
    const config = {
      enabled: true,
      assetRevision,
      overlayUrl,
      canvasRatio: "2550:1050",
      photoFields: design.photoLayouts.map((layout, index) => ({
        id: `${design.code.toLowerCase()}-photo-${index + 1}`,
        label: `Upload Photo ${index + 1}`,
        maskUrl: maskUrls[index],
        ...layout,
        rotationEnabled: false,
        required: true,
      })),
      textFields: [{
        id: `${design.code.toLowerCase()}-text-1`,
        label: design.textLabel,
        placeholder: design.textPlaceholder,
        defaultValue: "",
        maxLength: 60,
        color: design.textColor,
        ...design.textLayout,
        alignment: "center",
        fitToBox: true,
        fontSize: 58,
        fontFamily: "Georgia",
        allowFontChoice: false,
        movable: false,
        scalable: false,
        rotatable: false,
        allowColorChoice: false,
        rotation: 0,
        required: true,
      }],
      fileFields: [], linkFields: [], customFonts: [],
    };

    for (const row of designRows) {
      const { model } = row;
      let { product } = row;
      const title = titleFor(design, model);
      const tags = product.tags.filter((tag) => !tag.startsWith("cw-mug-template-") && !tag.startsWith("cw-design-") && !tag.startsWith("cw-mug-model-") && !["cw-mug-birthday","cw-mug-anniversary","cw-mug-family","cw-mug-friends","cw-mug-other"].includes(tag));
      tags.push("cw-mug", "cw-mug-friends", model.modelTag, `cw-mug-template-${design.code.toLowerCase()}`, `cw-design-${design.code.toLowerCase()}`);
      const updated = await gql(`mutation UpdateProduct($product:ProductUpdateInput!){productUpdate(product:$product){product{id title handle tags variants(first:10){nodes{id}} media(first:40){nodes{id alt status}}} userErrors{field message}}}`, { product: { id: product.id, title, tags: [...new Set(tags)], status: "ACTIVE", seo: { title: `${design.name} Personalised Friends Mug | Cartwala`, description: `Create a personalised friendship mug with your photo, editable names and a meaningful friend quote. Preview online and order from Cartwala.` } } });
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
        const variants = await gql(`mutation UpdateVariants($productId:ID!,$variants:[ProductVariantsBulkInput!]!){productVariantsBulkUpdate(productId:$productId,variants:$variants){userErrors{field message}}}`, { productId: product.id, variants: product.variants.nodes.map((variant, index) => ({ id: variant.id, price: model.price, compareAtPrice: model.compareAtPrice, inventoryItem: { tracked: false, requiresShipping: true, sku: `${model.sku}-${design.code.slice(-3)}${index ? `-${index + 1}` : ""}`, measurement: { weight: { unit: "GRAMS", value: 350 } } } })) });
        const error = variants.productVariantsBulkUpdate.userErrors?.[0];
        if (error) throw new Error(`${product.handle}: ${error.message}`);
      }

      const alt = `${design.code} ${model.label} Friends Mug – exact photo shape ${assetRevision}`;
      if (!product.media.nodes.some((media) => media.alt === alt)) {
        const imageUrl = await uploadFile(`${design.code}-${model.key}-mockup.${mockupExtension}`);
        const media = await gql(`mutation AttachImage($productId:ID!,$media:[CreateMediaInput!]!){productCreateMedia(productId:$productId,media:$media){media{id alt status} mediaUserErrors{field message}}}`, { productId: product.id, media: [{ originalSource: imageUrl, mediaContentType: "IMAGE", alt }] });
        const newMedia = media.productCreateMedia.media?.[0];
        const mediaError = media.productCreateMedia.mediaUserErrors?.[0];
        if (!newMedia || mediaError) throw new Error(`${product.handle}: ${mediaError?.message || "image attach failed"}`);
        try {
          await gql(`mutation Reorder($id:ID!,$moves:[MoveInput!]!){productReorderMedia(id:$id,moves:$moves){job{id} mediaUserErrors{field message}}}`, { id: product.id, moves: [{ id: newMedia.id, newPosition: "0" }] });
        } catch (error) {
          console.warn(`${product.handle}: image attached; featured-order retry required: ${error.message}`);
        }
        const oldMediaIds = product.media.nodes.map((media) => media.id).filter((id) => id !== newMedia.id);
        if (oldMediaIds.length) {
          const removed = await gql(`mutation DeleteOldMedia($productId:ID!,$mediaIds:[ID!]!){productDeleteMedia(productId:$productId,mediaIds:$mediaIds){deletedMediaIds mediaUserErrors{field message}}}`, { productId: product.id, mediaIds: oldMediaIds });
          const deleteError = removed.productDeleteMedia.mediaUserErrors?.[0];
          if (deleteError) throw new Error(`${product.handle}: ${deleteError.message}`);
        }
      }

      const legacyId = Number(product.id.split("/").pop());
      const published = await fetch(`https://${session.shop}/admin/api/2025-10/products/${legacyId}.json`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": session.accessToken },
        body: JSON.stringify({ product: { id: legacyId, published_at: new Date().toISOString(), published_scope: "web", status: "active" } }),
      });
      if (!published.ok) throw new Error(`${product.handle}: publish HTTP ${published.status}`);
      console.log(`Configured ${design.code} / ${model.key}`);
    }
  }

  console.log(`Friends products ready: ${designs.length} designs × ${models.length} mug types = ${rows.length} products.`);
}

main().catch((error) => {
  console.error(`Friends product upload failed: ${error.stack || error.message}`);
  process.exitCode = 1;
}).finally(async () => prisma.$disconnect());
