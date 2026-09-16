import type { LoaderFunctionArgs } from "react-router";

const trustedHost = (hostname: string) => {
  const host = hostname.toLowerCase();
  return (
    host === "cdn.shopify.com" ||
    host.endsWith(".cdn.shopify.com") ||
    host.endsWith(".myshopify.com") ||
    host.endsWith(".shopifycdn.net") ||
    host.endsWith(".shopifycdn.com")
  );
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // This route only proxies public image/file assets from explicitly trusted
  // Shopify CDN hosts. Do not require embedded-admin authentication here:
  // <img> requests cannot attach the App Bridge session token, which caused
  // print/PSD generation to fail even while the Print Files page was authenticated.
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

  let upstream: Response;
  try {
    upstream = await fetch(assetUrl.toString(), {
      redirect: "follow",
      headers: {
        Accept: "image/*,application/octet-stream;q=0.9,*/*;q=0.5",
        "User-Agent": "Cartwala-Gift-Personalizer/1.0",
      },
    });
  } catch {
    return new Response("Asset could not be loaded", { status: 502 });
  }

  if (!upstream.ok) return new Response("Asset could not be loaded", { status: upstream.status });

  // A trusted URL must not redirect the proxy to an unrelated host.
  try {
    const finalUrl = new URL(upstream.url || assetUrl.toString());
    if (finalUrl.protocol !== "https:" || !trustedHost(finalUrl.hostname)) {
      return new Response("Asset redirect host is not allowed", { status: 400 });
    }
  } catch {
    return new Response("Invalid asset redirect", { status: 400 });
  }

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
