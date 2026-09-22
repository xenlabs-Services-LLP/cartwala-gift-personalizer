import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const here = path.dirname(fileURLToPath(import.meta.url));
const assets = path.resolve(here, "../assets/realistic-mug-mockups");
const apiVersion = "2026-07";

const birthdayDesigns = [
  ["CW-BD-001", "burgundy-gold"],
  ["CW-BD-002", "royal-blue-stars"],
  ["CW-BD-003", "pink-floral"],
  ["CW-BD-004", "black-gold-luxury"],
  ["CW-BD-005", "sky-balloons"],
  ["CW-BD-006", "purple-party"],
  ["CW-BD-007", "green-botanical"],
  ["CW-BD-008", "red-bold"],
  ["CW-BD-009", "peach-cake"],
  ["CW-BD-010", "rainbow-celebration"],
];

const loveDesigns = [
  ["CW-LV-001", "blush-love-always"],
  ["CW-LV-002", "written-in-the-stars"],
  ["CW-LV-003", "grow-old-with-me"],
];

const models = ["normal", "magic", "love", "red"];
const originalHandles = {
  normal: "personalized-normal-white-photo-mug-11oz",
  magic: "personalized-magic-mug-hot-water-reveal-11oz",
  love: "personalized-white-love-handle-mug-11oz",
  red: "personalized-inner-colour-red-mug-11oz",
};

const targets = [
  ...birthdayDesigns.flatMap(([code, slug]) => models.map((model) => ({
    code,
    model,
    handle: code === "CW-BD-001" ? originalHandles[model] : `personalized-birthday-${slug}-${model}-mug`,
  }))),
  ...loveDesigns.flatMap(([code, slug]) => models.map((model) => ({
    code,
    model,
    handle: `personalized-love-${slug}-${model}-mug`,
  }))),
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
    if (!response.ok || json.errors?.length) {
      throw new Error(json.errors?.map((error) => error.message).join("; ") || `Shopify HTTP ${response.status}`);
    }
    return json.data;
  };

  const getProduct = async (handle) => {
    const data = await gql(`query ProductByHandle($query:String!){products(first:5,query:$query){nodes{id handle media(first:40){nodes{id alt status}}}}}`, { query: `handle:${handle}` });
    return data.products.nodes.find((item) => item.handle === handle);
  };

  const uploadFile = async (filename) => {
    const bytes = fs.readFileSync(path.join(assets, filename));
    const staged = await gql(`mutation Stage($input:[StagedUploadInput!]!){stagedUploadsCreate(input:$input){stagedTargets{url resourceUrl parameters{name value}} userErrors{field message}}}`, {
      input: [{ filename, mimeType: "image/jpeg", resource: "IMAGE", httpMethod: "POST", fileSize: String(bytes.length) }],
    });
    const error = staged.stagedUploadsCreate.userErrors?.[0];
    const target = staged.stagedUploadsCreate.stagedTargets?.[0];
    if (error || !target) throw new Error(`${filename}: ${error?.message || "staged upload failed"}`);

    const form = new FormData();
    for (const parameter of target.parameters) form.append(parameter.name, parameter.value);
    form.append("file", new Blob([bytes], { type: "image/jpeg" }), filename);
    const sent = await fetch(target.url, { method: "POST", body: form });
    if (!sent.ok) throw new Error(`${filename}: staged upload returned HTTP ${sent.status}`);

    const made = await gql(`mutation MakeFile($files:[FileCreateInput!]!){fileCreate(files:$files){files{id fileStatus ... on MediaImage{image{url}}} userErrors{field message}}}`, {
      files: [{ alt: `Cartwala ${filename}`, contentType: "IMAGE", originalSource: target.resourceUrl }],
    });
    const file = made.fileCreate.files?.[0];
    if (!file) throw new Error(`${filename}: ${made.fileCreate.userErrors?.[0]?.message || "fileCreate failed"}`);
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const checked = await gql(`query FileStatus($id:ID!){node(id:$id){... on MediaImage{fileStatus image{url}}}}`, { id: file.id });
      if (checked.node?.fileStatus === "READY" && checked.node.image?.url) return checked.node.image.url;
      if (checked.node?.fileStatus === "FAILED") throw new Error(`${filename}: Shopify file processing failed`);
      await sleep(1200);
    }
    throw new Error(`${filename}: Shopify file processing timed out`);
  };

  let completed = 0;
  for (const target of targets) {
    const filename = `${target.code}-${target.model}-mockup.jpg`;
    if (!fs.existsSync(path.join(assets, filename))) throw new Error(`Missing ${filename}`);
    const product = await getProduct(target.handle);
    if (!product) throw new Error(`Product not found: ${target.handle}`);

    const newAlt = `${target.code} ${target.model} realistic three-view mug mockup v2`;
    const existing = product.media.nodes.find((media) => media.alt === newAlt);
    if (existing) {
      completed += 1;
      console.log(`[${completed}/${targets.length}] already updated ${target.handle}`);
      continue;
    }

    const imageUrl = await uploadFile(filename);
    const attached = await gql(`mutation AttachImage($productId:ID!,$media:[CreateMediaInput!]!){productCreateMedia(productId:$productId,media:$media){media{id alt status} mediaUserErrors{field message}}}`, {
      productId: product.id,
      media: [{ originalSource: imageUrl, mediaContentType: "IMAGE", alt: newAlt }],
    });
    const mediaError = attached.productCreateMedia.mediaUserErrors?.[0];
    const newMedia = attached.productCreateMedia.media?.[0];
    if (mediaError || !newMedia) throw new Error(`${target.handle}: ${mediaError?.message || "image attach failed"}`);

    await gql(`mutation Reorder($id:ID!,$moves:[MoveInput!]!){productReorderMedia(id:$id,moves:$moves){job{id} mediaUserErrors{field message}}}`, {
      id: product.id,
      moves: [{ id: newMedia.id, newPosition: "0" }],
    });

    const oldMediaIds = product.media.nodes.map((media) => media.id).filter((id) => id !== newMedia.id);
    if (oldMediaIds.length) {
      const removed = await gql(`mutation DeleteOldMedia($productId:ID!,$mediaIds:[ID!]!){productDeleteMedia(productId:$productId,mediaIds:$mediaIds){deletedMediaIds mediaUserErrors{field message}}}`, {
        productId: product.id,
        mediaIds: oldMediaIds,
      });
      const deleteError = removed.productDeleteMedia.mediaUserErrors?.[0];
      if (deleteError) throw new Error(`${target.handle}: ${deleteError.message}`);
    }

    completed += 1;
    console.log(`[${completed}/${targets.length}] updated ${target.handle}`);
  }

  console.log(`Realistic mug mockups complete: ${completed}/${targets.length} products.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});
