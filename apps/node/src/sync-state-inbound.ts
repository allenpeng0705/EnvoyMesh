import { parseSyncStatePayload, type EnvoyEnvelope } from "@envoymesh/protocol";
import type { NodeProfile } from "@envoymesh/local-store";

export type SyncStateInboundResult =
  | { ok: true; scope: string; updateBase64: string; senderOwnerId: string }
  | { ok: false; reason: string };

/** Accept sync.state only from the same owner (paired devices). */
export function handleInboundSyncStateIntent(input: {
  envelope: EnvoyEnvelope;
  profile: NodeProfile;
}): SyncStateInboundResult {
  try {
    const payload = parseSyncStatePayload(input.envelope.payload);
    if (payload.senderOwnerId !== input.profile.owner.ownerId) {
      return { ok: false, reason: "sync.state senderOwnerId must match local owner" };
    }
    return {
      ok: true,
      scope: payload.scope,
      updateBase64: payload.updateBase64,
      senderOwnerId: payload.senderOwnerId,
    };
  } catch {
    return { ok: false, reason: "invalid sync.state payload" };
  }
}
