---
tags: [testing, tooling]
---

# Verification and Tooling

## `npm run verify`

Defined in `package.json`, chains:
```
lint          → eslint (cached, respects .gitignore)
typecheck     → react-router typegen && tsc --noEmit
qa            → node scripts/verify-personalizer.mjs
                + node --check on both storefront JS assets (syntax only)
build         → react-router build
```

## `scripts/verify-personalizer.mjs` — a dependency-free contract test

No test framework — plain `node:assert/strict` + `node:vm`. Notably:
- It **extracts the storefront's live `normalize` function** straight out of `cartwala-personalizer.js` by string-slicing between `"const normalize=raw=>"` and the next `"\n  };"`, then runs it in a `vm.runInNewContext` sandbox with stub `clamp`/`array` helpers. This means the test exercises the *actual shipped minified-style source*, not a reimplementation — if someone edits the storefront normalizer and breaks the slice boundaries, the test itself fails loudly rather than silently testing stale logic.
- Asserts the 13-slot and 50-slot configs round-trip correctly (`config.photos.length === count`, ids/widths preserved) — this is the concrete evidence behind the README's "tested with 13 and 50 slots" claim.
- Asserts a non-square `canvasRatio` ("1080:1350") and default text value survive normalization.
- A long list of `assert.match`/`assert.doesNotMatch` regex checks against the raw source of all three JS assets *and* `app._index.tsx`, effectively pinning specific implementation details as regression guards, e.g.:
  - `data-cw-save` exists, `data-cw-preview` does **not** (guards against a removed "standalone Preview" button reappearing).
  - `hideBuyNow`, `setPurchaseReady(false)` present (purchase-gating can't be silently removed).
  - `formData.set('sections','cart-drawer,cart-icon-bubble')` (specific sections must be requested from `cart/add.js`).
  - Admin file must still `import("ag-psd")`, check `intent === "psdImport"`, use the `^(PHOTO|UPLOAD)` regex, and reference `configRef.current` (guards the V5.0.1 stale-config hotfix from regressing).
  - CSS must define `--cw-slot-icon` and must **not** contain the literal `min-width:min(190px,85%)` (guards a specific past layout bug fix).

This pattern — pinning exact source snippets as regex assertions — is unusual but deliberate given there's no real unit-test harness around vanilla storefront JS; it's cheap insurance against regressing specific historical bugs (each one traceable to a `CHANGELOG.md` entry).

## What's *not* automated

- No integration/e2e test against a real theme or checkout. The README is explicit: *"Use a development store for the final theme-specific cart and checkout test."* — see the manual checklist in [[Setup and Deployment]].
- No test coverage of the GraphQL upload flows (`uploadImage`/`uploadFont`/staged uploads) beyond the `READ-FIRST-STATUS.txt` claim that "Shopify Admin GraphQL operations for image upload/status and bulk metafield save pass schema validation" (i.e., checked against the GraphQL schema, not executed).
