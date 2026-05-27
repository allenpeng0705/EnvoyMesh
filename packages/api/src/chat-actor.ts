import type { EnvoyActorRole } from "@envoymesh/protocol";

export type ChatActorRole = "human" | "agent" | "system";

export interface ChatSenderActorFields {
  actorRole: ChatActorRole;
  agentId?: string;
  agentVerified?: boolean;
}

/** Map wire envelope roles to chat log / UI sender fields. */
export function chatSenderActorFromEnvelope(
  senderRole: EnvoyActorRole,
  agentCredential?: { agentId: string } | null,
  verified = true,
): ChatSenderActorFields {
  if (senderRole === "agent") {
    return {
      actorRole: "agent",
      agentId: agentCredential?.agentId,
      agentVerified: verified,
    };
  }
  if (senderRole === "system") {
    return { actorRole: "system" };
  }
  return { actorRole: "human" };
}

/** Badge label for chat bubbles (verified agent vs human). */
export function formatChatActorBadge(input: {
  displayName: string;
  actorRole?: ChatActorRole;
  agentVerified?: boolean;
  outgoing?: boolean;
}): string | undefined {
  const { displayName, actorRole, agentVerified, outgoing } = input;
  if (actorRole === "agent") {
    if (outgoing) {
      return agentVerified === false ? "Your agent (unverified)" : "Your agent";
    }
    const base = displayName.trim() || "Contact";
    if (agentVerified === false) {
      return `${base}'s agent (unverified)`;
    }
    return `${base}'s agent`;
  }
  if (actorRole === "system") {
    return "System";
  }
  if (outgoing) {
    return "You";
  }
  return displayName.trim() || undefined;
}
