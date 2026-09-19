import type { Config } from "./personalizer-config";
import { normalizeConfig } from "./personalizer-config";
import type { ShopifyFileAsset } from "./shopify-files.server";

export const ASSET_REGISTRY_KEY = "personalizer_asset_registry";

export type PersonalizerAssetVersion = {
  createdAt: string;
  config: Config;
  overlay: ShopifyFileAsset | null;
  masks: ShopifyFileAsset[];
};

export type PersonalizerAssetRegistry = {
  schemaVersion: 1;
  current: PersonalizerAssetVersion | null;
  previous: PersonalizerAssetVersion | null;
  retired: Array<{
    deleteAfter: string;
    assets: ShopifyFileAsset[];
  }>;
};

export const emptyAssetRegistry = (): PersonalizerAssetRegistry => ({
  schemaVersion: 1,
  current: null,
  previous: null,
  retired: [],
});

const normalizeAsset = (value: unknown): ShopifyFileAsset | null => {
  if (!value || typeof value !== "object") return null;
  const asset = value as Partial<ShopifyFileAsset>;
  const id = String(asset.id || "");
  const url = String(asset.url || "");
  if (!/^gid:\/\/shopify\/(MediaImage|GenericFile)\/\d+$/.test(id)) return null;
  if (!/^https:\/\//.test(url)) return null;
  return { id, url };
};

const normalizeVersion = (value: unknown): PersonalizerAssetVersion | null => {
  if (!value || typeof value !== "object") return null;
  const version = value as Partial<PersonalizerAssetVersion>;
  if (!version.config) return null;
  const createdAt = String(version.createdAt || "");
  return {
    createdAt: Number.isNaN(Date.parse(createdAt))
      ? new Date(0).toISOString()
      : new Date(createdAt).toISOString(),
    config: normalizeConfig(version.config),
    overlay: normalizeAsset(version.overlay),
    masks: Array.isArray(version.masks)
      ? version.masks
          .map(normalizeAsset)
          .filter((asset): asset is ShopifyFileAsset => asset !== null)
      : [],
  };
};

export const normalizeAssetRegistry = (
  value: unknown,
): PersonalizerAssetRegistry => {
  if (!value || typeof value !== "object") return emptyAssetRegistry();
  const registry = value as Partial<PersonalizerAssetRegistry>;
  const retired = Array.isArray(registry.retired)
    ? registry.retired.slice(0, 100).flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const candidate = item as {
          deleteAfter?: unknown;
          assets?: unknown;
        };
        const deleteAfter = String(candidate.deleteAfter || "");
        const assets = Array.isArray(candidate.assets)
          ? candidate.assets
              .map(normalizeAsset)
              .filter((asset): asset is ShopifyFileAsset => asset !== null)
          : [];
        return Number.isNaN(Date.parse(deleteAfter)) || !assets.length
          ? []
          : [{ deleteAfter: new Date(deleteAfter).toISOString(), assets }];
      })
    : [];
  return {
    schemaVersion: 1,
    current: normalizeVersion(registry.current),
    previous: normalizeVersion(registry.previous),
    retired,
  };
};

export const assetIds = (version: PersonalizerAssetVersion | null): string[] =>
  version
    ? [version.overlay?.id, ...version.masks.map((asset) => asset.id)].filter(
        (id): id is string => Boolean(id),
      )
    : [];

export const RETIRED_ASSET_DAYS = 30;

export const retireAssets = (
  version: PersonalizerAssetVersion | null,
  now = Date.now(),
): PersonalizerAssetRegistry["retired"][number] | null => {
  if (!version) return null;
  const assets = [version.overlay, ...version.masks].filter(
    (asset): asset is ShopifyFileAsset => asset !== null,
  );
  if (!assets.length) return null;
  return {
    deleteAfter: new Date(
      now + RETIRED_ASSET_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString(),
    assets,
  };
};

export const legacyVersion = (
  config: unknown,
): PersonalizerAssetVersion | null => {
  if (!config || typeof config !== "object") return null;
  return {
    createdAt: new Date(0).toISOString(),
    config: normalizeConfig(config),
    overlay: null,
    masks: [],
  };
};
