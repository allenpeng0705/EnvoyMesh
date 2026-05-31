import { type AgentCredential, type AuthChallengePayload, type AuthChallengeResponsePayload, type Capability, type DeviceCertificate, type DeviceProfile, type DeviceRevocationRecord, type DeviceRevocationReason, type EnvoyEnvelope, type EnvoyIntent, type Mandate, type ProofOfIntent, type PublicIdentity, type UnsignedMandate, type UnsignedEnvoyEnvelope, type UnsignedDataTransferVoucher, type DataTransferVoucher, type HumanProfilePayload, type FriendMatchingPreferencesPayload } from "@envoymesh/protocol";
export interface EnvoyKeyPair {
    publicKeyPem: string;
    privateKeyPem: string;
}
export interface EnvoyIdentity {
    peerId: string;
    publicKeyPem: string;
    privateKeyPem: string;
}
export interface OwnerIdentity {
    ownerId: string;
    publicKeyPem: string;
    privateKeyPem: string;
}
export interface DeviceIdentity {
    deviceId: string;
    publicKeyPem: string;
    privateKeyPem: string;
}
export interface AgentIdentity {
    agentId: string;
    agentPeerId: string;
    publicKeyPem: string;
    privateKeyPem: string;
}
export interface CreateAgentCredentialInput {
    owner: OwnerIdentity;
    agent: AgentIdentity;
    scope?: string[];
    credentialId?: string;
    issuedAt?: string;
    expiresAt?: string | null;
}
export interface CreateDeviceCertificateInput {
    owner: OwnerIdentity;
    device: DeviceIdentity;
    deviceProfile: DeviceProfile;
    capabilities: Capability[];
    certificateId?: string;
    issuedAt?: string;
    expiresAt?: string | null;
}
export interface CreateDeviceRevocationRecordInput {
    owner: OwnerIdentity;
    deviceId: string;
    reason: DeviceRevocationReason;
    certificateId?: string;
    revokedAt?: string;
    revocationId?: string;
}
export interface CreateChallengeResponseInput {
    challenge: AuthChallengePayload;
    ownerPublicKeyPem: string;
    deviceCertificate: DeviceCertificate;
    devicePrivateKeyPem: string;
}
export interface CreateMandateInput {
    owner: OwnerIdentity;
    unsignedMandate: UnsignedMandate;
}
export interface CreateProofOfIntentInput {
    mandate: Mandate;
    taskId: string;
    requestIntent: EnvoyIntent;
    device: DeviceIdentity;
    nonce?: string;
}
export declare function generateIdentity(): EnvoyIdentity;
export declare function generateOwnerIdentity(): OwnerIdentity;
export declare function generateDeviceIdentity(): DeviceIdentity;
/**
 * Generate an agent identity.
 * Note: The agent's peerId is derived from ownerId + agentPublicKeyPem to create
 * a unique identity that can be verified by peers.
 */
export declare function generateAgentIdentity(ownerId: string): AgentIdentity;
export declare function generateEd25519KeyPair(): EnvoyKeyPair;
export declare function derivePeerId(publicKeyPem: string): string;
export declare function deriveOwnerId(publicKeyPem: string): string;
export declare function deriveDeviceId(publicKeyPem: string): string;
/**
 * Derive an agent ID from the owner's ID and the agent's public key.
 * Format: envoy:agent:<sha256(ownerId + agentPublicKeyPem)>
 */
export declare function deriveAgentId(ownerId: string, agentPublicKeyPem: string): string;
export declare function toPublicOwnerIdentity(owner: OwnerIdentity): PublicIdentity;
export declare function toPublicDeviceIdentity(device: DeviceIdentity): PublicIdentity;
export declare function createDeviceCertificate(input: CreateDeviceCertificateInput): DeviceCertificate;
export declare function verifyDeviceCertificate(certificate: DeviceCertificate, ownerPublicKeyPem: string): boolean;
/**
 * Create an agent credential signed by the owner.
 * The credential links the agent's public key to the owner and defines
 * what intents the agent is allowed to send.
 */
export declare function createAgentCredential(input: CreateAgentCredentialInput): AgentCredential;
/**
 * Verify an agent credential using the owner's public key.
 * Returns true if:
 * 1. The owner's public key matches ownerId
 * 2. The agent's public key matches agentPublicKeyPem
 * 3. The agent's peer ID matches agentPeerId
 * 4. The signature is valid
 */
export declare function verifyAgentCredential(credential: AgentCredential, ownerPublicKeyPem?: string): boolean;
/**
 * Check if an agent credential is expired.
 * Returns true if expired or not yet valid.
 */
export declare function isAgentCredentialExpired(credential: AgentCredential): boolean;
export declare function createDeviceRevocationRecord(input: CreateDeviceRevocationRecordInput): DeviceRevocationRecord;
export declare function verifyDeviceRevocationRecord(record: DeviceRevocationRecord, ownerPublicKeyPem: string): boolean;
export declare function isDeviceRevoked(certificate: DeviceCertificate, records: readonly DeviceRevocationRecord[], ownerPublicKeyPem: string): boolean;
export declare function signUnsignedEnvelope<TPayload>(envelope: UnsignedEnvoyEnvelope<TPayload>, privateKeyPem: string): EnvoyEnvelope<TPayload>;
export declare function verifyEnvelope(envelope: EnvoyEnvelope): boolean;
/** Inbound verification: agent envelopes use {@link verifyAgentEnvelope}; device/human use {@link verifyEnvelope}. */
export declare function verifyInboundEnvelope(envelope: EnvoyEnvelope): boolean;
/**
 * Verify an envelope sent by an agent.
 * Checks:
 * 1. Envelope signature is valid (using agent's public key)
 * 2. senderPeerId matches the agent's peer ID from credential
 * 3. Agent credential is present (required for senderRole=agent)
 * 4. Agent credential is signed by the owner
 * 5. Agent credential is not expired
 * 6. The intent is within the agent's scope
 */
export declare function verifyAgentEnvelope(envelope: EnvoyEnvelope, ownerPublicKeyPem?: string): boolean;
export declare function verifyAuthorizedDeviceEnvelope(envelope: EnvoyEnvelope, certificate: DeviceCertificate, ownerPublicKeyPem: string): boolean;
export declare function createAuthChallengeResponse(input: CreateChallengeResponseInput): AuthChallengeResponsePayload;
export declare function verifyAuthChallengeResponse(challenge: AuthChallengePayload, response: AuthChallengeResponsePayload): boolean;
export declare function signMandate(input: CreateMandateInput): Mandate;
export declare function verifyMandate(mandate: Mandate, ownerPublicKeyPem: string): boolean;
export declare function createProofOfIntent(input: CreateProofOfIntentInput): ProofOfIntent;
export declare function verifyProofOfIntent(proof: ProofOfIntent, mandate: Mandate, deviceCertificate: DeviceCertificate, ownerPublicKeyPem: string): boolean;
export declare function signCanonicalPayload(input: unknown, privateKeyPem: string): string;
export declare function hashCanonicalPayload(input: unknown): string;
export declare function verifyCanonicalPayload(input: unknown, signature: string, publicKeyPem: string): boolean;
export declare function createSignedDataTransferVoucher(input: {
    unsigned: UnsignedDataTransferVoucher;
    devicePrivateKeyPem: string;
}): DataTransferVoucher;
export declare function verifyDataTransferVoucher(voucher: DataTransferVoucher, devicePublicKeyPem: string): boolean;
export declare function signHumanProfile(payload: Omit<HumanProfilePayload, "signature">, ownerPrivateKeyPem: string): HumanProfilePayload;
export declare function verifyHumanProfile(profile: HumanProfilePayload, ownerPublicKeyPem: string): boolean;
export declare function signFriendMatchingPreferences(payload: Omit<FriendMatchingPreferencesPayload, "signature">, ownerPrivateKeyPem: string): FriendMatchingPreferencesPayload;
export declare function verifyFriendMatchingPreferences(prefs: FriendMatchingPreferencesPayload, ownerPublicKeyPem: string): boolean;
export interface EncryptedOwnerKey {
    /** AES-256-GCM ciphertext (base64url) */
    encryptedKey: string;
    /** Ephemeral ECDH P-256 public key (raw 65 bytes, base64url) */
    ephemeralPublicKey: string;
    /** AES-GCM IV (12 bytes, base64url) */
    iv: string;
    /** AES-GCM authentication tag (16 bytes, base64url) — included separately for Web Crypto API */
    authTag: string;
}
/**
 * Encrypt the owner private key for secure transfer to a mobile device.
 *
 * Uses ECDH over P-256 + HKDF-SHA-256 + AES-256-GCM.
 * The peer's ECDH public key is in raw uncompressed format (65 bytes for P-256).
 *
 * Called by the home node during shared-identity pairing.
 */
export declare function encryptOwnerKeyForDevice(ownerPrivateKeyPem: string, peerEcdhPublicKeyRaw: Uint8Array): Promise<EncryptedOwnerKey>;
//# sourceMappingURL=index.d.ts.map