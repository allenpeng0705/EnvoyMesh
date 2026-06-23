import type { EnvoyEnvelope } from "@envoymesh/protocol";
import { CHAT_DELIVERY_ACK_TIMEOUT_MS } from "@envoymesh/protocol";
import type { EnvoyMesh } from "@envoymesh/network";
import {
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
  Pick<EnvoyMesh, "sendExpectReply">;

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
}): Promise<ChatDeliverResult> {
  const maxAttempts = input.maxAttempts ?? CHAT_SEND_MAX_ATTEMPTS;
  let lastErr: unknown;
  let hints = input.dialHints;
  const preferCircuits = shouldPreferCircuitDialHints(
    input.peerListenAddrs,
    hints,
    input.transportPeerId,
  );
  const canExpectAck =
    input.expectDeliveryAck !== false && typeof input.mesh.sendChatExpectReply === "function";
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
        if (!ready && attempt === 0) {
          lastErr = new Error(`No reachable path to ${input.transportPeerId.slice(0, 12)}… before send`);
          continue;
        }
      }
    }

    const preferCircuitsOnAttempt = preferCircuits || attempt >= 2;
    const forceFreshDial = attempt > 0;
    let usedAck = false;

    try {
      if (canExpectAck) {
        usedAck = true;
        const reply = await input.mesh.sendChatExpectReply(input.transportPeerId, input.envelope, {
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

/**
 * Deliver `call.*` envelopes on `/envoymesh/message/0.1.0` (not chat protocol).
 * Fire-and-forget — no delivery ack wait.
 */
export async function deliverCallEnvelopeWithRetry(input: {
  mesh: OutboundDeliverMesh;
  transportPeerId: string;
  envelope: EnvoyEnvelope;
  dialHints: string[];
  peerListenAddrs?: string[];
  rebuildDialHints?: () => Promise<string[]>;
  maxAttempts?: number;
}): Promise<ChatDeliverResult> {
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

    try {
      const ready = await prepareOutboundPeerConnection({
        mesh: input.mesh,
        transportPeerId: input.transportPeerId,
        protocol: ENVOY_MESSAGE_PROTOCOL,
        dialHints: hints,
        preferCircuitHints: preferCircuits || attempt > 0,
        forceFreshDial: attempt > 0,
      });
      if (!ready) {
        lastErr = new Error(`No reachable path to ${input.transportPeerId.slice(0, 12)}… before call send`);
        continue;
      }

      await input.mesh.send(input.transportPeerId, input.envelope, {
        dialHints: hints,
        preferCircuitHints: preferCircuits || attempt > 0,
        forceFreshDial: attempt > 0,
      });
      if (attempt > 0) {
        console.log(`[call] delivered on attempt ${attempt + 1}/${maxAttempts}`);
      }
      return { delivered: true, deliveredAt: new Date().toISOString() };
    } catch (err) {
      lastErr = err;
      console.warn(
        `[call] attempt ${attempt + 1}/${maxAttempts} failed for ${input.transportPeerId.slice(0, 12)}…:`,
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

/** Request/response on {@link ENVOY_MESSAGE_PROTOCOL} with verify + retries. */
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
      protocol: ENVOY_MESSAGE_PROTOCOL,
      dialHints: hints,
      preferCircuitHints: preferCircuits || attempt > 0,
      forceFreshDial: attempt > 0,
    });
    if (!ready) {
      lastErr = new Error(`No reachable path to ${input.transportPeerId.slice(0, 12)}… before expect-reply send`);
      continue;
    }

    try {
      const reply = await input.mesh.sendExpectReply(input.transportPeerId, input.envelope, {
        timeoutMs,
        dialHints: hints,
        preferCircuitHints: preferCircuits || attempt > 0,
        forceFreshDial: attempt > 0,
      });
      if (attempt > 0) {
        console.log(`[expect-reply] delivered on attempt ${attempt + 1}/${maxAttempts}`);
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
  mesh: OutboundDeliverMesh;
  transportPeerId: string;
  envelope: EnvoyEnvelope;
  dialHints?: string[];
  peerListenAddrs?: string[];
  rebuildDialHints?: () => Promise<string[]>;
  maxAttempts?: number;
}): Promise<ChatDeliverResult> {
  return withOutboundSendLock(input.transportPeerId, () =>
    deliverCallEnvelopeWithRetry({
      mesh: input.mesh,
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
