import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { authenticate } from "../shopify.server";

type Config = {
  enabled: boolean;
  overlayUrl: string;
  canvasRatio: string;
  photoFields: Array<{
    id: string;
    label: string;
    maskUrl: string;
    x: number;
    y: number;
    width: number;
    height: number;
    rotationEnabled: boolean;
    required: boolean;
  }>;
  textFields: Array<{
    id: string;
    label: string;
    maxLength: number;
    color: string;
    x: number;
    y: number;
    fontSize: number;
    fontFamily: string;
    allowFontChoice: boolean;
    movable: boolean;
    scalable: boolean;
    rotatable: boolean;
    allowColorChoice: boolean;
    rotation: number;
    required: boolean;
  }>;
  fileFields: Array<{
    id: string;
    label: string;
    accept: string;
    maxSizeMb: number;
    required: boolean;
  }>;
  linkFields: Array<{
    id: string;
    label: string;
    placeholder: string;
    required: boolean;
  }>;
  customFonts: Array<{ id: string; name: string; url: string }>;
};

type Product = {
  id: string;
  title: string;
  handle: string;
  tags: string[];
  variants: {
    nodes: Array<{
      id: string;
      price: string;
      compareAtPrice?: string | null;
    }>;
  };
  personalizer?: { jsonValue?: Config | null } | null;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const products: Product[] = [];
  let cursor: string | null = null;
  let hasNextPage = true;
  while (hasNextPage) {
    const response = await admin.graphql(
      `#graphql
    query CartwalaProducts($after: String) {
      products(first: 250, after: $after, sortKey: UPDATED_AT, reverse: true) {
        nodes {
          id
          title
          handle
          tags
          variants(first: 1) { nodes { id price compareAtPrice } }
          storefrontPersonalizer: metafield(namespace: "cartwala_personalizer", key: "personalizer_config") { jsonValue }
          personalizer: metafield(key: "personalizer_config") { jsonValue }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  `,
      { variables: { after: cursor } },
    );
    const json = (await response.json()) as {
      data?: {
        products?: {
          nodes?: Product[];
          pageInfo?: { hasNextPage: boolean; endCursor?: string | null };
        };
      };
      errors?: unknown[];
    };
    if (json.errors?.length)
      throw new Response("Shopify returned an error while loading products.", {
        status: 502,
      });
    products.push(
      ...(json.data?.products?.nodes ?? []).map(
        (
          product: Product & {
            storefrontPersonalizer?: { jsonValue?: Config | null } | null;
          },
        ) => ({
          ...product,
          personalizer: product.storefrontPersonalizer ?? product.personalizer,
        }),
      ),
    );
    hasNextPage = json.data?.products?.pageInfo?.hasNextPage === true;
    cursor = json.data?.products?.pageInfo?.endCursor ?? null;
    if (hasNextPage && !cursor) hasNextPage = false;
  }

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
        <s-link href="/app/print-files">Print Files</s-link>
      </s-app-nav>
      <Outlet />
    </AppProvider>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
