import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { authenticate } from "../shopify.server";

type Config = {
  enabled: boolean;
  overlayUrl: string;
  canvasRatio: string;
  photoFields: Array<{ id: string; label: string; maskUrl: string; x: number; y: number; width: number; height: number; rotationEnabled: boolean; required: boolean }>;
  textFields: Array<{ id: string; label: string; maxLength: number; color: string; x: number; y: number; fontSize: number; fontFamily: string; allowFontChoice: boolean; required: boolean }>;
  fileFields: Array<{ id: string; label: string; accept: string; maxSizeMb: number; required: boolean }>;
  linkFields: Array<{ id: string; label: string; placeholder: string; required: boolean }>;
  customFonts: Array<{ id: string; name: string; url: string }>;
};

type Product = {
  id: string;
  title: string;
  handle: string;
  personalizer?: { jsonValue?: Config | null } | null;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const products: Product[] = [];
  let cursor: string | null = null;
  let hasNextPage = true;
  while (hasNextPage) {
    const response = await admin.graphql(`#graphql
    query CartwalaProducts($after: String) {
      products(first: 250, after: $after, sortKey: UPDATED_AT, reverse: true) {
        nodes {
          id
          title
          handle
          personalizer: metafield(namespace: "$app", key: "personalizer_config") { jsonValue }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  `, { variables: { after: cursor } });
    const json = await response.json() as {
    data?: { products?: { nodes?: Product[]; pageInfo?: { hasNextPage: boolean; endCursor?: string | null } } };
    errors?: unknown[];
  };
    if (json.errors?.length) throw new Response("Shopify returned an error while loading products.", { status: 502 });
    products.push(...(json.data?.products?.nodes ?? []));
    hasNextPage = json.data?.products?.pageInfo?.hasNextPage === true;
    cursor = json.data?.products?.pageInfo?.endCursor ?? null;
    if (hasNextPage && !cursor) hasNextPage = false;
  }

  // eslint-disable-next-line no-undef
  return {
    apiKey: process.env.SHOPIFY_API_KEY || "",
    products,
  };
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <s-app-nav>
        <s-link href="/app">Personalizer</s-link>
      </s-app-nav>
      <Outlet />
    </AppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
