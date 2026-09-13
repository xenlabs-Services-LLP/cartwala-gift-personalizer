// Browser-only helpers for the PSD auto-import feature (see
// app/routes/app._index.tsx, importPsd()). These read a parsed `ag-psd`
// layer tree and turn it into flattened canvases: one overlay + one mask per
// PHOTO/UPLOAD layer, plus the position/size/color/font metadata for every
// editable text layer.
//
// Deliberately DOM-only (HTMLCanvasElement, CanvasRenderingContext2D) - this
// module must never be imported by server-only code paths.

import { clamp } from "./personalizer-config";

export type PsdCanvasLayer = {
  name?: string;
  left?: number;
  top?: number;
  right?: number;
  bottom?: number;
  hidden?: boolean;
  opacity?: number;
  canvas?: HTMLCanvasElement;
  children?: PsdCanvasLayer[];
  text?: {
    text?: string;
    transform?: number[];
    top?: number;
    left?: number;
    bottom?: number;
    right?: number;
    style?: { fontSize?: number; font?: { name?: string }; fillColor?: unknown };
    styleRuns?: Array<{ style?: { fontSize?: number; font?: { name?: string }; fillColor?: unknown } }>;
  };
};

export type PsdBounds = { left: number; top: number; right: number; bottom: number };

/** Strips the PHOTO_/UPLOAD_/TEXT_ naming prefix to derive a customer-facing label. */
export const psdLayerLabel = (name: string, fallback: string): string =>
  name.replace(/^(PHOTO|UPLOAD|TEXT)[\s_-]*/i, "").replace(/[_-]+/g, " ").trim() || fallback;

/**
 * Resolves a layer's bounds in document pixel space, handling the case
 * (common for Photoshop text layers) where the layer's own left/top/right/
 * bottom are empty and the real box only lives on the text transform, and
 * the case of a group layer, whose bounds are the union of its children.
 */
export const psdLayerBounds = (layer: PsdCanvasLayer): PsdBounds => {
  const own = {
    left: Number(layer.left),
    top: Number(layer.top),
    right: Number(layer.right),
    bottom: Number(layer.bottom),
  };
  if ([own.left, own.top, own.right, own.bottom].every(Number.isFinite) && own.right > own.left && own.bottom > own.top) {
    return own;
  }

  const transform = layer.text?.transform;
  const textLeft = Number(layer.text?.left);
  const textTop = Number(layer.text?.top);
  const textRight = Number(layer.text?.right);
  const textBottom = Number(layer.text?.bottom);
  if (
    Array.isArray(transform) &&
    transform.length >= 6 &&
    [textLeft, textTop, textRight, textBottom, Number(transform[4]), Number(transform[5])].every(Number.isFinite) &&
    textRight > textLeft &&
    textBottom > textTop
  ) {
    return {
      left: Number(transform[4]) + textLeft,
      top: Number(transform[5]) + textTop,
      right: Number(transform[4]) + textRight,
      bottom: Number(transform[5]) + textBottom,
    };
  }

  const childBounds: PsdBounds[] = (layer.children || [])
    .map(psdLayerBounds)
    .filter((bounds) => bounds.right > bounds.left && bounds.bottom > bounds.top);
  if (!childBounds.length) return { left: 0, top: 0, right: 0, bottom: 0 };
  return {
    left: Math.min(...childBounds.map((bounds) => bounds.left)),
    top: Math.min(...childBounds.map((bounds) => bounds.top)),
    right: Math.max(...childBounds.map((bounds) => bounds.right)),
    bottom: Math.max(...childBounds.map((bounds) => bounds.bottom)),
  };
};

const toHex = (channels: number[]): string =>
  `#${channels.map((channel) => Math.round(channel).toString(16).padStart(2, "0")).join("")}`;

/**
 * Converts a Photoshop text-layer fill color to `#rrggbb`. Handles the three
 * encodings ag-psd can hand back: 8-bit RGB, fractional (0-1) RGB, and CMYK.
 *
 * Previously a true 4-channel CMYK color was matched by the same branch as
 * "only a K channel is present" and rendered as a plain K-only grayscale,
 * silently ignoring the C/M/Y channels. This now converts real CMYK with the
 * standard (naive, non-ICC) formula, and reserves the grayscale path for
 * when C/M/Y are genuinely absent.
 */
export const psdColor = (value: unknown): string => {
  const color = value && typeof value === "object" ? (value as Record<string, unknown>) : {};

  if (["r", "g", "b"].every((key) => Number.isFinite(Number(color[key])))) {
    return toHex(["r", "g", "b"].map((key) => clamp(color[key], 0, 255, 17)));
  }

  if (["fr", "fg", "fb"].every((key) => Number.isFinite(Number(color[key])))) {
    return toHex(["fr", "fg", "fb"].map((key) => clamp(Number(color[key]) * 255, 0, 255, 17)));
  }

  if (["c", "m", "y", "k"].every((key) => Number.isFinite(Number(color[key])))) {
    const c = clamp(color.c, 0, 100, 0) / 100;
    const m = clamp(color.m, 0, 100, 0) / 100;
    const y = clamp(color.y, 0, 100, 0) / 100;
    const k = clamp(color.k, 0, 100, 0) / 100;
    return toHex([255 * (1 - c) * (1 - k), 255 * (1 - m) * (1 - k), 255 * (1 - y) * (1 - k)]);
  }

  if (Number.isFinite(Number(color.k))) {
    const gray = 255 * (1 - clamp(color.k, 0, 100, 0) / 100);
    return toHex([gray, gray, gray]);
  }

  return "#111111";
};

export const canvasBlob = (canvas: HTMLCanvasElement): Promise<Blob> =>
  new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("A PNG could not be generated from the PSD."))), "image/png"),
  );

/** Flattens the layer tree into a list of drawable (non-group, non-hidden) layers. */
export const psdDrawableLayers = (layers: PsdCanvasLayer[], parentHidden = false): PsdCanvasLayer[] =>
  layers.flatMap((layer) => {
    const hidden = parentHidden || layer.hidden === true;
    return [hidden ? [] : [layer], ...(layer.children ? [psdDrawableLayers(layer.children, hidden)] : [])].flat();
  });

/** Draws one layer (recursing into groups) onto `context`, skipping anything in `excluded`. */
export const drawPsdLayer = (
  context: CanvasRenderingContext2D,
  layer: PsdCanvasLayer,
  excluded: Set<PsdCanvasLayer>,
  documentWidth: number,
  documentHeight: number,
): void => {
  if (layer.hidden || excluded.has(layer)) return;
  if (layer.children?.length) {
    [...layer.children].reverse().forEach((child) => drawPsdLayer(context, child, excluded, documentWidth, documentHeight));
    return;
  }
  if (!layer.canvas) return;

  const bounds = psdLayerBounds(layer);
  const width = Math.max(1, bounds.right - bounds.left);
  const height = Math.max(1, bounds.bottom - bounds.top);
  const fullDocumentCanvas = Math.abs(layer.canvas.width - documentWidth) < 2 && Math.abs(layer.canvas.height - documentHeight) < 2;

  context.save();
  const opacity = Number(layer.opacity);
  context.globalAlpha = Number.isFinite(opacity) ? clamp(opacity > 1 ? opacity / 255 : opacity, 0, 1, 1) : 1;
  if (fullDocumentCanvas) context.drawImage(layer.canvas, 0, 0);
  else context.drawImage(layer.canvas, bounds.left, bounds.top, width, height);
  context.restore();
};

export const canvasHasPixels = (canvas: HTMLCanvasElement): boolean => {
  const data = canvas.getContext("2d")?.getImageData(0, 0, canvas.width, canvas.height).data;
  if (!data) return false;
  for (let index = 3; index < data.length; index += 4) if (data[index] > 0) return true;
  return false;
};
