import type { ChatMessagePayload, DeviceCertificate, EnvoyEnvelope } from "@envoymesh/protocol";
export type ChatDeviceAuthResult = {
    ok: true;
    deviceId?: string;
    deviceProfile?: string;
} | {
    ok: false;
    reason: string;
};
export type VerifyAuthorizedDeviceEnvelope = (envelope: EnvoyEnvelope, certificate: DeviceCertificate, ownerPublicKeyPem: string) => boolean;
export type IsDeviceRevokedFn = (certificate: DeviceCertificate, ownerPublicKeyPem: string) => boolean;
/**
 * Verify optional device certificate on inbound chat.message payloads.
 * Legacy peers without a certificate pass through unchanged.
 */
export declare function verifyInboundChatDeviceAuthorization(envelope: EnvoyEnvelope, payload: ChatMessagePayload, verifyAuthorizedDeviceEnvelope: VerifyAuthorizedDeviceEnvelope, isDeviceRevoked?: IsDeviceRevokedFn): ChatDeviceAuthResult;
/** Attach cert fields to outbound chat payloads when a device certificate is available. */
export declare function chatMessagePayloadDeviceFields(input: {
    deviceCertificate?: DeviceCertificate | null;
    ownerPublicKeyPem?: string;
}): Pick<ChatMessagePayload, "deviceCertificate" | "ownerPublicKeyPem">;
/** Human-readable sender label for multi-device chat (e.g. "Alice (satellite)"). */
export declare function formatChatSenderDisplayName(baseDisplayName: string, payload: ChatMessagePayload): string;
//# sourceMappingURL=chat-device-auth.d.ts.map