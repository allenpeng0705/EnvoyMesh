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
    // agent↔agent: NOT OK (use A2A task intents instead)
    const roles = [envelope.senderRole, envelope.recipientRole];
    if (!roles.includes("human")) {
      return {
        ok: false,
        reason: "chat.message requires at least one human role (use A2A intents for agent-to-agent)",
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
