/** WAN cold-start join invite (v1) — unsigned bootstrap seed bundle. */
export type WanJoinInviteV1 = {
    v: 1;
    createdAt: string;
    expiresAt?: string;
    note?: string;
    targetPeerId?: string;
    targetMultiaddrs?: string[];
    bootstrapPeers: string[];
    bootstrapPresets: string[];
};
export declare function encodeWanJoinInviteV1(invite: WanJoinInviteV1): string;
export declare function decodeWanJoinInviteV1(token: string): WanJoinInviteV1;
export declare function assertWanJoinInviteNotExpired(invite: WanJoinInviteV1, nowMs?: number): void;
/** Extract token from `envoy://join?token=…`, raw query, or bare base64url token. */
export declare function parseEnvoyJoinUri(input: string): string;
export declare function buildEnvoyJoinUri(token: string): string;
export declare function dedupeBootstrapStrings(items: readonly string[]): string[];
/** Addresses to persist as discovery seeds when accepting an invite. */
export declare function wanJoinInviteSeedAddrs(invite: WanJoinInviteV1): string[];
export declare function mergeWanJoinInviteBootstrap(input: {
    bootstrapPeers: readonly string[];
    bootstrapPresets: readonly string[];
    invite: WanJoinInviteV1;
}): {
    bootstrapPeers: string[];
    bootstrapPresets: string[];
    seedAddrs: string[];
};
//# sourceMappingURL=wan-join-invite.d.ts.map