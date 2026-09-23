import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const here = path.dirname(fileURLToPath(import.meta.url));
const assets = path.resolve(here, '../assets/anniversary-ten-live');
const psdPath = path.join(assets, 'CW-AN-001-champagne-ribbon-vows.psd');
const manifest = JSON.parse(fs.readFileSync(path.join(assets, 'manifest-pilot.json'), 'utf8'));
const apiVersion = '2026-07';

const models = [
  { key: 'normal', label: 'Classic White Mug', tag: 'cw-mug-model-white', price: '250.00', compareAt: '450.00', sku: 'CW-ANN-NORMAL' },
  { key: 'magic', label: 'Magic Hot Water Reveal Mug', tag: 'cw-mug-model-magic', price: '400.00', compareAt: '800.00', sku: 'CW-ANN-MAGIC' },
  { key: 'love', label: 'White Love Handle Mug', tag: 'cw-mug-model-love-handle', price: '300.00', compareAt: '700.00', sku: 'CW-ANN-LOVE' },
  { key: 'red', label: 'Inner Colour Red Mug', tag: 'cw-mug-model-red', price: '300.00', compareAt: '700.00', sku: 'CW-ANN-RED' },
];

const handleFor = (design, model) => `personalized-anniversary-${design.slug}-${model.key}-mug`;
const titleFor = (design, model) => `Personalized ${design.name} Anniversary Mug – ${model.label}`;

async function main() {
  const sessions = await prisma.session.findMany();
  const session = sessions.find((row) => !row.isOnline && row.accessToken) || sessions.find((row) => row.accessToken);
  if (!session) throw new Error('No stored Shopify Admin session is available.');
  const endpoint = `https://${session.shop}/admin/api/${apiVersion}/graphql.json`;
  const gql = async (query, variables = {}) => {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': session.accessToken },
      body: JSON.stringify({ query, variables }),
    });
    const json = await response.json();
    if (!response.ok || json.errors?.length) throw new Error(json.errors?.map((error) => error.message).join('; ') || `Shopify HTTP ${response.status}`);
    return json.data;
  };

  const upload = async (file, resource, contentType, mimeType) => {
    const bytes = fs.readFileSync(file);
    const name = path.basename(file);
    const staged = await gql(`mutation Stage($input:[StagedUploadInput!]!){stagedUploadsCreate(input:$input){stagedTargets{url resourceUrl parameters{name value}} userErrors{field message}}}`, {
      input: [{ filename: name, mimeType, resource, httpMethod: 'POST', fileSize: String(bytes.length) }],
    });
    const target = staged.stagedUploadsCreate.stagedTargets?.[0];
    const stageError = staged.stagedUploadsCreate.userErrors?.[0];
    if (!target || stageError) throw new Error(`${name}: ${stageError?.message || 'staging failed'}`);
    const body = new FormData();
    for (const parameter of target.parameters) body.append(parameter.name, parameter.value);
    body.append('file', new Blob([bytes], { type: mimeType }), name);
    const sent = await fetch(target.url, { method: 'POST', body });
    if (!sent.ok) throw new Error(`${name}: upload HTTP ${sent.status}`);
    const made = await gql(`mutation Make($files:[FileCreateInput!]!){fileCreate(files:$files){files{id fileStatus ... on MediaImage{image{url}} ... on GenericFile{url}} userErrors{field message}}}`, {
      files: [{ alt: `Cartwala ${name}`, contentType, originalSource: target.resourceUrl }],
    });
    const fileNode = made.fileCreate.files?.[0];
    if (!fileNode) throw new Error(`${name}: ${made.fileCreate.userErrors?.[0]?.message || 'file registration failed'}`);
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const status = await gql(`query File($id:ID!){node(id:$id){... on MediaImage{fileStatus image{url}} ... on GenericFile{fileStatus url}}}`, { id: fileNode.id });
      if (status.node?.fileStatus === 'FAILED') throw new Error(`${name}: Shopify processing failed`);
      if (status.node?.image?.url || status.node?.url) return status.node.image?.url || status.node.url;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error(`${name}: Shopify processing timeout`);
  };

  const collectionData = await gql(`query Collection($query:String!){collections(first:5,query:$query){nodes{id handle products(first:250){nodes{id}}}}}`, { query: 'handle:customised-mugs' });
  const collection = collectionData.collections.nodes.find((row) => row.handle === 'customised-mugs');
  if (!collection) throw new Error('Customised Mugs collection was not found.');
  const collectionIds = new Set(collection.products.nodes.map((row) => row.id));

  for (const design of manifest) {
    const overlayUrl = await upload(path.join(assets, `${design.code}-overlay.png`), 'IMAGE', 'IMAGE', 'image/png');
    const maskUrls = [];
    for (let index = 0; index < 2; index += 1) {
      maskUrls.push(await upload(path.join(assets, `${design.code}-photo-${index + 1}-mask.png`), 'IMAGE', 'IMAGE', 'image/png'));
    }
    const psdUrl = await upload(psdPath, 'FILE', 'FILE', 'image/vnd.adobe.photoshop');
    console.log(`PSD archived in Shopify Files: ${psdUrl}`);

    const config = {
      enabled: true,
      overlayUrl,
      canvasRatio: '2550:1050',
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
        defaultValue: '',
        maxLength: 80,
        maxLines: 2,
        color: design.textColor,
        ...design.textLayout,
        alignment: 'center',
        fitToBox: true,
        fontSize: 58,
        fontFamily: 'Georgia',
        allowFontChoice: false,
        movable: false,
        scalable: false,
        rotatable: false,
        allowColorChoice: false,
        rotation: 0,
        required: false,
      }],
      fileFields: [],
      linkFields: [],
      customFonts: [],
    };

    const products = [];
    for (const model of models) {
      const handle = handleFor(design, model);
      const found = await gql(`query Product($query:String!){products(first:5,query:$query){nodes{id handle tags variants(first:10){nodes{id}}}}}`, { query: `handle:${handle}` });
      let product = found.products.nodes.find((row) => row.handle === handle);
      if (!product) {
        const created = await gql(`mutation Create($product:ProductCreateInput!){productCreate(product:$product){product{id handle tags variants(first:10){nodes{id}}} userErrors{field message}}}`, { product: {
          title: titleFor(design, model),
          handle,
          descriptionHtml: `<p>Celebrate your journey together with this premium ${design.name} personalised anniversary mug. Upload two favourite photos and optionally add names, a date, or a short message.</p><ul><li>Two editable photo areas</li><li>Optional two-line customer message</li><li>Fixed anniversary quote</li><li>Live preview before ordering</li><li>High-quality full-wrap print</li></ul>`,
          productType: 'Customised Mug',
          vendor: 'Cartwala',
          status: 'DRAFT',
          seo: { title: `${design.name} Personalised Anniversary Mug | Cartwala`, description: `Personalise the ${design.name} anniversary mug with two photos and an optional message. Premium full-wrap design from Cartwala.` },
          tags: ['cw-mug', 'cw-mug-anniversary', model.tag, `cw-mug-template-${design.code.toLowerCase()}`, `cw-design-${design.code.toLowerCase()}`],
        } });
        const error = created.productCreate.userErrors?.[0];
        if (error) throw new Error(`${handle}: ${error.message}`);
        product = created.productCreate.product;
        console.log(`Created draft ${handle}`);
      }
      products.push({ product, model });

      const saved = await gql(`mutation Save($metafields:[MetafieldsSetInput!]!){metafieldsSet(metafields:$metafields){userErrors{field message}}}`, { metafields: [
        { ownerId: product.id, namespace: '$app', key: 'personalizer_config', type: 'json', value: JSON.stringify(config) },
        { ownerId: product.id, namespace: 'cartwala_personalizer', key: 'personalizer_config', type: 'json', value: JSON.stringify(config) },
      ] });
      if (saved.metafieldsSet.userErrors?.length) throw new Error(`${handle}: ${saved.metafieldsSet.userErrors[0].message}`);

      const variants = await gql(`mutation Variants($productId:ID!,$variants:[ProductVariantsBulkInput!]!){productVariantsBulkUpdate(productId:$productId,variants:$variants){userErrors{field message}}}`, {
        productId: product.id,
        variants: product.variants.nodes.map((variant, index) => ({
          id: variant.id,
          price: model.price,
          compareAtPrice: model.compareAt,
          inventoryItem: { tracked: false, requiresShipping: true, sku: `${model.sku}-001${index ? `-${index + 1}` : ''}`, measurement: { weight: { unit: 'GRAMS', value: 350 } } },
        })),
      });
      if (variants.productVariantsBulkUpdate.userErrors?.length) throw new Error(`${handle}: ${variants.productVariantsBulkUpdate.userErrors[0].message}`);
    }

    const missing = products.map((row) => row.product.id).filter((id) => !collectionIds.has(id));
    if (missing.length) {
      const added = await gql(`mutation Add($id:ID!,$productIds:[ID!]!){collectionAddProducts(id:$id,productIds:$productIds){userErrors{field message}}}`, { id: collection.id, productIds: missing });
      if (added.collectionAddProducts.userErrors?.length) throw new Error(added.collectionAddProducts.userErrors[0].message);
    }

    const verify = await gql(`query Verify($query:String!){products(first:10,query:$query){nodes{handle status config:metafield(namespace:"cartwala_personalizer",key:"personalizer_config"){jsonValue}}}}`, { query: `tag:cw-mug-template-${design.code.toLowerCase()}` });
    for (const row of verify.products.nodes) {
      const cfg = row.config?.jsonValue;
      if (cfg?.photoFields?.length !== 2 || cfg?.textFields?.[0]?.required !== false) throw new Error(`${row.handle}: config verification failed`);
    }
    console.log(`Verified ${verify.products.nodes.length} pilot products: two photos + optional text.`);
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
}).finally(async () => prisma.$disconnect());
