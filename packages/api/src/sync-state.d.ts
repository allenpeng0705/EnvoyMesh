/** Stable scope key for Assistant compose CRDT wire sync (Phase 15E). */
export declare const ASSISTANT_DRAFT_SYNC_SCOPE = "assistant-draft:v1";
/** Per-contact compose buffer scope for yjs sync between paired owner devices. */
export declare function contactComposeDraftSyncScope(contactOwnerId: string): string;
export declare function isContactComposeDraftSyncScope(scope: string): boolean;
/** Per-contact private notes + tags (loro) sync between paired owner devices. */
export declare function contactNotesSyncScope(contactOwnerId: string): string;
export declare function isContactNotesSyncScope(scope: string): boolean;
export interface SyncStateUpdate {
    scope: string;
    updateBase64: string;
    senderOwnerId: string;
}
export interface SendSyncStateUpdateParams {
    scope: string;
    updateBase64: string;
    /** When set, send only to this libp2p peer id; otherwise fan-out to same-owner devices. */
    targetPeerId?: string;
}
export interface SendSyncStateUpdateResult {
    ok: boolean;
    recipients: number;
    error?: string;
}
//# sourceMappingURL=sync-state.d.ts.map