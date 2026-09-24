import type { LoaderFunctionArgs } from "react-router";
import { makeCustomerPdf, paidOrderDesigns, verifyPdfToken } from "../lib/signature-day.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const token = verifyPdfToken(new URL(request.url).searchParams.get("token") || "");
  if (!token) return new Response("This download link has expired", { status: 403 });
  const designs = await paidOrderDesigns(token.shop, token.orderId, token.customerId, token.checkoutToken);
  if (!designs.length) return new Response("Preview not available", { status: 404 });
  const pdf = await makeCustomerPdf(designs);
  const orderNumber = token.orderId.split("/").pop();
  return new Response(Buffer.from(pdf), { headers: {
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="cartwala-signature-day-${orderNumber}.pdf"`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  } });
};
