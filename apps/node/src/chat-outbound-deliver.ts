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

import { shouldPreferCircuitDialHints } from "./outbound-dial-hints.js";
import {
  clearOutboundPeerFreshness,
  isOutboundPeerRecentlyVerified,
  markOutboundPeerVerified,
} from "./outbound-peer-freshness.js";
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

/** True for VoIP/WebRTC signaling intents only. */
export function isCallIntent(intent: string | undefined): boolean {
  return typeof intent === "string" && intent.startsWith("call.");
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
}): Promise<boolean> {
  const warmOpts = {
    dialHints: input.dialHints,
    preferCircuitHints: input.preferCircuitHints,
  };
  const conn = input.mesh.getPeerConnectionInfo(input.transportPeerId);
  const upgradeRelayToDirect = conn.connected && !conn.direct && !input.preferCircuitHints;

  if (
    !input.forceFreshDial &&
    !upgradeRelayToDirect &&
    conn.connected &&
    isOutboundPeerRecentlyVerified(input.transportPeerId)
  ) {
    return true;
  }

  const redialFresh = async (): Promise<boolean> => {
    try {
      await input.mesh.closeConnectionsToPeer(input.transportPeerId);
      const result = await input.mesh.ensurePeerReachable(input.transportPeerId, input.protocol, {
        ...warmOpts,
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
      const result = await input.mesh.ensurePeerReachable(input.transportPeerId, input.protocol, warmOpts);
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
    const verified = await input.mesh.ensurePeerReachable(input.transportPeerId, input.protocol, {
      ...warmOpts,
      verifyConnection: true,
    });
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
}): Promise<boolean> {
  return prepareOutboundPeerConnection({
    mesh: input.mesh,
    transportPeerId: input.transportPeerId,
    protocol: input.chatProtocol,
    dialHints: input.dialHints,
    preferCircuitHints: input.preferCircuitHints,
    forceFreshDial: input.forceFreshDial,
  });
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
    | "closeConnectionsToPeer"
    | "ensurePeerReachable"
    | "getPeerConnectionInfo"
  > &
    Partial<Pick<EnvoyMesh, "sendChatExpectReply">>;
  transportPeerId: string;
  envelope: EnvoyEnvelope;
  dialHints: string[];
  peerListenAddrs?: string[];
  chatProtocol: string;
  rebuildDialHints?: () => Promise<string[]>;
  maxAttempts?: number;
  expectDeliveryAck?: boolean;
}): Promise<ChatDeliverResult> {
  const maxAttempts = input.maxAttempts ?? CHAT_SEND_MAX_ATTEMPTS;
  let lastErr: unknown;
  let hints = input.dialHints;
  const preferCircuits = shouldPreferCircuitDialHints(
    input.peerListenAddrs,
    hints,
    input.transportPeerId,
  );
  const sendChatExpectReplyFn = input.mesh.sendChatExpectReply;
  const canExpectAck =
    input.expectDeliveryAck !== false && typeof sendChatExpectReplyFn === "function";
  const sendChatExpectReply = canExpectAck
    ? sendChatExpectReplyFn.bind(input.mesh)
    : undefined;
  const ackTimeoutMs = resolveChatDeliveryAckTimeoutMs(hints);

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
      const closed = await input.mesh.closeConnectionsToPeer(input.transportPeerId);
      if (closed > 0) {
        console.log(
          `[sendChat] closed ${closed} stale connection(s) before retry ${attempt + 1}/${maxAttempts}`,
        );
      }
    } else {
      const conn = input.mesh.getPeerConnectionInfo(input.transportPeerId);
      const preferCircuitsOnPrepare = preferCircuits || attempt >= 2;
      const needsRelayUpgrade =
        conn.connected && !conn.direct && !preferCircuitsOnPrepare && hasDirectTcpDialHints(hints);
      const skipPrepare =
        canExpectAck &&
        !needsRelayUpgrade &&
        (isOutboundPeerRecentlyVerified(input.transportPeerId) ||
          (conn.connected && conn.direct));
      if (!skipPrepare) {
        const ready = await prepareOutboundChatConnection({
          mesh: input.mesh,
          transportPeerId: input.transportPeerId,
          chatProtocol: input.chatProtocol,
          dialHints: hints,
          preferCircuitHints: preferCircuitsOnPrepare,
          forceFreshDial: attempt > 0,
        });
        if (!ready && attempt === 0 && canExpectAck) {
          lastErr = new Error(`No reachable path to ${input.transportPeerId.slice(0, 12)}… before send`);
          continue;
        }
      }
    }

    const preferCircuitsOnAttempt = preferCircuits || attempt >= 2;
    const forceFreshDial = attempt > 0;
    let usedAck = false;

    try {
      if (canExpectAck && sendChatExpectReply) {
        usedAck = true;
        const reply = await sendChatExpectReply(input.transportPeerId, input.envelope, {
          timeoutMs: ackTimeoutMs,
          dialHints: hints,
          preferCircuitHints: preferCircuitsOnAttempt,
          forceFreshDial,
        });
        const ack = parseChatDeliveredAck(reply);
        if (attempt > 0) {
          console.log(`[sendChat] delivered with ack on attempt ${attempt + 1}/${maxAttempts}`);
        }
        markOutboundPeerVerified(input.transportPeerId);
        return { delivered: true, deliveredAt: ack.deliveredAt };
      }
      await input.mesh.sendChat(input.transportPeerId, input.envelope, {
        dialHints: hints,
        preferCircuitHints: preferCircuitsOnAttempt,
        forceFreshDial,
      });
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
    });
    if (fallback) {
      return fallback;
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

async function trySendChatWithoutAck(input: {
  mesh: Pick<EnvoyMesh, "sendChat" | "closeConnectionsToPeer">;
  transportPeerId: string;
  envelope: EnvoyEnvelope;
  dialHints: string[];
  peerListenAddrs?: string[];
}): Promise<ChatDeliverResult | undefined> {
  const preferCircuits = shouldPreferCircuitDialHints(
    input.peerListenAddrs,
    input.dialHints,
    input.transportPeerId,
  );
  try {
    const closed = await input.mesh.closeConnectionsToPeer(input.transportPeerId);
    if (closed > 0) {
      console.log(`[sendChat] closed ${closed} stale connection(s) before ack-less fallback`);
    }
    await input.mesh.sendChat(input.transportPeerId, input.envelope, {
      dialHints: input.dialHints,
      preferCircuitHints: preferCircuits,
      forceFreshDial: true,
    });
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
}): Promise<ChatDeliverResult> {
  if (!isCallIntent(input.envelope.intent)) {
    return deliverChatEnvelopeWithRetry({
      mesh: input.mesh,
      transportPeerId: input.transportPeerId,
      envelope: input.envelope,
      dialHints: input.dialHints,
      peerListenAddrs: input.peerListenAddrs,
      chatProtocol: ENVOY_CHAT_PROTOCOL,
      rebuildDialHints: input.rebuildDialHints,
      maxAttempts: input.maxAttempts,
      expectDeliveryAck: false,
    });
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
  const preferCircuits =
    input.preferCircuitHints === true ||
    shouldPreferCircuitDialHints(input.peerListenAddrs, hints, input.transportPeerId);

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
        });
        if (!ready && !input.mesh.getPeerConnectionInfo(input.transportPeerId).connected) {
          lastErr = new Error(`No reachable path to ${input.transportPeerId.slice(0, 12)}… before call send`);
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
          preferCircuitHints: preferCircuits || attempt > 0,
          forceFreshDial: true,
        });
        if (!ready) {
          lastErr = new Error(`No reachable path to ${input.transportPeerId.slice(0, 12)}… before call send`);
          continue;
        }
      }

      const sendConn = input.mesh.getPeerConnectionInfo(input.transportPeerId);
      await input.mesh.sendChat(input.transportPeerId, input.envelope, {
        dialHints: sendConn.connected ? [] : hints,
        preferCircuitHints: sendConn.connected ? false : preferCircuits || attempt > 0,
        forceFreshDial: attempt > 0,
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
}): Promise<ChatDeliverResult> {
  const maxAttempts = input.maxAttempts ?? CHAT_SEND_MAX_ATTEMPTS;
  let lastErr: unknown;
  let hints = input.dialHints;
  const preferCircuits =
    input.preferCircuitHints === true ||
    shouldPreferCircuitDialHints(input.peerListenAddrs, hints, input.transportPeerId);

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
        });
        if (!ready && !input.mesh.getPeerConnectionInfo(input.transportPeerId).connected) {
          lastErr = new Error(`No reachable path to ${input.transportPeerId.slice(0, 12)}… before send`);
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
          preferCircuitHints: preferCircuits || attempt > 0,
          forceFreshDial: true,
        });
        if (!ready && !input.mesh.getPeerConnectionInfo(input.transportPeerId).connected) {
          lastErr = new Error(`No reachable path to ${input.transportPeerId.slice(0, 12)}… before send`);
          continue;
        }
      }

      const sendConn = input.mesh.getPeerConnectionInfo(input.transportPeerId);
      await input.mesh.send(input.transportPeerId, input.envelope, {
        dialHints: sendConn.connected && sendConn.direct && attempt === 0 ? [] : hints,
        preferCircuitHints: preferCircuits || attempt > 0,
        forceFreshDial: attempt > 0,
      });
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
}): Promise<number> {
  const maxAttempts = input.maxAttempts ?? CHAT_SEND_MAX_ATTEMPTS;
  let lastErr: unknown;
  let hints = input.dialHints;
  const preferCircuits = shouldPreferCircuitDialHints(
    input.peerListenAddrs,
    hints,
    input.transportPeerId,
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
        {
          dialHints: hints,
          preferCircuitHints: preferCircuits || attempt > 0,
          forceFreshDial: attempt > 0,
        },
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

  if (useChatProtocol) {
    if (!isPeerLiveConnected(input.mesh, input.transportPeerId)) {
      throw new Error(
        `No open connection to ${input.transportPeerId.slice(0, 12)}… for profile request`,
      );
    }
    let lastProfileErr: unknown;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 0) {
        await sleep(CHAT_SEND_RETRY_BASE_MS * attempt);
      }
      try {
        const reply = await sendExpectReply(input.transportPeerId, input.envelope, {
          timeoutMs,
          dialHints: [],
          preferCircuitHints: false,
          forceFreshDial: false,
        });
        markOutboundPeerVerified(input.transportPeerId);
        return reply;
      } catch (err) {
        lastProfileErr = err;
        console.warn(
          `[expect-reply] profile attempt ${attempt + 1}/${maxAttempts} failed for ${input.transportPeerId.slice(0, 12)}…:`,
          err instanceof Error ? err.message : err,
        );
      }
    }
    throw lastProfileErr instanceof Error ? lastProfileErr : new Error(String(lastProfileErr));
  }

  let lastErr: unknown;
  let hints = input.dialHints;
  const preferCircuits = shouldPreferCircuitDialHints(
    input.peerListenAddrs,
    hints,
    input.transportPeerId,
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
      const conn = input.mesh.getPeerConnectionInfo(input.transportPeerId);
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
      const ready = await prepareOutboundPeerConnection({
        mesh: input.mesh,
        transportPeerId: input.transportPeerId,
        protocol,
        dialHints: hints,
        preferCircuitHints: preferCircuits || attempt > 0,
        forceFreshDial: attempt > 0,
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
      const reply = await sendExpectReply(input.transportPeerId, input.envelope, {
        timeoutMs,
        dialHints: useChatProtocol && sendConn.connected ? [] : hints,
        preferCircuitHints: useChatProtocol && sendConn.connected ? false : preferCircuits || attempt > 0,
        forceFreshDial: attempt > 0,
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
      console.warn(
        `[expect-reply] attempt ${attempt + 1}/${maxAttempts} failed for ${input.transportPeerId.slice(0, 12)}…:`,
        err instanceof Error ? err.message : err,
      );
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
    }),
  );
}
