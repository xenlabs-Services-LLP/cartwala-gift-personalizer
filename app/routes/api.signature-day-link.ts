import type { LoaderFunctionArgs } from "react-router";
import { paidOrderDesigns, signedPdfToken } from "../lib/signature-day.server";
import { authenticate } from "../shopify.server";

// The customer account session token proves identity; the Shopify order lookup
// proves ownership and captured payment before a short-lived link is issued.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { cors, sessionToken } = await authenticate.public.customerAccount(request);
  const orderId = new URL(request.url).searchParams.get("orderId") || "";
  const shop = new URL(sessionToken.dest).hostname;
  const customerId = String(sessionToken.sub || "");
  const customerGid = /^\d+$/.test(customerId)
    ? `gid://shopify/Customer/${customerId}` : customerId;
  if (!customerGid.startsWith("gid://shopify/Customer/")) return cors(Response.json({ available: false }));
  const designs = await paidOrderDesigns(shop, orderId, customerGid);
  if (!designs.length) return cors(Response.json({ available: false }));
  const download = new URL("/api/signature-day-pdf", process.env.SHOPIFY_APP_URL);
  download.searchParams.set("token", signedPdfToken(shop, orderId, { customerId: customerGid }));
  return cors(Response.json({ available: true, downloadUrl: download.toString() }));
};
