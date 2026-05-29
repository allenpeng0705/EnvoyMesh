import { signCanonicalPayload, verifyCanonicalPayload } from "@envoymesh/identity";
import { isAnonymousDiscoveryOwnerId } from "./discovery-privacy.js";
export function discoveryReferralAttestationForSigning(input) {
    return {
        referralOwnerId: input.referralOwnerId.trim(),
        requestMessageId: input.requestMessageId.trim(),
        correlationId: input.correlationId?.trim() || undefined,
        anonymizedRequesterId: input.anonymizedRequesterId.trim(),
    };
}
export function createDiscoveryReferralAttestation(input, referralOwnerPrivateKeyPem) {
    const unsigned = discoveryReferralAttestationForSigning(input);
    return {
        ...unsigned,
        signature: signCanonicalPayload(unsigned, referralOwnerPrivateKeyPem),
    };
}
export function verifyDiscoveryReferralAttestation(input) {
    const att = input.attestation;
    if (att.referralOwnerId.trim() !== input.expectedReferralOwnerId.trim()) {
        return { ok: false, reason: "referralOwnerId mismatch" };
    }
    if (att.anonymizedRequesterId.trim() !== input.expectedAnonymizedRequesterId.trim()) {
        return { ok: false, reason: "anonymizedRequesterId mismatch" };
    }
    if (input.expectedCorrelationId?.trim() &&
        att.correlationId?.trim() &&
        att.correlationId.trim() !== input.expectedCorrelationId.trim()) {
        return { ok: false, reason: "correlationId mismatch" };
    }
    const unsigned = discoveryReferralAttestationForSigning(att);
    const valid = verifyCanonicalPayload(unsigned, att.signature, input.referralOwnerPublicKeyPem);
    if (!valid) {
        return { ok: false, reason: "invalid referral attestation signature" };
    }
    return { ok: true };
}
/** US-MH2+: hop>0 anonymous forwards require a cryptographic referral attestation. */
export function requiresDiscoveryReferralAttestation(input) {
    const hop = input.currentHop ?? 0;
    return (hop > 0 &&
        input.forwardPrivacy === "anonymous" &&
        isAnonymousDiscoveryOwnerId(input.requesterOwnerId));
}
//# sourceMappingURL=discovery-referral-attestation.js.map