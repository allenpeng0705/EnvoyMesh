import { describe, expect, it } from "vitest";
import { createUnsignedEnvelope } from "@envoymesh/protocol";
import { generateOwnerIdentity, signHumanProfile } from "@envoymesh/identity";
import { ownerIdFromProfileIntent } from "../src/peer-directory-learn.js";

describe("ownerIdFromProfileIntent", () => {
  it("reads owner from profile.sync payload", () => {
    const owner = generateOwnerIdentity();
    const profile = signHumanProfile(
      {
        version: "0.1",
        ownerId: owner.ownerId,
        displayName: "Mac",
        username: "mac01",
        profileVisibility: "private",
        updatedAt: new Date().toISOString(),
      },
      owner.privateKeyPem,
    );
    const envelope = createUnsignedEnvelope({
      senderPeerId: "envoy_sender",
      senderPublicKey: owner.publicKeyPem,
      senderRole: "human",
      intent: "profile.sync",
      payload: { profile, ownerPublicKeyPem: owner.publicKeyPem },
    });
    expect(ownerIdFromProfileIntent(envelope)).toBe(owner.ownerId);
  });
});
