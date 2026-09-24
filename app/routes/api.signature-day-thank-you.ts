import type { LoaderFunctionArgs } from "react-router";
import { paidOrderDesigns, signedPdfToken } from "../lib/signature-day.server";
import { authenticate } from "../shopify.server";

// The checkout token identifies this particular completed checkout, including guests.
// Match it against the paid order before issuing a short-lived PDF link.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { cors, sessionToken } = await authenticate.public.checkout(request);
  const params = new URL(request.url).searchParams;
  const orderId = params.get("orderId") || "";
  const checkoutToken = params.get("checkoutToken") || "";
  if (!/^[a-zA-Z0-9_-]{16,256}$/.test(checkoutToken))
    return cors(Response.json({ available: false }));
  const shop = new URL(sessionToken.dest).hostname;
  const designs = await paidOrderDesigns(shop, orderId, undefined, checkoutToken);
  if (!designs.length) return cors(Response.json({ available: false }));
  const download = new URL("/api/signature-day-pdf", process.env.SHOPIFY_APP_URL);
  download.searchParams.set("token", signedPdfToken(shop, orderId, { checkoutToken }));
  return cors(Response.json({ available: true, downloadUrl: download.toString() }));
};
