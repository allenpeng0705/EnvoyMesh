/** Stable scope key for Assistant compose CRDT wire sync (Phase 15E). */
export const ASSISTANT_DRAFT_SYNC_SCOPE = "assistant-draft:v1";

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
