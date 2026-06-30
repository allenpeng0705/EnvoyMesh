/**
 * getPairingPayload runtime (Step 25).
 *
 * Extracted from `node-service-impl.ts`. Builds the QR-code pairing
 * payload that mobile apps scan to start pairing with the home node.
 *
 * Determines the best wsUrl (relay proxy or direct LAN), embeds
 * the home node's identity, bridge status, and the full list of
 * bootstrap peers (libp2p multiaddrs + WebSocket fallbacks).
 */
import { randomUUID } from "node:crypto";
import {
  DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR,
} from "@envoymesh/api";
import type { BridgeStatus, PairingPayload } from "@envoymesh/api";

export interface ReachableMeshLike {
  peerId: string;
  multiaddrs: string[];
}

export interface GetPairingPayloadContext {
  getBridgeStatus(): Promise<BridgeStatus>;
  /** Reach the live mesh or external mesh (or undefined if neither). */
  getReachableMesh(): ReachableMeshLike | undefined;
  getWsPort(): number | undefined;
  getWsPath(): string | undefined;
  /** Public relay WebSocket URL override (undefined = auto, "" = disabled). */
  getRelayPublicWsUrl(): string | null | undefined;
  /** All configured relay bootstrap peers (libp2p multiaddrs). */
  getRelayBootstrapPeers(): string[];
  /** Get the current node profile (or undefined). */
  getProfile(): {
    owner: {
      ownerId: string;
      publicKeyPem: string;
    };
  } | undefined;
  /** Derive a WebSocket URL from a multiaddr (returns undefined if not derivable). */
  deriveRelayWsUrl(addr: string): string | undefined;
  /** Auto-discover relay WebSocket URL (returns undefined if none reachable). */
  autoDiscoverRelayWsUrl(): Promise<string | undefined>;
  /** Auto-discover relay peer ID. */
  autoDiscoverRelayPeerId(): Promise<string | undefined>;
  /** Set the new pairing token + issued-at timestamp. */
  setPairingToken(token: string, issuedAt: number): void;
}

/** Names of every bootstrap preset EnvoyGo can fall back to. */
const ALL_KNOWN_PRESETS = [
  "cn-relay",
  "public-libp2p-am6",
  "public-libp2p-am7",
  "public-libp2p",
];

const LOOPBACK_RE = /^127\./;
const IPV4_RE = /\/ip4\/([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)/;
const DEFAULT_WS_PORT = 3030;
const DEFAULT_WS_PATH = "/ws";
const COMMUNITY_BOOTSTRAP_LIBP2P = [
  "/dnsaddr/am6.bootstrap.libp2p.io/p2p/QmbLHAnMoJPWSCR5Zhtx6BHJX9KiKNN6LccNBoMmrjUqFq",
  "/dnsaddr/am7.bootstrap.libp2p.io/p2p/QmcZf59bWwK5XFi76CZX8cbJ4BhTzzA7W8R4Hk6x4pJ8Yf",
  "/dnsaddr/bootstrap.libp2p.io/p2p/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN",
];

function deriveLanIp(multiaddrs: string[]): string {
  for (const addr of multiaddrs) {
    const m = addr.match(IPV4_RE);
    if (m && !LOOPBACK_RE.test(m[1])) return m[1];
  }
  return "localhost";
}

export async function getPairingPayloadViaRuntime(
  ctx: GetPairingPayloadContext,
): Promise<PairingPayload> {
  const bridgeStatus = await ctx.getBridgeStatus();
  const reachable = ctx.getReachableMesh();

  // Derive LAN IP.
  const lanIp = reachable?.multiaddrs ? deriveLanIp(reachable.multiaddrs) : "localhost";
  const wsPort = ctx.getWsPort() ?? DEFAULT_WS_PORT;
  const wsPath = ctx.getWsPath() ?? DEFAULT_WS_PATH;
  const lanWsUrl = `ws://${lanIp}:${wsPort}${wsPath}`;

  // Resolve relay WebSocket URL.
  const configuredRelayWsUrl = ctx.getRelayPublicWsUrl();
  const relayWsUrl =
    configuredRelayWsUrl !== undefined
      ? configuredRelayWsUrl || undefined // "" → undefined (disabled)
      : await ctx.autoDiscoverRelayWsUrl();

  // Generate fresh pairing token.
  const token = randomUUID();
  ctx.setPairingToken(token, Date.now());

  // Build wsUrl (relay URL with target+token params, or LAN fallback).
  let wsUrl: string;
  if (relayWsUrl) {
    const params = new URLSearchParams();
    if (reachable?.peerId) params.set("target", reachable.peerId);
    params.set("token", token);
    wsUrl = `${relayWsUrl}?${params.toString()}`;
  } else {
    wsUrl = lanWsUrl;
  }

  const payload: PairingPayload = { wsUrl };
  if (lanIp !== "localhost") {
    payload.lanWsUrl = lanWsUrl;
  }
  payload.token = token;

  if (relayWsUrl && configuredRelayWsUrl === undefined) {
    payload.relayPeerId = await ctx.autoDiscoverRelayPeerId();
  }
  if (relayWsUrl) {
    payload.relayWsUrl = relayWsUrl;
  }
  if (bridgeStatus.enabled) {
    payload.agentPeerId = bridgeStatus.agentPeerId;
    if (bridgeStatus.agentPublicKeyPem) {
      payload.agentPubKey = bridgeStatus.agentPublicKeyPem;
    }
    if (bridgeStatus.agentName?.trim()) {
      payload.agentName = bridgeStatus.agentName.trim();
    }
  }
  if (reachable?.peerId) {
    payload.homeNodePeerId = reachable.peerId;
  }

  const profile = ctx.getProfile();
  if (profile) {
    payload.ownerPublicKey = profile.owner.publicKeyPem;
    payload.ownerId = profile.owner.ownerId;
  }

  // Bootstrap peers — both libp2p and WebSocket fallbacks.
  const allBootstrapPeers: string[] = [];
  allBootstrapPeers.push(DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR);
  allBootstrapPeers.push(...COMMUNITY_BOOTSTRAP_LIBP2P);
  for (const addr of ctx.getRelayBootstrapPeers()) {
    allBootstrapPeers.push(addr);
    const wsUrl = ctx.deriveRelayWsUrl(addr);
    if (wsUrl) allBootstrapPeers.push(wsUrl);
  }
  if (allBootstrapPeers.length > 0) {
    payload.bootstrapPeers = allBootstrapPeers;
  }

  // Deduplicated preset names.
  const homeConfiguredPresets = new Set(
    ctx.getRelayBootstrapPeers().filter((p) => ALL_KNOWN_PRESETS.includes(p)),
  );
  const extraPresets = ALL_KNOWN_PRESETS.filter((p) => !homeConfiguredPresets.has(p));
  payload.bootstrapPresetNames = [...homeConfiguredPresets, ...extraPresets];

  return payload;
}