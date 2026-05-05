import { verifyEnvelope } from "@envoymesh/identity";
import { EnvoyEnvelopeSchema, type EnvoyEnvelope } from "@envoymesh/protocol";

export type InboundGuardDecision =
  | { action: "allow"; envelope: EnvoyEnvelope }
  | { action: "reject"; reason: string; messageId?: string };

export interface InboundMessageGuard {
  inspect(input: unknown): InboundGuardDecision;
}

export interface InboundMessageGuardOptions {
  maxEnvelopeBytes?: number;
  /** Max messageIds kept for replay suppression; oldest evicted first (long-running nodes / Windows). Default 100000. */
  maxReplayEntries?: number;
}

const defaultMaxEnvelopeBytes = 64 * 1024;
const defaultMaxReplayEntries = 100_000;

export function createInboundMessageGuard(
  options: InboundMessageGuardOptions = {},
): InboundMessageGuard {
  const seenMessageIds = new Set<string>();
  const replayOrder: string[] = [];
  const maxEnvelopeBytes = options.maxEnvelopeBytes ?? defaultMaxEnvelopeBytes;
  const maxReplayEntries = options.maxReplayEntries ?? defaultMaxReplayEntries;

  return {
    inspect(input) {
      const byteLength = Buffer.byteLength(JSON.stringify(input), "utf8");

      if (byteLength > maxEnvelopeBytes) {
        return { action: "reject", reason: "envelope exceeds maximum size" };
      }

      const parsed = EnvoyEnvelopeSchema.safeParse(input);
      if (!parsed.success) {
        return { action: "reject", reason: "malformed or unsigned envelope" };
      }

      const envelope = parsed.data as EnvoyEnvelope;
      if (seenMessageIds.has(envelope.messageId)) {
        return {
          action: "reject",
          reason: "replayed message",
          messageId: envelope.messageId,
        };
      }

      if (!verifyEnvelope(envelope)) {
        return {
          action: "reject",
          reason: "invalid signature",
          messageId: envelope.messageId,
        };
      }

      seenMessageIds.add(envelope.messageId);
      replayOrder.push(envelope.messageId);
      while (replayOrder.length > maxReplayEntries) {
        const old = replayOrder.shift();
        if (old !== undefined) {
          seenMessageIds.delete(old);
        }
      }
      return { action: "allow", envelope };
    },
  };
}
