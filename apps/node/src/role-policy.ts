import type { EnvoyEnvelope } from "@envoymesh/protocol";
import { isA2ATaskIntent } from "./task-dispatcher.js";

export type InboundRolePolicyDecision =
  | { ok: true }
  | {
      ok: false;
      reason: string;
    };

export function evaluateInboundEnvelopeRolePolicy(envelope: EnvoyEnvelope): InboundRolePolicyDecision {
  if (envelope.intent === "chat.message") {
    if (envelope.senderRole !== "human" || envelope.recipientRole !== "human") {
      return {
        ok: false,
        reason: "chat.message requires senderRole=human and recipientRole=human",
      };
    }
    return { ok: true };
  }

  if (isA2ATaskIntent(envelope.intent)) {
    if (envelope.senderRole !== "agent") {
      return {
        ok: false,
        reason: `${envelope.intent} requires senderRole=agent`,
      };
    }
    if (envelope.recipientRole !== "agent") {
      return {
        ok: false,
        reason: `${envelope.intent} requires recipientRole=agent`,
      };
    }
  }

  return { ok: true };
}
