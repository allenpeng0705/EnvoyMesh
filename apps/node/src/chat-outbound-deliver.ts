import type { EnvoyEnvelope } from "@envoymesh/protocol";
import { CHAT_DELIVERY_ACK_TIMEOUT_MS } from "@envoymesh/protocol";
import type { EnvoyMesh } from "@envoymesh/network";
import {
  ENVOY_CHAT_PROTOCOL,
  ENVOY_DATA_PROTOCOL,
  ENVOY_MESSAGE_PROTOCOL,
  hasDirectTcpDialHints,
  prioritizeCircuitDialHints,
} from "@envoymesh/network";
import { parseChatDeliveredAck } from "@envoymesh/api/chat-delivered";

import {
  resolvePreferCircuitDialHints,
  shouldPreferCircuitDialHints,
  shouldRetainCircuitDialHints,
} from "./outbound-dial-hints.js";
import { detectLikelyVpnActive } from "./cgnat-detection.js";
import { resolveSameSubnetLanFirstFromEvidence } from "./peer-reachability-policy.js";
import {
  clearOutboundPeerFreshness,
  isOutboundPeerRecentlyVerified,
  markOutboundPeerVerified,
} from "./outbound-peer-freshness.js";
import { ensureReachableWithLanFirstBudget } from "./outbound-warm-dial.js";
import { withOutboundSendLock } from "./outbound-send-lock.js";
import { webrtcCallTrace, webrtcCallWarn, shortCallId } from "./webrtc-call-trace.js";

/** Shorter ack wait when LAN/direct dial hints exist (fail fast vs 45s WAN timeout). */
const DIRECT_CHAT_DELIVERY_ACK_TIMEOUT_MS = 12_000;

/** Resolve delivery-ack timeout from outbound dial hints (exported for tests). */
export function resolveChatDeliveryAckTimeoutMs(dialHints: readonly string[]): number {
  return hasDirectTcpDialHints(dialHints)
    ? DIRECT_CHAT_DELIVERY_ACK_TIMEOUT_MS
    : CHAT_DELIVERY_ACK_TIMEOUT_MS;
}

const CHAT_SEND_MAX_ATTEMPTS = 3;
const CHAT_SEND_RETRY_BASE_MS = 800;

/** Collapse identical expect-reply failure spam (protocol selection / DHT peers). */
const EXPECT_REPLY_FAIL_LOG_INTERVAL_MS = 15_000;

/** Per-peer cooldown for prepare-failed / no-route spam on 24/7 offline bonds. */
const PREPARE_FAILED_LOG_INTERVAL_MS = 120_000;

type ExpectReplyFailBucket = {
  lastLogAt: number;
  suppressed: number;
};

const expectReplyFailBuckets = new Map<string, ExpectReplyFailBucket>();
const prepareFailedLogBuckets = new Map<string, ExpectReplyFailBucket>();

function logRateLimitedPeerWarn(
  buckets: Map<string, ExpectReplyFailBucket>,
  key: string,
  intervalMs: number,
  line: string,
): void {
  const now = Date.now();
  const bucket = buckets.get(key) ?? { lastLogAt: 0, suppressed: 0 };
  if (now - bucket.lastLogAt < intervalMs) {
    bucket.suppressed += 1;
    buckets.set(key, bucket);
    return;
  }
  const suppressed = bucket.suppressed;
  buckets.set(key, { lastLogAt: now, suppressed: 0 });
  const suffix = suppressed > 0 ? ` (+${suppressed} similar suppressed)` : "";
  console.warn(`${line}${suffix}`);
}

/** Rate-limited `[send] prepare-failed` / retry-prepare-failed (exported for profile.sync reuse). */
export function logOutboundPrepareFailed(
  tag: string,
  peerOrOwnerId: string,
  detail: string,
): void {
  logRateLimitedPeerWarn(
    prepareFailedLogBuckets,
    `${tag}:${peerOrOwnerId}`,
    PREPARE_FAILED_LOG_INTERVAL_MS,
    `${tag} ${detail}`,
  );
}

/** Classify common expect-reply failures for rate-limited logging (exported for tests). */
export function classifyExpectReplyFailure(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("protocol selection failed") || m.includes("could not negotiate")) {
    return "protocol_selection";
  }
  if (m.includes("no outbound dial attempted")) return "no_dial";
  if (m.includes("dial queue is full")) return "dial_queue_full";
  if (m.includes("no_reservation") || m.includes("no active reservation")) {
    return "no_reservation";
  }
  if (m.includes("aborted")) return "aborted";
  if (m.includes("no valid addresses")) return "no_addresses";
  return "other";
}

function logExpectReplyAttemptFailure(
  peerId: string,
  attempt: number,
  maxAttempts: number,
  err: unknown,
): void {
  const msg = err instanceof Error ? err.message : String(err);
  const kind = classifyExpectReplyFailure(msg);
  // Rare / unexpected failures: always log (still one line per attempt).
  if (kind === "other") {
    console.warn(
      `[expect-reply] attempt ${attempt}/${maxAttempts} failed for ${peerId.slice(0, 12)}…:`,
      msg,
    );
    return;
  }
  const now = Date.now();
  const bucket = expectReplyFailBuckets.get(kind) ?? { lastLogAt: 0, suppressed: 0 };
  if (now - bucket.lastLogAt < EXPECT_REPLY_FAIL_LOG_INTERVAL_MS) {
    bucket.suppressed += 1;
    expectReplyFailBuckets.set(kind, bucket);
    return;
  }
  const suppressed = bucket.suppressed;
  expectReplyFailBuckets.set(kind, { lastLogAt: now, suppressed: 0 });
  const suffix = suppressed > 0 ? ` (+${suppressed} similar suppressed)` : "";
  console.warn(
    `[expect-reply] attempt ${attempt}/${maxAttempts} failed for ${peerId.slice(0, 12)}…: ${msg}${suffix}`,
  );
}

/** Test helper — clear expect-reply log rate-limit state. */
export function resetExpectReplyFailLogBucketsForTests(): void {
  expectReplyFailBuckets.clear();
  prepareFailedLogBuckets.clear();
}

function meshLocalListenAddrs(mesh: unknown): string[] | undefined {
  const addrs = (mesh as { multiaddrs?: unknown }).multiaddrs;
  return Array.isArray(addrs) ? (addrs as string[]) : undefined;
}

function dialPreferenceOpts(
  mesh: unknown,
  discoveryProfile?: string,
): {
  localListenAddrs?: readonly string[];
  discoveryProfile?: string;
  likelyVpnActive?: boolean;
} {
  return {
    localListenAddrs: meshLocalListenAddrs(mesh),
    discoveryProfile: discoveryProfile?.trim() || undefined,
    likelyVpnActive: detectLikelyVpnActive(),
  };
}

/** Enable short private-LAN dial budget when same-subnet evidence exists. */
function resolveSameSubnetLanFirst(input: {
  mesh: unknown;
  dialHints: string[];
  peerListenAddrs?: string[];
  preferCircuitHints?: boolean;
}): boolean {
  return resolveSameSubnetLanFirstFromEvidence({
    likelyVpnActive: detectLikelyVpnActive(),
    localListenAddrs: meshLocalListenAddrs(input.mesh),
    peerListenAddrs: input.peerListenAddrs,
    dialHints: input.dialHints,
    preferCircuitHints: input.preferCircuitHints,
  });
}

export type OutboundDeliverMesh = Pick<
  EnvoyMesh,
  "send" | "closeConnectionsToPeer" | "ensurePeerReachable" | "getPeerConnectionInfo"
>;

export type OutboundExpectReplyMesh = OutboundDeliverMesh &
  Pick<
    EnvoyMesh,
    "sendExpectReply" | "sendChatExpectEnvelopeReply" | "getConnectedPeerIds"
  >;

function isProfileIntent(intent: string | undefined): boolean {
  return typeof intent === "string" && intent.startsWith("profile.");
}

/**
 * Chat protocol allowlist — see {@link validateEnvelopeProtocol} in
 * `@envoymesh/network`. Keep in sync. Intents not matching any of these
 * must travel on the message protocol (not chat) or the chat stream
 * handler will reject them with `invalid intent … on chat protocol`.
 */
export function isChatProtocolIntent(intent: string | undefined): boolean {
  return (
    intent === "chat.message" ||
    intent === "chat.delivered" ||
    intent === "chat.room.sync" ||
    intent === "chat.room.message" ||
    (typeof intent === "string" && (intent.startsWith("call.") || intent.startsWith("profile.")))
  );
}

export type ChatDeliverResult = {
  delivered: boolean;
  deliveredAt?: string;
};

/** On late retries, fall back to relay circuits; keep direct/LAN first while attempts remain low. */
export function rotateDialHintsForRetry(hints: string[], attempt: number): string[] {
  if (attempt <= 0 || hints.length === 0) {
    return hints;
  }
  if (attempt < 2 && hasDirectTcpDialHints(hints)) {
    return hints;
  }
  return prioritizeCircuitDialHints(hints);
}

/** Verify / warm libp2p path before outbound send (chat, message, data). */
export async function prepareOutboundPeerConnection(input: {
  mesh: Pick<
    EnvoyMesh,
    "closeConnectionsToPeer" | "ensurePeerReachable" | "getPeerConnectionInfo"
  >;
  transportPeerId: string;
  protocol: string;
  dialHints: string[];
  preferCircuitHints: boolean;
  forceFreshDial: boolean;
  /** Peer-directory / inbound listen addrs — unioned into same-subnet evidence. */
  peerListenAddrs?: string[];
}): Promise<boolean> {
  const sameSubnetLanFirst = resolveSameSubnetLanFirst({
    mesh: input.mesh,
    dialHints: input.dialHints,
    peerListenAddrs: input.peerListenAddrs,
    preferCircuitHints: input.preferCircuitHints,
  });
  const likelyVpnActive = detectLikelyVpnActive();
  const conn = input.mesh.getPeerConnectionInfo(input.transportPeerId);
  const upgradeRelayToDirect = conn.connected && !conn.direct && !input.preferCircuitHints;

  if (
    !input.forceFreshDial &&
    !upgradeRelayToDirect &&
    conn.connected &&
    conn.direct &&
    isOutboundPeerRecentlyVerified(input.transportPeerId)
  ) {
    return true;
  }

  // Relay-to-direct upgrade: when the peer is connected via relay and we're
  // not forcing a fresh dial, skip the upgrade and send on the relay. The
  // upgrade path (redialFresh below) closes the working relay connection
  // BEFORE the direct dial succeeds — when the direct dial fails on stale
  // LAN addresses, the peer becomes completely unreachable and the message
  // is lost. This is the root cause of bond.accept / agent.card.request
  // never reaching the peer: Mac receives bond.request over relay, then
  // destroys the relay connection trying to upgrade to direct, then can't
  // send the reply. Direct path upgrades should happen in a background
  // health task, not in the critical send path.
  if (upgradeRelayToDirect && !input.forceFreshDial) {
    return true;
  }

  const warmReachable = async (opts: {
    forceFreshDial?: boolean;
    upgradeRelayToDirect?: boolean;
    verifyConnection?: boolean;
  }) =>
    ensureReachableWithLanFirstBudget({
      mesh: input.mesh,
      transportPeerId: input.transportPeerId,
      protocol: input.protocol,
      dialHints: input.dialHints,
      preferCircuitHints: input.preferCircuitHints,
      sameSubnetLanFirst,
      forceFreshDial: opts.forceFreshDial,
      upgradeRelayToDirect: opts.upgradeRelayToDirect,
      verifyConnection: opts.verifyConnection,
      likelyVpnActive,
    });

  const redialFresh = async (): Promise<boolean> => {
    try {
      await input.mesh.closeConnectionsToPeer(input.transportPeerId);
      const result = await warmReachable({
        forceFreshDial: true,
        upgradeRelayToDirect,
      });
      if (result.connected) {
        markOutboundPeerVerified(input.transportPeerId);
      } else {
        clearOutboundPeerFreshness(input.transportPeerId);
      }
      return result.connected;
    } catch (warmErr) {
      console.warn(
        `[send] pre-send redial failed for ${input.transportPeerId.slice(0, 12)}…:`,
        warmErr instanceof Error ? warmErr.message : warmErr,
      );
      return false;
    }
  };

  if (input.forceFreshDial || upgradeRelayToDirect) {
    return redialFresh();
  }

  if (!conn.connected) {
    try {
      const result = await warmReachable({
        // Offline prepare is user-facing (chat/call/bond send). Bypass the
        // dial-queue / NO_RESERVATION deferral that exists for speculative warm.
        forceFreshDial: true,
      });
      if (result.connected) {
        markOutboundPeerVerified(input.transportPeerId);
      }
      return result.connected;
    } catch (warmErr) {
      console.warn(
        `[send] pre-send warm failed for ${input.transportPeerId.slice(0, 12)}…:`,
        warmErr instanceof Error ? warmErr.message : warmErr,
      );
      return false;
    }
  }

  // libp2p may report "open" while NAT/TCP is half-dead (common on Windows LAN paths).
  try {
    const verified = await warmReachable({ verifyConnection: true });
    if (verified.connected) {
      markOutboundPeerVerified(input.transportPeerId);
      return true;
    }
    clearOutboundPeerFreshness(input.transportPeerId);
    console.warn(
      `[send] stale connection to ${input.transportPeerId.slice(0, 12)}…; redialing before send`,
    );
    return redialFresh();
  } catch (warmErr) {
    console.warn(
      `[send] pre-send verify failed for ${input.transportPeerId.slice(0, 12)}…:`,
      warmErr instanceof Error ? warmErr.message : warmErr,
    );
    return false;
  }
}

/** @deprecated use prepareOutboundPeerConnection */
async function prepareOutboundChatConnection(input: {
  mesh: Pick<
    EnvoyMesh,
    "closeConnectionsToPeer" | "ensurePeerReachable" | "getPeerConnectionInfo"
  >;
  transportPeerId: string;
  chatProtocol: string;
  dialHints: string[];
  preferCircuitHints: boolean;
  forceFreshDial: boolean;
  peerListenAddrs?: string[];
}): Promise<boolean> {
  return prepareOutboundPeerConnection({
    mesh: input.mesh,
    transportPeerId: input.transportPeerId,
    protocol: input.chatProtocol,
    dialHints: input.dialHints,
    preferCircuitHints: input.preferCircuitHints,
    forceFreshDial: input.forceFreshDial,
    peerListenAddrs: input.peerListenAddrs,
  });
}

function outboundSendDialOpts(input: {
  mesh: unknown;
  dialHints: string[];
  peerListenAddrs?: string[];
  preferCircuitHints?: boolean;
  forceFreshDial?: boolean;
}): {
  dialHints: string[];
  preferCircuitHints?: boolean;
  forceFreshDial?: boolean;
  sameSubnetLanFirst: boolean;
} {
  return {
    dialHints: input.dialHints,
    preferCircuitHints: input.preferCircuitHints,
    forceFreshDial: input.forceFreshDial,
    sameSubnetLanFirst: resolveSameSubnetLanFirst(input),
  };
}

/** ACK read failed after chat.message was written — do not retry (avoids duplicate sends). */
export function isChatAckFailureLikelyAfterWrite(err: unknown): boolean {
  const name = err instanceof Error ? (err as Error & { name?: string }).name : "";
  const msg = err instanceof Error ? err.message : String(err);
  if (name === "StreamResetError") {
    return true;
  }
  if (/sendChatExpectReply timed out/i.test(msg) || /chat ack timed out/i.test(msg)) {
    return true;
  }
  if (/Cannot send on stream/i.test(msg) || /stream is not writable/i.test(msg)) {
    return false;
  }
  return (
    /stream has been reset/i.test(msg) ||
    /peer closed stream without a reply/i.test(msg) ||
    /Unexpected EOF/i.test(msg) ||
    /stream closed while reading/i.test(msg)
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function deliverChatEnvelopeWithRetry(input: {
  mesh: Pick<
    EnvoyMesh,
    | "sendChat"
    | "sendChatExpectReply"
    | "closeConnectionsToPeer"
    | "ensurePeerReachable"
    | "getPeerConnectionInfo"
  >;
  transportPeerId: string;
  envelope: EnvoyEnvelope;
  dialHints: string[];
  peerListenAddrs?: string[];
  chatProtocol: string;
  rebuildDialHints?: () => Promise<string[]>;
  maxAttempts?: number;
  expectDeliveryAck?: boolean;
  /** From node config — gates same-subnet LAN-first (relay-only must stay circuit-first). */
  discoveryProfile?: string;
}): Promise<ChatDeliverResult> {
  const maxAttempts = input.maxAttempts ?? CHAT_SEND_MAX_ATTEMPTS;
  let lastErr: unknown;
  let hints = input.dialHints;
  const preferCircuits = shouldPreferCircuitDialHints(
    input.peerListenAddrs,
    hints,
    input.transportPeerId,
    dialPreferenceOpts(input.mesh, input.discoveryProfile),
  );
  const canExpectAck =
    input.expectDeliveryAck !== false && typeof input.mesh.sendChatExpectReply === "function";
  // Connected direct peers often dial with empty hints; still use the short LAN ack budget.
  const ackTimeoutMs =
    input.mesh.getPeerConnectionInfo(input.transportPeerId).direct === true
      ? DIRECT_CHAT_DELIVERY_ACK_TIMEOUT_MS
      : resolveChatDeliveryAckTimeoutMs(hints);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      await sleep(CHAT_SEND_RETRY_BASE_MS * attempt);
      if (input.rebuildDialHints) {
        try {
          hints = await input.rebuildDialHints();
        } catch {
          /* keep previous hints */
        }
      }
      hints = rotateDialHintsForRetry(hints, attempt);
      const beforeClose = input.mesh.getPeerConnectionInfo(input.transportPeerId);
      // Closing a live relay before redial strands Win→Mac when the only path
      // is a Mac-initiated circuit (Win often cannot recreate the reservation hop).
      if (beforeClose.direct || !beforeClose.connected) {
        const closed = await input.mesh.closeConnectionsToPeer(input.transportPeerId);
        if (closed > 0) {
          console.log(
            `[sendChat] closed ${closed} stale connection(s) before retry ${attempt + 1}/${maxAttempts}`,
          );
        }
      } else {
        console.log(
          `[sendChat] keeping live relay for retry ${attempt + 1}/${maxAttempts} (no close)`,
        );
      }
    } else {
      const conn = input.mesh.getPeerConnectionInfo(input.transportPeerId);
      const preferCircuitsOnPrepare = preferCircuits || attempt >= 2;
      const needsRelayUpgrade =
        conn.connected && !conn.direct && !preferCircuitsOnPrepare && hasDirectTcpDialHints(hints);
      // Skip prepare only on a recently verified *direct* path. Inbound Mac→Win
      // chat marks Win's peer verified even when the only libp2p conn is a
      // Mac-initiated relay circuit that cannot carry Win→Mac streams reliably.
      const skipPrepare =
        !needsRelayUpgrade &&
        conn.connected &&
        conn.direct &&
        isOutboundPeerRecentlyVerified(input.transportPeerId);
      if (!skipPrepare) {
        const ready = await prepareOutboundChatConnection({
          mesh: input.mesh,
          transportPeerId: input.transportPeerId,
          chatProtocol: input.chatProtocol,
          dialHints: hints,
          preferCircuitHints: preferCircuitsOnPrepare,
          forceFreshDial: attempt > 0,
          peerListenAddrs: input.peerListenAddrs,
        });
        if (!ready && attempt === 0) {
          lastErr = new Error(`No reachable path to ${input.transportPeerId.slice(0, 12)}… before send`);
          continue;
        }
      }
    }

    const preferCircuitsOnAttempt = preferCircuits || attempt >= 2;
    const forceFreshDial = attempt > 0;
    let usedAck = false;
    const sendDial = outboundSendDialOpts({
      mesh: input.mesh,
      dialHints: hints,
      peerListenAddrs: input.peerListenAddrs,
      preferCircuitHints: preferCircuitsOnAttempt,
      forceFreshDial,
    });

    try {
      if (canExpectAck) {
        usedAck = true;
        const reply = await input.mesh.sendChatExpectReply(input.transportPeerId, input.envelope, {
          timeoutMs: ackTimeoutMs,
          ...sendDial,
        });
        const ack = parseChatDeliveredAck(reply);
        if (attempt > 0) {
          console.log(`[sendChat] delivered with ack on attempt ${attempt + 1}/${maxAttempts}`);
        }
        markOutboundPeerVerified(input.transportPeerId);
        return { delivered: true, deliveredAt: ack.deliveredAt };
      }
      await input.mesh.sendChat(input.transportPeerId, input.envelope, sendDial);
      if (attempt > 0) {
        console.log(`[sendChat] delivered on attempt ${attempt + 1}/${maxAttempts}`);
      }
      markOutboundPeerVerified(input.transportPeerId);
      return { delivered: false };
    } catch (err) {
      lastErr = err;
      if (attempt + 1 >= maxAttempts) {
        clearOutboundPeerFreshness(input.transportPeerId);
      }
      if (usedAck && isChatAckFailureLikelyAfterWrite(err)) {
        console.warn(
          `[sendChat] ack failed after send for ${input.transportPeerId.slice(0, 12)}… (message likely delivered):`,
          err instanceof Error ? err.message : err,
        );
        markOutboundPeerVerified(input.transportPeerId);
        return { delivered: false };
      }
      console.warn(
        `[sendChat] attempt ${attempt + 1}/${maxAttempts} failed for ${input.transportPeerId.slice(0, 12)}…:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  if (canExpectAck && typeof input.mesh.sendChat === "function") {
    const fallback = await trySendChatWithoutAck({
      mesh: input.mesh,
      transportPeerId: input.transportPeerId,
      envelope: input.envelope,
      dialHints: rotateDialHintsForRetry(hints, maxAttempts),
      peerListenAddrs: input.peerListenAddrs,
      discoveryProfile: input.discoveryProfile,
    });
    if (fallback) {
      return fallback;
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

async function trySendChatWithoutAck(input: {
  mesh: Pick<EnvoyMesh, "sendChat" | "closeConnectionsToPeer" | "getPeerConnectionInfo">;
  transportPeerId: string;
  envelope: EnvoyEnvelope;
  dialHints: string[];
  peerListenAddrs?: string[];
  discoveryProfile?: string;
}): Promise<ChatDeliverResult | undefined> {
  const preferCircuits = shouldPreferCircuitDialHints(
    input.peerListenAddrs,
    input.dialHints,
    input.transportPeerId,
    dialPreferenceOpts(input.mesh, input.discoveryProfile),
  );
  try {
    const beforeClose = input.mesh.getPeerConnectionInfo(input.transportPeerId);
    if (beforeClose.direct || !beforeClose.connected) {
      const closed = await input.mesh.closeConnectionsToPeer(input.transportPeerId);
      if (closed > 0) {
        console.log(`[sendChat] closed ${closed} stale connection(s) before ack-less fallback`);
      }
    } else {
      console.log("[sendChat] keeping live relay for ack-less fallback (no close)");
    }
    await input.mesh.sendChat(
      input.transportPeerId,
      input.envelope,
      outboundSendDialOpts({
        mesh: input.mesh,
        dialHints: input.dialHints,
        peerListenAddrs: input.peerListenAddrs,
        preferCircuitHints: preferCircuits,
        forceFreshDial: true,
      }),
    );
    console.log("[sendChat] delivered without ack (fallback after ack failures)");
    return { delivered: false };
  } catch (err) {
    console.warn(
      "[sendChat] ack-less fallback failed:",
      err instanceof Error ? err.message : err,
    );
    return undefined;
  }
}

export type OutboundCallDeliverMesh = Pick<
  EnvoyMesh,
  | "sendChat"
  | "closeConnectionsToPeer"
  | "ensurePeerReachable"
  | "getPeerConnectionInfo"
  | "getConnectedPeerIds"
  | "peerId"
>;

export type OutboundProfileDeliverMesh = OutboundCallDeliverMesh;

function isPeerLiveConnected(
  mesh: Pick<EnvoyMesh, "getPeerConnectionInfo" | "getConnectedPeerIds">,
  transportPeerId: string,
): boolean {
  if (mesh.getConnectedPeerIds().includes(transportPeerId)) {
    return true;
  }
  return mesh.getPeerConnectionInfo(transportPeerId).connected;
}

/**
 * Best-effort `profile.*` fire-and-forget on chat — never dials stale LAN hints when
 * the peer is not already connected (background traffic must not starve call/chat).
 */
export async function deliverProfileEnvelopeWithRetry(input: {
  mesh: OutboundProfileDeliverMesh;
  transportPeerId: string;
  envelope: EnvoyEnvelope;
  dialHints: string[];
  peerListenAddrs?: string[];
  rebuildDialHints?: () => Promise<string[]>;
  maxAttempts?: number;
  discoveryProfile?: string;
}): Promise<ChatDeliverResult> {
  if (!isPeerLiveConnected(input.mesh, input.transportPeerId)) {
    return { delivered: false };
  }
  try {
    await input.mesh.sendChat(input.transportPeerId, input.envelope, { dialHints: [] });
    markOutboundPeerVerified(input.transportPeerId);
    return { delivered: true, deliveredAt: new Date().toISOString() };
  } catch (err) {
    console.warn(
      `[profile] send failed for ${input.transportPeerId.slice(0, 12)}…:`,
      err instanceof Error ? err.message : err,
    );
    return { delivered: false };
  }
}

/**
 * Deliver `call.*` envelopes on `/envoymesh/chat/0.1.0`.
 * Chat is the stable bonded-contact path; message protocol often fails to negotiate
 * on existing relay/LAN connections ("Protocol selection failed").
 */
export async function deliverCallEnvelopeWithRetry(input: {
  mesh: OutboundCallDeliverMesh;
  transportPeerId: string;
  envelope: EnvoyEnvelope;
  dialHints: string[];
  peerListenAddrs?: string[];
  rebuildDialHints?: () => Promise<string[]>;
  maxAttempts?: number;
  /** When true, try relay circuit paths before stale direct WAN hints. */
  preferCircuitHints?: boolean;
  discoveryProfile?: string;
}): Promise<ChatDeliverResult> {
  // Protocol dispatch: chat/call/profile intents travel on `/envoymesh/chat/0.1.0`
  // (this function); everything else (agent.card.*, social.intro.*, device.pair.*,
  // task.*, discovery.*, share.*, …) must travel on `/envoymesh/message/0.1.0` or
  // the chat stream handler rejects them with `invalid intent … on chat protocol`.
  // Without this guard, callers like NodeServiceImpl.requestAgentCard silently
  // exhaust retries with "No reachable path … before call send".
  if (!isChatProtocolIntent(input.envelope.intent)) {
    return withOutboundSendLock(input.transportPeerId, () =>
      deliverMessageEnvelopeWithRetry({
        // OutboundCallDeliverMesh is `Pick<sendChat, …>` while deliverMessageEnvelopeWithRetry
        // needs `Pick<send, …>`. The underlying EnvoyMesh exposes both; widen via `unknown`.
        mesh: input.mesh as unknown as OutboundDeliverMesh,
        transportPeerId: input.transportPeerId,
        envelope: input.envelope,
        dialHints: input.dialHints,
        peerListenAddrs: input.peerListenAddrs,
        rebuildDialHints: input.rebuildDialHints,
        maxAttempts: input.maxAttempts,
        preferCircuitHints: input.preferCircuitHints,
      }),
    );
  }
  // Self-dial guard: if the target peer is the local node itself, abort
  // immediately instead of going through the retry loop.
  // Wrapped in try/catch because mesh.peerId throws if the node isn't started.
  let localPeerId: string | undefined;
  try {
    localPeerId = input.mesh.peerId;
  } catch {
    // Node not started — can't determine local peer ID; skip the guard.
  }
  if (localPeerId && input.transportPeerId === localPeerId) {
    webrtcCallTrace("deliver-call:self-skip", {
      intent: input.envelope.intent,
      peer: shortCallId(input.transportPeerId),
    });
    return { delivered: false };
  }

  // Invalid peer ID format guard: envoy_ runtime IDs are not libp2p multiaddr
  // peer IDs and cause "Please pass a multibase decoder" errors. Skip them
  // immediately rather than retrying.
  if (input.transportPeerId.startsWith("envoy_") || input.transportPeerId.startsWith("envoy:")) {
    webrtcCallTrace("deliver-call:invalid-peer-id", {
      intent: input.envelope.intent,
      peer: shortCallId(input.transportPeerId),
    });
    return { delivered: false };
  }

  const maxAttempts = input.maxAttempts ?? CHAT_SEND_MAX_ATTEMPTS;
  const intent = input.envelope.intent;
  const callId =
    typeof input.envelope.payload === "object" &&
    input.envelope.payload !== null &&
    "callId" in input.envelope.payload
      ? String((input.envelope.payload as { callId?: string }).callId)
      : undefined;
  webrtcCallTrace("deliver-call:start", {
    intent,
    callId: shortCallId(callId),
    peer: shortCallId(input.transportPeerId),
    maxAttempts,
    hintCount: input.dialHints.length,
  });
  let lastErr: unknown;
  let hints = input.dialHints;
  // Explicit preferCircuitHints:false (lan-fast call path) must win over the
  // private-LAN→circuit heuristic, or same-LAN invites burn 30s on relay and
  // never ring the callee.
  const preferCircuits = resolvePreferCircuitDialHints(
    input.preferCircuitHints,
    input.peerListenAddrs,
    hints,
    input.transportPeerId,
    dialPreferenceOpts(input.mesh, input.discoveryProfile),
  );

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      hints = rotateDialHintsForRetry(hints, attempt);
      if (input.rebuildDialHints) {
        try {
          hints = await input.rebuildDialHints();
        } catch {
          /* keep rotated hints */
        }
      }
      await sleep(CHAT_SEND_RETRY_BASE_MS * attempt);
      try {
        await input.mesh.closeConnectionsToPeer(input.transportPeerId);
      } catch {
        /* ignore */
      }
    } else {
      const conn = input.mesh.getPeerConnectionInfo(input.transportPeerId);
      // Fire-and-forget call signaling: never tear down an open path to chase stale dial hints.
      const skipPrepare =
        conn.connected || isOutboundPeerRecentlyVerified(input.transportPeerId);
      webrtcCallTrace("deliver-call:attempt", {
        attempt: attempt + 1,
        callId: shortCallId(callId),
        peer: shortCallId(input.transportPeerId),
        connected: conn.connected,
        direct: conn.direct,
        skipPrepare,
      });
      if (!skipPrepare) {
        const ready = await prepareOutboundPeerConnection({
          mesh: input.mesh,
          transportPeerId: input.transportPeerId,
          protocol: ENVOY_CHAT_PROTOCOL,
          dialHints: hints,
          preferCircuitHints: preferCircuits,
          forceFreshDial: false,
          peerListenAddrs: input.peerListenAddrs,
        });
        if (!ready && !input.mesh.getPeerConnectionInfo(input.transportPeerId).connected) {
          lastErr = new Error(`No reachable path to ${input.transportPeerId.slice(0, 12)}… before call send`);
          console.warn(`[deliver-call] prepare-failed attempt ${attempt + 1}/${maxAttempts} for ${input.transportPeerId.slice(0, 24)}…: ${lastErr instanceof Error ? lastErr.message : lastErr}`);
          webrtcCallWarn("deliver-call:prepare-failed", {
            attempt: attempt + 1,
            callId: shortCallId(callId),
            peer: shortCallId(input.transportPeerId),
          });
          continue;
        }
      }
    }

    try {
      if (attempt > 0) {
        const ready = await prepareOutboundPeerConnection({
          mesh: input.mesh,
          transportPeerId: input.transportPeerId,
          protocol: ENVOY_CHAT_PROTOCOL,
          dialHints: hints,
          // Retries may escalate to circuits unless caller forced LAN-first.
          preferCircuitHints:
            input.preferCircuitHints === false ? false : preferCircuits || attempt > 0,
          forceFreshDial: true,
          peerListenAddrs: input.peerListenAddrs,
        });
        if (!ready) {
          lastErr = new Error(`No reachable path to ${input.transportPeerId.slice(0, 12)}… before call send`);
          continue;
        }
      }

      const sendConn = input.mesh.getPeerConnectionInfo(input.transportPeerId);
      // Connected sends usually clear dialHints (reuse open path). Retain when
      // the caller explicitly asked for circuits or this is bond.request —
      // otherwise limited-relay stream failures cannot redial the circuit.
      const retainHints =
        !sendConn.connected ||
        shouldRetainCircuitDialHints({
          intent: input.envelope.intent,
          preferCircuitHints: input.preferCircuitHints,
        });
      await input.mesh.sendChat(input.transportPeerId, input.envelope, {
        ...outboundSendDialOpts({
          mesh: input.mesh,
          dialHints: retainHints ? hints : [],
          peerListenAddrs: input.peerListenAddrs,
          preferCircuitHints: !retainHints
            ? false
            : input.preferCircuitHints === false
              ? false
              : preferCircuits || attempt > 0 || input.preferCircuitHints === true,
          forceFreshDial: attempt > 0,
        }),
      });
      if (attempt > 0) {
        console.log(`[call] delivered on attempt ${attempt + 1}/${maxAttempts}`);
      }
      webrtcCallTrace("deliver-call:ok", {
        attempt: attempt + 1,
        callId: shortCallId(callId),
        peer: shortCallId(input.transportPeerId),
        connected: sendConn.connected,
        direct: sendConn.direct,
      });
      return { delivered: true, deliveredAt: new Date().toISOString() };
    } catch (err) {
      lastErr = err;
      webrtcCallWarn("deliver-call:attempt-failed", {
        attempt: attempt + 1,
        callId: shortCallId(callId),
        peer: shortCallId(input.transportPeerId),
        error: err instanceof Error ? err.message.slice(0, 120) : String(err),
      });
      console.warn(
        `[call] attempt ${attempt + 1}/${maxAttempts} failed for ${input.transportPeerId.slice(0, 12)}…:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  webrtcCallWarn("deliver-call:exhausted", {
    callId: shortCallId(callId),
    peer: shortCallId(input.transportPeerId),
    error: lastErr instanceof Error ? lastErr.message.slice(0, 120) : String(lastErr),
  });
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/** Deliver non-chat envelopes on `/envoymesh/message/0.1.0` (share, profile, broadcast, tasks). */
export async function deliverMessageEnvelopeWithRetry(input: {
  mesh: OutboundDeliverMesh;
  transportPeerId: string;
  envelope: EnvoyEnvelope;
  dialHints: string[];
  peerListenAddrs?: string[];
  rebuildDialHints?: () => Promise<string[]>;
  maxAttempts?: number;
  preferCircuitHints?: boolean;
  discoveryProfile?: string;
}): Promise<ChatDeliverResult> {
  const maxAttempts = input.maxAttempts ?? CHAT_SEND_MAX_ATTEMPTS;
  let lastErr: unknown;
  let hints = input.dialHints;
  const preferCircuits = resolvePreferCircuitDialHints(
    input.preferCircuitHints,
    input.peerListenAddrs,
    hints,
    input.transportPeerId,
    dialPreferenceOpts(input.mesh, input.discoveryProfile),
  );

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      hints = rotateDialHintsForRetry(hints, attempt);
      if (input.rebuildDialHints) {
        try {
          hints = await input.rebuildDialHints();
        } catch {
          /* keep rotated hints */
        }
      }
      await sleep(CHAT_SEND_RETRY_BASE_MS * attempt);
      try {
        await input.mesh.closeConnectionsToPeer(input.transportPeerId);
      } catch {
        /* ignore */
      }
    } else {
      const conn = input.mesh.getPeerConnectionInfo(input.transportPeerId);
      const needsRelayUpgrade =
        conn.connected && !conn.direct && !preferCircuits && hasDirectTcpDialHints(hints);
      const skipPrepare =
        !needsRelayUpgrade &&
        (isOutboundPeerRecentlyVerified(input.transportPeerId) ||
          (conn.connected && conn.direct));
      if (!skipPrepare) {
        const ready = await prepareOutboundPeerConnection({
          mesh: input.mesh,
          transportPeerId: input.transportPeerId,
          protocol: ENVOY_MESSAGE_PROTOCOL,
          dialHints: hints,
          preferCircuitHints: preferCircuits,
          forceFreshDial: false,
          peerListenAddrs: input.peerListenAddrs,
        });
        if (!ready && !input.mesh.getPeerConnectionInfo(input.transportPeerId).connected) {
          lastErr = new Error(`No reachable path to ${input.transportPeerId.slice(0, 12)}… before send`);
          logOutboundPrepareFailed(
            "[send] prepare-failed",
            input.transportPeerId,
            `attempt ${attempt + 1}/${maxAttempts} for ${input.transportPeerId.slice(0, 24)}…: ${lastErr.message}`,
          );
          continue;
        }
      }
    }

    try {
      if (attempt > 0) {
        const ready = await prepareOutboundPeerConnection({
          mesh: input.mesh,
          transportPeerId: input.transportPeerId,
          protocol: ENVOY_MESSAGE_PROTOCOL,
          dialHints: hints,
          preferCircuitHints:
            input.preferCircuitHints === false ? false : preferCircuits || attempt > 0,
          forceFreshDial: true,
          peerListenAddrs: input.peerListenAddrs,
        });
        if (!ready) {
          lastErr = new Error(`No reachable path to ${input.transportPeerId.slice(0, 12)}… before send`);
          logOutboundPrepareFailed(
            "[send] retry-prepare-failed",
            input.transportPeerId,
            `attempt ${attempt + 1}/${maxAttempts} for ${input.transportPeerId.slice(0, 24)}…: ${lastErr.message}`,
          );
          continue;
        }
      }

      const sendConn = input.mesh.getPeerConnectionInfo(input.transportPeerId);
      await input.mesh.send(
        input.transportPeerId,
        input.envelope,
        outboundSendDialOpts({
          mesh: input.mesh,
          dialHints: sendConn.connected && sendConn.direct && attempt === 0 ? [] : hints,
          peerListenAddrs: input.peerListenAddrs,
          preferCircuitHints:
            input.preferCircuitHints === false ? false : preferCircuits || attempt > 0,
          forceFreshDial: attempt > 0,
        }),
      );
      return { delivered: true, deliveredAt: new Date().toISOString() };
    } catch (err) {
      lastErr = err;
      console.warn(
        `[send] attempt ${attempt + 1}/${maxAttempts} failed for ${input.transportPeerId.slice(0, 12)}…:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/** Deliver chunked vault data on {@link ENVOY_DATA_PROTOCOL} with verify + retries. */
export async function deliverDataTransferWithRetry(input: {
  mesh: Pick<
    EnvoyMesh,
    | "sendDataTransfer"
    | "closeConnectionsToPeer"
    | "ensurePeerReachable"
    | "getPeerConnectionInfo"
  >;
  transportPeerId: string;
  voucherUtf8: Uint8Array;
  chunks: Uint8Array[];
  dialHints: string[];
  peerListenAddrs?: string[];
  maxAttempts?: number;
  rebuildDialHints?: () => Promise<string[]>;
  discoveryProfile?: string;
}): Promise<number> {
  const maxAttempts = input.maxAttempts ?? CHAT_SEND_MAX_ATTEMPTS;
  let lastErr: unknown;
  let hints = input.dialHints;
  const preferCircuits = shouldPreferCircuitDialHints(
    input.peerListenAddrs,
    hints,
    input.transportPeerId,
    dialPreferenceOpts(input.mesh, input.discoveryProfile),
  );

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      hints = rotateDialHintsForRetry(hints, attempt);
      if (input.rebuildDialHints) {
        try {
          hints = await input.rebuildDialHints();
        } catch {
          /* keep rotated hints */
        }
      }
      await sleep(CHAT_SEND_RETRY_BASE_MS * attempt);
      try {
        await input.mesh.closeConnectionsToPeer(input.transportPeerId);
      } catch {
        /* ignore */
      }
    }

    const ready = await prepareOutboundPeerConnection({
      mesh: input.mesh,
      transportPeerId: input.transportPeerId,
      protocol: ENVOY_DATA_PROTOCOL,
      dialHints: hints,
      preferCircuitHints: preferCircuits || attempt > 0,
      forceFreshDial: attempt > 0,
      peerListenAddrs: input.peerListenAddrs,
    });
    if (!ready) {
      lastErr = new Error(`No reachable data path to ${input.transportPeerId.slice(0, 12)}…`);
      continue;
    }

    try {
      const latencyMs = await input.mesh.sendDataTransfer(
        input.transportPeerId,
        input.voucherUtf8,
        input.chunks,
        outboundSendDialOpts({
          mesh: input.mesh,
          dialHints: hints,
          peerListenAddrs: input.peerListenAddrs,
          preferCircuitHints: preferCircuits || attempt > 0,
          forceFreshDial: attempt > 0,
        }),
      );
      if (attempt > 0) {
        console.log(`[data-transfer] delivered on attempt ${attempt + 1}/${maxAttempts}`);
      }
      return latencyMs;
    } catch (err) {
      lastErr = err;
      console.warn(
        `[data-transfer] attempt ${attempt + 1}/${maxAttempts} failed for ${input.transportPeerId.slice(0, 12)}…:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/** Request/response on chat or message protocol with verify + retries. */
export async function deliverExpectReplyWithRetry(input: {
  mesh: OutboundExpectReplyMesh;
  transportPeerId: string;
  envelope: EnvoyEnvelope;
  dialHints: string[];
  peerListenAddrs?: string[];
  timeoutMs?: number;
  rebuildDialHints?: () => Promise<string[]>;
  maxAttempts?: number;
  /** Explicit false keeps Online-direct (agent.card / VPN) instead of circuit-first. */
  preferCircuitHints?: boolean;
  discoveryProfile?: string;
}): Promise<EnvoyEnvelope> {
  const maxAttempts = input.maxAttempts ?? CHAT_SEND_MAX_ATTEMPTS;
  const timeoutMs = input.timeoutMs ?? 30_000;
  const useChatProtocol = isProfileIntent(input.envelope.intent);
  const protocol = useChatProtocol ? ENVOY_CHAT_PROTOCOL : ENVOY_MESSAGE_PROTOCOL;
  const sendExpectReply = useChatProtocol
    ? input.mesh.sendChatExpectEnvelopeReply?.bind(input.mesh)
    : input.mesh.sendExpectReply?.bind(input.mesh);
  if (!sendExpectReply) {
    throw new Error(
      useChatProtocol
        ? "sendChatExpectEnvelopeReply is required for profile expect-reply"
        : "sendExpectReply is required for message expect-reply",
    );
  }

  let lastErr: unknown;
  let hints = input.dialHints;
  // Explicit preferCircuitHints:false (agent.card / LAN-fast) must win over
  // shouldPreferCircuitDialHints — same rule as deliverMessageEnvelopeWithRetry.
  const preferCircuits =
    input.preferCircuitHints === false
      ? false
      : input.preferCircuitHints === true
        ? true
        : shouldPreferCircuitDialHints(
            input.peerListenAddrs,
            hints,
            input.transportPeerId,
            dialPreferenceOpts(input.mesh, input.discoveryProfile),
          );

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      hints = rotateDialHintsForRetry(hints, attempt);
      if (input.rebuildDialHints) {
        try {
          hints = await input.rebuildDialHints();
        } catch {
          /* keep rotated hints */
        }
      }
      await sleep(CHAT_SEND_RETRY_BASE_MS * attempt);
      try {
        await input.mesh.closeConnectionsToPeer(input.transportPeerId);
      } catch {
        /* ignore */
      }
    } else if (useChatProtocol) {
      const skipPrepare =
        isPeerLiveConnected(input.mesh, input.transportPeerId) ||
        isOutboundPeerRecentlyVerified(input.transportPeerId);
      if (!skipPrepare) {
        const ready = await prepareOutboundPeerConnection({
          mesh: input.mesh,
          transportPeerId: input.transportPeerId,
          protocol,
          dialHints: hints,
          preferCircuitHints: preferCircuits,
          forceFreshDial: false,
          peerListenAddrs: input.peerListenAddrs,
        });
        if (!ready && !input.mesh.getPeerConnectionInfo(input.transportPeerId).connected) {
          lastErr = new Error(
            `No reachable path to ${input.transportPeerId.slice(0, 12)}… before expect-reply send`,
          );
          continue;
        }
      }
    }

    if (attempt > 0 || !useChatProtocol) {
      const preferOnPrepare =
        input.preferCircuitHints === false ? false : preferCircuits || attempt > 0;
      const ready = await prepareOutboundPeerConnection({
        mesh: input.mesh,
        transportPeerId: input.transportPeerId,
        protocol,
        dialHints: hints,
        preferCircuitHints: preferOnPrepare,
        forceFreshDial: attempt > 0,
        peerListenAddrs: input.peerListenAddrs,
      });
      if (!ready) {
        lastErr = new Error(
          `No reachable path to ${input.transportPeerId.slice(0, 12)}… before expect-reply send`,
        );
        continue;
      }
    }

    try {
      const sendConn = input.mesh.getPeerConnectionInfo(input.transportPeerId);
      const preferOnSend =
        input.preferCircuitHints === false
          ? false
          : useChatProtocol && sendConn.connected
            ? false
            : preferCircuits || attempt > 0;
      const reply = await sendExpectReply(input.transportPeerId, input.envelope, {
        timeoutMs,
        ...outboundSendDialOpts({
          mesh: input.mesh,
          dialHints: useChatProtocol && sendConn.connected ? [] : hints,
          peerListenAddrs: input.peerListenAddrs,
          preferCircuitHints: preferOnSend,
          forceFreshDial: attempt > 0,
        }),
      });
      if (attempt > 0) {
        console.log(`[expect-reply] delivered on attempt ${attempt + 1}/${maxAttempts}`);
      }
      if (useChatProtocol) {
        markOutboundPeerVerified(input.transportPeerId);
      }
      return reply;
    } catch (err) {
      lastErr = err;
      logExpectReplyAttemptFailure(input.transportPeerId, attempt + 1, maxAttempts, err);
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/** Canonical fire-and-forget outbound send: per-peer lock + verify + retry. */
export async function sendEnvelopeWithRetry(input: {
  mesh: OutboundDeliverMesh | OutboundProfileDeliverMesh;
  transportPeerId: string;
  envelope: EnvoyEnvelope;
  dialHints?: string[];
  peerListenAddrs?: string[];
  rebuildDialHints?: () => Promise<string[]>;
  maxAttempts?: number;
  preferCircuitHints?: boolean;
}): Promise<ChatDeliverResult> {
  if (isProfileIntent(input.envelope.intent)) {
    return withOutboundSendLock(input.transportPeerId, () =>
      deliverProfileEnvelopeWithRetry({
        mesh: input.mesh as OutboundProfileDeliverMesh,
        transportPeerId: input.transportPeerId,
        envelope: input.envelope,
        dialHints: input.dialHints ?? [],
        peerListenAddrs: input.peerListenAddrs,
        rebuildDialHints: input.rebuildDialHints,
        maxAttempts: input.maxAttempts,
      }),
    );
  }
  return withOutboundSendLock(input.transportPeerId, () =>
    deliverMessageEnvelopeWithRetry({
      mesh: input.mesh as OutboundDeliverMesh,
      transportPeerId: input.transportPeerId,
      envelope: input.envelope,
      dialHints: input.dialHints ?? [],
      peerListenAddrs: input.peerListenAddrs,
      rebuildDialHints: input.rebuildDialHints,
      maxAttempts: input.maxAttempts,
      preferCircuitHints: input.preferCircuitHints,
    }),
  );
}

/** Canonical request/response outbound send: per-peer lock + verify + retry. */
export async function sendExpectReplyWithRetry(input: {
  mesh: OutboundExpectReplyMesh;
  transportPeerId: string;
  envelope: EnvoyEnvelope;
  dialHints?: string[];
  peerListenAddrs?: string[];
  timeoutMs?: number;
  rebuildDialHints?: () => Promise<string[]>;
  maxAttempts?: number;
  preferCircuitHints?: boolean;
}): Promise<EnvoyEnvelope> {
  return withOutboundSendLock(input.transportPeerId, () =>
    deliverExpectReplyWithRetry({
      mesh: input.mesh,
      transportPeerId: input.transportPeerId,
      envelope: input.envelope,
      dialHints: input.dialHints ?? [],
      peerListenAddrs: input.peerListenAddrs,
      timeoutMs: input.timeoutMs,
      rebuildDialHints: input.rebuildDialHints,
      maxAttempts: input.maxAttempts,
      preferCircuitHints: input.preferCircuitHints,
    }),
  );
}
