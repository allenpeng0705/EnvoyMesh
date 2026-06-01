import type { ChatMessagePayload, DeviceCertificate, EnvoyEnvelope } from "@envoymesh/protocol";

export type ChatDeviceAuthResult =
  | { ok: true; deviceId?: string; deviceProfile?: string }
  | { ok: false; reason: string };

export type VerifyAuthorizedDeviceEnvelope = (
  envelope: EnvoyEnvelope,
  certificate: DeviceCertificate,
  ownerPublicKeyPem: string,
) => boolean;

export type IsDeviceRevokedFn = (
  certificate: DeviceCertificate,
  ownerPublicKeyPem: string,
) => boolean;

/**
 * Verify optional device certificate on inbound chat.message payloads.
 * Legacy peers without a certificate pass through unchanged.
 */
export function verifyInboundChatDeviceAuthorization(
  envelope: EnvoyEnvelope,
  payload: Pick<ChatMessagePayload, "senderOwnerId" | "deviceCertificate" | "ownerPublicKeyPem">,
  verifyAuthorizedDeviceEnvelope: VerifyAuthorizedDeviceEnvelope,
  isDeviceRevoked?: IsDeviceRevokedFn,
): ChatDeviceAuthResult {
  if (!payload.deviceCertificate) {
    return { ok: true };
  }

  const ownerPublicKeyPem = payload.ownerPublicKeyPem;
  if (!ownerPublicKeyPem?.trim()) {
    return { ok: false, reason: "chat.message missing ownerPublicKeyPem for device certificate" };
  }

  if (payload.deviceCertificate.ownerId !== payload.senderOwnerId) {
    return { ok: false, reason: "device certificate ownerId does not match senderOwnerId" };
  }

  if (
    !verifyAuthorizedDeviceEnvelope(envelope, payload.deviceCertificate, ownerPublicKeyPem)
  ) {
    return { ok: false, reason: "unauthorized device certificate for chat.message" };
  }

  if (isDeviceRevoked?.(payload.deviceCertificate, ownerPublicKeyPem)) {
    return { ok: false, reason: "device certificate revoked" };
  }

  return {
    ok: true,
    deviceId: payload.deviceCertificate.deviceId,
    deviceProfile: payload.deviceCertificate.deviceProfile,
  };
}

/** Attach cert fields to outbound chat payloads when a device certificate is available. */
export function chatMessagePayloadDeviceFields(input: {
  deviceCertificate?: DeviceCertificate | null;
  ownerPublicKeyPem?: string;
}): Pick<ChatMessagePayload, "deviceCertificate" | "ownerPublicKeyPem"> {
  if (!input.deviceCertificate || !input.ownerPublicKeyPem?.trim()) {
    return {};
  }
  return {
    deviceCertificate: input.deviceCertificate,
    ownerPublicKeyPem: input.ownerPublicKeyPem,
  };
}

/** Human-readable sender label for multi-device chat (e.g. "Alice (satellite)"). */
export function formatChatSenderDisplayName(
  baseDisplayName: string,
  payload: Pick<ChatMessagePayload, "deviceCertificate">,
): string {
  if (!payload.deviceCertificate) {
    return baseDisplayName;
  }
  if (payload.deviceCertificate.deviceProfile === "primary") {
    return baseDisplayName;
  }
  return `${baseDisplayName} (${payload.deviceCertificate.deviceProfile})`;
}
