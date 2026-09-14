import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

const trustedHost = (hostname: string) => {
  const host = hostname.toLowerCase();
  return (
    host === "cdn.shopify.com" ||
    host.endsWith(".myshopify.com") ||
    host.endsWith(".shopifycdn.net") ||
    host.endsWith(".shopifycdn.com")
  );
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  const requestUrl = new URL(request.url);
  const raw = requestUrl.searchParams.get("url") || "";
  let assetUrl: URL;
  try {
    assetUrl = new URL(raw);
  } catch {
    return new Response("Invalid asset URL", { status: 400 });
  }
  if (assetUrl.protocol !== "https:" || !trustedHost(assetUrl.hostname)) {
    return new Response("Asset host is not allowed", { status: 400 });
  }

  const upstream = await fetch(assetUrl.toString(), {
    headers: { Accept: "image/*,application/octet-stream;q=0.9,*/*;q=0.5" },
  });
  if (!upstream.ok) return new Response("Asset could not be loaded", { status: upstream.status });

  const size = Number(upstream.headers.get("content-length") || 0);
  if (size > 60 * 1024 * 1024) return new Response("Asset is too large", { status: 413 });
  const bytes = await upstream.arrayBuffer();
  if (bytes.byteLength > 60 * 1024 * 1024) return new Response("Asset is too large", { status: 413 });

  return new Response(bytes, {
    headers: {
      "Content-Type": upstream.headers.get("content-type") || "application/octet-stream",
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
};
