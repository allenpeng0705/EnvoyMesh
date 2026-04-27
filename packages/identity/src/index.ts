import {
  authChallengeProofForSigning,
  canonicalJson,
  deviceCertificateForSigning,
  deviceRevocationRecordForSigning,
  envelopeForSigning,
  mandateForSigning,
  proofOfIntentForSigning,
  type AuthChallengePayload,
  type AuthChallengeResponsePayload,
  type Capability,
  type DeviceCertificate,
  type DeviceProfile,
  type DeviceRevocationRecord,
  type DeviceRevocationReason,
  type EnvoyEnvelope,
  type EnvoyIntent,
  type Mandate,
  type ProofOfIntent,
  type PublicIdentity,
  type UnsignedMandate,
  type UnsignedDeviceCertificate,
  type UnsignedDeviceRevocationRecord,
  type UnsignedEnvoyEnvelope,
  type UnsignedDataTransferVoucher,
  type DataTransferVoucher,
  dataTransferVoucherForSigning,
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
  return `envoy_${createHash("sha256").update(publicKeyPem).digest("base64url")}`;
}

export function deriveOwnerId(publicKeyPem: string): string {
  return `envoy:owner:${createHash("sha256").update(publicKeyPem).digest("base64url")}`;
}

export function deriveDeviceId(publicKeyPem: string): string {
  return `envoy:device:${createHash("sha256").update(publicKeyPem).digest("base64url")}`;
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

function randomCertificateId(): string {
  return `cert_${randomUUID()}`;
}
