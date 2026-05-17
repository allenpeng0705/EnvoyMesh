/**
 * Mobile-compatible identity primitives using @noble/curves and @noble/hashes.
 *
 * Provides equivalent functionality to @envoymesh/identity but uses pure-JS
 * crypto that works in browsers, WebViews, and Node.js — no `node:crypto`.
 *
 * PEM format for Ed25519:
 * - PUBLIC KEY:  SPKI   (44 DER bytes → PEM)
 * - PRIVATE KEY: PKCS8  (48 DER bytes → PEM)
 */
import { ed25519 } from "@noble/curves/ed25519";
import { sha256 } from "@noble/hashes/sha256";
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
  dataTransferVoucherForSigning,
  humanProfileForSigning,
} from "@envoymesh/protocol";
import type {
  AgentCredential,
  AuthChallengePayload,
  AuthChallengeResponsePayload,
  Capability,
  CreateUnsignedAgentCredentialInput,
  DeviceCertificate,
  DeviceProfile,
  DeviceRevocationRecord,
  DeviceRevocationReason,
  EnvoyEnvelope,
  EnvoyIntent,
  Mandate,
  ProofOfIntent,
  PublicIdentity,
  UnsignedAgentCredential,
  UnsignedMandate,
  UnsignedDeviceCertificate,
  UnsignedDeviceRevocationRecord,
  UnsignedEnvoyEnvelope,
  UnsignedDataTransferVoucher,
  DataTransferVoucher,
  HumanProfilePayload,
} from "@envoymesh/protocol";

// ---------------------------------------------------------------------------
// Type exports (compatible with @envoymesh/identity)
// ---------------------------------------------------------------------------

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

export { canonicalJson };

// ---------------------------------------------------------------------------
// PEM encode / decode for Ed25519 (pure JS)
// ---------------------------------------------------------------------------

/**
 * SPKI DER prefix for Ed25519 public key (12 bytes).
 */
const ED25519_SPKI_PREFIX = new Uint8Array([
  0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00,
]);

/**
 * PKCS8 DER prefix for Ed25519 private key (16 bytes).
 */
const ED25519_PKCS8_PREFIX = new Uint8Array([
  0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20,
]);

function base64urlToBytes(base64url: string): Uint8Array {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = base64.length % 4 ? "=".repeat(4 - (base64.length % 4)) : "";
  const binary = atob(base64 + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function bytesToBase64url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function rawPublicKeyToPem(rawKey: Uint8Array): string {
  const der = new Uint8Array(ED25519_SPKI_PREFIX.length + rawKey.length);
  der.set(ED25519_SPKI_PREFIX);
  der.set(rawKey, ED25519_SPKI_PREFIX.length);
  const b64 = bytesToBase64url(der);
  // PEM line-wrap at 64 chars
  const lines: string[] = [];
  for (let i = 0; i < b64.length; i += 64) {
    lines.push(b64.slice(i, i + 64));
  }
  return `-----BEGIN PUBLIC KEY-----\n${lines.join("\n")}\n-----END PUBLIC KEY-----\n`;
}

function rawPrivateKeyToPem(rawKey: Uint8Array): string {
  const der = new Uint8Array(ED25519_PKCS8_PREFIX.length + rawKey.length);
  der.set(ED25519_PKCS8_PREFIX);
  der.set(rawKey, ED25519_PKCS8_PREFIX.length);
  const b64 = bytesToBase64url(der);
  const lines: string[] = [];
  for (let i = 0; i < b64.length; i += 64) {
    lines.push(b64.slice(i, i + 64));
  }
  return `-----BEGIN PRIVATE KEY-----\n${lines.join("\n")}\n-----END PRIVATE KEY-----\n`;
}

function pemToRawKey(pem: string, expectedPrefixLen: number): Uint8Array {
  const b64 = pem
    .replace(/-----(BEGIN|END) (PUBLIC|PRIVATE) KEY-----/g, "")
    .replace(/\s/g, "");
  return base64urlToBytes(b64).slice(expectedPrefixLen);
}

// ---------------------------------------------------------------------------
// Crypto primitives
// ---------------------------------------------------------------------------

export function generateEd25519KeyPair(): EnvoyKeyPair {
  const privateKey = ed25519.utils.randomPrivateKey();
  const publicKey = ed25519.getPublicKey(privateKey);
  return {
    publicKeyPem: rawPublicKeyToPem(publicKey),
    privateKeyPem: rawPrivateKeyToPem(privateKey),
  };
}

export function signCanonicalPayload(input: unknown, privateKeyPem: string): string {
  const rawKey = pemToRawKey(privateKeyPem, ED25519_PKCS8_PREFIX.length);
  const payload = new TextEncoder().encode(canonicalJson(input));
  const signature = ed25519.sign(payload, rawKey);
  return bytesToBase64url(signature);
}

export function verifyCanonicalPayload(
  input: unknown,
  signature: string,
  publicKeyPem: string,
): boolean {
  try {
    const rawKey = pemToRawKey(publicKeyPem, ED25519_SPKI_PREFIX.length);
    const payload = new TextEncoder().encode(canonicalJson(input));
    const sigBytes = base64urlToBytes(signature);
    return ed25519.verify(sigBytes, payload, rawKey);
  } catch {
    return false;
  }
}

export function hashCanonicalPayload(input: unknown): string {
  const payload = new TextEncoder().encode(canonicalJson(input));
  const digest = sha256(payload);
  return bytesToBase64url(digest);
}

/** Hash a raw string directly (no canonical JSON wrapping). Used for identity derivation from PEM strings. */
function hashDirect(input: string): string {
  const digest = sha256(new TextEncoder().encode(input));
  return bytesToBase64url(digest);
}

function randomUUID(): string {
  return crypto.randomUUID();
}

// ---------------------------------------------------------------------------
// Identity derivation
// ---------------------------------------------------------------------------

export function derivePeerId(publicKeyPem: string): string {
  return `envoy_${hashDirect(publicKeyPem)}`;
}

export function deriveOwnerId(publicKeyPem: string): string {
  return `envoy:owner:${hashDirect(publicKeyPem)}`;
}

export function deriveDeviceId(publicKeyPem: string): string {
  return `envoy:device:${hashDirect(publicKeyPem)}`;
}

export function deriveAgentId(ownerId: string, agentPublicKeyPem: string): string {
  return `envoy:agent:${bytesToBase64url(sha256(new TextEncoder().encode(ownerId + agentPublicKeyPem)))}`;
}

// ---------------------------------------------------------------------------
// Identity generation
// ---------------------------------------------------------------------------

export function generateIdentity(): EnvoyIdentity {
  const { publicKeyPem, privateKeyPem } = generateEd25519KeyPair();
  return { peerId: derivePeerId(publicKeyPem), publicKeyPem, privateKeyPem };
}

export function generateOwnerIdentity(): OwnerIdentity {
  const { publicKeyPem, privateKeyPem } = generateEd25519KeyPair();
  return { ownerId: deriveOwnerId(publicKeyPem), publicKeyPem, privateKeyPem };
}

export function generateDeviceIdentity(): DeviceIdentity {
  const { publicKeyPem, privateKeyPem } = generateEd25519KeyPair();
  return { deviceId: deriveDeviceId(publicKeyPem), publicKeyPem, privateKeyPem };
}

export function generateAgentIdentity(ownerId: string): AgentIdentity {
  const { publicKeyPem, privateKeyPem } = generateEd25519KeyPair();
  return {
    agentId: deriveAgentId(ownerId, publicKeyPem),
    agentPeerId: `envoy_agent_${bytesToBase64url(sha256(new TextEncoder().encode(ownerId + publicKeyPem)))}`,
    publicKeyPem,
    privateKeyPem,
  };
}

// ---------------------------------------------------------------------------
// Public identity helpers
// ---------------------------------------------------------------------------

export function toPublicOwnerIdentity(owner: OwnerIdentity): PublicIdentity {
  return { id: owner.ownerId, publicKeyPem: owner.publicKeyPem };
}

export function toPublicDeviceIdentity(device: DeviceIdentity): PublicIdentity {
  return { id: device.deviceId, publicKeyPem: device.publicKeyPem };
}

// ---------------------------------------------------------------------------
// Device certificates
// ---------------------------------------------------------------------------

function randomCertificateId(): string {
  return `cert_${randomUUID()}`;
}

export function createDeviceCertificate(input: CreateDeviceCertificateInput): DeviceCertificate {
  const unsigned: UnsignedDeviceCertificate = {
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
  return { ...unsigned, signature: signCanonicalPayload(unsigned, input.owner.privateKeyPem) };
}

export function verifyDeviceCertificate(
  certificate: DeviceCertificate,
  ownerPublicKeyPem: string,
): boolean {
  if (deriveOwnerId(ownerPublicKeyPem) !== certificate.ownerId) return false;
  if (deriveDeviceId(certificate.devicePublicKeyPem) !== certificate.deviceId) return false;
  return verifyCanonicalPayload(
    deviceCertificateForSigning(certificate),
    certificate.signature,
    ownerPublicKeyPem,
  );
}

// ---------------------------------------------------------------------------
// Agent credentials
// ---------------------------------------------------------------------------

export function createAgentCredential(input: CreateAgentCredentialInput): AgentCredential {
  const unsigned = createUnsignedAgentCredential({
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
  return { ...unsigned, signature: signCanonicalPayload(unsigned, input.owner.privateKeyPem) };
}

export function verifyAgentCredential(
  credential: AgentCredential,
  ownerPublicKeyPem = credential.ownerPublicKeyPem,
): boolean {
  if (credential.ownerPublicKeyPem !== ownerPublicKeyPem) return false;
  if (deriveOwnerId(ownerPublicKeyPem) !== credential.ownerId) return false;
  if (deriveAgentId(credential.ownerId, credential.agentPublicKeyPem) !== credential.agentId) return false;
  return verifyCanonicalPayload(
    agentCredentialForSigning(credential),
    credential.signature,
    ownerPublicKeyPem,
  );
}

export function isAgentCredentialExpired(credential: AgentCredential): boolean {
  if (credential.expiresAt === null) return false;
  return new Date() > new Date(credential.expiresAt);
}

// ---------------------------------------------------------------------------
// Device revocation
// ---------------------------------------------------------------------------

export function createDeviceRevocationRecord(
  input: CreateDeviceRevocationRecordInput,
): DeviceRevocationRecord {
  const unsigned: UnsignedDeviceRevocationRecord = {
    version: "0.1",
    revocationId: input.revocationId ?? `revocation_${randomUUID()}`,
    ownerId: input.owner.ownerId,
    deviceId: input.deviceId,
    certificateId: input.certificateId,
    reason: input.reason,
    revokedAt: input.revokedAt ?? new Date().toISOString(),
  };
  return { ...unsigned, signature: signCanonicalPayload(unsigned, input.owner.privateKeyPem) };
}

export function verifyDeviceRevocationRecord(
  record: DeviceRevocationRecord,
  ownerPublicKeyPem: string,
): boolean {
  if (deriveOwnerId(ownerPublicKeyPem) !== record.ownerId) return false;
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
    if (!verifyDeviceRevocationRecord(record, ownerPublicKeyPem)) return false;
    if (record.ownerId !== certificate.ownerId || record.deviceId !== certificate.deviceId) return false;
    return !record.certificateId || record.certificateId === certificate.certificateId;
  });
}

// ---------------------------------------------------------------------------
// Envelope signing / verification
// ---------------------------------------------------------------------------

export function signUnsignedEnvelope<TPayload>(
  envelope: UnsignedEnvoyEnvelope<TPayload>,
  privateKeyPem: string,
): EnvoyEnvelope<TPayload> {
  return { ...envelope, signature: signCanonicalPayload(envelope, privateKeyPem) };
}

export function verifyEnvelope(envelope: EnvoyEnvelope): boolean {
  if (derivePeerId(envelope.senderPublicKey) !== envelope.senderPeerId) return false;
  return verifyCanonicalPayload(
    envelopeForSigning(envelope),
    envelope.signature,
    envelope.senderPublicKey,
  );
}

export function verifyAgentEnvelope(
  envelope: EnvoyEnvelope,
  ownerPublicKeyPem = envelope.agentCredential?.ownerPublicKeyPem ?? "",
): boolean {
  if (!envelope.agentCredential) return false;
  if (!verifyAgentCredential(envelope.agentCredential, ownerPublicKeyPem)) return false;
  if (envelope.senderPeerId !== envelope.agentCredential.agentPeerId) return false;
  if (!verifyCanonicalPayload(
    envelopeForSigning(envelope),
    envelope.signature,
    envelope.senderPublicKey,
  )) return false;
  if (isAgentCredentialExpired(envelope.agentCredential)) return false;
  const scope = envelope.agentCredential.scope;
  if (!scope.includes(envelope.intent)) return false;
  return true;
}

export function verifyAuthorizedDeviceEnvelope(
  envelope: EnvoyEnvelope,
  certificate: DeviceCertificate,
  ownerPublicKeyPem: string,
): boolean {
  if (!verifyDeviceCertificate(certificate, ownerPublicKeyPem)) return false;
  if (envelope.senderPublicKey !== certificate.devicePublicKeyPem) return false;
  return verifyEnvelope(envelope);
}

// ---------------------------------------------------------------------------
// Auth challenge
// ---------------------------------------------------------------------------

export function createAuthChallengeResponse(
  input: CreateChallengeResponseInput,
): AuthChallengeResponsePayload {
  const proofPayload = {
    challengeId: input.challenge.challengeId,
    nonce: input.challenge.nonce,
    responderOwnerId: input.deviceCertificate.ownerId,
    responderDeviceId: input.deviceCertificate.deviceId,
    ownerPublicKeyPem: input.ownerPublicKeyPem,
    deviceCertificate: input.deviceCertificate,
    proof: "",
  };
  return {
    ...proofPayload,
    proof: signCanonicalPayload(
      authChallengeProofForSigning(proofPayload),
      input.devicePrivateKeyPem,
    ),
  };
}

export function verifyAuthChallengeResponse(
  challenge: AuthChallengePayload,
  response: AuthChallengeResponsePayload,
): boolean {
  if (challenge.challengeId !== response.challengeId || challenge.nonce !== response.nonce) return false;
  if (!verifyDeviceCertificate(response.deviceCertificate, response.ownerPublicKeyPem)) return false;
  if (response.responderOwnerId !== response.deviceCertificate.ownerId) return false;
  if (response.responderDeviceId !== response.deviceCertificate.deviceId) return false;
  return verifyCanonicalPayload(
    authChallengeProofForSigning(response),
    response.proof,
    response.deviceCertificate.devicePublicKeyPem,
  );
}

// ---------------------------------------------------------------------------
// Mandates
// ---------------------------------------------------------------------------

export function signMandate(input: CreateMandateInput): Mandate {
  if (input.unsignedMandate.ownerId !== input.owner.ownerId) {
    throw new Error("Mandate owner does not match signing owner");
  }
  return { ...input.unsignedMandate, signature: signCanonicalPayload(input.unsignedMandate, input.owner.privateKeyPem) };
}

export function verifyMandate(mandate: Mandate, ownerPublicKeyPem: string): boolean {
  if (deriveOwnerId(ownerPublicKeyPem) !== mandate.ownerId) return false;
  return verifyCanonicalPayload(mandateForSigning(mandate), mandate.signature, ownerPublicKeyPem);
}

// ---------------------------------------------------------------------------
// Proof of intent
// ---------------------------------------------------------------------------

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
  if (!verifyMandate(mandate, ownerPublicKeyPem)) return false;
  if (!verifyDeviceCertificate(deviceCertificate, ownerPublicKeyPem)) return false;
  if (proof.mandateId !== mandate.mandateId) return false;
  if (proof.mandateHash !== hashCanonicalPayload(mandate)) return false;
  if (proof.deviceId !== deviceCertificate.deviceId) return false;
  if (mandate.issuedToDeviceId !== deviceCertificate.deviceId) return false;
  return verifyCanonicalPayload(
    proofOfIntentForSigning(proof),
    proof.proof,
    deviceCertificate.devicePublicKeyPem,
  );
}

// ---------------------------------------------------------------------------
// Data transfer vouchers
// ---------------------------------------------------------------------------

export function createSignedDataTransferVoucher(input: {
  unsigned: UnsignedDataTransferVoucher;
  devicePrivateKeyPem: string;
}): DataTransferVoucher {
  return { ...input.unsigned, signature: signCanonicalPayload(input.unsigned, input.devicePrivateKeyPem) };
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

// ---------------------------------------------------------------------------
// Human profile
// ---------------------------------------------------------------------------

export function signHumanProfile(
  payload: Omit<HumanProfilePayload, "signature">,
  ownerPrivateKeyPem: string,
): HumanProfilePayload {
  return { ...payload, signature: signCanonicalPayload(payload, ownerPrivateKeyPem) };
}

export function verifyHumanProfile(
  profile: HumanProfilePayload,
  ownerPublicKeyPem: string,
): boolean {
  if (deriveOwnerId(ownerPublicKeyPem) !== profile.ownerId) return false;
  return verifyCanonicalPayload(humanProfileForSigning(profile), profile.signature, ownerPublicKeyPem);
}

// ---------------------------------------------------------------------------
// ECDH key exchange for shared-identity owner-key transfer (Phase 11)
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
 * Generate an ECDH P-256 keypair for owner-key transfer.
 * Returns the public key raw bytes (65 bytes uncompressed) as base64url,
 * and the private key as a CryptoKey (stored in memory for the pairing session).
 */
export async function generateEcdhKeyPair(): Promise<{
  publicKeyRaw: Uint8Array;
  privateKey: CryptoKey;
}> {
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  const publicKeyRaw = new Uint8Array(
    await crypto.subtle.exportKey("raw", keyPair.publicKey),
  );
  return { publicKeyRaw, privateKey: keyPair.privateKey };
}

/**
 * Encrypt the owner private key for secure transfer to a mobile device.
 * Uses ECDH over P-256 + HKDF-SHA-256 + AES-256-GCM.
 * Called by the home node during shared-identity pairing.
 */
export async function encryptOwnerKeyForDevice(
  ownerPrivateKeyPem: string,
  peerEcdhPublicKeyRaw: Uint8Array,
): Promise<EncryptedOwnerKey> {
  const ephemeralKeyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );

  const ephemeralPubKeyRaw = new Uint8Array(
    await crypto.subtle.exportKey("raw", ephemeralKeyPair.publicKey),
  );

  const peerPubKey = await crypto.subtle.importKey(
    "raw", peerEcdhPublicKeyRaw.buffer as ArrayBuffer,
    { name: "ECDH", namedCurve: "P-256" },
    false, [],
  );

  const sharedBits = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "ECDH", public: peerPubKey },
      ephemeralKeyPair.privateKey,
      256,
    ) as ArrayBuffer,
  );

  const hkdfKey = await crypto.subtle.importKey(
    "raw", sharedBits.buffer as ArrayBuffer,
    { name: "HKDF" }, false, ["deriveKey"],
  );

  const info = new TextEncoder().encode("envoymesh:owner-key-wrap:v1");
  const aesKey = await crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0).buffer as ArrayBuffer, info },
    hkdfKey,
    { name: "AES-GCM", length: 256 },
    false, ["encrypt"],
  );

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(ownerPrivateKeyPem);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, plaintext) as ArrayBuffer,
  );

  const encryptedContent = ciphertext.slice(0, ciphertext.length - 16);
  const authTag = ciphertext.slice(ciphertext.length - 16);

  return {
    encryptedKey: bytesToBase64url(encryptedContent),
    ephemeralPublicKey: bytesToBase64url(ephemeralPubKeyRaw),
    iv: bytesToBase64url(iv),
    authTag: bytesToBase64url(authTag),
  };
}

/**
 * Decrypt the owner private key received from the home node.
 * Uses the mobile device's ECDH private key + the ephemeral public key from the home node.
 */
export async function decryptOwnerKeyFromDevice(
  encrypted: EncryptedOwnerKey,
  deviceEcdhPrivateKey: CryptoKey,
): Promise<string> {
  const ephemeralPubKey = await crypto.subtle.importKey(
    "raw",
    base64urlToBytes(encrypted.ephemeralPublicKey).buffer as ArrayBuffer,
    { name: "ECDH", namedCurve: "P-256" },
    false, [],
  );

  const sharedBits = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "ECDH", public: ephemeralPubKey },
      deviceEcdhPrivateKey,
      256,
    ) as ArrayBuffer,
  );

  const hkdfKey = await crypto.subtle.importKey(
    "raw", sharedBits.buffer as ArrayBuffer,
    { name: "HKDF" }, false, ["deriveKey"],
  );

  const info = new TextEncoder().encode("envoymesh:owner-key-wrap:v1");
  const aesKey = await crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0).buffer as ArrayBuffer, info },
    hkdfKey,
    { name: "AES-GCM", length: 256 },
    false, ["decrypt"],
  );

  // Reconstruct ciphertext with auth tag appended
  const encryptedContent = base64urlToBytes(encrypted.encryptedKey);
  const authTag = base64urlToBytes(encrypted.authTag);
  const ciphertext = new Uint8Array(encryptedContent.length + authTag.length);
  ciphertext.set(encryptedContent);
  ciphertext.set(authTag, encryptedContent.length);

  const plaintext = new Uint8Array(
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64urlToBytes(encrypted.iv).buffer as ArrayBuffer },
      aesKey,
      ciphertext.buffer as ArrayBuffer,
    ) as ArrayBuffer,
  );

  return new TextDecoder().decode(plaintext);
}
