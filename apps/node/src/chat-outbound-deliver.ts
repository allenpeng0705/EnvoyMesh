import type { EnvoyEnvelope } from "@envoymesh/protocol";
import { CHAT_DELIVERY_ACK_TIMEOUT_MS } from "@envoymesh/protocol";
import type { EnvoyMesh } from "@envoymesh/network";
import { prioritizeCircuitDialHints } from "@envoymesh/network";
import { parseChatDeliveredAck } from "@envoymesh/api";

const CHAT_SEND_MAX_ATTEMPTS = 3;
const CHAT_SEND_RETRY_BASE_MS = 800;

export type ChatDeliverResult = {
  delivered: boolean;
  deliveredAt?: string;
};

/** On retry, try relay circuit paths before direct / stale LAN hints. */
export function rotateDialHintsForRetry(hints: string[], attempt: number): string[] {
  if (attempt <= 0 || hints.length === 0) {
    return hints;
  }
  return prioritizeCircuitDialHints(hints);
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
  chatProtocol: string;
  rebuildDialHints?: () => Promise<string[]>;
  maxAttempts?: number;
  expectDeliveryAck?: boolean;
}): Promise<ChatDeliverResult> {
  const maxAttempts = input.maxAttempts ?? CHAT_SEND_MAX_ATTEMPTS;
  let lastErr: unknown;
  let hints = input.dialHints;
  const preferCircuits = hints.some((h) => h.includes("/p2p-circuit/"));

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
      if (!conn.connected) {
        try {
          await input.mesh.ensurePeerReachable(input.transportPeerId, input.chatProtocol, {
            dialHints: hints,
            preferCircuitHints: preferCircuits,
          });
        } catch (warmErr) {
          console.warn(
            `[sendChat] pre-send warm failed for ${input.transportPeerId.slice(0, 12)}…:`,
            warmErr instanceof Error ? warmErr.message : warmErr,
          );
        }
      }
    }

    try {
      if (input.expectDeliveryAck !== false && typeof input.mesh.sendChatExpectReply === "function") {
        const reply = await input.mesh.sendChatExpectReply(input.transportPeerId, input.envelope, {
          timeoutMs: CHAT_DELIVERY_ACK_TIMEOUT_MS,
          dialHints: hints,
          preferCircuitHints: preferCircuits || attempt > 0,
        });
        const ack = parseChatDeliveredAck(reply);
        if (attempt > 0) {
          console.log(`[sendChat] delivered with ack on attempt ${attempt + 1}/${maxAttempts}`);
        }
        return { delivered: true, deliveredAt: ack.deliveredAt };
      }
      await input.mesh.sendChat(input.transportPeerId, input.envelope, {
        dialHints: hints,
        preferCircuitHints: preferCircuits || attempt > 0,
      });
      if (attempt > 0) {
        console.log(`[sendChat] delivered on attempt ${attempt + 1}/${maxAttempts}`);
      }
      return { delivered: false };
    } catch (err) {
      lastErr = err;
      console.warn(
        `[sendChat] attempt ${attempt + 1}/${maxAttempts} failed for ${input.transportPeerId.slice(0, 12)}…:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
