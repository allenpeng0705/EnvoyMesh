/**
 * getPairingPayload runtime (Step 25).
 *
 * Builds the QR-code pairing payload for EnvoyGo / mobile.
 *
 * QR embeds:
 *   - primary `relayWsUrl` (`rel`)
 *   - extra configured Envoy relay WS bases (`relayWsUrls` / `rels`)
 *   - LAN / identity / pairing token
 *
 * Not embedded (EnvoyGo already has community hardcoded; DHT bootstraps
 * do not help first-pair):
 *   - built-in community relay
 *   - public libp2p DHT presets (am6/am7/…)
 */
import { randomUUID } from "node:crypto";
import {
  DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR,
  normalizeRelayWsList,
  stripRelayWsParams,
} from "@envoymesh/api";
import type { BridgeStatus, PairingPayload } from "@envoymesh/api";
import { reviewFamilyInviteToken } from "./review-pairing.js";

export interface ReachableMeshLike {
  peerId: string;
  multiaddrs: string[];
}

export interface ConfiguredRelayLike {
  addr: string;
  enabled?: boolean;
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
  /** Operator-configured Envoy relays (Settings → Relays). */
  getConfiguredRelays(): Promise<ConfiguredRelayLike[]> | ConfiguredRelayLike[];
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
  /**
   * Opt-in store-review long-lived token. When present, getPairingPayload
   * embeds this stable token instead of a fresh UUID.
   */
  getReviewPairing():
    | import("./review-pairing.js").ReviewPairingSettings
    | null
    | Promise<import("./review-pairing.js").ReviewPairingSettings | null>;
}

/** Presets / addrs EnvoyGo already knows or that do not help pairing. */
const QR_OMIT_PRESETS = new Set([
  "cn-relay",
  "public-libp2p",
  "public-libp2p-am6",
  "public-libp2p-am7",
]);

const LOOPBACK_RE = /^127\./;
const IPV4_RE = /\/ip4\/([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)/;
const DEFAULT_WS_PORT = 3030;
const DEFAULT_WS_PATH = "/ws";

/** True if this entry is built-in community or public libp2p DHT bootstrap. */
export function isBuiltinOrPublicBootstrap(entry: string): boolean {
  const trimmed = entry.trim();
  if (!trimmed) return true;
  if (QR_OMIT_PRESETS.has(trimmed)) return true;
  if (trimmed === DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR) return true;
  if (trimmed.includes("47.93.11.212")) return true;
  if (trimmed.includes("bootstrap.libp2p.io")) return true;
  return false;
}

function deriveLanIp(multiaddrs: string[]): string {
  for (const addr of multiaddrs) {
    const m = addr.match(IPV4_RE);
    if (m && !LOOPBACK_RE.test(m[1])) return m[1];
  }
  return "localhost";
}

/** Resolve an address or URL to a clean relay WebSocket base. */
function toRelayWsBase(
  addr: string,
  deriveRelayWsUrl: (a: string) => string | undefined,
): string | undefined {
  const trimmed = addr.trim();
  if (!trimmed || isBuiltinOrPublicBootstrap(trimmed)) return undefined;
  if (/^wss?:\/\//i.test(trimmed)) {
    return stripRelayWsParams(trimmed);
  }
  const derived = deriveRelayWsUrl(trimmed);
  if (!derived || isBuiltinOrPublicBootstrap(derived)) return undefined;
  return stripRelayWsParams(derived);
}

/**
 * Collect Envoy relay WebSocket bases from Settings-configured relays
 * plus any non-public bootstrap multiaddrs that derive to WS.
 */
export async function collectConfiguredRelayWsUrls(ctx: {
  getConfiguredRelays(): Promise<ConfiguredRelayLike[]> | ConfiguredRelayLike[];
  getRelayBootstrapPeers(): string[];
  deriveRelayWsUrl(addr: string): string | undefined;
}): Promise<string[]> {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (base: string | undefined) => {
    if (!base || seen.has(base)) return;
    seen.add(base);
    out.push(base);
  };

  const configured = await Promise.resolve(ctx.getConfiguredRelays());
  for (const relay of configured) {
    if (relay.enabled === false) continue;
    add(toRelayWsBase(relay.addr, ctx.deriveRelayWsUrl));
  }
  for (const addr of ctx.getRelayBootstrapPeers()) {
    add(toRelayWsBase(addr, ctx.deriveRelayWsUrl));
  }
  return out;
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

  // All operator Envoy relay WS bases (US/EU/…), excluding built-in community.
  const allRelayWs = await collectConfiguredRelayWsUrls(ctx);

  // Primary relay: explicit override → first configured Envoy relay →
  // auto-discover (may be community; only used when no operator relays).
  const configuredRelayWsUrl = ctx.getRelayPublicWsUrl();
  let relayWsUrl: string | undefined;
  if (configuredRelayWsUrl !== undefined) {
    relayWsUrl = configuredRelayWsUrl || undefined; // "" → disabled
  } else if (allRelayWs.length > 0) {
    // Prefer operator relays in the QR; community is built into EnvoyGo.
    relayWsUrl = allRelayWs[0];
  } else {
    relayWsUrl = await ctx.autoDiscoverRelayWsUrl();
    // Never pack built-in community into QR when we have nothing else —
    // EnvoyGo already falls back to it. Leaving rel empty uses LAN wsUrl.
    if (relayWsUrl && isBuiltinOrPublicBootstrap(relayWsUrl)) {
      relayWsUrl = undefined;
    }
  }
  relayWsUrl = stripRelayWsParams(relayWsUrl);

  // Pairing token: stable review token when enabled, else fresh 30-min UUID.
  // In family-only (Apple review) mode the QR embeds the derived family token,
  // so even the "owner" QR scans as a family member, never the owner.
  const review = await Promise.resolve(ctx.getReviewPairing());
  const token = review
    ? review.familyOnly
      ? reviewFamilyInviteToken(review.token)
      : review.token
    : randomUUID();
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

  // Extra relays for QR fallback (everything except primary).
  const extras = normalizeRelayWsList(allRelayWs, relayWsUrl);
  if (extras.length > 0) {
    payload.relayWsUrls = extras;
    // Also expose as bootstrapPeers WS entries for older clients / post-pair sync.
    payload.bootstrapPeers = extras;
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

  return payload;
}
