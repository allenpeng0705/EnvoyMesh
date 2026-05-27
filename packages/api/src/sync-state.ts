/** Stable scope key for Assistant compose CRDT wire sync (Phase 15E). */
export const ASSISTANT_DRAFT_SYNC_SCOPE = "assistant-draft:v1";

const CONTACT_COMPOSE_DRAFT_SCOPE_PREFIX = "contact-compose-draft:v1:";

/** Per-contact compose buffer scope for yjs sync between paired owner devices. */
export function contactComposeDraftSyncScope(contactOwnerId: string): string {
  const id = contactOwnerId.trim();
  if (!id) {
    throw new Error("contactOwnerId is required");
  }
  return `${CONTACT_COMPOSE_DRAFT_SCOPE_PREFIX}${id}`;
}

export function isContactComposeDraftSyncScope(scope: string): boolean {
  return scope.startsWith(CONTACT_COMPOSE_DRAFT_SCOPE_PREFIX);
}

const CONTACT_NOTES_SCOPE_PREFIX = "contact-notes:v1:";

/** Per-contact private notes + tags (loro) sync between paired owner devices. */
export function contactNotesSyncScope(contactOwnerId: string): string {
  const id = contactOwnerId.trim();
  if (!id) {
    throw new Error("contactOwnerId is required");
  }
  return `${CONTACT_NOTES_SCOPE_PREFIX}${id}`;
}

export function isContactNotesSyncScope(scope: string): boolean {
  return scope.startsWith(CONTACT_NOTES_SCOPE_PREFIX);
}

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
