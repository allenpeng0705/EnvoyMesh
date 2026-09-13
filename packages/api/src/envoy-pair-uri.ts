// From `@envoymesh/protocol`, not `./ws-protocol.js`: the payload contract moved
// there, and importing it from the product-bound module made this file
// product-bound too — which is the whole reason a second product could not
// speak the same QR format.
import type { PairWithHomeNodeParams } from "@envoymesh/protocol";

function paramsToPairWithHomeNode(searchParams: URLSearchParams): PairWithHomeNodeParams {
  const required = (key: string): string => {
    const value = searchParams.get(key)?.trim();
    if (!value) {
      throw new Error(`Pairing link is missing ${key}`);
    }
    return value;
  };

  const optional = (key: string): string | undefined => {
    const value = searchParams.get(key)?.trim();
    return value || undefined;
  };
  /**
   * A comma-separated list, for the one field that is one.
   *
   * `relayWsUrls` is declared on the pairing contract (`protocol/src/pairing-contract.ts`) and
   * carried by the compact codec (`pairing-token.ts`), but the `envoy://pair` URI had no way to
   * express it — so a product that wanted to advertise relay fallback in a QR code could not. A
   * relay WebSocket URL never contains a comma, so one parameter with a joined list is unambiguous
   * and keeps the URI's shape (one key, one value) for every other field.
   */
  const list = (key: string): string[] | undefined => {
    const raw = optional(key);
    if (!raw) return undefined;
    const parts = raw
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
    return parts.length > 0 ? parts : undefined;
  };

  return {
    wsUrl: required("wsUrl"),
    app: optional("app"),
    lanWsUrl: optional("lanWsUrl"),
    token: required("token"),
    ownerPublicKey: required("ownerPublicKey"),
    ownerId: required("ownerId"),
    relayPeerId: optional("relayPeerId"),
    relayWsUrls: list("relayWsUrls"),
    agentPeerId: optional("agentPeerId"),
    agentPubKey: optional("agentPubKey"),
    agentName: optional("agentName"),
    homeNodePeerId: optional("homeNodePeerId"),
  };
}

/**
 * Build the `envoy://pair?…` URI that {@link parseEnvoyPairUri} reads.
 *
 * **One format, one implementation, one place.** The builder used to live in
 * `@envoymesh/reuse-host`, next to the shared parser but as a *second* piece of
 * code — the family rule is that every EnvoyMesh app speaks the same QR format and
 * the same URI scheme, and that is only guaranteed while there is exactly one
 * builder and one parser. `reuse-host` re-exports this, so no consumer changed.
 *
 * Only `wsUrl`, `token`, `ownerPublicKey` and `ownerId` are required; the rest are
 * written only when present (`URLSearchParams` escapes values, so a token
 * containing `&` or a newline round-trips instead of corrupting the query).
 */
export function buildEnvoyPairUri(params: PairWithHomeNodeParams): string {
  const query = new URLSearchParams();
  query.set("wsUrl", params.wsUrl);
  if (params.lanWsUrl) query.set("lanWsUrl", params.lanWsUrl);
  query.set("token", params.token);
  query.set("ownerPublicKey", params.ownerPublicKey);
  query.set("ownerId", params.ownerId);
  if (params.app) query.set("app", params.app);
  for (const key of [
    "relayPeerId",
    "agentPeerId",
    "agentPubKey",
    "agentName",
    "homeNodePeerId",
  ] as const) {
    const value = params[key];
    if (value) query.set(key, value);
  }
  // The one list-valued field: joined with commas, and read back by `list()` above.
  if (params.relayWsUrls && params.relayWsUrls.length > 0) {
    const urls = params.relayWsUrls.map((url) => url.trim()).filter((url) => url.length > 0);
    if (urls.length > 0) query.set("relayWsUrls", urls.join(","));
  }
  return `envoy://pair?${query.toString()}`;
}

/**
 * Parse an `envoy://pair?...` URI (or raw query string) into params for {@link NodeService.pairWithHomeNode}.
 */
export function parseEnvoyPairUri(input: string): PairWithHomeNodeParams {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("Pairing link is empty");
  }

  if (trimmed.startsWith("envoy://pair")) {
    let url: URL;
    try {
      url = new URL(trimmed);
    } catch {
      throw new Error("Invalid pairing link");
    }
    if (url.protocol !== "envoy:" || url.hostname !== "pair") {
      throw new Error("Expected envoy://pair link from desktop Settings");
    }
    return paramsToPairWithHomeNode(url.searchParams);
  }

  const query = trimmed.startsWith("pair?") ? trimmed.slice("pair?".length) : trimmed.replace(/^\?/, "");
  if (!query.includes("=")) {
    throw new Error("Expected envoy://pair link from desktop Settings");
  }
  return paramsToPairWithHomeNode(new URLSearchParams(query));
}
