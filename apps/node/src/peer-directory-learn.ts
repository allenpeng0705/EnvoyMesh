import type { EnvoyEnvelope } from "@envoymesh/protocol";
import {
  parseProfileRequestPayload,
  parseProfileSyncPayload,
} from "@envoymesh/protocol";
import { isLibp2pPeerId } from "./profile-sync-outbound.js";

/** Owner id carried in profile intents (the profile subject / requester). */
export function ownerIdFromProfileIntent(envelope: EnvoyEnvelope): string | undefined {
  try {
    if (envelope.intent === "profile.request") {
      return parseProfileRequestPayload(envelope.payload).requesterOwnerId;
    }
    if (envelope.intent === "profile.sync" || envelope.intent === "profile.response") {
      return parseProfileSyncPayload(envelope.payload).profile.ownerId;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export function canLearnTransportFromProfileIntent(envelope: EnvoyEnvelope): boolean {
  return ownerIdFromProfileIntent(envelope) !== undefined;
}

export function normalizeTransportPeerId(transportPeerId: string | undefined): string | undefined {
  const id = transportPeerId?.trim();
  if (!id || !isLibp2pPeerId(id)) return undefined;
  return id;
}
