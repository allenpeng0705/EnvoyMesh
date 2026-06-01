import {
  formatChatSenderDisplayName,
  verifyInboundChatDeviceAuthorization,
} from "@envoymesh/api";
import type { DeviceAuthorizationStore } from "@envoymesh/local-store";
import { verifyAuthorizedDeviceEnvelope } from "@envoymesh/identity";
import type { ChatMessagePayload, ChatRoomMessagePayload, EnvoyEnvelope } from "@envoymesh/protocol";

export { formatChatSenderDisplayName };

let deviceAuthorizationStore: DeviceAuthorizationStore | null = null;

export function bindDeviceAuthorizationStore(store: DeviceAuthorizationStore | null): void {
  deviceAuthorizationStore = store;
}

type ChatSenderDevicePayload = Pick<
  ChatMessagePayload | ChatRoomMessagePayload,
  "senderOwnerId" | "deviceCertificate" | "ownerPublicKeyPem"
>;

export async function verifyInboundChatDevice(
  envelope: EnvoyEnvelope,
  payload: ChatSenderDevicePayload,
) {
  const result = verifyInboundChatDeviceAuthorization(
    envelope,
    payload,
    verifyAuthorizedDeviceEnvelope,
  );
  if (!result.ok || !payload.deviceCertificate || !deviceAuthorizationStore) {
    return result;
  }
  const ownerPublicKeyPem = payload.ownerPublicKeyPem;
  if (!ownerPublicKeyPem?.trim()) {
    return result;
  }
  const revoked = await deviceAuthorizationStore.isCertificateRevoked(
    payload.deviceCertificate,
    ownerPublicKeyPem,
  );
  if (revoked) {
    return { ok: false as const, reason: "device certificate revoked" };
  }
  return result;
}
