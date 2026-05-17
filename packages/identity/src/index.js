import { agentCredentialForSigning, authChallengeProofForSigning, canonicalJson, createUnsignedAgentCredential, deviceCertificateForSigning, deviceRevocationRecordForSigning, envelopeForSigning, mandateForSigning, proofOfIntentForSigning, dataTransferVoucherForSigning, humanProfileForSigning, } from "@envoymesh/protocol";
import { createHash, generateKeyPairSync, randomUUID, sign as cryptoSign, verify as cryptoVerify, } from "node:crypto";
export function generateIdentity() {
    const { publicKeyPem, privateKeyPem } = generateEd25519KeyPair();
    return {
        peerId: derivePeerId(publicKeyPem),
        publicKeyPem,
        privateKeyPem,
    };
}
export function generateOwnerIdentity() {
    const { publicKeyPem, privateKeyPem } = generateEd25519KeyPair();
    return {
        ownerId: deriveOwnerId(publicKeyPem),
        publicKeyPem,
        privateKeyPem,
    };
}
export function generateDeviceIdentity() {
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
export function generateAgentIdentity(ownerId) {
    const { publicKeyPem, privateKeyPem } = generateEd25519KeyPair();
    return {
        agentId: deriveAgentId(ownerId, publicKeyPem),
        agentPeerId: `envoy_agent_${createHash("sha256").update(ownerId + publicKeyPem).digest("base64url")}`,
        publicKeyPem,
        privateKeyPem,
    };
}
export function generateEd25519KeyPair() {
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
export function derivePeerId(publicKeyPem) {
    /** Protocol / envelope only — distinct from libp2p `PeerId`; do not show as a user-facing “peer id”. */
    return `envoy_${createHash("sha256").update(publicKeyPem).digest("base64url")}`;
}
export function deriveOwnerId(publicKeyPem) {
    return `envoy:owner:${createHash("sha256").update(publicKeyPem).digest("base64url")}`;
}
export function deriveDeviceId(publicKeyPem) {
    return `envoy:device:${createHash("sha256").update(publicKeyPem).digest("base64url")}`;
}
/**
 * Derive an agent ID from the owner's ID and the agent's public key.
 * Format: envoy:agent:<sha256(ownerId + agentPublicKeyPem)>
 */
export function deriveAgentId(ownerId, agentPublicKeyPem) {
    return `envoy:agent:${createHash("sha256").update(ownerId + agentPublicKeyPem).digest("base64url")}`;
}
export function toPublicOwnerIdentity(owner) {
    return {
        id: owner.ownerId,
        publicKeyPem: owner.publicKeyPem,
    };
}
export function toPublicDeviceIdentity(device) {
    return {
        id: device.deviceId,
        publicKeyPem: device.publicKeyPem,
    };
}
export function createDeviceCertificate(input) {
    const unsignedCertificate = {
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
export function verifyDeviceCertificate(certificate, ownerPublicKeyPem) {
    if (deriveOwnerId(ownerPublicKeyPem) !== certificate.ownerId) {
        return false;
    }
    if (deriveDeviceId(certificate.devicePublicKeyPem) !== certificate.deviceId) {
        return false;
    }
    return verifyCanonicalPayload(deviceCertificateForSigning(certificate), certificate.signature, ownerPublicKeyPem);
}
/**
 * Create an agent credential signed by the owner.
 * The credential links the agent's public key to the owner and defines
 * what intents the agent is allowed to send.
 */
export function createAgentCredential(input) {
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
export function verifyAgentCredential(credential, ownerPublicKeyPem = credential.ownerPublicKeyPem) {
    if (credential.ownerPublicKeyPem !== ownerPublicKeyPem) {
        return false;
    }
    if (deriveOwnerId(ownerPublicKeyPem) !== credential.ownerId) {
        return false;
    }
    if (deriveAgentId(credential.ownerId, credential.agentPublicKeyPem) !== credential.agentId) {
        return false;
    }
    return verifyCanonicalPayload(agentCredentialForSigning(credential), credential.signature, ownerPublicKeyPem);
}
/**
 * Check if an agent credential is expired.
 * Returns true if expired or not yet valid.
 */
export function isAgentCredentialExpired(credential) {
    if (credential.expiresAt === null) {
        return false; // No expiration
    }
    const now = new Date();
    const expiresAt = new Date(credential.expiresAt);
    return now > expiresAt;
}
export function createDeviceRevocationRecord(input) {
    const unsignedRecord = {
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
export function verifyDeviceRevocationRecord(record, ownerPublicKeyPem) {
    if (deriveOwnerId(ownerPublicKeyPem) !== record.ownerId) {
        return false;
    }
    return verifyCanonicalPayload(deviceRevocationRecordForSigning(record), record.signature, ownerPublicKeyPem);
}
export function isDeviceRevoked(certificate, records, ownerPublicKeyPem) {
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
export function signUnsignedEnvelope(envelope, privateKeyPem) {
    const signature = signCanonicalPayload(envelope, privateKeyPem);
    return {
        ...envelope,
        signature,
    };
}
export function verifyEnvelope(envelope) {
    if (derivePeerId(envelope.senderPublicKey) !== envelope.senderPeerId) {
        return false;
    }
    return verifyCanonicalPayload(envelopeForSigning(envelope), envelope.signature, envelope.senderPublicKey);
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
export function verifyAgentEnvelope(envelope, ownerPublicKeyPem = envelope.agentCredential?.ownerPublicKeyPem ?? "") {
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
    if (!verifyCanonicalPayload(envelopeForSigning(envelope), envelope.signature, envelope.senderPublicKey)) {
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
export function verifyAuthorizedDeviceEnvelope(envelope, certificate, ownerPublicKeyPem) {
    if (!verifyDeviceCertificate(certificate, ownerPublicKeyPem)) {
        return false;
    }
    if (envelope.senderPublicKey !== certificate.devicePublicKeyPem) {
        return false;
    }
    return verifyEnvelope(envelope);
}
export function createAuthChallengeResponse(input) {
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
        proof: signCanonicalPayload(authChallengeProofForSigning(responseWithoutProof), input.devicePrivateKeyPem),
    };
}
export function verifyAuthChallengeResponse(challenge, response) {
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
    return verifyCanonicalPayload(authChallengeProofForSigning(response), response.proof, response.deviceCertificate.devicePublicKeyPem);
}
export function signMandate(input) {
    if (input.unsignedMandate.ownerId !== input.owner.ownerId) {
        throw new Error("Mandate owner does not match signing owner");
    }
    return {
        ...input.unsignedMandate,
        signature: signCanonicalPayload(input.unsignedMandate, input.owner.privateKeyPem),
    };
}
export function verifyMandate(mandate, ownerPublicKeyPem) {
    if (deriveOwnerId(ownerPublicKeyPem) !== mandate.ownerId) {
        return false;
    }
    return verifyCanonicalPayload(mandateForSigning(mandate), mandate.signature, ownerPublicKeyPem);
}
export function createProofOfIntent(input) {
    const unsignedProof = {
        version: "0.1",
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
export function verifyProofOfIntent(proof, mandate, deviceCertificate, ownerPublicKeyPem) {
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
    return verifyCanonicalPayload(proofOfIntentForSigning(proof), proof.proof, deviceCertificate.devicePublicKeyPem);
}
export function signCanonicalPayload(input, privateKeyPem) {
    const payload = Buffer.from(canonicalJson(input), "utf8");
    return cryptoSign(null, payload, privateKeyPem).toString("base64url");
}
export function hashCanonicalPayload(input) {
    return createHash("sha256").update(canonicalJson(input)).digest("base64url");
}
export function verifyCanonicalPayload(input, signature, publicKeyPem) {
    const payload = Buffer.from(canonicalJson(input), "utf8");
    return cryptoVerify(null, payload, publicKeyPem, Buffer.from(signature, "base64url"));
}
export function createSignedDataTransferVoucher(input) {
    return {
        ...input.unsigned,
        signature: signCanonicalPayload(input.unsigned, input.devicePrivateKeyPem),
    };
}
export function verifyDataTransferVoucher(voucher, devicePublicKeyPem) {
    return verifyCanonicalPayload(dataTransferVoucherForSigning(voucher), voucher.signature, devicePublicKeyPem);
}
export function signHumanProfile(payload, ownerPrivateKeyPem) {
    return {
        ...payload,
        signature: signCanonicalPayload(payload, ownerPrivateKeyPem),
    };
}
export function verifyHumanProfile(profile, ownerPublicKeyPem) {
    if (deriveOwnerId(ownerPublicKeyPem) !== profile.ownerId) {
        return false;
    }
    return verifyCanonicalPayload(humanProfileForSigning(profile), profile.signature, ownerPublicKeyPem);
}
function randomCertificateId() {
    return `cert_${randomUUID()}`;
}
//# sourceMappingURL=index.js.map