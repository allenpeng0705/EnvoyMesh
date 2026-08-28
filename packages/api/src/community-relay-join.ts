import { timingSafeEqual } from "node:crypto";
import type { RelayJoinRequestPayload } from "@envoymesh/protocol";
import { isCommunityPresetRelayPeerId } from "./default-bootstrap.js";

export type RelayJoinDecision =
  | { accept: true }
  | { accept: false; reason: string };

function tokensMatch(expected: string, provided: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Evaluate an inbound relay.join.request on a community preset gatekeeper. */
export function evaluateCommunityRelayJoinRequest(input: {
  gatekeeperPeerId: string;
  relayPublicMode: boolean;
  configuredJoinToken: string | null;
  request: RelayJoinRequestPayload;
  requesterPeerId: string;
}): RelayJoinDecision {
  if (!isCommunityPresetRelayPeerId(input.gatekeeperPeerId)) {
    return { accept: false, reason: "join gatekeeper is not a community preset relay" };
  }
  if (!input.relayPublicMode) {
    return { accept: false, reason: "join disabled on non-public relay" };
  }
  const configured = input.configuredJoinToken?.trim() ?? "";
  if (configured.length < 8) {
    return { accept: false, reason: "join token not configured on gatekeeper" };
  }
  const provided = input.request.joinToken?.trim() ?? "";
  if (!tokensMatch(configured, provided)) {
    return { accept: false, reason: "invalid join token" };
  }
  if (input.request.relay.relayId === input.gatekeeperPeerId) {
    return { accept: false, reason: "cannot join self" };
  }
  if (input.request.relay.publicAddrs.length === 0) {
    return { accept: false, reason: "joiner must publish public addrs" };
  }
  if (input.request.relay.relayId !== input.requesterPeerId) {
    return { accept: false, reason: "relay id mismatch" };
  }
  return { accept: true };
}

export interface RelayJoinRateLimiter {
  allow(peerId: string, now?: number): boolean;
}

/** Per-peer sliding window limiter for relay.join.request attempts. */
export function createRelayJoinRateLimiter(opts?: {
  windowMs?: number;
  maxAttempts?: number;
  maxEntries?: number;
}): RelayJoinRateLimiter {
  const windowMs = opts?.windowMs ?? 60_000;
  const maxAttempts = opts?.maxAttempts ?? 10;
  const maxEntries = opts?.maxEntries ?? 10_000;
  const counts = new Map<string, { count: number; resetAt: number }>();

  function evictExpired(now: number): void {
    if (counts.size < maxEntries) return;
    let oldest: string | null = null;
    let oldestExpiry = Infinity;
    for (const [id, entry] of counts) {
      if (entry.resetAt < now && entry.resetAt < oldestExpiry) {
        oldest = id;
        oldestExpiry = entry.resetAt;
      }
    }
    if (oldest) counts.delete(oldest);
  }

  return {
    allow(peerId: string, now = Date.now()): boolean {
      if (!peerId || typeof peerId !== "string") return false;
      evictExpired(now);
      const entry = counts.get(peerId);
      if (!entry || entry.resetAt < now) {
        counts.set(peerId, { count: 1, resetAt: now + windowMs });
        return true;
      }
      if (entry.count >= maxAttempts) return false;
      entry.count += 1;
      return true;
    },
  };
}
