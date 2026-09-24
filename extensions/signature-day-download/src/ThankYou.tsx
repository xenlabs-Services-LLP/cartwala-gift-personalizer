/** @jsxImportSource preact */
import "@shopify/ui-extensions/preact";
import type { Api } from "@shopify/ui-extensions/purchase.thank-you.customer-information.render-after";
import { render } from "preact";
import { useEffect, useState } from "preact/hooks";

const checkout = (globalThis as unknown as { shopify: Api }).shopify;
const APP_URL = "https://cartwala-gift-personalizer.fly.dev";
type Result = { available: boolean; downloadUrl?: string };

export default async () => { render(<ThankYouDownload />, document.body); };

function ThankYouDownload() {
  const orderId = checkout.orderConfirmation.value?.order.id;
  const checkoutToken = checkout.checkoutToken.value;
  const isSignatureDay = checkout.lines.value.some((line) =>
    line.attributes.some((attribute) => attribute.key === "_Cartwala Signature Day Design"));
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // PDF links expire after five minutes; renew while this page remains open.
  useEffect(() => {
    if (!isSignatureDay) return;
    const timer = setInterval(() => setAttempt((n) => n + 1), 4 * 60 * 1000);
    return () => clearInterval(timer);
  }, [isSignatureDay]);

  useEffect(() => {
    if (!orderId || !checkoutToken || !isSignatureDay) return;
    let active = true;
    setResult(null);
    setError(false);
    (async () => {
      try {
        const token = await checkout.sessionToken.get();
        const url = new URL(`${APP_URL}/api/signature-day-thank-you`);
        url.searchParams.set("orderId", orderId);
        url.searchParams.set("checkoutToken", checkoutToken);
        const response = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
        const data = response.ok ? await response.json() as Result : { available: false };
        if (active) { setResult(data); setError(!data.available); }
      } catch { if (active) setError(true); }
    })();
    return () => { active = false; };
  }, [orderId, checkoutToken, isSignatureDay, attempt]);

  if (!isSignatureDay) return null;
  return <s-section heading="Your Signature Day T-shirt previews">
    {result?.available && result.downloadUrl
      ? <s-link href={result.downloadUrl}>Download your preview PDF</s-link>
      : <s-stack gap="base">
          <s-text>{error ? "Your preview is still being prepared. Try again in a moment." : "Preparing your preview PDF…"}</s-text>
          {error && <s-button onClick={() => setAttempt((n) => n + 1)}>Try again</s-button>}
        </s-stack>}
  </s-section>;
}
