/** @jsxImportSource preact */
import "@shopify/ui-extensions/preact";
import type { Api } from "@shopify/ui-extensions/customer-account.order-status.block.render";
import { render } from "preact";
import { useEffect, useState } from "preact/hooks";

declare const shopify: Api;

type Result = { available: boolean; downloadUrl?: string };
const APP_URL = "https://cartwala-gift-personalizer.fly.dev";

export default async () => { render(<DownloadPreview />, document.body); };

function DownloadPreview() {
  const orderId = shopify.order.value?.id;
  const isSignatureDay = shopify.lines.value.some((line) =>
    line.attributes.some((attribute) => attribute.key === "_Cartwala Signature Day Design"));
  const authState = shopify.authenticationState.value;
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    if (!orderId || !isSignatureDay || authState !== "fully_authenticated") return;
    let active = true;
    (async () => {
      try {
        const token = await shopify.sessionToken.get();
        const response = await fetch(`${APP_URL}/api/signature-day-link?orderId=${encodeURIComponent(orderId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = response.ok ? await response.json() as Result : { available: false };
        if (active) setResult(data);
      } catch { if (active) setResult({ available: false }); }
    })();
    return () => { active = false; };
  }, [orderId, authState, isSignatureDay]);

  if (!orderId || !isSignatureDay || !result?.available && authState === "fully_authenticated") return null;
  if (authState !== "fully_authenticated") return (
    <s-section heading="Signature Day preview">
      <s-button onClick={() => shopify.requireLogin()}>Sign in to download your preview PDF</s-button>
    </s-section>
  );
  return <s-section heading="Signature Day preview">
    <s-link href={result?.downloadUrl}>Download your T-shirt preview PDF</s-link>
  </s-section>;
}
