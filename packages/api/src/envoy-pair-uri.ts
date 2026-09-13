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

  return {
    wsUrl: required("wsUrl"),
    lanWsUrl: optional("lanWsUrl"),
    token: required("token"),
    ownerPublicKey: required("ownerPublicKey"),
    ownerId: required("ownerId"),
    relayPeerId: optional("relayPeerId"),
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
