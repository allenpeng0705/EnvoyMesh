import { createCapabilityManifestStore, createLocalTaskStore, createLocalTrustStore, createLocalPeerDirectoryStore } from "@envoymesh/local-store";
import { generateDeviceIdentity, generateOwnerIdentity } from "@envoymesh/identity";
import { createDeviceCertificate } from "@envoymesh/identity";
import { createUnsignedEnvelope } from "@envoymesh/protocol";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleInboundShareRequest, handleInboundShareAccept } from "../src/share-inbound.js";

let profileDir: string;

beforeEach(async () => {
  profileDir = await mkdtemp(join(tmpdir(), "envoymesh-share-"));
});

afterEach(async () => {
  await rm(profileDir, { recursive: true, force: true });
});

function testProfile() {
  const owner = generateOwnerIdentity();
  const device = generateDeviceIdentity();
  return {
    owner,
    device,
    deviceCertificate: createDeviceCertificate({
      owner,
      device,
      deviceProfile: "primary",
      capabilities: ["message.send", "mesh.listen", "mesh.discovery", "knowledge.query"],
    }),
  };
}

function signedEnvelope(profile: ReturnType<typeof testProfile>, intent: string, payload: unknown) {
  return {
    ...createUnsignedEnvelope({
      senderPeerId: "peer-remote",
      senderPublicKey: profile.device.publicKeyPem,
      intent: intent as any,
      payload,
      createdAt: "2026-05-06T10:00:00.000Z",
      messageId: `share-${Date.now()}`,
    }),
    signature: "sig",
  };
}

describe("handleInboundShareRequest", () => {
  it("rejects invalid payload (bad requestType)", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);
    const peerDirectoryStore = createLocalPeerDirectoryStore(profileDir);

    const envelope = signedEnvelope(profile, "share.request", {
      requestType: "invalid-type",
      query: "test",
    });

    const result = await handleInboundShareRequest({
      envelope,
      remotePeerId: "libp2p-remote",
      receivedAt: Date.now(),
      correlationId: "corr-1",
      taskStore,
      trustStore,
      peerDirectoryStore,
      profile,
      vaultIndex: null,
      modelProviders: { mode: "mock" },
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toContain("requestType");
  });

  it("denies blocked sender", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);
    const peerDirectoryStore = createLocalPeerDirectoryStore(profileDir);

    // Set up the peer in directory so we can resolve their ownerId
    await peerDirectoryStore.ensurePeerFromInboundChat({
      ownerId: "envoy:owner:blocked-contact",
      peerId: "peer-remote",
      listenAddrs: [],
    });
    await trustStore.setTrustRecord({ peerOwnerId: "envoy:owner:blocked-contact", level: "blocked" });

    const envelope = signedEnvelope(profile, "share.request", {
      requestType: "knowledge",
      query: "test query",
      requestedSensitivity: "public",
    });

    const result = await handleInboundShareRequest({
      envelope,
      remotePeerId: "libp2p-remote",
      receivedAt: Date.now(),
      correlationId: "corr-1",
      taskStore,
      trustStore,
      peerDirectoryStore,
      profile,
      vaultIndex: null,
      modelProviders: { mode: "mock" },
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toContain("blocked");
  });

  it("denies public stranger (no peer directory entry)", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);
    const peerDirectoryStore = createLocalPeerDirectoryStore(profileDir);

    // No peer directory entry → ownerId resolves to undefined → bond level = "public"
    // Public peers are denied for knowledge.query intent
    const envelope = signedEnvelope(profile, "share.request", {
      requestType: "knowledge",
      query: "what is my name?",
      requestedSensitivity: "public",
    });

    const result = await handleInboundShareRequest({
      envelope,
      remotePeerId: "libp2p-remote",
      receivedAt: Date.now(),
      correlationId: "corr-share-1",
      taskStore,
      trustStore,
      peerDirectoryStore,
      profile,
      vaultIndex: null,
      modelProviders: { mode: "mock" },
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toContain("public");
  });

  it("allows knowledge request from bonded contact and returns preview", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);
    const peerDirectoryStore = createLocalPeerDirectoryStore(profileDir);

    // Set up referred trust
    await peerDirectoryStore.ensurePeerFromInboundChat({
      ownerId: "envoy:owner:friend",
      peerId: "peer-remote",
      listenAddrs: [],
    });
    await trustStore.setTrustRecord({ peerOwnerId: "envoy:owner:friend", level: "referred" });

    const envelope = signedEnvelope(profile, "share.request", {
      requestType: "knowledge",
      query: "what is my name?",
      requestedSensitivity: "public",
    });

    const result = await handleInboundShareRequest({
      envelope,
      remotePeerId: "libp2p-remote",
      receivedAt: Date.now(),
      correlationId: "corr-share-2",
      taskStore,
      trustStore,
      peerDirectoryStore,
      profile,
      vaultIndex: null,
      modelProviders: { mode: "mock" },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.responsePayload.previewText.length).toBeGreaterThan(0);
      expect(result.responsePayload.refused).toBe(false);
      expect(result.responsePayload.sensitivity).toBe("public");
    }
  });

  it("returns preview for direct trust requesting friends sensitivity (within ceiling)", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);
    const peerDirectoryStore = createLocalPeerDirectoryStore(profileDir);

    // Set up direct trust
    await peerDirectoryStore.ensurePeerFromInboundChat({
      ownerId: "envoy:owner:friend",
      peerId: "peer-remote",
      listenAddrs: [],
    });
    await trustStore.setTrustRecord({ peerOwnerId: "envoy:owner:friend", level: "direct" });

    const envelope = signedEnvelope(profile, "share.request", {
      requestType: "knowledge",
      query: "my friends-only notes",
      requestedSensitivity: "friends",
    });

    const result = await handleInboundShareRequest({
      envelope,
      remotePeerId: "libp2p-remote",
      receivedAt: Date.now(),
      correlationId: "corr-share-3",
      taskStore,
      trustStore,
      peerDirectoryStore,
      profile,
      vaultIndex: null,
      modelProviders: { mode: "mock" },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      // direct trust ceiling is "friends" - requesting "friends" is within ceiling
      expect(result.responsePayload.sensitivity).toBe("friends");
    }
  });

  it("sets isFileTransfer for file requests", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);
    const peerDirectoryStore = createLocalPeerDirectoryStore(profileDir);

    await peerDirectoryStore.ensurePeerFromInboundChat({
      ownerId: "envoy:owner:friend",
      peerId: "peer-remote",
      listenAddrs: [],
    });
    await trustStore.setTrustRecord({ peerOwnerId: "envoy:owner:friend", level: "referred" });

    const envelope = signedEnvelope(profile, "share.request", {
      requestType: "file",
      relativePath: "documents/report.pdf",
      requestedSensitivity: "public",
    });

    const result = await handleInboundShareRequest({
      envelope,
      remotePeerId: "libp2p-remote",
      receivedAt: Date.now(),
      correlationId: "corr-share-4",
      taskStore,
      trustStore,
      peerDirectoryStore,
      profile,
      vaultIndex: null,
      modelProviders: { mode: "mock" },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.responsePayload.isFileTransfer).toBe(true);
      expect(result.responsePayload.contentHint).toContain("report.pdf");
    }
  });

  it("manifest ceiling caps direct trust friends policy when manifest is stricter", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);
    const peerDirectoryStore = createLocalPeerDirectoryStore(profileDir);
    const manifestStore = createCapabilityManifestStore(profileDir);

    // Manifest ceiling is "public" (stricter than direct policy which allows "friends")
    await manifestStore.createDefaultManifest({
      visibility: "public-preview",
      sensitivityCeiling: "public",
      capabilities: ["knowledge.query"],
    });
    const manifest = await manifestStore.loadManifest();

    await peerDirectoryStore.ensurePeerFromInboundChat({
      ownerId: "envoy:owner:friend",
      peerId: "peer-remote",
      listenAddrs: [],
    });
    await trustStore.setTrustRecord({ peerOwnerId: "envoy:owner:friend", level: "direct" });

    const envelope = signedEnvelope(profile, "share.request", {
      requestType: "knowledge",
      query: "some info",
      requestedSensitivity: "friends",
    });

    const result = await handleInboundShareRequest({
      envelope,
      remotePeerId: "libp2p-remote",
      receivedAt: Date.now(),
      correlationId: "corr-share-5",
      taskStore,
      trustStore,
      peerDirectoryStore,
      profile,
      vaultIndex: null,
      modelProviders: { mode: "mock" },
      capabilityManifest: manifest,
    });

    // Direct bond allows up to "friends" for knowledge.query, but manifest ceiling is "public"
    // Policy says allow with maxSensitivity=friends, then manifest further caps to "public"
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.responsePayload.sensitivity).toBe("public");
    }
  });
});

describe("handleInboundShareAccept", () => {
  it("rejects invalid payload (missing inReplyTo)", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);
    const peerDirectoryStore = createLocalPeerDirectoryStore(profileDir);

    const envelope = signedEnvelope(profile, "share.accept", { accept: true });

    const result = await handleInboundShareAccept({
      envelope,
      remotePeerId: "libp2p-remote",
      receivedAt: Date.now(),
      correlationId: "corr-accept-1",
      taskStore,
      trustStore,
      peerDirectoryStore,
      profile,
      vaultIndex: null,
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toContain("inReplyTo");
  });

  it("returns proceed=true when accepted", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);
    const peerDirectoryStore = createLocalPeerDirectoryStore(profileDir);

    await peerDirectoryStore.ensurePeerFromInboundChat({
      ownerId: "envoy:owner:friend",
      peerId: "peer-remote",
      listenAddrs: [],
    });

    const envelope = signedEnvelope(profile, "share.accept", {
      inReplyTo: "preview-msg-123",
      accept: true,
    });

    const result = await handleInboundShareAccept({
      envelope,
      remotePeerId: "libp2p-remote",
      receivedAt: Date.now(),
      correlationId: "corr-accept-2",
      taskStore,
      trustStore,
      peerDirectoryStore,
      profile,
      vaultIndex: null,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.proceed).toBe(true);
    }
  });

  it("returns proceed=false when declined", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);
    const peerDirectoryStore = createLocalPeerDirectoryStore(profileDir);

    await peerDirectoryStore.ensurePeerFromInboundChat({
      ownerId: "envoy:owner:friend",
      peerId: "peer-remote",
      listenAddrs: [],
    });

    const envelope = signedEnvelope(profile, "share.accept", {
      inReplyTo: "preview-msg-123",
      accept: false,
    });

    const result = await handleInboundShareAccept({
      envelope,
      remotePeerId: "libp2p-remote",
      receivedAt: Date.now(),
      correlationId: "corr-accept-3",
      taskStore,
      trustStore,
      peerDirectoryStore,
      profile,
      vaultIndex: null,
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toContain("declined");
  });
});
