import prismaPackage from "@prisma/client";

const { PrismaClient } = prismaPackage;
const prisma = new PrismaClient();
const apiVersion = "2026-07";

async function main() {
  const sessions = await prisma.session.findMany();
  const session = sessions.find((item) => !item.isOnline && item.accessToken)
    || sessions.find((item) => item.accessToken);
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
    if (!response.ok || json.errors?.length) {
      throw new Error(json.errors?.map((error) => error.message).join("; ") || `Shopify HTTP ${response.status}`);
    }
    return json.data;
  };

  const products = [];
  let after = null;
  do {
    const data = await gql(`query MugConfigs($after:String){products(first:100,after:$after,query:"tag:cw-mug"){nodes{id title handle appConfig:metafield(namespace:"$app",key:"personalizer_config"){jsonValue} legacyConfig:metafield(namespace:"cartwala_personalizer",key:"personalizer_config"){jsonValue}} pageInfo{hasNextPage endCursor}}}`, { after });
    products.push(...data.products.nodes);
    after = data.products.pageInfo.hasNextPage ? data.products.pageInfo.endCursor : null;
  } while (after);

  const updates = [];
  let changedProducts = 0;
  let changedFields = 0;

  for (const product of products) {
    const config = product.appConfig?.jsonValue || product.legacyConfig?.jsonValue;
    if (!config?.enabled || !Array.isArray(config.textFields) || !config.textFields.length) continue;

    const textFields = config.textFields.map((field) => {
      if (field.required === false) return field;
      changedFields += 1;
      return { ...field, required: false };
    });
    if (textFields.every((field, index) => field === config.textFields[index])) continue;

    const updatedConfig = { ...config, textFields };
    const value = JSON.stringify(updatedConfig);
    updates.push(
      { ownerId: product.id, namespace: "$app", key: "personalizer_config", type: "json", value },
      { ownerId: product.id, namespace: "cartwala_personalizer", key: "personalizer_config", type: "json", value },
    );
    changedProducts += 1;
  }

  for (let index = 0; index < updates.length; index += 24) {
    const batch = updates.slice(index, index + 24);
    const result = await gql(`mutation SaveOptionalText($metafields:[MetafieldsSetInput!]!){metafieldsSet(metafields:$metafields){metafields{id key namespace} userErrors{field message code}}}`, { metafields: batch });
    const error = result.metafieldsSet.userErrors?.[0];
    if (error) throw new Error(`${error.code || "METAFIELD_ERROR"}: ${error.message}`);
    console.log(`Saved ${Math.min(index + batch.length, updates.length)}/${updates.length} metafield values`);
  }

  console.log(`Mug text optional update complete: ${changedProducts}/${products.length} products, ${changedFields} text fields changed.`);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
}).finally(async () => prisma.$disconnect());
