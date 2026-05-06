/**
 * Phase 8M — Broadcast matching tests (broadcast-inbound.ts lines 166-197).
 *
 * Tests capability and keyword matching in handleInboundBroadcastRequest.
 *
 * Matching rules:
 * - hasTagMatch = true if requestedTagHashes.length > 0
 * - keywordsMatch: manifest["hash:X"] matches requested["hash:X"] (exact string match)
 *   Empty requestedKeywordHashes → true (no constraint)
 *   Non-empty both: true if any requested hash exactly equals any manifest keyword
 * - hasCapabilityMatch = filter(requestedCaps, manifestCaps).length > 0
 * - matches = hasTagMatch || hasCapabilityMatch || hasKeywordMatch
 *
 * Note: hasTagMatch is a presence check (length > 0), NOT a quality check.
 * This makes the matching quite permissive — most non-empty requests are allowed.
 */

import { generateDeviceIdentity, generateOwnerIdentity } from "@envoymesh/identity";
import { createDeviceCertificate } from "@envoymesh/identity";
import {
  createLocalTaskStore,
  createLocalTrustStore,
  type NodeProfile,
} from "@envoymesh/local-store";
import { createUnsignedEnvelope } from "@envoymesh/protocol";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleInboundBroadcastRequest } from "../src/broadcast-inbound.js";

let profileDir: string;

beforeEach(async () => {
  profileDir = await mkdtemp(join(tmpdir(), "envoymesh-bc-match-"));
});

afterEach(async () => {
  await rm(profileDir, { recursive: true, force: true });
});

function testProfile(): NodeProfile {
  const owner = generateOwnerIdentity();
  const device = generateDeviceIdentity();
  return {
    owner,
    device,
    deviceCertificate: createDeviceCertificate({
      owner,
      device,
      deviceProfile: "primary",
      capabilities: ["mesh.listen", "mesh.discovery", "task.execute"],
    }),
  };
}

function makeManifest(overrides: Partial<{
  visibility: "public-preview" | "contacts-only";
  sensitivityCeiling: "public" | "friends" | "trusted" | "private";
  capabilities: string[];
  keywords: string[];
}> = {}) {
  return {
    visibility: overrides.visibility ?? "public-preview",
    sensitivityCeiling: overrides.sensitivityCeiling ?? "public",
    capabilities: overrides.capabilities ?? ["mesh.listen", "mesh.discovery"],
    keywords: overrides.keywords ?? ["tech", "books"],
  };
}

function broadcastEnvelope(profile: NodeProfile, payload: unknown) {
  return {
    ...createUnsignedEnvelope({
      senderPeerId: "peer-broadcaster",
      senderPublicKey: profile.device.publicKeyPem,
      intent: "broadcast.request",
      payload,
      createdAt: "2026-05-06T10:00:00.000Z",
      messageId: `bc-match-${Date.now()}`,
    }),
    signature: "sig",
  };
}

describe("handleInboundBroadcastRequest — manifest matching", () => {
  it("allows when capability matches (non-empty cap list matches manifest)", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);

    await trustStore.setTrustRecord({ peerOwnerId: "envoy:owner:peer-cap", level: "referred" });

    // Request: task.execute (in manifest), no tags
    // → hasCapabilityMatch = true → matches = true → ALLOWED
    const manifest = makeManifest({ capabilities: ["task.execute"], keywords: [] });

    const envelope = broadcastEnvelope(profile, {
      queryId: "q-cap",
      ttl: 1,
      maxResponses: 3,
      requestedTagHashes: [],
      requestedCapabilities: ["task.execute"],
      requestedSensitivity: "public",
      senderOwnerId: "envoy:owner:peer-cap",
      timeoutMs: 30_000,
    });

    const result = await handleInboundBroadcastRequest({
      envelope,
      profile,
      remotePeerId: "libp2p-cap",
      receivedAt: Date.now(),
      correlationId: "corr-cap",
      taskStore,
      trustStore,
      capabilityManifest: manifest,
    });

    expect(result.ok).toBe(true);
  });

  it("allows when keyword matches (exact hash match)", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);

    await trustStore.setTrustRecord({ peerOwnerId: "envoy:owner:peer-kw", level: "referred" });

    // Request: hash:books (matches manifest keyword exactly), no caps
    // → hasCapabilityMatch = false
    // → hasTagMatch = true (non-empty)
    // → hasKeywordMatch = true (hash:books in manifestKeywords)
    // → matches = true → ALLOWED
    const manifest = makeManifest({ capabilities: [], keywords: ["hash:books"] });

    const envelope = broadcastEnvelope(profile, {
      queryId: "q-kw",
      ttl: 1,
      maxResponses: 3,
      requestedTagHashes: ["hash:books"],
      requestedCapabilities: [],
      requestedSensitivity: "public",
      senderOwnerId: "envoy:owner:peer-kw",
      timeoutMs: 30_000,
    });

    const result = await handleInboundBroadcastRequest({
      envelope,
      profile,
      remotePeerId: "libp2p-kw",
      receivedAt: Date.now(),
      correlationId: "corr-kw",
      taskStore,
      trustStore,
      capabilityManifest: manifest,
    });

    expect(result.ok).toBe(true);
  });

  it("allows when both capability and keyword match", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);

    await trustStore.setTrustRecord({ peerOwnerId: "envoy:owner:peer-both", level: "referred" });

    const manifest = makeManifest({ capabilities: ["task.execute"], keywords: ["hash:books"] });

    const envelope = broadcastEnvelope(profile, {
      queryId: "q-both",
      ttl: 1,
      maxResponses: 3,
      requestedTagHashes: ["hash:books"],
      requestedCapabilities: ["task.execute"],
      requestedSensitivity: "public",
      senderOwnerId: "envoy:owner:peer-both",
      timeoutMs: 30_000,
    });

    const result = await handleInboundBroadcastRequest({
      envelope,
      profile,
      remotePeerId: "libp2p-both",
      receivedAt: Date.now(),
      correlationId: "corr-both",
      taskStore,
      trustStore,
      capabilityManifest: manifest,
    });

    expect(result.ok).toBe(true);
  });

  it("denies when visibility=contacts-only for public caller", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);

    // Public trust (no record) + anonymousDiscoveryMode=public-preview (not "off")
    // → reaches visibility check → contacts-only rejects public callers
    const manifest = makeManifest({ visibility: "contacts-only", capabilities: ["mesh.listen"], keywords: ["hash:books"] });

    const envelope = broadcastEnvelope(profile, {
      queryId: "q-vis",
      ttl: 1,
      maxResponses: 3,
      requestedTagHashes: ["hash:books"],
      requestedCapabilities: ["mesh.listen"],
      requestedSensitivity: "public",
      senderOwnerId: "envoy:owner:stranger",
      timeoutMs: 30_000,
    });

    const result = await handleInboundBroadcastRequest({
      envelope,
      profile,
      remotePeerId: "libp2p-stranger",
      receivedAt: Date.now(),
      correlationId: "corr-vis",
      taskStore,
      trustStore,
      capabilityManifest: manifest,
      anonymousDiscoveryMode: "public-preview", // must be non-"off" to reach visibility check
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("contacts-only");
    }
  });

  it("denies when requested sensitivity exceeds manifest ceiling", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);

    await trustStore.setTrustRecord({ peerOwnerId: "envoy:owner:peer-sens", level: "direct" });

    const manifest = makeManifest({ sensitivityCeiling: "public", capabilities: ["mesh.listen"], keywords: [] });

    const envelope = broadcastEnvelope(profile, {
      queryId: "q-sens",
      ttl: 1,
      maxResponses: 3,
      requestedTagHashes: [],
      requestedCapabilities: ["mesh.listen"],
      requestedSensitivity: "friends", // exceeds ceiling
      senderOwnerId: "envoy:owner:peer-sens",
      timeoutMs: 30_000,
    });

    const result = await handleInboundBroadcastRequest({
      envelope,
      profile,
      remotePeerId: "libp2p-sens",
      receivedAt: Date.now(),
      correlationId: "corr-sens",
      taskStore,
      trustStore,
      capabilityManifest: manifest,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("sensitivity");
    }
  });

  it("audits broadcast.request with allow outcome when match succeeds", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);

    await trustStore.setTrustRecord({ peerOwnerId: "envoy:owner:peer-audit", level: "referred" });

    const manifest = makeManifest({ capabilities: ["task.execute"], keywords: [] });

    const envelope = broadcastEnvelope(profile, {
      queryId: "q-audit",
      ttl: 1,
      maxResponses: 3,
      requestedTagHashes: [],
      requestedCapabilities: ["task.execute"],
      requestedSensitivity: "public",
      senderOwnerId: "envoy:owner:peer-audit",
      timeoutMs: 30_000,
    });

    const result = await handleInboundBroadcastRequest({
      envelope,
      profile,
      remotePeerId: "libp2p-audit",
      receivedAt: Date.now(),
      correlationId: "corr-audit",
      taskStore,
      trustStore,
      capabilityManifest: manifest,
    });

    expect(result.ok).toBe(true);

    const audits = await taskStore.readAuditEvents();
    const bcEvent = audits.find((a) => a.intent === "broadcast.request");
    expect(bcEvent).toBeDefined();
    expect(bcEvent!.outcome).toBe("allow");
  });
});
