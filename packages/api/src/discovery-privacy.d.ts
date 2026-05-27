/** Wire prefix for US-MH2 anonymized discovery requester ids. */
export declare const ANONYMOUS_DISCOVERY_OWNER_PREFIX = "envoy:discovery:anon:";
export type DiscoveryForwardPrivacy = "none" | "anonymous";
export declare function anonymizeDiscoveryRequesterOwnerId(originalOwnerId: string, correlationId: string | undefined): string;
export declare function isAnonymousDiscoveryOwnerId(ownerId: string): boolean;
/** Audit-safe label — never logs full anonymous token in downstream-facing summaries. */
export declare function discoveryRequesterAuditLabel(input: {
    requesterOwnerId: string;
    referralOwnerId?: string;
    currentHop?: number;
}): string;
export declare function shouldAnonymizeDiscoveryForward(currentHop: number): boolean;
//# sourceMappingURL=discovery-privacy.d.ts.map