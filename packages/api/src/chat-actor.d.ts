import type { EnvoyActorRole } from "@envoymesh/protocol";
export type ChatActorRole = "human" | "agent" | "system";
export interface ChatSenderActorFields {
    actorRole: ChatActorRole;
    agentId?: string;
    agentVerified?: boolean;
}
/** Map wire envelope roles to chat log / UI sender fields. */
export declare function chatSenderActorFromEnvelope(senderRole: EnvoyActorRole, agentCredential?: {
    agentId: string;
} | null, verified?: boolean): ChatSenderActorFields;
/** Badge label for chat bubbles (verified agent vs human). */
export declare function formatChatActorBadge(input: {
    displayName: string;
    actorRole?: ChatActorRole;
    agentVerified?: boolean;
    outgoing?: boolean;
}): string | undefined;
//# sourceMappingURL=chat-actor.d.ts.map