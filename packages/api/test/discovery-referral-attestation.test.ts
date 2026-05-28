import { generateOwnerIdentity } from "@envoymesh/identity";
import {
  createDiscoveryReferralAttestation,
  requiresDiscoveryReferralAttestation,
  verifyDiscoveryReferralAttestation,
} from "../src/discovery-referral-attestation.js";
import { describe, expect, it } from "vitest";

describe("discovery referral attestation", () => {
  it("signs and verifies referral proof", () => {
    const bob = generateOwnerIdentity();
    const attestation = createDiscoveryReferralAttestation(
      {
        referralOwnerId: bob.ownerId,
        requestMessageId: "req-abc",
        correlationId: "corr-1",
        anonymizedRequesterId: "envoy:discovery:anon:testtoken",
      },
      bob.privateKeyPem,
    );
    expect(
      verifyDiscoveryReferralAttestation({
        attestation,
        referralOwnerPublicKeyPem: bob.publicKeyPem,
        expectedReferralOwnerId: bob.ownerId,
        expectedAnonymizedRequesterId: "envoy:discovery:anon:testtoken",
        expectedCorrelationId: "corr-1",
      }).ok,
    ).toBe(true);
  });

  it("requires attestation for anonymous hop>0 forwards", () => {
    expect(
      requiresDiscoveryReferralAttestation({
        requesterOwnerId: "envoy:discovery:anon:abc",
        currentHop: 1,
        forwardPrivacy: "anonymous",
      }),
    ).toBe(true);
    expect(
      requiresDiscoveryReferralAttestation({
        requesterOwnerId: "envoy:owner:alice",
        currentHop: 0,
        forwardPrivacy: "none",
      }),
    ).toBe(false);
  });
});
