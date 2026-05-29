export type SocialProxySessionStatus = "discovered" | "syncing" | "intro_proposed" | "awaiting_peer" | "commitment_ready" | "hello_pending" | "hello_sent" | "chatting" | "owner_review" | "bonded" | "declined" | "expired" | "cancelled";
export type SocialProxySessionEvent = "RUN_PASS" | "SYNC_OK" | "SYNC_DEFER" | "OWNER_APPROVE_INTRO" | "OWNER_DECLINE" | "SEND_HELLO" | "QUEUE_HELLO" | "APPROVE_HELLO" | "CHAT_ALLOWED" | "INBOUND_CHAT" | "ESCALATE" | "KILL_SWITCH" | "BOND_DETECTED" | "EXPIRE";
export interface SocialProxySession {
    sessionId: string;
    correlationId: string;
    postureRef: string;
    candidateOwnerId?: string;
    candidatePeerId?: string;
    introProposalMessageId?: string;
    ownerCommitmentRef?: string;
    status: SocialProxySessionStatus;
    trustPathSummary?: string;
    lastAgentChatAt?: string;
    introCountToday?: number;
    createdAt: string;
    updatedAt: string;
    expiresAt?: string;
}
export interface SocialProxyTransitionContext {
    autoHello?: boolean;
    helloRequiresApproval?: boolean;
    hasOwnerCommitmentRef?: boolean;
}
export interface SocialProxyTransitionResult {
    session: SocialProxySession;
    changed: boolean;
}
export declare function isSocialProxyTerminal(status: SocialProxySessionStatus): boolean;
export declare function transitionSocialProxySession(session: SocialProxySession, event: SocialProxySessionEvent, ctx?: SocialProxyTransitionContext): SocialProxyTransitionResult;
export declare function createSocialProxySession(input: {
    postureRef: string;
    correlationId?: string;
    candidateOwnerId?: string;
    candidatePeerId?: string;
    trustPathSummary?: string;
    expiresAt?: string;
}): SocialProxySession;
//# sourceMappingURL=social-proxy-session.d.ts.map