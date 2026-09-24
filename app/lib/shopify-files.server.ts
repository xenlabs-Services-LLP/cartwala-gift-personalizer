// Uploads a font or image to Shopify Files via the three-step staged-upload
// dance (stagedUploadsCreate -> direct POST -> fileCreate), used by both the
// manual "upload overlay/mask/font" actions and the PSD auto-import action
// in app/routes/app._index.tsx.
//
// Consolidated from two near-duplicate implementations (one per file type)
// that each had their own copy of the polling loop. Also fixes a real bug
// present in both originals: they only checked each mutation's `userErrors`
// array and never the GraphQL response's top-level `errors`. A throttled or
// otherwise rejected request comes back with `data` absent (so `userErrors`
// resolves to `[]` through the optional chains) and was being reported as a
// silent success.

import { authenticate } from "../shopify.server";

type AdminApiContext = Awaited<ReturnType<typeof authenticate.admin>>["admin"];

type StagedTarget = {
  url: string;
  resourceUrl: string;
  parameters: Array<{ name: string; value: string }>;
};

type GraphQLJson = {
  data?: Record<string, unknown>;
  errors?: Array<{ message?: string }>;
};

export class ShopifyFileUploadError extends Error {}

const userErrorsAt = (
  json: GraphQLJson,
  mutationKey: string,
): string | undefined => {
  const mutation = json.data?.[mutationKey] as
    { userErrors?: Array<{ message?: string }> } | undefined;
  return mutation?.userErrors?.[0]?.message;
};

/** Prefers a top-level GraphQL error over a mutation's own userErrors. */
const firstError = (
  json: GraphQLJson,
  mutationKey?: string,
): string | undefined =>
  json.errors?.[0]?.message ??
  (mutationKey ? userErrorsAt(json, mutationKey) : undefined);

async function stageUpload(
  admin: AdminApiContext,
  file: File,
  resource: "FILE" | "IMAGE",
): Promise<StagedTarget> {
  const response = await admin.graphql(
    `#graphql
    mutation CartwalaStageUpload($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets { url resourceUrl parameters { name value } }
        userErrors { message }
      }
    }`,
    {
      variables: {
        input: [
          {
            filename: file.name,
            mimeType:
              file.type || (resource === "IMAGE" ? "image/png" : "font/ttf"),
            resource,
            httpMethod: "POST",
            fileSize: String(file.size),
          },
        ],
      },
    },
  );
  const json = (await response.json()) as GraphQLJson;
  const error = firstError(json, "stagedUploadsCreate");
  const target = (
    json.data?.stagedUploadsCreate as
      { stagedTargets?: StagedTarget[] } | undefined
  )?.stagedTargets?.[0];
  if (error || !target)
    throw new ShopifyFileUploadError(
      error || "The upload could not be started.",
    );
  return target;
}

async function sendToStagedTarget(
  target: StagedTarget,
  file: File,
): Promise<void> {
  const body = new FormData();
  target.parameters.forEach((parameter) =>
    body.append(parameter.name, parameter.value),
  );
  body.append("file", file, file.name);
  const sent = await fetch(target.url, { method: "POST", body });
  if (!sent.ok)
    throw new ShopifyFileUploadError(
      "The file could not be uploaded to Shopify.",
    );
}

export type ShopifyFileAsset = { id: string; url: string };

type CreatedFile = { id: string; fileStatus?: string; url?: string };

async function createShopifyFile(
  admin: AdminApiContext,
  resourceUrl: string,
  alt: string,
  contentType: "FILE" | "IMAGE",
): Promise<CreatedFile> {
  const response = await admin.graphql(
    `#graphql
    mutation CartwalaCreateFile($files: [FileCreateInput!]!) {
      fileCreate(files: $files) {
        files {
          id
          fileStatus
          ... on GenericFile { url }
          ... on MediaImage { image { url } }
        }
        userErrors { message }
      }
    }`,
    {
      variables: { files: [{ alt, contentType, originalSource: resourceUrl }] },
    },
  );
  const json = (await response.json()) as GraphQLJson;
  const error = firstError(json, "fileCreate");
  const created = (
    json.data?.fileCreate as
      | {
          files?: Array<{
            id: string;
            fileStatus?: string;
            url?: string;
            image?: { url?: string };
          }>;
        }
      | undefined
  )?.files?.[0];
  if (error || !created)
    throw new ShopifyFileUploadError(
      error || "The file could not be saved to Shopify Files.",
    );
  return {
    id: created.id,
    fileStatus: created.fileStatus,
    url: created.url ?? created.image?.url,
  };
}

async function pollForUrl(
  admin: AdminApiContext,
  id: string,
  attempts: number,
): Promise<string> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    const response = await admin.graphql(
      `#graphql
      query CartwalaFileStatus($id: ID!) {
        node(id: $id) {
          ... on GenericFile { fileStatus url }
          ... on MediaImage { fileStatus image { url } }
        }
      }`,
      { variables: { id } },
    );
    const json = (await response.json()) as GraphQLJson;
    const error = firstError(json);
    if (error) throw new ShopifyFileUploadError(error);
    const node = json.data?.node as
      | { fileStatus?: string; url?: string; image?: { url?: string } }
      | null
      | undefined;
    if (node?.fileStatus === "FAILED")
      throw new ShopifyFileUploadError("Shopify could not process this file.");
    const url = node?.url ?? node?.image?.url;
    if (url) return url;
  }
  throw new ShopifyFileUploadError(
    "The file is still processing. Please try the upload again after a few seconds.",
  );
}

async function uploadToShopifyFiles(
  admin: AdminApiContext,
  file: File,
  resource: "FILE" | "IMAGE",
  pollAttempts: number,
): Promise<ShopifyFileAsset> {
  const target = await stageUpload(admin, file, resource);
  await sendToStagedTarget(target, file);
  const created = await createShopifyFile(
    admin,
    target.resourceUrl,
    file.name,
    resource,
  );
  if (created.fileStatus === "FAILED")
    throw new ShopifyFileUploadError("Shopify could not process this file.");
  try {
    const url =
      created.url || (await pollForUrl(admin, created.id, pollAttempts));
    return { id: created.id, url };
  } catch (error) {
    // fileCreate already succeeded, so a later polling failure would otherwise
    // leave an invisible orphan in Shopify Files after every retry.
    await deleteShopifyFiles(admin, [created.id]).catch(() => undefined);
    throw error;
  }
}

export async function uploadFont(
  admin: AdminApiContext,
  file: File,
): Promise<string> {
  if (!/\.(woff2?|ttf|otf)$/i.test(file.name) || file.size > 10 * 1024 * 1024) {
    throw new ShopifyFileUploadError(
      "Choose a WOFF, WOFF2, TTF or OTF font smaller than 10 MB.",
    );
  }
  return (await uploadToShopifyFiles(admin, file, "FILE", 12)).url;
}

export async function uploadImage(
  admin: AdminApiContext,
  file: File,
): Promise<string> {
  return (await uploadImageAsset(admin, file)).url;
}

export async function uploadImageAsset(
  admin: AdminApiContext,
  file: File,
): Promise<ShopifyFileAsset> {
  if (!/\.(png|jpe?g|webp)$/i.test(file.name) || file.size > 25 * 1024 * 1024) {
    throw new ShopifyFileUploadError(
      "Choose a PNG, JPG or WebP image smaller than 25 MB.",
    );
  }
  return uploadToShopifyFiles(admin, file, "IMAGE", 20);
}

/** Stage and create up to four print images in two Admin API mutations. */
export async function uploadImageAssets(
  admin: AdminApiContext,
  files: File[],
): Promise<ShopifyFileAsset[]> {
  if (!files.length || files.length > 4 || files.some(
    (file) => !/\.(png|jpe?g|webp)$/i.test(file.name) ||
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size < 100 || file.size > 15 * 1024 * 1024,
  )) throw new ShopifyFileUploadError("Choose up to four JPG, PNG or WebP images under 15 MB each.");

  const stagedResponse = await admin.graphql(
    `#graphql
    mutation CartwalaStagePrintBatch($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets { url resourceUrl parameters { name value } }
        userErrors { message }
      }
    }`,
    { variables: { input: files.map((file) => ({
      filename: file.name, mimeType: file.type, resource: "IMAGE",
      httpMethod: "POST", fileSize: String(file.size),
    })) } },
  );
  const stagedJson = (await stagedResponse.json()) as GraphQLJson;
  const stagedError = firstError(stagedJson, "stagedUploadsCreate");
  const targets = (stagedJson.data?.stagedUploadsCreate as
    { stagedTargets?: StagedTarget[] } | undefined)?.stagedTargets;
  if (stagedError || targets?.length !== files.length) throw new ShopifyFileUploadError(
    stagedError || "Could not prepare all print uploads.",
  );
  await Promise.all(files.map((file, index) => sendToStagedTarget(targets[index], file)));

  const createdResponse = await admin.graphql(
    `#graphql
    mutation CartwalaCreatePrintBatch($files: [FileCreateInput!]!) {
      fileCreate(files: $files) {
        files { id fileStatus ... on MediaImage { image { url } } }
        userErrors { message }
      }
    }`,
    { variables: { files: targets.map((target, index) => ({
      alt: files[index].name, contentType: "IMAGE", originalSource: target.resourceUrl,
    })) } },
  );
  const createdJson = (await createdResponse.json()) as GraphQLJson;
  const createdError = firstError(createdJson, "fileCreate");
  const created = (createdJson.data?.fileCreate as
    { files?: Array<{ id: string; fileStatus?: string; image?: { url?: string } }> } | undefined)?.files;
  const ids = created?.map((file) => file.id).filter(Boolean) ?? [];
  if (createdError || created?.length !== files.length) {
    await deleteShopifyFiles(admin, ids).catch(() => undefined);
    throw new ShopifyFileUploadError(createdError || "Could not save all print files.");
  }
  try {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const statusResponse = await admin.graphql(
        `#graphql
        query CartwalaPrintBatchStatus($ids: [ID!]!) {
          nodes(ids: $ids) { ... on MediaImage { fileStatus image { url } } }
        }`,
        { variables: { ids } },
      );
      const statusJson = (await statusResponse.json()) as GraphQLJson;
      const statusError = firstError(statusJson);
      if (statusError) throw new ShopifyFileUploadError(statusError);
      const nodes = statusJson.data?.nodes as
        Array<{ fileStatus?: string; image?: { url?: string } } | null> | undefined;
      if (nodes?.some((node) => node?.fileStatus === "FAILED"))
        throw new ShopifyFileUploadError("Shopify could not process a print file.");
      if (nodes?.length === files.length && nodes.every((node) => node?.image?.url))
        return ids.map((id, index) => ({ id, url: nodes[index]!.image!.url! }));
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new ShopifyFileUploadError("Print files are still processing. Try again in a moment.");
  } catch (error) {
    await deleteShopifyFiles(admin, ids).catch(() => undefined);
    throw error;
  }
}

/**
 * Permanently removes app-owned generated assets. Callers must only pass IDs
 * recorded by uploadImageAsset; deleting arbitrary merchant files is unsafe.
 */
export async function deleteShopifyFiles(
  admin: AdminApiContext,
  fileIds: string[],
): Promise<string[]> {
  const safeIds = [...new Set(fileIds)].filter((id) =>
    /^gid:\/\/shopify\/(MediaImage|GenericFile)\/\d+$/.test(id),
  );
  const deleted: string[] = [];
  for (let offset = 0; offset < safeIds.length; offset += 100) {
    const response = await admin.graphql(
      `#graphql
      mutation CartwalaDeleteGeneratedFiles($fileIds: [ID!]!) {
        fileDelete(fileIds: $fileIds) {
          deletedFileIds
          userErrors { field message code }
        }
      }`,
      { variables: { fileIds: safeIds.slice(offset, offset + 100) } },
    );
    const json = (await response.json()) as GraphQLJson;
    const error = firstError(json, "fileDelete");
    if (error) throw new ShopifyFileUploadError(error);
    const payload = json.data?.fileDelete as
      { deletedFileIds?: string[] } | undefined;
    deleted.push(...(payload?.deletedFileIds ?? []));
  }
  return deleted;
}

/** Shared by every metafieldsSet caller in the action - see app/routes/app._index.tsx. */
export function firstMetafieldsSetError(json: GraphQLJson): string | undefined {
  return firstError(json, "metafieldsSet");
}
