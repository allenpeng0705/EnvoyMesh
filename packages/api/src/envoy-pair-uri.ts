// From `@envoymesh/protocol`, not `./ws-protocol.js`: the payload contract moved
// there, and importing it from the product-bound module made this file
// product-bound too — which is the whole reason a second product could not
// speak the same QR format.
import type { PairingPayload, PairWithHomeNodeParams } from "@envoymesh/protocol";
import { encodePairingToken } from "./pairing-token.js";

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
   * A comma-separated list, for the fields that are lists.
   *
   * `relayWsUrls` is declared on the pairing contract (`protocol/src/pairing-contract.ts`) and
   * carried by the compact codec (`pairing-token.ts`), but the `envoy://pair` URI had no way to
   * express it — so a product that wanted to advertise relay fallback in a QR code could not. A
   * relay WebSocket URL never contains a comma, so one parameter with a joined list is unambiguous
   * and keeps the URI's shape (one key, one value) for every other field. `bootstrapPeers` is the
   * same shape for the same reason: a libp2p multiaddr never contains a comma either, and the
   * contract documents it as this node's dialable addresses.
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
    bootstrapPeers: list("bootstrapPeers"),
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
 * Two forms, one entry point:
 *
 *   * the **legacy query form** — `envoy://pair?wsUrl=…&token=…` — is the default, so
 *     every existing caller mints byte-identical output and every reader that predates
 *     the compressed form keeps working;
 *   * the **compressed form** — `envoy://pair?pairing=<base64url-gzip-json>` — is opt-in
 *     via `{ compressed: true }`, or its named alias {@link buildEnvoyPairUriCompressed}.
 *     It exists because a payload with a home-node peer id, several multiaddrs and relay
 *     hints makes the query string long enough to push the QR into a denser version.
 *     The Dart client already decodes it (`pairing_uri.dart`), so this closes the gap
 *     where the form could be read but never minted.
 *
 * It is one overloaded function rather than `buildEnvoyPairUri` plus an options-taking
 * twin so that the default stays `string` at the type level: an existing caller never
 * has to narrow a `string | Promise<string>`. The alternative — making the *compressed*
 * form the default — was rejected because it would break every older reader in the field.
 */
export function buildEnvoyPairUri(params: PairWithHomeNodeParams): string;
export function buildEnvoyPairUri(
  params: PairWithHomeNodeParams,
  options: { compressed: true },
): Promise<string>;
export function buildEnvoyPairUri(
  params: PairWithHomeNodeParams,
  options: { compressed?: boolean },
): string | Promise<string>;
export function buildEnvoyPairUri(
  params: PairWithHomeNodeParams,
  options?: { compressed?: boolean },
): string | Promise<string> {
  if (options?.compressed) return buildEnvoyPairUriCompressed(params);
  return buildLegacyEnvoyPairUri(params);
}

/**
 * The legacy query-param form.
 *
 * Only `wsUrl`, `token`, `ownerPublicKey` and `ownerId` are required; the rest are
 * written only when present (`URLSearchParams` escapes values, so a token
 * containing `&` or a newline round-trips instead of corrupting the query).
 */
function buildLegacyEnvoyPairUri(params: PairWithHomeNodeParams): string {
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
  // The list-valued fields: joined with commas, and read back by `list()` above.
  if (params.relayWsUrls && params.relayWsUrls.length > 0) {
    const urls = params.relayWsUrls.map((url) => url.trim()).filter((url) => url.length > 0);
    if (urls.length > 0) query.set("relayWsUrls", urls.join(","));
  }
  // `bootstrapPeers` is the multiaddr half of the same story: with `homeNodePeerId` above
  // it is what a libp2p phone dials the home peer by, with no relay in between. Written
  // only when supplied, so a caller that passes neither keeps a byte-identical URI.
  if (params.bootstrapPeers && params.bootstrapPeers.length > 0) {
    const addrs = params.bootstrapPeers.map((addr) => addr.trim()).filter((addr) => addr.length > 0);
    if (addrs.length > 0) query.set("bootstrapPeers", addrs.join(","));
  }
  return `envoy://pair?${query.toString()}`;
}

/**
 * Mint the compressed `envoy://pair?pairing=<base64url-gzip-json>` form.
 *
 * Async because gzip is: `encodePairingToken` uses the platform `CompressionStream`,
 * which has no synchronous twin in the browser. This is why the compressed form is a
 * separate opt-in call and not the default of the synchronous builder.
 *
 * The token layout is the shared V1 pairing token (`pairing-token.ts`), which is the
 * format the Dart client already reads — including the multi-relay `rels` list. Note
 * that `agentPubKey` is not part of V1, and the phone's `PairingData` has no field for
 * it; the legacy URI writes it for node-side consumers, which do not scan this form.
 */
export async function buildEnvoyPairUriCompressed(
  params: PairWithHomeNodeParams,
): Promise<string> {
  const token = await encodePairingToken(toPairingPayload(params));
  // base64url is already URL-safe and unpadded, so no escaping is needed; the Dart
  // reader takes `pairing` straight from `queryParameters['pairing']`.
  return `envoy://pair?pairing=${token}`;
}

/**
 * The `envoy://pair` params as the compact codec's payload.
 *
 * The two contracts overlap but are not identical; this is the one place that knows the
 * mapping, so a field added to one side has exactly one spot to be carried. `relayWsUrl`
 * (singular) is deliberately unset: on a pair URI the primary relay is already `wsUrl`
 * (with its `target`/`token` params), and the compact reader falls back to `wsUrl` when
 * `rel` is absent — the same rule the Dart legacy reader uses.
 */
function toPairingPayload(params: PairWithHomeNodeParams): PairingPayload {
  return {
    wsUrl: params.wsUrl,
    app: params.app,
    lanWsUrl: params.lanWsUrl,
    token: params.token,
    ownerPublicKey: params.ownerPublicKey,
    ownerId: params.ownerId,
    agentPeerId: params.agentPeerId,
    relayPeerId: params.relayPeerId,
    relayWsUrls: params.relayWsUrls,
    homeNodePeerId: params.homeNodePeerId,
    agentName: params.agentName,
    // The multiaddr list is now carried by both forms, so a `pairing=` code is no longer
    // the lossy substitute it was for a phone that dials the home peer over libp2p.
    bootstrapPeers: params.bootstrapPeers,
  };
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
