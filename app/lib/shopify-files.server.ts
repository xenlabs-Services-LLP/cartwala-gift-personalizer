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

const userErrorsAt = (json: GraphQLJson, mutationKey: string): string | undefined => {
  const mutation = json.data?.[mutationKey] as { userErrors?: Array<{ message?: string }> } | undefined;
  return mutation?.userErrors?.[0]?.message;
};

/** Prefers a top-level GraphQL error over a mutation's own userErrors. */
const firstError = (json: GraphQLJson, mutationKey?: string): string | undefined =>
  json.errors?.[0]?.message ?? (mutationKey ? userErrorsAt(json, mutationKey) : undefined);

async function stageUpload(admin: AdminApiContext, file: File, resource: "FILE" | "IMAGE"): Promise<StagedTarget> {
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
            mimeType: file.type || (resource === "IMAGE" ? "image/png" : "font/ttf"),
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
  const target = (json.data?.stagedUploadsCreate as { stagedTargets?: StagedTarget[] } | undefined)?.stagedTargets?.[0];
  if (error || !target) throw new ShopifyFileUploadError(error || "The upload could not be started.");
  return target;
}

async function sendToStagedTarget(target: StagedTarget, file: File): Promise<void> {
  const body = new FormData();
  target.parameters.forEach((parameter) => body.append(parameter.name, parameter.value));
  body.append("file", file, file.name);
  const sent = await fetch(target.url, { method: "POST", body });
  if (!sent.ok) throw new ShopifyFileUploadError("The file could not be uploaded to Shopify.");
}

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
    { variables: { files: [{ alt, contentType, originalSource: resourceUrl }] } },
  );
  const json = (await response.json()) as GraphQLJson;
  const error = firstError(json, "fileCreate");
  const created = (json.data?.fileCreate as { files?: Array<{ id: string; fileStatus?: string; url?: string; image?: { url?: string } }> } | undefined)?.files?.[0];
  if (error || !created) throw new ShopifyFileUploadError(error || "The file could not be saved to Shopify Files.");
  return { id: created.id, fileStatus: created.fileStatus, url: created.url ?? created.image?.url };
}

async function pollForUrl(admin: AdminApiContext, id: string, attempts: number): Promise<string> {
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
    const node = json.data?.node as { fileStatus?: string; url?: string; image?: { url?: string } } | null | undefined;
    if (node?.fileStatus === "FAILED") throw new ShopifyFileUploadError("Shopify could not process this file.");
    const url = node?.url ?? node?.image?.url;
    if (url) return url;
  }
  throw new ShopifyFileUploadError("The file is still processing. Please try the upload again after a few seconds.");
}

async function uploadToShopifyFiles(
  admin: AdminApiContext,
  file: File,
  resource: "FILE" | "IMAGE",
  pollAttempts: number,
): Promise<string> {
  const target = await stageUpload(admin, file, resource);
  await sendToStagedTarget(target, file);
  const created = await createShopifyFile(admin, target.resourceUrl, file.name, resource);
  if (created.fileStatus === "FAILED") throw new ShopifyFileUploadError("Shopify could not process this file.");
  if (created.url) return created.url;
  return pollForUrl(admin, created.id, pollAttempts);
}

export async function uploadFont(admin: AdminApiContext, file: File): Promise<string> {
  if (!/\.(woff2?|ttf|otf)$/i.test(file.name) || file.size > 10 * 1024 * 1024) {
    throw new ShopifyFileUploadError("Choose a WOFF, WOFF2, TTF or OTF font smaller than 10 MB.");
  }
  return uploadToShopifyFiles(admin, file, "FILE", 12);
}

export async function uploadImage(admin: AdminApiContext, file: File): Promise<string> {
  if (!/\.(png|jpe?g|webp)$/i.test(file.name) || file.size > 25 * 1024 * 1024) {
    throw new ShopifyFileUploadError("Choose a PNG, JPG or WebP image smaller than 25 MB.");
  }
  return uploadToShopifyFiles(admin, file, "IMAGE", 20);
}

/** Shared by every metafieldsSet caller in the action - see app/routes/app._index.tsx. */
export function firstMetafieldsSetError(json: GraphQLJson): string | undefined {
  return firstError(json, "metafieldsSet");
}
