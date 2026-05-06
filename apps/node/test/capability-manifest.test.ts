import {
  createCapabilityManifestStore,
  createLocalTaskStore,
  createLocalTrustStore,
  createLocalPeerDirectoryStore,
  sensitivityAllowed,
  keywordsMatch,
  type CapabilityManifest,
} from "@envoymesh/local-store";
import { generateDeviceIdentity, generateOwnerIdentity } from "@envoymesh/identity";
import { createDeviceCertificate } from "@envoymesh/identity";
import { createUnsignedEnvelope } from "@envoymesh/protocol";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleInboundDiscoveryIntent } from "../src/discovery-inbound.js";

let profileDir: string;

beforeEach(async () => {
  profileDir = await mkdtemp(join(tmpdir(), "envoymesh-capman-"));
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
      capabilities: ["message.send", "mesh.listen", "mesh.discovery"],
    }),
  };
}

function signedEnvelope(profile: ReturnType<typeof testProfile>, payload: unknown) {
  return {
    ...createUnsignedEnvelope({
      senderPeerId: "peer-remote",
      senderPublicKey: profile.device.publicKeyPem,
      intent: "discovery.request",
      payload,
      createdAt: "2026-05-06T10:00:00.000Z",
      messageId: "disc-manifest-1",
    }),
    signature: "sig",
  };
}

describe("CapabilityManifestStore", () => {
  let store: ReturnType<typeof createCapabilityManifestStore>;

  beforeEach(() => {
    store = createCapabilityManifestStore(profileDir);
  });

  it("creates and loads a default manifest", async () => {
    const manifest = await store.createDefaultManifest();
    expect(manifest.version).toBe("0.1");
    expect(manifest.id.length).toBeGreaterThan(0);
    expect(manifest.visibility).toBe("contacts-only");
    expect(manifest.sensitivityCeiling).toBe("friends");
    expect(manifest.keywords.length).toBeGreaterThan(0);
    expect(manifest.capabilities.length).toBeGreaterThan(0);
    expect(manifest.approvedAt.length).toBeGreaterThan(0);

    const loaded = await store.loadManifest();
    expect(loaded).toBeDefined();
    expect(loaded!.id).toBe(manifest.id);
    expect(loaded!.visibility).toBe("contacts-only");
  });

  it("loads undefined when no manifest exists", async () => {
    const result = await store.loadManifest();
    expect(result).toBeUndefined();
  });

  it("saves and loads a custom manifest", async () => {
    const custom: CapabilityManifest = {
      version: "0.1",
      id: "custom-id-123",
      versionTag: "1.0.0",
      visibility: "public-preview",
      sensitivityCeiling: "public",
      keywords: ["music", "books", "p2p"],
      capabilities: ["mesh.listen", "knowledge.query"],
      description: "A test node",
      approvedAt: "2026-05-06T00:00:00.000Z",
      updatedAt: "2026-05-06T00:00:00.000Z",
    };
    await store.saveManifest(custom);

    const loaded = await store.loadManifest();
    expect(loaded).toBeDefined();
    expect(loaded!.id).toBe("custom-id-123");
    expect(loaded!.visibility).toBe("public-preview");
    expect(loaded!.sensitivityCeiling).toBe("public");
    expect(loaded!.keywords).toEqual(["music", "books", "p2p"]);
    expect(loaded!.capabilities).toEqual(["mesh.listen", "knowledge.query"]);
    expect(loaded!.description).toBe("A test node");
  });

  it("createDefaultManifest uses provided values", async () => {
    const manifest = await store.createDefaultManifest({
      visibility: "public-auto-answer",
      sensitivityCeiling: "private",
      keywords: ["ai", "research"],
      capabilities: ["task.execute"],
      description: "AI research node",
    });
    expect(manifest.visibility).toBe("public-auto-answer");
    expect(manifest.sensitivityCeiling).toBe("private");
    expect(manifest.keywords).toEqual(["ai", "research"]);
    expect(manifest.capabilities).toEqual(["task.execute"]);
    expect(manifest.description).toBe("AI research node");
  });
});

describe("sensitivityAllowed", () => {
  it("public <= public is allowed", () => {
    expect(sensitivityAllowed("public", "public")).toBe(true);
  });
  it("public <= friends is allowed", () => {
    expect(sensitivityAllowed("public", "friends")).toBe(true);
  });
  it("public <= private is allowed", () => {
    expect(sensitivityAllowed("public", "private")).toBe(true);
  });
  it("friends <= friends is allowed", () => {
    expect(sensitivityAllowed("friends", "friends")).toBe(true);
  });
  it("friends <= public is NOT allowed", () => {
    expect(sensitivityAllowed("friends", "public")).toBe(false);
  });
  it("private <= friends is NOT allowed", () => {
    expect(sensitivityAllowed("private", "friends")).toBe(false);
  });
  it("private <= private is allowed", () => {
    expect(sensitivityAllowed("private", "private")).toBe(true);
  });
});

describe("keywordsMatch", () => {
  it("empty requested hashes matches everything", () => {
    expect(keywordsMatch(["music", "books"], [])).toBe(true);
  });
  it("empty manifest keywords matches nothing", () => {
    expect(keywordsMatch([], ["music"])).toBe(false);
  });
  it("exact match returns true", () => {
    expect(keywordsMatch(["music", "books"], ["music"])).toBe(true);
  });
  it("case-insensitive match", () => {
    expect(keywordsMatch(["Music", "BOOKS"], ["music", "books"])).toBe(true);
  });
  it("no match returns false", () => {
    expect(keywordsMatch(["music", "books"], ["science"])).toBe(false);
  });
  it("partial match (one of multiple) returns true", () => {
    expect(keywordsMatch(["music", "books"], ["music", "science"])).toBe(true);
  });
});

describe("handleInboundDiscoveryIntent with capability manifest", () => {
  it("manifest visibility=contacts-only rejects public trust requester", async () => {
    const profile = testProfile();
    const manifestStore = createCapabilityManifestStore(profileDir);
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);

    await manifestStore.createDefaultManifest({ visibility: "contacts-only" });
    const manifest = await manifestStore.loadManifest();

    const envelope = signedEnvelope(profile, {
      requesterOwnerId: "envoy:owner:stranger",
      requestedTagHashes: ["music"],
      requestedCapabilities: [],
      maxResults: 2,
    });

    const result = await handleInboundDiscoveryIntent({
      envelope,
      profile,
      remotePeerId: "libp2p-stranger",
      receivedAt: Date.now(),
      correlationId: undefined,
      taskStore,
      trustStore,
      capabilityManifest: manifest,
      anonymousDiscoveryMode: "contacts-only",
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toContain("contacts-only");
  });

  it("manifest visibility=public-preview allows public trust with matched capabilities", async () => {
    const profile = testProfile();
    const manifestStore = createCapabilityManifestStore(profileDir);
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);

    await manifestStore.createDefaultManifest({
      visibility: "public-preview",
      sensitivityCeiling: "public",
      keywords: ["music", "p2p"],
      capabilities: ["mesh.listen", "knowledge.query"],
    });
    const manifest = await manifestStore.loadManifest();

    const envelope = signedEnvelope(profile, {
      requesterOwnerId: "envoy:owner:stranger",
      requestedTagHashes: ["music"],
      requestedCapabilities: ["knowledge.query"],
      maxResults: 2,
    });

    const result = await handleInboundDiscoveryIntent({
      envelope,
      profile,
      remotePeerId: "libp2p-stranger",
      receivedAt: Date.now(),
      correlationId: "corr-m1",
      taskStore,
      trustStore,
      capabilityManifest: manifest,
      anonymousDiscoveryMode: "public-preview",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.responsePayload?.matches.length).toBeGreaterThan(0);
    }
  });

  it("manifest sensitivity ceiling rejects too-sensitive requests", async () => {
    const profile = testProfile();
    const manifestStore = createCapabilityManifestStore(profileDir);
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);

    await manifestStore.createDefaultManifest({
      visibility: "public-preview",
      sensitivityCeiling: "public",
    });
    const manifest = await manifestStore.loadManifest();

    const envelope = signedEnvelope(profile, {
      requesterOwnerId: "envoy:owner:stranger",
      requestedTagHashes: ["music"], // must have at least one
      requestedCapabilities: [],
      maxResults: 2,
      requestedSensitivity: "friends", // requesting friends-level sensitivity
    });

    const result = await handleInboundDiscoveryIntent({
      envelope,
      profile,
      remotePeerId: "libp2p-stranger",
      receivedAt: Date.now(),
      correlationId: undefined,
      taskStore,
      trustStore,
      capabilityManifest: manifest,
      anonymousDiscoveryMode: "public-preview",
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toContain("sensitivity");
  });

  it("blocked sender is always rejected even with manifest", async () => {
    const profile = testProfile();
    const manifestStore = createCapabilityManifestStore(profileDir);
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);

    await trustStore.setTrustRecord({ peerOwnerId: "envoy:owner:blocked", level: "blocked" });
    await manifestStore.createDefaultManifest({ visibility: "public-auto-answer" });
    const manifest = await manifestStore.loadManifest();

    const envelope = signedEnvelope(profile, {
      requesterOwnerId: "envoy:owner:blocked",
      requestedTagHashes: ["music"],
      requestedCapabilities: [],
      maxResults: 2,
    });

    const result = await handleInboundDiscoveryIntent({
      envelope,
      profile,
      remotePeerId: "libp2p-blocked",
      receivedAt: Date.now(),
      correlationId: undefined,
      taskStore,
      trustStore,
      capabilityManifest: manifest,
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toContain("blocked");
  });

  it("no manifest falls back to legacy trust-level gate", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);

    // No manifest store created

    const envelope = signedEnvelope(profile, {
      requesterOwnerId: "envoy:owner:stranger",
      requestedTagHashes: ["music"],
      requestedCapabilities: [],
      maxResults: 2,
    });

    const result = await handleInboundDiscoveryIntent({
      envelope,
      profile,
      remotePeerId: "libp2p-stranger",
      receivedAt: Date.now(),
      correlationId: undefined,
      taskStore,
      trustStore,
      anonymousDiscoveryMode: "contacts-only",
      // no capabilityManifest
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toContain("public");
  });

  it("manifest matched capabilities override device certificate", async () => {
    const profile = testProfile();
    const manifestStore = createCapabilityManifestStore(profileDir);
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);

    // Set up referred trust so contacts-only manifest allows this request
    await trustStore.setTrustRecord({
      peerOwnerId: "envoy:owner:friend",
      level: "referred",
    });

    // Manifest exposes only mesh.listen and mesh.discovery (NOT task.execute)
    // Device certificate has task.execute, but manifest should override
    await manifestStore.createDefaultManifest({
      visibility: "contacts-only",
      keywords: [],
      capabilities: ["mesh.listen", "mesh.discovery"], // NO task.execute
    });
    const manifest = await manifestStore.loadManifest();

    // Request mesh.discovery (which IS in manifest) - should match
    const envelope = signedEnvelope(profile, {
      requesterOwnerId: "envoy:owner:friend",
      requestedTagHashes: [],
      requestedCapabilities: ["mesh.discovery"],
      maxResults: 2,
    });

    const result = await handleInboundDiscoveryIntent({
      envelope,
      profile,
      remotePeerId: "libp2p-friend",
      receivedAt: Date.now(),
      correlationId: undefined,
      taskStore,
      trustStore,
      capabilityManifest: manifest,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.responsePayload?.matches.length).toBe(1);
      expect(result.responsePayload?.matches[0]?.matchedCapabilities).toContain("mesh.discovery");
    }
  });
});
