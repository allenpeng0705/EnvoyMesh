import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createAuthChallengePayload,
  createUnsignedMandate,
  createSystemSignalPayload,
  createUnsignedEnvelope,
  type DeviceCertificate,
  type EnvoyEnvelope,
} from "@envoymesh/protocol";
import { describe, expect, it } from "vitest";
import {
  createAgentCredential,
  createDeviceCertificate,
  createAuthChallengeResponse,
  createDeviceRevocationRecord,
  createProofOfIntent,
  derivePeerId,
  deriveOwnerId,
  generateAgentIdentity,
  generateDeviceIdentity,
  generateEd25519KeyPair,
  generateIdentity,
  generateOwnerIdentity,
  isAgentCredentialExpired,
  signCanonicalPayload,
  signHumanProfile,
  signMandate,
  signUnsignedEnvelope,
  verifyAgentCredential,
  verifyAgentEnvelope,
  verifyAuthChallengeResponse,
  verifyAuthorizedDeviceEnvelope,
  verifyCanonicalPayload,
  verifyDeviceCertificate,
  verifyDeviceRevocationRecord,
  verifyEnvelope,
  verifyHumanProfile,
  isDeviceRevoked,
  verifyMandate,
  verifyProofOfIntent,
} from "../src/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ===========================================================================
// Golden fixture cross-verification — mobile-identity MUST produce identical
// output to packages/identity (node:crypto Ed25519).
// ===========================================================================

describe("companion golden fixture (Dart TS peer/owner id parity)", () => {
  it("derivePeerId and deriveOwnerId match committed vectors", () => {
    const golden = JSON.parse(
      readFileSync(join(__dirname, "fixtures/companion_identity_golden.json"), "utf8"),
    ) as {
      publicKeyPem: string;
      peerId: string;
      ownerId: string;
    };
    expect(derivePeerId(golden.publicKeyPem)).toBe(golden.peerId);
    expect(deriveOwnerId(golden.publicKeyPem)).toBe(golden.ownerId);
  });
});

describe("companion envelope signature (Dart interop)", () => {
  it("fixture unsigned signs to fixture signature; signed envelope verifies", () => {
    const g = JSON.parse(
      readFileSync(join(__dirname, "fixtures/companion_envelope_interop_golden.json"), "utf8"),
    ) as {
      privateKeyPem: string;
      unsignedEnvelopeJson: Record<string, unknown>;
      signatureBase64Url: string;
      signedEnvelopeJson: Record<string, unknown>;
    };
    const sig = signCanonicalPayload(g.unsignedEnvelopeJson, g.privateKeyPem);
    expect(sig).toBe(g.signatureBase64Url);
    expect(verifyEnvelope(g.signedEnvelopeJson as EnvoyEnvelope)).toBe(true);
  });
});

// ===========================================================================
// Identity tests — mirrors packages/identity/test/identity.test.ts
// verifies that @noble/curves produces identical results to node:crypto.
// ===========================================================================

describe("identity", () => {
  it("signs and verifies an envelope", () => {
    const identity = generateIdentity();
    const unsigned = createUnsignedEnvelope({
      senderPeerId: identity.peerId,
      senderPublicKey: identity.publicKeyPem,
      recipientPeerId: "peer-b",
      intent: "system.ping",
      payload: { message: "hello" },
    });

    const signed = signUnsignedEnvelope(unsigned, identity.privateKeyPem);

    expect(verifyEnvelope(signed)).toBe(true);
  });

  it("rejects a tampered envelope", () => {
    const identity = generateIdentity();
    const unsigned = createUnsignedEnvelope({
      senderPeerId: identity.peerId,
      senderPublicKey: identity.publicKeyPem,
      intent: "system.ping",
      payload: { message: "hello" },
    });

    const signed = signUnsignedEnvelope(unsigned, identity.privateKeyPem);
    const tampered = {
      ...signed,
      payload: { message: "changed" },
    };

    expect(verifyEnvelope(tampered)).toBe(false);
  });

  it("rejects peer IDs that do not match the sender public key", () => {
    const identity = generateIdentity();
    const unsigned = createUnsignedEnvelope({
      senderPeerId: "envoy_wrong",
      senderPublicKey: identity.publicKeyPem,
      intent: "system.ping",
      payload: {},
    });

    const signed = signUnsignedEnvelope(unsigned, identity.privateKeyPem);

    expect(verifyEnvelope(signed)).toBe(false);
  });

  it("issues and verifies an owner-signed device certificate", () => {
    const owner = generateOwnerIdentity();
    const device = generateDeviceIdentity();

    const certificate = createDeviceCertificate({
      owner,
      device,
      deviceProfile: "satellite",
      capabilities: ["ui.channel", "approval.prompt", "message.send"],
      issuedAt: "2026-04-26T10:00:00.000Z",
    });

    expect(certificate.ownerId).toBe(owner.ownerId);
    expect(certificate.deviceId).toBe(device.deviceId);
    expect(certificate.deviceProfile).toBe("satellite");
    expect(verifyDeviceCertificate(certificate, owner.publicKeyPem)).toBe(true);
  });

  it("rejects a device certificate signed by a different owner", () => {
    const owner = generateOwnerIdentity();
    const otherOwner = generateOwnerIdentity();
    const device = generateDeviceIdentity();

    const certificate = createDeviceCertificate({
      owner,
      device,
      deviceProfile: "primary",
      capabilities: ["mesh.listen", "vault.index"],
    });

    expect(verifyDeviceCertificate(certificate, otherOwner.publicKeyPem)).toBe(false);
  });

  it("rejects tampered device certificate capabilities", () => {
    const owner = generateOwnerIdentity();
    const device = generateDeviceIdentity();

    const certificate = createDeviceCertificate({
      owner,
      device,
      deviceProfile: "satellite",
      capabilities: ["ui.channel"],
    });

    const tampered: DeviceCertificate = {
      ...certificate,
      capabilities: ["ui.channel", "vault.retrieve"],
    };

    expect(verifyDeviceCertificate(tampered, owner.publicKeyPem)).toBe(false);
  });

  it("creates and verifies owner-signed device revocation records", () => {
    const owner = generateOwnerIdentity();
    const device = generateDeviceIdentity();
    const certificate = createDeviceCertificate({
      owner,
      device,
      deviceProfile: "satellite",
      capabilities: ["ui.channel"],
      certificateId: "cert-1",
    });

    const record = createDeviceRevocationRecord({
      owner,
      deviceId: device.deviceId,
      certificateId: certificate.certificateId,
      reason: "lost",
      revokedAt: "2026-04-27T10:00:00.000Z",
    });

    expect(verifyDeviceRevocationRecord(record, owner.publicKeyPem)).toBe(true);
    expect(isDeviceRevoked(certificate, [record], owner.publicKeyPem)).toBe(true);
  });

  it("rejects tampered device revocation records", () => {
    const owner = generateOwnerIdentity();
    const device = generateDeviceIdentity();
    const otherDevice = generateDeviceIdentity();
    const certificate = createDeviceCertificate({
      owner,
      device,
      deviceProfile: "primary",
      capabilities: ["mesh.listen"],
      certificateId: "cert-1",
    });
    const record = createDeviceRevocationRecord({
      owner,
      deviceId: otherDevice.deviceId,
      certificateId: "cert-2",
      reason: "retired",
    });
    const tampered = {
      ...record,
      deviceId: device.deviceId,
    };

    expect(verifyDeviceRevocationRecord(tampered, owner.publicKeyPem)).toBe(false);
    expect(isDeviceRevoked(certificate, [record], owner.publicKeyPem)).toBe(false);
  });

  it("verifies an envelope signed by an authorized device", () => {
    const owner = generateOwnerIdentity();
    const device = generateDeviceIdentity();
    const certificate = createDeviceCertificate({
      owner,
      device,
      deviceProfile: "primary",
      capabilities: ["mesh.listen", "mesh.discovery", "device.sync"],
    });
    const unsigned = createUnsignedEnvelope({
      senderPeerId: derivePeerId(device.publicKeyPem),
      senderPublicKey: device.publicKeyPem,
      intent: "system.signal",
      payload: createSystemSignalPayload({
        deviceCertificate: certificate,
        ownerPublicKeyPem: owner.publicKeyPem,
        listenAddrs: ["/ip4/127.0.0.1/tcp/10000"],
      }),
    });

    const envelope = signUnsignedEnvelope(unsigned, device.privateKeyPem);

    expect(verifyAuthorizedDeviceEnvelope(envelope, certificate, owner.publicKeyPem)).toBe(true);
  });

  it("rejects an authorized device envelope signed by a different device", () => {
    const owner = generateOwnerIdentity();
    const device = generateDeviceIdentity();
    const otherDevice = generateDeviceIdentity();
    const certificate = createDeviceCertificate({
      owner,
      device,
      deviceProfile: "satellite",
      capabilities: ["ui.channel", "message.send"],
    });
    const unsigned = createUnsignedEnvelope({
      senderPeerId: derivePeerId(otherDevice.publicKeyPem),
      senderPublicKey: otherDevice.publicKeyPem,
      intent: "system.signal",
      payload: createSystemSignalPayload({
        deviceCertificate: certificate,
        ownerPublicKeyPem: owner.publicKeyPem,
      }),
    });

    const envelope = signUnsignedEnvelope(unsigned, otherDevice.privateKeyPem);

    expect(verifyAuthorizedDeviceEnvelope(envelope, certificate, owner.publicKeyPem)).toBe(false);
  });

  it("creates and verifies a device-signed challenge response", () => {
    const owner = generateOwnerIdentity();
    const device = generateDeviceIdentity();
    const certificate = createDeviceCertificate({
      owner,
      device,
      deviceProfile: "primary",
      capabilities: ["mesh.listen", "message.send"],
    });
    const challenge = createAuthChallengePayload({
      targetOwnerId: owner.ownerId,
      targetDeviceId: device.deviceId,
    });

    const response = createAuthChallengeResponse({
      challenge,
      ownerPublicKeyPem: owner.publicKeyPem,
      deviceCertificate: certificate,
      devicePrivateKeyPem: device.privateKeyPem,
    });

    expect(verifyAuthChallengeResponse(challenge, response)).toBe(true);
  });

  it("rejects a challenge response for the wrong nonce", () => {
    const owner = generateOwnerIdentity();
    const device = generateDeviceIdentity();
    const certificate = createDeviceCertificate({
      owner,
      device,
      deviceProfile: "primary",
      capabilities: ["mesh.listen", "message.send"],
    });
    const challenge = createAuthChallengePayload();
    const otherChallenge = { ...challenge, nonce: "different-nonce" };

    const response = createAuthChallengeResponse({
      challenge: otherChallenge,
      ownerPublicKeyPem: owner.publicKeyPem,
      deviceCertificate: certificate,
      devicePrivateKeyPem: device.privateKeyPem,
    });

    expect(verifyAuthChallengeResponse(challenge, response)).toBe(false);
  });

  it("rejects a challenge response signed by a different device", () => {
    const owner = generateOwnerIdentity();
    const device = generateDeviceIdentity();
    const otherDevice = generateDeviceIdentity();
    const certificate = createDeviceCertificate({
      owner,
      device,
      deviceProfile: "satellite",
      capabilities: ["ui.channel", "message.send"],
    });
    const challenge = createAuthChallengePayload();

    const response = createAuthChallengeResponse({
      challenge,
      ownerPublicKeyPem: owner.publicKeyPem,
      deviceCertificate: certificate,
      devicePrivateKeyPem: otherDevice.privateKeyPem,
    });

    expect(verifyAuthChallengeResponse(challenge, response)).toBe(false);
  });

  it("signs and verifies an owner mandate", () => {
    const owner = generateOwnerIdentity();
    const device = generateDeviceIdentity();
    const unsignedMandate = createUnsignedMandate({
      ownerId: owner.ownerId,
      issuedToDeviceId: device.deviceId,
      taskIntent: "find a book",
      objective: "Find a strong book about distributed systems.",
      expiresAt: "2026-04-27T10:00:00.000Z",
    });

    const mandate = signMandate({ owner, unsignedMandate });

    expect(verifyMandate(mandate, owner.publicKeyPem)).toBe(true);
  });

  it("rejects a tampered mandate", () => {
    const owner = generateOwnerIdentity();
    const device = generateDeviceIdentity();
    const unsignedMandate = createUnsignedMandate({
      ownerId: owner.ownerId,
      issuedToDeviceId: device.deviceId,
      taskIntent: "find a book",
      objective: "Find a strong book about distributed systems.",
    });
    const mandate = signMandate({ owner, unsignedMandate });
    const tampered = {
      ...mandate,
      allowedActions: [...mandate.allowedActions, "purchase" as const],
    };

    expect(verifyMandate(tampered, owner.publicKeyPem)).toBe(false);
  });

  it("creates and verifies device Proof of Intent for a mandate", () => {
    const owner = generateOwnerIdentity();
    const device = generateDeviceIdentity();
    const certificate = createDeviceCertificate({
      owner,
      device,
      deviceProfile: "primary",
      capabilities: ["mesh.listen", "message.send", "task.execute"],
    });
    const unsignedMandate = createUnsignedMandate({
      ownerId: owner.ownerId,
      issuedToDeviceId: device.deviceId,
      taskIntent: "find a book",
      objective: "Ask trusted peers for a distributed systems book recommendation.",
      expiresAt: "2026-04-27T10:00:00.000Z",
    });
    const mandate = signMandate({ owner, unsignedMandate });

    const proof = createProofOfIntent({
      mandate,
      taskId: "task-1",
      requestIntent: "task.propose",
      device,
      nonce: "nonce-1",
    });

    expect(verifyProofOfIntent(proof, mandate, certificate, owner.publicKeyPem)).toBe(true);
  });

  it("rejects Proof of Intent from a device not named in the mandate", () => {
    const owner = generateOwnerIdentity();
    const device = generateDeviceIdentity();
    const otherDevice = generateDeviceIdentity();
    const otherCertificate = createDeviceCertificate({
      owner,
      device: otherDevice,
      deviceProfile: "satellite",
      capabilities: ["ui.channel", "message.send"],
    });
    const unsignedMandate = createUnsignedMandate({
      ownerId: owner.ownerId,
      issuedToDeviceId: device.deviceId,
      taskIntent: "find a book",
      objective: "Ask trusted peers for a distributed systems book recommendation.",
    });
    const mandate = signMandate({ owner, unsignedMandate });

    const proof = createProofOfIntent({
      mandate,
      taskId: "task-1",
      requestIntent: "task.propose",
      device: otherDevice,
    });

    expect(verifyProofOfIntent(proof, mandate, otherCertificate, owner.publicKeyPem)).toBe(false);
  });
});

// ===========================================================================
// Agent identity tests
// ===========================================================================

describe("agent identity", () => {
  it("generates an agent identity with correct IDs", () => {
    const owner = generateOwnerIdentity();
    const agent = generateAgentIdentity(owner.ownerId);

    expect(agent.agentId).toMatch(/^envoy:agent:/);
    expect(agent.agentPeerId).toMatch(/^envoy_agent_/);
    expect(agent.publicKeyPem).toBeTruthy();
    expect(agent.privateKeyPem).toBeTruthy();
  });

  it("creates and verifies an agent credential", () => {
    const owner = generateOwnerIdentity();
    const agent = generateAgentIdentity(owner.ownerId);

    const credential = createAgentCredential({
      owner,
      agent,
      scope: ["chat.message", "knowledge.query"],
    });

    expect(credential.ownerId).toBe(owner.ownerId);
    expect(credential.agentId).toBe(agent.agentId);
    expect(credential.agentPeerId).toBe(agent.agentPeerId);
    expect(credential.scope).toEqual(["chat.message", "knowledge.query"]);
    expect(verifyAgentCredential(credential, owner.publicKeyPem)).toBe(true);
  });

  it("rejects agent credential signed by wrong owner", () => {
    const owner = generateOwnerIdentity();
    const otherOwner = generateOwnerIdentity();
    const agent = generateAgentIdentity(owner.ownerId);

    const credential = createAgentCredential({
      owner,
      agent,
      scope: ["chat.message"],
    });

    expect(verifyAgentCredential(credential, otherOwner.publicKeyPem)).toBe(false);
  });

  it("detects expired agent credentials", () => {
    const owner = generateOwnerIdentity();
    const agent = generateAgentIdentity(owner.ownerId);

    const credential = createAgentCredential({
      owner,
      agent,
      scope: ["chat.message"],
      expiresAt: "2020-01-01T00:00:00.000Z",
    });

    expect(isAgentCredentialExpired(credential)).toBe(true);
  });

  it("allows null expiresAt (no expiration)", () => {
    const owner = generateOwnerIdentity();
    const agent = generateAgentIdentity(owner.ownerId);

    const credential = createAgentCredential({
      owner,
      agent,
      scope: ["chat.message"],
      expiresAt: null,
    });

    expect(isAgentCredentialExpired(credential)).toBe(false);
  });

  it("verifies an agent envelope with valid credential", () => {
    const owner = generateOwnerIdentity();
    const agent = generateAgentIdentity(owner.ownerId);
    const credential = createAgentCredential({
      owner,
      agent,
      scope: ["chat.message", "knowledge.query"],
    });

    const unsigned = createUnsignedEnvelope({
      senderPeerId: agent.agentPeerId,
      senderPublicKey: agent.publicKeyPem,
      senderRole: "agent",
      recipientPeerId: "peer-b",
      recipientRole: "human",
      intent: "chat.message",
      payload: { text: "hello" },
      agentCredential: credential,
    });

    const envelope = signUnsignedEnvelope(unsigned, agent.privateKeyPem);

    expect(verifyAgentEnvelope(envelope, owner.publicKeyPem)).toBe(true);
  });

  it("rejects agent envelope when intent not in scope", () => {
    const owner = generateOwnerIdentity();
    const agent = generateAgentIdentity(owner.ownerId);
    const credential = createAgentCredential({
      owner,
      agent,
      scope: ["chat.message"],
    });

    const unsigned = createUnsignedEnvelope({
      senderPeerId: agent.agentPeerId,
      senderPublicKey: agent.publicKeyPem,
      senderRole: "agent",
      recipientPeerId: "peer-b",
      recipientRole: "human",
      intent: "knowledge.query",
      payload: { text: "hello" },
      agentCredential: credential,
    });

    const envelope = signUnsignedEnvelope(unsigned, agent.privateKeyPem);

    expect(verifyAgentEnvelope(envelope, owner.publicKeyPem)).toBe(false);
  });

  it("rejects agent envelope with expired credential", () => {
    const owner = generateOwnerIdentity();
    const agent = generateAgentIdentity(owner.ownerId);
    const credential = createAgentCredential({
      owner,
      agent,
      scope: ["chat.message"],
      expiresAt: "2020-01-01T00:00:00.000Z",
    });

    const unsigned = createUnsignedEnvelope({
      senderPeerId: agent.agentPeerId,
      senderPublicKey: agent.publicKeyPem,
      senderRole: "agent",
      recipientPeerId: "peer-b",
      recipientRole: "human",
      intent: "chat.message",
      payload: { text: "hello" },
      agentCredential: credential,
    });

    const envelope = signUnsignedEnvelope(unsigned, agent.privateKeyPem);

    expect(verifyAgentEnvelope(envelope, owner.publicKeyPem)).toBe(false);
  });

  it("rejects agent envelope when credential is tampered", () => {
    const owner = generateOwnerIdentity();
    const agent = generateAgentIdentity(owner.ownerId);
    const credential = createAgentCredential({
      owner,
      agent,
      scope: ["chat.message"],
    });

    const unsigned = createUnsignedEnvelope({
      senderPeerId: agent.agentPeerId,
      senderPublicKey: agent.publicKeyPem,
      senderRole: "agent",
      recipientPeerId: "peer-b",
      recipientRole: "human",
      intent: "chat.message",
      payload: { text: "hello" },
      agentCredential: credential,
    });

    const envelope = signUnsignedEnvelope(unsigned, agent.privateKeyPem);

    const tamperedEnvelope = {
      ...envelope,
      agentCredential: { ...credential, scope: ["task.propose"] },
    };

    expect(verifyAgentEnvelope(tamperedEnvelope, owner.publicKeyPem)).toBe(false);
  });

  it("rejects agent envelope when owner public key doesn't match", () => {
    const owner = generateOwnerIdentity();
    const otherOwner = generateOwnerIdentity();
    const agent = generateAgentIdentity(owner.ownerId);
    const credential = createAgentCredential({
      owner,
      agent,
      scope: ["chat.message"],
    });

    const unsigned = createUnsignedEnvelope({
      senderPeerId: agent.agentPeerId,
      senderPublicKey: agent.publicKeyPem,
      senderRole: "agent",
      recipientPeerId: "peer-b",
      recipientRole: "human",
      intent: "chat.message",
      payload: { text: "hello" },
      agentCredential: credential,
    });

    const envelope = signUnsignedEnvelope(unsigned, agent.privateKeyPem);

    expect(verifyAgentEnvelope(envelope, otherOwner.publicKeyPem)).toBe(false);
  });
});

// ===========================================================================
// PEM round-trip tests
// ===========================================================================

describe("PEM encode/decode round-trip", () => {
  it("round-trips an Ed25519 key pair through PEM", () => {
    const identity = generateIdentity();
    expect(derivePeerId(identity.publicKeyPem)).toBe(identity.peerId);
    const sig = signCanonicalPayload({ hello: "world" }, identity.privateKeyPem);
    expect(verifyCanonicalPayload({ hello: "world" }, sig, identity.publicKeyPem)).toBe(true);
  });

  it("generates keys that produce valid PEM format", () => {
    const kp = generateEd25519KeyPair();
    expect(kp.publicKeyPem).toMatch(/^-----BEGIN PUBLIC KEY-----\n/);
    expect(kp.publicKeyPem).toMatch(/\n-----END PUBLIC KEY-----\n$/);
    expect(kp.privateKeyPem).toMatch(/^-----BEGIN PRIVATE KEY-----\n/);
    expect(kp.privateKeyPem).toMatch(/\n-----END PRIVATE KEY-----\n$/);
  });

  it("signCanonicalPayload produces deterministic signatures", () => {
    const kp = generateEd25519KeyPair();
    const input = { a: 1, b: 2 };
    const sig1 = signCanonicalPayload(input, kp.privateKeyPem);
    const sig2 = signCanonicalPayload(input, kp.privateKeyPem);
    expect(sig1).toBe(sig2);
  });

  it("verifyCanonicalPayload rejects invalid signature", () => {
    const kp = generateEd25519KeyPair();
    const input = { a: 1 };
    const sig = signCanonicalPayload(input, kp.privateKeyPem);
    expect(verifyCanonicalPayload({ a: 2 }, sig, kp.publicKeyPem)).toBe(false);
    const tamperedSig = sig.replace(sig[0], sig[0] === "A" ? "B" : "A");
    expect(verifyCanonicalPayload(input, tamperedSig, kp.publicKeyPem)).toBe(false);
  });
});

// ===========================================================================
// Cross-verification with @envoymesh/identity (node:crypto)
// ===========================================================================

describe("cross-verification with @envoymesh/identity (node:crypto)", () => {
  it("derivePeerId produces structurally valid IDs", () => {
    const id = generateIdentity();
    expect(id.peerId).toMatch(/^envoy_/);
    expect(id.peerId.length).toBeGreaterThan(10);
  });

  it("deriveOwnerId produces structurally valid IDs", () => {
    const owner = generateOwnerIdentity();
    expect(owner.ownerId).toMatch(/^envoy:owner:/);
    expect(owner.ownerId.length).toBeGreaterThan(15);
  });

  it("deriveDeviceId produces structurally valid IDs", () => {
    const device = generateDeviceIdentity();
    expect(device.deviceId).toMatch(/^envoy:device:/);
    expect(device.deviceId.length).toBeGreaterThan(15);
  });

  it("deriveAgentId includes owner ID in derivation", () => {
    const owner = generateOwnerIdentity();
    const agent1 = generateAgentIdentity(owner.ownerId);
    const agent2 = generateAgentIdentity(owner.ownerId);

    expect(agent1.agentId).not.toBe(agent2.agentId);
    expect(agent1.agentPeerId).not.toBe(agent2.agentPeerId);

    const otherOwner = generateOwnerIdentity();
    const agent3 = generateAgentIdentity(otherOwner.ownerId);
    expect(agent3.agentId).not.toBe(agent1.agentId);
  });
});

// ===========================================================================
// Human profile signing
// ===========================================================================

describe("human profile", () => {
  it("signs and verifies a human profile", () => {
    const owner = generateOwnerIdentity();
    const profile = {
      ownerId: owner.ownerId,
      displayName: "Alice",
      bio: "Enthusiast",
      version: "0.1",
    } as const;

    const signed = signHumanProfile(profile, owner.privateKeyPem);
    expect(signed.signature).toBeTruthy();
    expect(verifyHumanProfile(signed, owner.publicKeyPem)).toBe(true);
  });

  it("rejects human profile with wrong owner", () => {
    const owner = generateOwnerIdentity();
    const other = generateOwnerIdentity();
    const profile = {
      ownerId: owner.ownerId,
      displayName: "Alice",
      version: "0.1",
    } as const;

    const signed = signHumanProfile(profile, owner.privateKeyPem);
    expect(verifyHumanProfile(signed, other.publicKeyPem)).toBe(false);
  });

  // -------------------------------------------------------------------
  // ECDH key exchange + owner-key wrapping (Phase 11)
  // -------------------------------------------------------------------

  it("encrypt and decrypt owner key round-trip via ECDH", async () => {
    const { generateEcdhKeyPair, encryptOwnerKeyForDevice, decryptOwnerKeyFromDevice } = await import("@envoymesh/mobile-identity");
    const owner = generateOwnerIdentity();

    // Mobile generates ECDH keypair
    const ecdhKeyPair = await generateEcdhKeyPair();

    // Home node encrypts with mobile's public key
    const encrypted = await encryptOwnerKeyForDevice(
      owner.privateKeyPem,
      ecdhKeyPair.publicKeyRaw,
    );

    expect(encrypted.encryptedKey).toBeTruthy();
    expect(encrypted.ephemeralPublicKey).toBeTruthy();
    expect(encrypted.iv).toBeTruthy();
    expect(encrypted.authTag).toBeTruthy();

    // Mobile decrypts with its ECDH private key
    const decrypted = await decryptOwnerKeyFromDevice(encrypted, ecdhKeyPair.privateKey);
    expect(decrypted).toBe(owner.privateKeyPem);
  });

  it("decrypt with wrong private key fails", async () => {
    const { generateEcdhKeyPair, encryptOwnerKeyForDevice, decryptOwnerKeyFromDevice } = await import("@envoymesh/mobile-identity");
    const owner = generateOwnerIdentity();

    const ecdhKeyPair1 = await generateEcdhKeyPair();
    const ecdhKeyPair2 = await generateEcdhKeyPair();

    const encrypted = await encryptOwnerKeyForDevice(
      owner.privateKeyPem,
      ecdhKeyPair1.publicKeyRaw,
    );

    // Decrypting with a different key should fail
    await expect(
      decryptOwnerKeyFromDevice(encrypted, ecdhKeyPair2.privateKey),
    ).rejects.toThrow();
  });

  it("tampered encrypted blob fails decryption", async () => {
    const { generateEcdhKeyPair, encryptOwnerKeyForDevice, decryptOwnerKeyFromDevice } = await import("@envoymesh/mobile-identity");
    const owner = generateOwnerIdentity();

    const ecdhKeyPair = await generateEcdhKeyPair();
    const encrypted = await encryptOwnerKeyForDevice(
      owner.privateKeyPem,
      ecdhKeyPair.publicKeyRaw,
    );

    // Tamper with the ciphertext
    const tampered = { ...encrypted, encryptedKey: "AAAAAAAA" + encrypted.encryptedKey.slice(8) };
    await expect(
      decryptOwnerKeyFromDevice(tampered, ecdhKeyPair.privateKey),
    ).rejects.toThrow();
  });
});

