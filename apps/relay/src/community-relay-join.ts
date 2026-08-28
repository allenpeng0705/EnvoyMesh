/**
 * Gated community relay join (Phase 46D) — relay-runtime helpers.
 *
 * Shared evaluation + rate limiting live in @envoymesh/api/community-relay-join.
 */
import type { EnvoyMesh } from "@envoymesh/network";
import {
  DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDRS,
  isCommunityPresetRelayPeerId,
  peerIdFromBootstrapMultiaddr,
} from "@envoymesh/api";
import { evaluateCommunityRelayJoinRequest } from "@envoymesh/api/community-relay-join";
import {
  createRelayJoinRequestPayload,
  createRelayJoinResponsePayload,
  parseRelayJoinResponsePayload,
  type RelayJoinRequestPayload,
  type RelayJoinResponsePayload,
} from "@envoymesh/protocol";
import type { RelayControlIdentity } from "./relay-control-identity.js";
import type { createRelayRoster } from "./relay-roster.js";
import { isJunkRelayHint } from "./relay-roster.js";

export { evaluateCommunityRelayJoinRequest } from "@envoymesh/api/community-relay-join";

export function buildRelayJoinResponseForAcceptedJoin(input: {
  roster: ReturnType<typeof createRelayRoster>;
  request: RelayJoinRequestPayload;
  bookTtlMs: number;
}): RelayJoinResponsePayload {
  const expiresAt = new Date(Date.now() + input.bookTtlMs).toISOString();
  input.roster.registerRelay({
    relayId: input.request.relay.relayId,
    addrs: input.request.relay.publicAddrs,
    relation: "sibling",
    state: "verified",
    level: input.request.relay.level,
    region: input.request.relay.region,
    expiresAt: input.request.relay.expiresAt ?? expiresAt,
  });
  return createRelayJoinResponsePayload({
    accepted: true,
    acceptedLevel: input.request.desiredLevel ?? input.request.relay.level,
    siblings: input.roster.verifiedRelayHints(8),
    candidateRelays: [],
    childLimit: 20,
    graphEpoch: `join-${Date.now()}`,
    expiresAt,
  });
}

export function buildRelayJoinRejection(reason: string, bookTtlMs: number): RelayJoinResponsePayload {
  return createRelayJoinResponsePayload({
    accepted: false,
    reason,
    expiresAt: new Date(Date.now() + bookTtlMs).toISOString(),
  });
}

/** Dialable community preset bootstrap addrs (CN + US), excluding self. */
export function communityPresetJoinTargets(selfPeerId: string): string[] {
  return DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDRS.filter((addr) => {
    const id = peerIdFromBootstrapMultiaddr(addr);
    return id != null && id !== selfPeerId;
  });
}

/**
 * Outbound join from a new relay to the community fleet.
 * Returns true when any preset gatekeeper accepts the join.
 */
export async function requestCommunityRelayJoin(input: {
  mesh: EnvoyMesh;
  identity: RelayControlIdentity;
  roster: ReturnType<typeof createRelayRoster>;
  joinToken: string;
  publicAddrs: string[];
  bookTtlMs: number;
  timeoutMs?: number;
  log?: (msg: string) => void;
  warn?: (msg: string) => void;
}): Promise<boolean> {
  const log = input.log ?? console.log;
  const warn = input.warn ?? console.warn;
  if (isCommunityPresetRelayPeerId(input.mesh.peerId)) {
    log("[relay] Community join skipped (this relay is a preset gatekeeper)");
    return true;
  }
  const token = input.joinToken.trim();
  if (token.length < 8) {
    warn("[relay] Community join skipped (join token too short)");
    return false;
  }
  const dialableAddrs = input.publicAddrs.filter(
    (a) => a.includes("/p2p/") && !a.includes("/p2p-circuit"),
  );
  if (dialableAddrs.length === 0) {
    warn("[relay] Community join skipped (no public addrs to advertise)");
    return false;
  }

  const expiresAt = new Date(Date.now() + input.bookTtlMs).toISOString();
  const joinPayload = createRelayJoinRequestPayload({
    relay: {
      relayId: input.mesh.peerId,
      level: 1,
      publicAddrs: dialableAddrs,
      expiresAt,
    },
    desiredLevel: 1,
    joinToken: token,
  });

  for (const targetAddr of communityPresetJoinTargets(input.mesh.peerId)) {
    const targetId = peerIdFromBootstrapMultiaddr(targetAddr);
    try {
      const envelope = input.identity.signControl({
        intent: "relay.join.request",
        payload: joinPayload,
        recipientPeerId: targetId ?? undefined,
      });
      const reply = await input.mesh.sendExpectReply(targetAddr, envelope, {
        timeoutMs: input.timeoutMs ?? 15_000,
      });
      if (reply.intent !== "relay.join.response") {
        warn(`[relay] Community join unexpected intent from ${targetId?.slice(0, 12)}…`);
        continue;
      }
      const response = parseRelayJoinResponsePayload(reply.payload);
      if (!response.accepted) {
        warn(
          `[relay] Community join rejected by ${targetId?.slice(0, 12)}… reason=${response.reason ?? "unknown"}`,
        );
        continue;
      }
      const siblingExpiresAt = new Date(Date.now() + input.bookTtlMs).toISOString();
      for (const hint of response.siblings) {
        if (isJunkRelayHint(hint, input.mesh.peerId)) continue;
        input.roster.registerRelay({
          relayId: hint.relayId,
          addrs: hint.multiaddrs,
          relation: "sibling",
          state: "verified",
          level: hint.level,
          region: hint.region,
          expiresAt: hint.expiresAt ?? siblingExpiresAt,
        });
      }
      log(
        `[relay] Community join accepted by ${targetId?.slice(0, 12)}… siblings=${response.siblings.length}`,
      );
      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      warn(`[relay] Community join dial failed target=${targetId?.slice(0, 12)}… error=${msg}`);
    }
  }
  warn("[relay] Community join failed (no preset gatekeeper accepted)");
  return false;
}

const DEFAULT_COMMUNITY_JOIN_RETRY_MS = 5 * 60_000;

/**
 * Retry community join until accepted (or this relay is a preset gatekeeper).
 * Skipped when `skipCommunitySiblings` is set (private org fleets).
 */
export function startCommunityRelayJoinRetry(input: {
  mesh: EnvoyMesh;
  identity: RelayControlIdentity;
  roster: ReturnType<typeof createRelayRoster>;
  joinToken: string | null;
  publicAddrs: () => string[];
  bookTtlMs: number;
  skipCommunitySiblings: boolean;
  intervalMs?: number;
  /** Fired once when join is accepted (roster publish hook). */
  onJoined?: () => void;
}): () => void {
  if (input.skipCommunitySiblings || !input.joinToken) return () => {};
  if (isCommunityPresetRelayPeerId(input.mesh.peerId)) return () => {};

  let joined = false;
  let inFlight = false;
  const intervalMs = input.intervalMs ?? DEFAULT_COMMUNITY_JOIN_RETRY_MS;

  const attempt = async (): Promise<void> => {
    if (joined || inFlight) return;
    inFlight = true;
    try {
      joined = await requestCommunityRelayJoin({
        mesh: input.mesh,
        identity: input.identity,
        roster: input.roster,
        joinToken: input.joinToken!,
        publicAddrs: input.publicAddrs(),
        bookTtlMs: input.bookTtlMs,
      });
      if (joined) input.onJoined?.();
    } finally {
      inFlight = false;
    }
  };

  void attempt();
  const timer = setInterval(() => {
    void attempt();
  }, intervalMs);
  if (timer.unref) timer.unref();

  return () => clearInterval(timer);
}
