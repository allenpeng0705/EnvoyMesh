import type { DiscoveryReferralAttestation } from "@envoymesh/protocol";
export type UnsignedDiscoveryReferralAttestation = Omit<DiscoveryReferralAttestation, "signature">;
export declare function discoveryReferralAttestationForSigning(input: UnsignedDiscoveryReferralAttestation): UnsignedDiscoveryReferralAttestation;
export declare function createDiscoveryReferralAttestation(input: UnsignedDiscoveryReferralAttestation, referralOwnerPrivateKeyPem: string): DiscoveryReferralAttestation;
export declare function verifyDiscoveryReferralAttestation(input: {
    attestation: DiscoveryReferralAttestation;
    referralOwnerPublicKeyPem: string;
    expectedReferralOwnerId: string;
    expectedAnonymizedRequesterId: string;
    expectedCorrelationId?: string;
}): {
    ok: true;
} | {
    ok: false;
    reason: string;
};
/** US-MH2+: hop>0 anonymous forwards require a cryptographic referral attestation. */
export declare function requiresDiscoveryReferralAttestation(input: {
    requesterOwnerId: string;
    currentHop?: number;
    forwardPrivacy?: "none" | "anonymous";
}): boolean;
//# sourceMappingURL=discovery-referral-attestation.d.ts.map