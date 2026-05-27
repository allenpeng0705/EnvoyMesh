/** Map wire envelope roles to chat log / UI sender fields. */
export function chatSenderActorFromEnvelope(senderRole, agentCredential, verified = true) {
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
export function formatChatActorBadge(input) {
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
//# sourceMappingURL=chat-actor.js.map