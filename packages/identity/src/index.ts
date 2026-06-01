import {
  agentCredentialForSigning,
  authChallengeProofForSigning,
  canonicalJson,
  createUnsignedAgentCredential,
  deviceCertificateForSigning,
  deviceRevocationRecordForSigning,
  envelopeForSigning,
  mandateForSigning,
  proofOfIntentForSigning,
  type AgentCredential,
  type AuthChallengePayload,
  type AuthChallengeResponsePayload,
  type Capability,
  type CreateAgentCredentialInput,
  type CreateChallengeResponseInput,
  type CreateDeviceCertificateInput,
  type CreateDeviceRevocationRecordInput,
  type CreateMandateInput,
  type CreateProofOfIntentInput,
  type CreateUnsignedAgentCredentialInput,
  type DeviceCertificate,
  type DeviceIdentity,
  type AgentIdentity,
  type DeviceRevocationRecord,
  type EnvoyIdentity,
  type EnvoyKeyPair,
  type EnvoyEnvelope,
  type OwnerIdentity,
  type Mandate,
  type ProofOfIntent,
  type PublicIdentity,
  type UnsignedAgentCredential,
  type UnsignedMandate,
  type UnsignedDeviceCertificate,
  type UnsignedDeviceRevocationRecord,
  type UnsignedEnvoyEnvelope,
  type UnsignedDataTransferVoucher,
  type DataTransferVoucher,
  dataTransferVoucherForSigning,
  humanProfileForSigning,
  friendMatchingPreferencesForSigning,
  createFriendMatchingPreferencesPayload,
  type HumanProfilePayload,
  type FriendMatchingPreferencesPayload,
} from "@envoymesh/protocol";
import {
  createHash,
  generateKeyPairSync,
  randomUUID,
  sign as cryptoSign,
  verify as cryptoVerify,
} from "node:crypto";

// Re-export shared identity types so existing imports from @envoymesh/identity
// (and @envoymesh/mobile-identity) keep working with a single source of truth.
export type {
  EnvoyKeyPair,
  EnvoyIdentity,
  OwnerIdentity,
  DeviceIdentity,
  AgentIdentity,
  CreateAgentCredentialInput,
  CreateDeviceCertificateInput,
  CreateDeviceRevocationRecordInput,
  CreateChallengeResponseInput,
  CreateMandateInput,
  CreateProofOfIntentInput,
} from "@envoymesh/protocol";

export function generateIdentity(): EnvoyIdentity {
  const { publicKeyPem, privateKeyPem } = generateEd25519KeyPair();

  return {
    peerId: derivePeerId(publicKeyPem),
    publicKeyPem,
    privateKeyPem,
  };
}

export function generateOwnerIdentity(): OwnerIdentity {
  const { publicKeyPem, privateKeyPem } = generateEd25519KeyPair();

  return {
    ownerId: deriveOwnerId(publicKeyPem),
    publicKeyPem,
    privateKeyPem,
  };
}

export function generateDeviceIdentity(): DeviceIdentity {
  const { publicKeyPem, privateKeyPem } = generateEd25519KeyPair();

  return {
    deviceId: deriveDeviceId(publicKeyPem),
    publicKeyPem,
    privateKeyPem,
  };
}

/**
 * Generate an agent identity.
 * Note: The agent's peerId is derived from ownerId + agentPublicKeyPem to create
 * a unique identity that can be verified by peers.
 */
export function generateAgentIdentity(ownerId: string): AgentIdentity {
  const { publicKeyPem, privateKeyPem } = generateEd25519KeyPair();

  return {
    agentId: deriveAgentId(ownerId, publicKeyPem),
    agentPeerId: `envoy_agent_${createHash("sha256").update(ownerId + publicKeyPem).digest("base64url")}`,
    publicKeyPem,
    privateKeyPem,
  };
}

export function generateEd25519KeyPair(): EnvoyKeyPair {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519", {
    publicKeyEncoding: {
      type: "spki",
      format: "pem",
    },
    privateKeyEncoding: {
      type: "pkcs8",
      format: "pem",
    },
  });

  return {
    publicKeyPem: publicKey,
    privateKeyPem: privateKey,
  };
}

export function derivePeerId(publicKeyPem: string): string {
  /** Protocol / envelope only — distinct from libp2p `PeerId`; do not show as a user-facing “peer id”. */
  return `envoy_${createHash("sha256").update(publicKeyPem).digest("base64url")}`;
}

export function deriveOwnerId(publicKeyPem: string): string {
  return `envoy:owner:${createHash("sha256").update(publicKeyPem).digest("base64url")}`;
}

export function deriveDeviceId(publicKeyPem: string): string {
  return `envoy:device:${createHash("sha256").update(publicKeyPem).digest("base64url")}`;
}

/**
 * Derive an agent ID from the owner's ID and the agent's public key.
 * Format: envoy:agent:<sha256(ownerId + agentPublicKeyPem)>
 */
export function deriveAgentId(ownerId: string, agentPublicKeyPem: string): string {
  return `envoy:agent:${createHash("sha256").update(ownerId + agentPublicKeyPem).digest("base64url")}`;
}

export function toPublicOwnerIdentity(owner: OwnerIdentity): PublicIdentity {
  return {
    id: owner.ownerId,
    publicKeyPem: owner.publicKeyPem,
  };
}

export function toPublicDeviceIdentity(device: DeviceIdentity): PublicIdentity {
  return {
    id: device.deviceId,
    publicKeyPem: device.publicKeyPem,
  };
}

export function createDeviceCertificate(
  input: CreateDeviceCertificateInput,
): DeviceCertificate {
  const unsignedCertificate: UnsignedDeviceCertificate = {
    version: "0.1",
    certificateId: input.certificateId ?? randomCertificateId(),
    ownerId: input.owner.ownerId,
    deviceId: input.device.deviceId,
    devicePublicKeyPem: input.device.publicKeyPem,
    deviceProfile: input.deviceProfile,
    capabilities: input.capabilities,
    issuedAt: input.issuedAt ?? new Date().toISOString(),
    expiresAt: input.expiresAt ?? null,
  };

  return {
    ...unsignedCertificate,
    signature: signCanonicalPayload(unsignedCertificate, input.owner.privateKeyPem),
  };
}

export function verifyDeviceCertificate(
  certificate: DeviceCertificate,
  ownerPublicKeyPem: string,
): boolean {
  if (deriveOwnerId(ownerPublicKeyPem) !== certificate.ownerId) {
    return false;
  }

  if (deriveDeviceId(certificate.devicePublicKeyPem) !== certificate.deviceId) {
    return false;
  }

  return verifyCanonicalPayload(
    deviceCertificateForSigning(certificate),
    certificate.signature,
    ownerPublicKeyPem,
  );
}

/**
 * Create an agent credential signed by the owner.
 * The credential links the agent's public key to the owner and defines
 * what intents the agent is allowed to send.
 */
export function createAgentCredential(input: CreateAgentCredentialInput): AgentCredential {
  const unsignedCredential = createUnsignedAgentCredential({
    ownerId: input.owner.ownerId,
    ownerPublicKeyPem: input.owner.publicKeyPem,
    agentId: input.agent.agentId,
    agentPeerId: input.agent.agentPeerId,
    agentPublicKeyPem: input.agent.publicKeyPem,
    scope: input.scope,
    credentialId: input.credentialId,
    issuedAt: input.issuedAt,
    expiresAt: input.expiresAt,
  });

  return {
    ...unsignedCredential,
    signature: signCanonicalPayload(unsignedCredential, input.owner.privateKeyPem),
  };
}

/**
 * Verify an agent credential using the owner's public key.
 * Returns true if:
 * 1. The owner's public key matches ownerId
 * 2. The agent's public key matches agentPublicKeyPem
 * 3. The agent's peer ID matches agentPeerId
 * 4. The signature is valid
 */
export function verifyAgentCredential(
  credential: AgentCredential,
  ownerPublicKeyPem = credential.ownerPublicKeyPem,
): boolean {
  if (credential.ownerPublicKeyPem !== ownerPublicKeyPem) {
    return false;
  }

  if (deriveOwnerId(ownerPublicKeyPem) !== credential.ownerId) {
    return false;
  }

  if (deriveAgentId(credential.ownerId, credential.agentPublicKeyPem) !== credential.agentId) {
    return false;
  }

  return verifyCanonicalPayload(
    agentCredentialForSigning(credential),
    credential.signature,
    ownerPublicKeyPem,
  );
}

/**
 * Check if an agent credential is expired.
 * Returns true if expired or not yet valid.
 */
export function isAgentCredentialExpired(credential: AgentCredential): boolean {
  if (credential.expiresAt === null) {
    return false; // No expiration
  }

  const now = new Date();
  const expiresAt = new Date(credential.expiresAt);
  return now > expiresAt;
}

export function createDeviceRevocationRecord(
  input: CreateDeviceRevocationRecordInput,
): DeviceRevocationRecord {
  const unsignedRecord: UnsignedDeviceRevocationRecord = {
    version: "0.1",
    revocationId: input.revocationId ?? `revocation_${randomUUID()}`,
    ownerId: input.owner.ownerId,
    deviceId: input.deviceId,
    certificateId: input.certificateId,
    reason: input.reason,
    revokedAt: input.revokedAt ?? new Date().toISOString(),
  };

  return {
    ...unsignedRecord,
    signature: signCanonicalPayload(unsignedRecord, input.owner.privateKeyPem),
  };
}

export function verifyDeviceRevocationRecord(
  record: DeviceRevocationRecord,
  ownerPublicKeyPem: string,
): boolean {
  if (deriveOwnerId(ownerPublicKeyPem) !== record.ownerId) {
    return false;
  }

  return verifyCanonicalPayload(
    deviceRevocationRecordForSigning(record),
    record.signature,
    ownerPublicKeyPem,
  );
}

export function isDeviceRevoked(
  certificate: DeviceCertificate,
  records: readonly DeviceRevocationRecord[],
  ownerPublicKeyPem: string,
): boolean {
  return records.some((record) => {
    if (!verifyDeviceRevocationRecord(record, ownerPublicKeyPem)) {
      return false;
    }

    if (record.ownerId !== certificate.ownerId || record.deviceId !== certificate.deviceId) {
      return false;
    }

    return !record.certificateId || record.certificateId === certificate.certificateId;
  });
}

export function signUnsignedEnvelope<TPayload>(
  envelope: UnsignedEnvoyEnvelope<TPayload>,
  privateKeyPem: string,
): EnvoyEnvelope<TPayload> {
  const signature = signCanonicalPayload(envelope, privateKeyPem);

  return {
    ...envelope,
    signature,
  };
}

export function verifyEnvelope(envelope: EnvoyEnvelope): boolean {
  if (derivePeerId(envelope.senderPublicKey) !== envelope.senderPeerId) {
    return false;
  }

  return verifyCanonicalPayload(
    envelopeForSigning(envelope),
    envelope.signature,
    envelope.senderPublicKey,
  );
}

/** Inbound verification: agent envelopes use {@link verifyAgentEnvelope}; device/human use {@link verifyEnvelope}. */
export function verifyInboundEnvelope(envelope: EnvoyEnvelope): boolean {
  if (envelope.senderRole === "agent" && envelope.agentCredential) {
    return verifyAgentEnvelope(envelope);
  }
  return verifyEnvelope(envelope);
}

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
export function verifyAgentEnvelope(
  envelope: EnvoyEnvelope,
  ownerPublicKeyPem = envelope.agentCredential?.ownerPublicKeyPem ?? "",
): boolean {
  // Agent credential must be present
  if (!envelope.agentCredential) {
    return false;
  }

  // Verify the agent credential signature first
  if (!verifyAgentCredential(envelope.agentCredential, ownerPublicKeyPem)) {
    return false;
  }

  // Check that senderPeerId matches the agent's peer ID from the credential
  if (envelope.senderPeerId !== envelope.agentCredential.agentPeerId) {
    return false;
  }

  // Verify envelope signature using the agent's public key
  if (!verifyCanonicalPayload(
    envelopeForSigning(envelope),
    envelope.signature,
    envelope.senderPublicKey,
  )) {
    return false;
  }

  // Check expiration
  if (isAgentCredentialExpired(envelope.agentCredential)) {
    return false;
  }

  // Check scope: the intent must be in the allowed scope
  const scope = envelope.agentCredential.scope;
  if (!scope.includes(envelope.intent)) {
    return false;
  }

  return true;
}

export function verifyAuthorizedDeviceEnvelope(
  envelope: EnvoyEnvelope,
  certificate: DeviceCertificate,
  ownerPublicKeyPem: string,
): boolean {
  if (!verifyDeviceCertificate(certificate, ownerPublicKeyPem)) {
    return false;
  }

  if (envelope.senderPublicKey !== certificate.devicePublicKeyPem) {
    return false;
  }

  return verifyEnvelope(envelope);
}

export function createAuthChallengeResponse(
  input: CreateChallengeResponseInput,
): AuthChallengeResponsePayload {
  const responseWithoutProof = {
    challengeId: input.challenge.challengeId,
    nonce: input.challenge.nonce,
    responderOwnerId: input.deviceCertificate.ownerId,
    responderDeviceId: input.deviceCertificate.deviceId,
    ownerPublicKeyPem: input.ownerPublicKeyPem,
    deviceCertificate: input.deviceCertificate,
    proof: "",
  };

  return {
    ...responseWithoutProof,
    proof: signCanonicalPayload(
      authChallengeProofForSigning(responseWithoutProof),
      input.devicePrivateKeyPem,
    ),
  };
}

export function verifyAuthChallengeResponse(
  challenge: AuthChallengePayload,
  response: AuthChallengeResponsePayload,
): boolean {
  if (challenge.challengeId !== response.challengeId || challenge.nonce !== response.nonce) {
    return false;
  }

  if (!verifyDeviceCertificate(response.deviceCertificate, response.ownerPublicKeyPem)) {
    return false;
  }

  if (response.responderOwnerId !== response.deviceCertificate.ownerId) {
    return false;
  }

  if (response.responderDeviceId !== response.deviceCertificate.deviceId) {
    return false;
  }

  return verifyCanonicalPayload(
    authChallengeProofForSigning(response),
    response.proof,
    response.deviceCertificate.devicePublicKeyPem,
  );
}

export function signMandate(input: CreateMandateInput): Mandate {
  if (input.unsignedMandate.ownerId !== input.owner.ownerId) {
    throw new Error("Mandate owner does not match signing owner");
  }

  return {
    ...input.unsignedMandate,
    signature: signCanonicalPayload(input.unsignedMandate, input.owner.privateKeyPem),
  };
}

export function verifyMandate(mandate: Mandate, ownerPublicKeyPem: string): boolean {
  if (deriveOwnerId(ownerPublicKeyPem) !== mandate.ownerId) {
    return false;
  }

  return verifyCanonicalPayload(
    mandateForSigning(mandate),
    mandate.signature,
    ownerPublicKeyPem,
  );
}

export function createProofOfIntent(input: CreateProofOfIntentInput): ProofOfIntent {
  const unsignedProof = {
    version: "0.1" as const,
    mandateId: input.mandate.mandateId,
    mandateHash: hashCanonicalPayload(input.mandate),
    taskId: input.taskId,
    requestIntent: input.requestIntent,
    nonce: input.nonce ?? randomUUID(),
    deviceId: input.device.deviceId,
  };

  return {
    ...unsignedProof,
    proof: signCanonicalPayload(unsignedProof, input.device.privateKeyPem),
  };
}

export function verifyProofOfIntent(
  proof: ProofOfIntent,
  mandate: Mandate,
  deviceCertificate: DeviceCertificate,
  ownerPublicKeyPem: string,
): boolean {
  if (!verifyMandate(mandate, ownerPublicKeyPem)) {
    return false;
  }

  if (!verifyDeviceCertificate(deviceCertificate, ownerPublicKeyPem)) {
    return false;
  }

  if (proof.mandateId !== mandate.mandateId) {
    return false;
  }

  if (proof.mandateHash !== hashCanonicalPayload(mandate)) {
    return false;
  }

  if (proof.deviceId !== deviceCertificate.deviceId) {
    return false;
  }

  if (mandate.issuedToDeviceId !== deviceCertificate.deviceId) {
    return false;
  }

  return verifyCanonicalPayload(
    proofOfIntentForSigning(proof),
    proof.proof,
    deviceCertificate.devicePublicKeyPem,
  );
}

export function signCanonicalPayload(input: unknown, privateKeyPem: string): string {
  const payload = Buffer.from(canonicalJson(input), "utf8");
  return cryptoSign(null, payload, privateKeyPem).toString("base64url");
}

export function hashCanonicalPayload(input: unknown): string {
  return createHash("sha256").update(canonicalJson(input)).digest("base64url");
}

export function verifyCanonicalPayload(
  input: unknown,
  signature: string,
  publicKeyPem: string,
): boolean {
  // Match the mobile-identity contract: malformed PEM or signature bytes
  // should not throw — return false so callers can branch on the boolean.
  try {
    const payload = Buffer.from(canonicalJson(input), "utf8");
    return cryptoVerify(null, payload, publicKeyPem, Buffer.from(signature, "base64url"));
  } catch {
    return false;
  }
}

export function createSignedDataTransferVoucher(input: {
  unsigned: UnsignedDataTransferVoucher;
  devicePrivateKeyPem: string;
}): DataTransferVoucher {
  return {
    ...input.unsigned,
    signature: signCanonicalPayload(input.unsigned, input.devicePrivateKeyPem),
  };
}

export function verifyDataTransferVoucher(
  voucher: DataTransferVoucher,
  devicePublicKeyPem: string,
): boolean {
  return verifyCanonicalPayload(
    dataTransferVoucherForSigning(voucher),
    voucher.signature,
    devicePublicKeyPem,
  );
}

export function signHumanProfile(
  payload: Omit<HumanProfilePayload, "signature">,
  ownerPrivateKeyPem: string,
): HumanProfilePayload {
  return {
    ...payload,
    signature: signCanonicalPayload(payload, ownerPrivateKeyPem),
  };
}

export function verifyHumanProfile(
  profile: HumanProfilePayload,
  ownerPublicKeyPem: string,
): boolean {
  if (deriveOwnerId(ownerPublicKeyPem) !== profile.ownerId) {
    return false;
  }
  return verifyCanonicalPayload(humanProfileForSigning(profile), profile.signature, ownerPublicKeyPem);
}

export function signFriendMatchingPreferences(
  payload: Omit<FriendMatchingPreferencesPayload, "signature">,
  ownerPrivateKeyPem: string,
): FriendMatchingPreferencesPayload {
  const signature = signCanonicalPayload(payload, ownerPrivateKeyPem);
  return createFriendMatchingPreferencesPayload({
    ownerId: payload.ownerId,
    text: payload.text,
    expiresAt: payload.expiresAt,
    signature,
  });
}

export function verifyFriendMatchingPreferences(
  prefs: FriendMatchingPreferencesPayload,
  ownerPublicKeyPem: string,
): boolean {
  if (deriveOwnerId(ownerPublicKeyPem) !== prefs.ownerId) {
    return false;
  }
  return verifyCanonicalPayload(friendMatchingPreferencesForSigning(prefs), prefs.signature, ownerPublicKeyPem);
}

function randomCertificateId(): string {
  return `cert_${randomUUID()}`;
}

// ---------------------------------------------------------------------------
// ECDH key exchange for shared-identity owner-key transfer (Phase 11).
//
// Crypto stack: Ed25519 via `node:crypto`, ECDH P-256 + HKDF + AES-256-GCM
// via Web Crypto (`crypto.subtle`). The two stacks are intentionally mixed
// here because Node 18+ exposes `crypto.subtle` and `@noble/curves` does
// not yet ship a stable P-256 across all supported runtimes. The same
// approach is mirrored in `@envoymesh/mobile-identity`; keep them in sync
// if a stable `@noble/curves/p256` is adopted on both sides.
// ---------------------------------------------------------------------------

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
export async function encryptOwnerKeyForDevice(
  ownerPrivateKeyPem: string,
  peerEcdhPublicKeyRaw: Uint8Array,
): Promise<EncryptedOwnerKey> {
  // Generate ephemeral ECDH P-256 keypair
  const ephemeralKeyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );

  // Export ephemeral public key
  const ephemeralPubKeyRaw = new Uint8Array(
    await crypto.subtle.exportKey("raw", ephemeralKeyPair.publicKey),
  );

  // Import peer's public key
  const peerPubKey = await crypto.subtle.importKey(
    "raw",
    peerEcdhPublicKeyRaw.buffer as ArrayBuffer,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );

  // Derive shared secret bits
  const sharedBits = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "ECDH", public: peerPubKey },
      ephemeralKeyPair.privateKey,
      256,
    ) as ArrayBuffer,
  );

  // Derive AES key via HKDF
  const hkdfKey = await crypto.subtle.importKey(
    "raw",
    sharedBits.buffer as ArrayBuffer,
    { name: "HKDF" },
    false,
    ["deriveKey"],
  );

  const info = new TextEncoder().encode("envoymesh:owner-key-wrap:v1");
  const aesKey = await crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0).buffer as ArrayBuffer, info },
    hkdfKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );

  // Encrypt
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(ownerPrivateKeyPem);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      aesKey,
      plaintext.buffer as ArrayBuffer,
    ) as ArrayBuffer,
  );

  // Split ciphertext into encrypted data + auth tag (GCM appends 16-byte tag)
  const encryptedContent = ciphertext.slice(0, ciphertext.length - 16);
  const authTag = ciphertext.slice(ciphertext.length - 16);

  return {
    encryptedKey: bytesToBase64url(encryptedContent),
    ephemeralPublicKey: bytesToBase64url(ephemeralPubKeyRaw),
    iv: bytesToBase64url(iv),
    authTag: bytesToBase64url(authTag),
  };
}

function bytesToBase64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}
