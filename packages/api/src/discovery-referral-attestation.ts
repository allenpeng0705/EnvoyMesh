import { signCanonicalPayload, verifyCanonicalPayload } from "@envoymesh/identity";
import type { DiscoveryReferralAttestation } from "@envoymesh/protocol";
import { isAnonymousDiscoveryOwnerId } from "./discovery-privacy.js";

export type UnsignedDiscoveryReferralAttestation = Omit<DiscoveryReferralAttestation, "signature">;

export function discoveryReferralAttestationForSigning(
  input: UnsignedDiscoveryReferralAttestation,
): UnsignedDiscoveryReferralAttestation {
  return {
    referralOwnerId: input.referralOwnerId.trim(),
    requestMessageId: input.requestMessageId.trim(),
    correlationId: input.correlationId?.trim() || undefined,
    anonymizedRequesterId: input.anonymizedRequesterId.trim(),
  };
}

export function createDiscoveryReferralAttestation(
  input: UnsignedDiscoveryReferralAttestation,
  referralOwnerPrivateKeyPem: string,
): DiscoveryReferralAttestation {
  const unsigned = discoveryReferralAttestationForSigning(input);
  return {
    ...unsigned,
    signature: signCanonicalPayload(unsigned, referralOwnerPrivateKeyPem),
  };
}

export function verifyDiscoveryReferralAttestation(input: {
  attestation: DiscoveryReferralAttestation;
  referralOwnerPublicKeyPem: string;
  expectedReferralOwnerId: string;
  expectedAnonymizedRequesterId: string;
  expectedCorrelationId?: string;
}): { ok: true } | { ok: false; reason: string } {
  const att = input.attestation;
  if (att.referralOwnerId.trim() !== input.expectedReferralOwnerId.trim()) {
    return { ok: false, reason: "referralOwnerId mismatch" };
  }
  if (att.anonymizedRequesterId.trim() !== input.expectedAnonymizedRequesterId.trim()) {
    return { ok: false, reason: "anonymizedRequesterId mismatch" };
  }
  if (
    input.expectedCorrelationId?.trim() &&
    att.correlationId?.trim() &&
    att.correlationId.trim() !== input.expectedCorrelationId.trim()
  ) {
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
export function requiresDiscoveryReferralAttestation(input: {
  requesterOwnerId: string;
  currentHop?: number;
  forwardPrivacy?: "none" | "anonymous";
}): boolean {
  const hop = input.currentHop ?? 0;
  return (
    hop > 0 &&
    input.forwardPrivacy === "anonymous" &&
    isAnonymousDiscoveryOwnerId(input.requesterOwnerId)
  );
}
