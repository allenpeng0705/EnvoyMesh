/**
 * Family-only gate for `/ws?target=` client-proxy `?product=` labels.
 *
 * ## Why a staged policy (aiNotes / Veda)
 *
 * Thin clients that predate `product=` (notably Veda/aiNotes still in the wild
 * before a store release) omit the query. Flipping straight to "require" would
 * brick those phones until a new binary ships. Staged policies:
 *
 * - **legacy** — never reject on product (observe-only; admin still classifies).
 * - **allowlist** (default) — allow missing `product=` (old thin clients);
 *   reject a *present* value that is not a known family product.
 * - **require** — after aiNotes (and other thin clients) ship `product=`,
 *   set `ENVOYMESH_RELAY_WS_PRODUCT_POLICY=require` so anonymous WS openers
 *   must claim a family product id.
 *
 * Labels remain spoofable — this is an abuse bar + ops signal, not auth.
 * The home still verifies the pairing token.
 */

import { classifyWsProxyProduct, type EnvoyPeerKind } from "@envoymesh/network";

/** Known thin-client / mesh product ids accepted on client-proxy. */
export const FAMILY_WS_PRODUCT_ALLOWLIST = new Set([
  "node",
  "relay",
  "envoydev",
  "envoygo",
  "veda",
  "envoydev-mobile",
  "envoygo-mobile",
  "family",
]);

export type WsProductPolicy = "legacy" | "allowlist" | "require";

/**
 * Resolve the WS product policy from env.
 *
 * Precedence:
 *   1. `ENVOYMESH_RELAY_WS_PRODUCT_POLICY` = legacy | allowlist | require
 *   2. Else `ENVOYMESH_RELAY_REQUIRE_FAMILY_PRODUCT` = 1|true → **require**
 *      (the post-release flip the operator turns on after all EnvoyXX apps ship)
 *   3. Else **allowlist** (safe while store builds catch up: missing product= OK)
 */
export function resolveWsProductPolicyFromEnv(env: {
  ENVOYMESH_RELAY_WS_PRODUCT_POLICY?: string;
  ENVOYMESH_RELAY_REQUIRE_FAMILY_PRODUCT?: string;
} = process.env): WsProductPolicy {
  const explicit = env.ENVOYMESH_RELAY_WS_PRODUCT_POLICY?.trim();
  if (explicit) return parseWsProductPolicy(explicit);
  const requireFlag = (env.ENVOYMESH_RELAY_REQUIRE_FAMILY_PRODUCT ?? "").trim().toLowerCase();
  if (requireFlag === "1" || requireFlag === "true" || requireFlag === "yes" || requireFlag === "on") {
    return "require";
  }
  return "allowlist";
}

export function parseWsProductPolicy(raw: string | undefined | null): WsProductPolicy {
  const v = (raw ?? "allowlist").trim().toLowerCase();
  if (v === "legacy" || v === "off" || v === "0") return "legacy";
  if (v === "require" || v === "strict") return "require";
  if (v === "allowlist" || v === "prefer" || v === "1") return "allowlist";
  return "allowlist";
}

export type WsProductGateResult =
  | {
      ok: true;
      product?: string;
      kind: EnvoyPeerKind;
      /** True when the client omitted product= under allowlist (legacy thin client). */
      legacyMissingProduct: boolean;
    }
  | { ok: false; reason: "missing" | "not-family"; closeMessage: string };

/**
 * Evaluate whether a client-proxy upgrade may proceed given `?product=`.
 */
export function evaluateWsProductGate(
  productQuery: string | undefined | null,
  policy: WsProductPolicy = "allowlist",
): WsProductGateResult {
  const classified = classifyWsProxyProduct(productQuery);
  const raw = (productQuery ?? "").trim().toLowerCase();

  if (policy === "legacy") {
    return {
      ok: true,
      ...(classified.product ? { product: classified.product } : {}),
      kind: classified.kind,
      legacyMissingProduct: !raw,
    };
  }

  if (!raw) {
    if (policy === "require") {
      return {
        ok: false,
        reason: "missing",
        closeMessage: "family product= required",
      };
    }
    // allowlist: old Veda / unlabeled thin clients
    return {
      ok: true,
      kind: "unknown",
      legacyMissingProduct: true,
    };
  }

  if (!FAMILY_WS_PRODUCT_ALLOWLIST.has(raw)) {
    return {
      ok: false,
      reason: "not-family",
      closeMessage: "product not in EnvoyMesh family allowlist",
    };
  }

  return {
    ok: true,
    product: raw,
    kind: classified.kind,
    legacyMissingProduct: false,
  };
}
