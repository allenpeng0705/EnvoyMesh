/**
 * How family peers advertise themselves on libp2p Identify and how the relay
 * classifies them for the operator console.
 *
 * ## Why a string, not a signed claim
 *
 * Identify `userAgent` (and the WS `product=` query) are **ops labels**, not
 * authentication. Anyone can spoof them. They answer "what does this peer claim
 * to be?" so a community relay can separate EnvoyMesh homes from anonymous DHT
 * swarm fill — not "prove this is EnvoyDev."
 *
 * Format: `envoymesh/<product>/<version>` (version optional). Examples:
 *   `envoymesh/node/0.6.0` — EnvoyMesh home node
 *   `envoymesh/relay/0.6.0` — community / standalone relay
 *   `envoymesh/envoydev/0.2.0` — EnvoyDev daemon mesh peer
 *   `envoymesh/envoygo/…` — EnvoyGo phone libp2p host (when set)
 *
 * WebSocket client-proxy (phones without libp2p, e.g. Veda) use `?product=`
 * instead, because they never appear in the libp2p peer table.
 */

import { ENVOYMESH_VERSION } from "@envoymesh/protocol";

/** Known libp2p / WS product ids the family ships. */
export type EnvoyPeerProductId =
  | "node"
  | "relay"
  | "envoydev"
  | "envoygo"
  | "veda"
  | "envoydev-mobile"
  | "envoygo-mobile"
  | "family"
  | "unknown";

export type EnvoyPeerKind =
  | "envoymesh-node"
  | "envoymesh-relay"
  | "envoydev"
  | "envoygo"
  | "veda"
  | "envoydev-mobile"
  | "envoygo-mobile"
  | "family-unlabeled"
  | "unknown";

const PRODUCT_TO_KIND: Record<string, EnvoyPeerKind> = {
  node: "envoymesh-node",
  relay: "envoymesh-relay",
  envoydev: "envoydev",
  envoygo: "envoygo",
  veda: "veda",
  "envoydev-mobile": "envoydev-mobile",
  "envoygo-mobile": "envoygo-mobile",
};

/** Build the Identify userAgent / WS product label for a family peer. */
export function buildEnvoyUserAgent(
  product: Exclude<EnvoyPeerProductId, "family" | "unknown">,
  version: string = ENVOYMESH_VERSION,
): string {
  const v = version.trim() || ENVOYMESH_VERSION;
  return `envoymesh/${product}/${v}`;
}

/** Default Identify userAgent when the caller did not set {@link EnvoyMeshOptions.userAgent}. */
export function defaultEnvoyUserAgent(options: {
  enableRelayServer?: boolean;
  version?: string;
}): string {
  return buildEnvoyUserAgent(
    options.enableRelayServer ? "relay" : "node",
    options.version ?? ENVOYMESH_VERSION,
  );
}

/**
 * Parse `envoymesh/<product>/<version>` (version optional). Returns null when
 * the string is not a family agent.
 */
export function parseEnvoyUserAgent(agentVersion: string | undefined | null): {
  product: string;
  version?: string;
} | null {
  const raw = agentVersion?.trim() ?? "";
  if (!raw) return null;
  const match = /^envoymesh\/([a-z0-9-]+)(?:\/([^\s/]+))?$/i.exec(raw);
  if (!match) return null;
  return {
    product: match[1]!.toLowerCase(),
    ...(match[2] ? { version: match[2] } : {}),
  };
}

/** True when any listed protocol is an EnvoyMesh family protocol. */
export function speaksEnvoyProtocol(protocols: readonly string[] | undefined): boolean {
  if (!protocols || protocols.length === 0) return false;
  return protocols.some((p) => p.startsWith("/envoymesh/"));
}

/**
 * Classify a libp2p peer from Identify metadata + negotiated protocols.
 *
 * Priority: explicit `envoymesh/…` agent → family protocol without label →
 * unknown (likely public swarm / DHT bootstrap).
 */
export function classifyLibp2pPeer(input: {
  agentVersion?: string | null;
  protocols?: readonly string[];
}): { kind: EnvoyPeerKind; product?: string; version?: string; agentVersion?: string } {
  const agentVersion = input.agentVersion?.trim() || undefined;
  const parsed = parseEnvoyUserAgent(agentVersion);
  if (parsed) {
    const kind = PRODUCT_TO_KIND[parsed.product] ?? "family-unlabeled";
    return {
      kind,
      product: parsed.product,
      ...(parsed.version ? { version: parsed.version } : {}),
      ...(agentVersion ? { agentVersion } : {}),
    };
  }
  if (speaksEnvoyProtocol(input.protocols)) {
    return {
      kind: "family-unlabeled",
      ...(agentVersion ? { agentVersion } : {}),
    };
  }
  return {
    kind: "unknown",
    ...(agentVersion ? { agentVersion } : {}),
  };
}

/**
 * Classify a WebSocket client-proxy caller from `?product=` (or legacy `?client=`).
 * Empty / missing → unknown (still a proxy stream, product not declared).
 */
export function classifyWsProxyProduct(
  productQuery: string | undefined | null,
): { kind: EnvoyPeerKind; product?: string } {
  const product = productQuery?.trim().toLowerCase() || "";
  if (!product) return { kind: "unknown" };
  const kind = PRODUCT_TO_KIND[product] ?? "family-unlabeled";
  return { kind, product };
}

/** Count peers by {@link EnvoyPeerKind} for the admin summary strip. */
export function summarizePeerKinds(
  kinds: readonly EnvoyPeerKind[],
): Record<EnvoyPeerKind, number> {
  const out: Record<EnvoyPeerKind, number> = {
    "envoymesh-node": 0,
    "envoymesh-relay": 0,
    envoydev: 0,
    envoygo: 0,
    veda: 0,
    "envoydev-mobile": 0,
    "envoygo-mobile": 0,
    "family-unlabeled": 0,
    unknown: 0,
  };
  for (const kind of kinds) {
    out[kind] = (out[kind] ?? 0) + 1;
  }
  return out;
}
