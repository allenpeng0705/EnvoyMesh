import { verifyInboundEnvelope } from "@envoymesh/identity";
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
/** profile.sync may include inline thumbnail bytes (up to 512 KiB image + base64 overhead). */
const profileMaxEnvelopeBytes = 1024 * 1024;
const defaultMaxReplayEntries = 100_000;

const PROFILE_INTENTS = new Set(["profile.sync", "profile.request", "profile.response"]);

function maxBytesForInboundIntent(intent: string | undefined, defaultLimit: number): number {
  if (intent && PROFILE_INTENTS.has(intent)) {
    return profileMaxEnvelopeBytes;
  }
  return defaultLimit;
}

function inboundIntentFromUnknown(input: unknown): string | undefined {
  if (typeof input !== "object" || input === null || !("intent" in input)) {
    return undefined;
  }
  const intent = (input as { intent?: unknown }).intent;
  return typeof intent === "string" ? intent : undefined;
}

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
      const intentHint = inboundIntentFromUnknown(input);
      const sizeLimit = maxBytesForInboundIntent(intentHint, maxEnvelopeBytes);

      if (byteLength > sizeLimit) {
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

      const verified = verifyInboundEnvelope(envelope);
      if (!verified) {
        return {
          action: "reject",
          reason: envelope.senderRole === "agent" && envelope.agentCredential != null
            ? "invalid agent credential or signature"
            : "invalid signature",
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
