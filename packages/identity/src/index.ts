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
  type CreateUnsignedAgentCredentialInput,
  type DeviceCertificate,
  type DeviceProfile,
  type DeviceRevocationRecord,
  type DeviceRevocationReason,
  type EnvoyEnvelope,
  type EnvoyIntent,
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
  type HumanProfilePayload,
} from "@envoymesh/protocol";
import {
  createHash,
  generateKeyPairSync,
  randomUUID,
  sign as cryptoSign,
  verify as cryptoVerify,
} from "node:crypto";

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
  const payload = Buffer.from(canonicalJson(input), "utf8");
  return cryptoVerify(null, payload, publicKeyPem, Buffer.from(signature, "base64url"));
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

function randomCertificateId(): string {
  return `cert_${randomUUID()}`;
}
