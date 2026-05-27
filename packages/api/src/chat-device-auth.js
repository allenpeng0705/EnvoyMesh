/**
 * Verify optional device certificate on inbound chat.message payloads.
 * Legacy peers without a certificate pass through unchanged.
 */
export function verifyInboundChatDeviceAuthorization(envelope, payload, verifyAuthorizedDeviceEnvelope, isDeviceRevoked) {
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
    if (!verifyAuthorizedDeviceEnvelope(envelope, payload.deviceCertificate, ownerPublicKeyPem)) {
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
export function chatMessagePayloadDeviceFields(input) {
    if (!input.deviceCertificate || !input.ownerPublicKeyPem?.trim()) {
        return {};
    }
    return {
        deviceCertificate: input.deviceCertificate,
        ownerPublicKeyPem: input.ownerPublicKeyPem,
    };
}
/** Human-readable sender label for multi-device chat (e.g. "Alice (satellite)"). */
export function formatChatSenderDisplayName(baseDisplayName, payload) {
    if (!payload.deviceCertificate) {
        return baseDisplayName;
    }
    if (payload.deviceCertificate.deviceProfile === "primary") {
        return baseDisplayName;
    }
    return `${baseDisplayName} (${payload.deviceCertificate.deviceProfile})`;
}
//# sourceMappingURL=chat-device-auth.js.map