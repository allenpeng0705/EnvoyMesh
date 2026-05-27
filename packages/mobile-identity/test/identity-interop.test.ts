import { createUnsignedEnvelope } from "@envoymesh/protocol";
import {
  generateEd25519KeyPair as generateDesktopKeyPair,
  signCanonicalPayload as signDesktopCanonicalPayload,
  signUnsignedEnvelope as signDesktopEnvelope,
  verifyCanonicalPayload as verifyDesktopCanonicalPayload,
  verifyEnvelope as verifyDesktopEnvelope,
} from "@envoymesh/identity";
import { describe, expect, it } from "vitest";
import {
  generateEd25519KeyPair as generateMobileKeyPair,
  signCanonicalPayload as signMobileCanonicalPayload,
  signUnsignedEnvelope as signMobileEnvelope,
  verifyCanonicalPayload as verifyMobileCanonicalPayload,
  verifyEnvelope as verifyMobileEnvelope,
  derivePeerId,
} from "../src/index.js";

describe("mobile-identity ↔ @envoymesh/identity interop", () => {
  const payload = { intent: "system.ping", nonce: "interop-01", value: 42 };

  it("produces identical signatures for the same PEM key and canonical payload", () => {
    const mobileKeys = generateMobileKeyPair();
    const desktopSig = signDesktopCanonicalPayload(payload, mobileKeys.privateKeyPem);
    const mobileSig = signMobileCanonicalPayload(payload, mobileKeys.privateKeyPem);
    expect(mobileSig).toBe(desktopSig);
  });

  it("desktop-generated PEM keys sign identically in both packages", () => {
    const desktopKeys = generateDesktopKeyPair();
    const desktopSig = signDesktopCanonicalPayload(payload, desktopKeys.privateKeyPem);
    const mobileSig = signMobileCanonicalPayload(payload, desktopKeys.privateKeyPem);
    expect(mobileSig).toBe(desktopSig);
  });

  it("mobile signs canonical payload; desktop verifies", () => {
    const keys = generateMobileKeyPair();
    const sig = signMobileCanonicalPayload(payload, keys.privateKeyPem);
    expect(verifyDesktopCanonicalPayload(payload, sig, keys.publicKeyPem)).toBe(true);
  });

  it("desktop signs canonical payload; mobile verifies", () => {
    const keys = generateDesktopKeyPair();
    const sig = signDesktopCanonicalPayload(payload, keys.privateKeyPem);
    expect(verifyMobileCanonicalPayload(payload, sig, keys.publicKeyPem)).toBe(true);
  });

  it("mobile-signed envelope verifies on desktop", () => {
    const keys = generateMobileKeyPair();
    const peerId = derivePeerId(keys.publicKeyPem);
    const unsigned = createUnsignedEnvelope({
      intent: "system.ping",
      senderPeerId: peerId,
      senderPublicKey: keys.publicKeyPem,
      payload: { message: "interop-mobile-signs" },
    });
    const signed = signMobileEnvelope(unsigned, keys.privateKeyPem);
    expect(verifyDesktopEnvelope(signed)).toBe(true);
  });

  it("desktop-signed envelope verifies on mobile", () => {
    const keys = generateDesktopKeyPair();
    const peerId = derivePeerId(keys.publicKeyPem);
    const unsigned = createUnsignedEnvelope({
      intent: "system.ping",
      senderPeerId: peerId,
      senderPublicKey: keys.publicKeyPem,
      payload: { message: "interop-desktop-signs" },
    });
    const signed = signDesktopEnvelope(unsigned, keys.privateKeyPem);
    expect(verifyMobileEnvelope(signed)).toBe(true);
  });
});
