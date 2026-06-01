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
    // human↔human: OK (original)
    // agent↔human: OK (Phase 9A — AI assistant / bridge replies)
    // agent↔human: OK for chat.delivered acks too
    const roles = [envelope.senderRole, envelope.recipientRole];
    if (!roles.includes("human")) {
      return {
        ok: false,
        reason: "chat.message requires at least one human role (use A2A intents for agent-to-agent)",
      };
    }
    return { ok: true };
  }

  if (envelope.intent === "chat.delivered") {
    const roles = [envelope.senderRole, envelope.recipientRole];
    if (!roles.includes("human")) {
      return {
        ok: false,
        reason: "chat.delivered requires at least one human role",
      };
    }
    return { ok: true };
  }

  if (envelope.intent === "chat.room.sync" || envelope.intent === "chat.room.message") {
    if (envelope.senderRole !== "human" || envelope.recipientRole !== "human") {
      return {
        ok: false,
        reason: `${envelope.intent} requires senderRole=human and recipientRole=human`,
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
