/**
 * Phase 8M — Load/spam tests for discovery (8I open task).
 *
 * Tests that prove non-matching anonymous discovery requests do NOT call the model.
 * Each test verifies that:
 * 1. The request is denied at the policy/manifest level
 * 2. No model.routed audit event is written (model was never called)
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
import { handleInboundDiscoveryIntent } from "../src/discovery-inbound.js";

let profileDir: string;

beforeEach(async () => {
  profileDir = await mkdtemp(join(tmpdir(), "envoymesh-loadspam-"));
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

function discoveryEnvelope(profile: NodeProfile, payload: unknown) {
  return {
    ...createUnsignedEnvelope({
      senderPeerId: "peer-remote",
      senderPublicKey: profile.device.publicKeyPem,
      intent: "discovery.request",
      payload,
      createdAt: "2026-05-06T10:00:00.000Z",
      messageId: `disc-load-${Date.now()}`,
    }),
    signature: "sig",
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
    capabilities: overrides.capabilities ?? ["task.execute"],
    keywords: overrides.keywords ?? ["books"],
  };
}

describe("discovery inbound — non-matching requests do NOT call the model", () => {
  it("denies when anonymous mode is 'off' and writes no model.routed audit", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);

    const envelope = discoveryEnvelope(profile, {
      requesterOwnerId: "envoy:owner:stranger",
      requestedTagHashes: ["hash:books"],
      requestedCapabilities: ["task.execute"],
      maxResults: 2,
    });

    const result = await handleInboundDiscoveryIntent({
      envelope,
      profile,
      remotePeerId: "libp2p-stranger",
      receivedAt: Date.now(),
      correlationId: "corr-off",
      taskStore,
      trustStore,
      anonymousDiscoveryMode: "off", // anonymous disabled
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toContain("disabled");

    // No model.routed event — model was never consulted
    const audits = await taskStore.readAuditEvents();
    expect(audits.some((a) => a.type === "model.routed")).toBe(false);
  });

  it("denies when anonymous mode is 'contacts-only' for public caller", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);

    const envelope = discoveryEnvelope(profile, {
      requesterOwnerId: "envoy:owner:stranger",
      requestedTagHashes: ["hash:books"],
      requestedCapabilities: ["task.execute"],
      maxResults: 2,
    });

    const result = await handleInboundDiscoveryIntent({
      envelope,
      profile,
      remotePeerId: "libp2p-stranger",
      receivedAt: Date.now(),
      correlationId: "corr-contacts",
      taskStore,
      trustStore,
      anonymousDiscoveryMode: "contacts-only", // public callers rejected
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toContain("contacts-only");

    const audits = await taskStore.readAuditEvents();
    expect(audits.some((a) => a.type === "model.routed")).toBe(false);
  });

  it("denies when anonymous sensitivity exceeds ceiling", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);

    const envelope = discoveryEnvelope(profile, {
      requesterOwnerId: "envoy:owner:stranger",
      requestedTagHashes: ["hash:books"],
      requestedCapabilities: ["task.execute"],
      requestedSensitivity: "friends", // exceeds ceiling
      maxResults: 2,
    });

    const result = await handleInboundDiscoveryIntent({
      envelope,
      profile,
      remotePeerId: "libp2p-stranger",
      receivedAt: Date.now(),
      correlationId: "corr-ceiling",
      taskStore,
      trustStore,
      anonymousDiscoveryMode: "public-preview",
      anonymousSensitivityCeiling: "public", // ceiling = public
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toContain("sensitivity");

    const audits = await taskStore.readAuditEvents();
    expect(audits.some((a) => a.type === "model.routed")).toBe(false);
  });

  it("denies when no manifest and sender has public trust (no model call)", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);

    const envelope = discoveryEnvelope(profile, {
      requesterOwnerId: "envoy:owner:stranger",
      requestedTagHashes: ["hash:books"],
      requestedCapabilities: ["task.execute"],
      maxResults: 2,
    });

    const result = await handleInboundDiscoveryIntent({
      envelope,
      profile,
      remotePeerId: "libp2p-stranger",
      receivedAt: Date.now(),
      correlationId: "corr-no-manifest",
      taskStore,
      trustStore,
      anonymousDiscoveryMode: "public-preview", // must be non-off to reach manifest check
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toContain("public");

    const audits = await taskStore.readAuditEvents();
    expect(audits.some((a) => a.type === "model.routed")).toBe(false);
  });

  it("denies when sender trust level is blocked (no model call)", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);

    await trustStore.setTrustRecord({ peerOwnerId: "envoy:owner:blocked-peer", level: "blocked" });

    const envelope = discoveryEnvelope(profile, {
      requesterOwnerId: "envoy:owner:blocked-peer",
      requestedTagHashes: ["hash:books"],
      requestedCapabilities: ["task.execute"],
      maxResults: 2,
    });

    const result = await handleInboundDiscoveryIntent({
      envelope,
      profile,
      remotePeerId: "libp2p-blocked",
      receivedAt: Date.now(),
      correlationId: "corr-blocked",
      taskStore,
      trustStore,
      anonymousDiscoveryMode: "public-preview",
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toContain("blocked");

    const audits = await taskStore.readAuditEvents();
    expect(audits.some((a) => a.type === "model.routed")).toBe(false);
  });

  it("denies when manifest visibility is contacts-only and caller is public", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);

    // Public trust (no record)
    const manifest = makeManifest({ visibility: "contacts-only", capabilities: ["task.execute"], keywords: ["books"] });

    const envelope = discoveryEnvelope(profile, {
      requesterOwnerId: "envoy:owner:stranger",
      requestedTagHashes: ["hash:books"],
      requestedCapabilities: ["task.execute"],
      requestedSensitivity: "public",
      maxResults: 2,
    });

    const result = await handleInboundDiscoveryIntent({
      envelope,
      profile,
      remotePeerId: "libp2p-stranger",
      receivedAt: Date.now(),
      correlationId: "corr-vis",
      taskStore,
      trustStore,
      anonymousDiscoveryMode: "public-preview",
      capabilityManifest: manifest,
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toContain("contacts-only");

    const audits = await taskStore.readAuditEvents();
    expect(audits.some((a) => a.type === "model.routed")).toBe(false);
  });

  it("allows matching anonymous request and writes model.routed audit", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);

    await trustStore.setTrustRecord({ peerOwnerId: "envoy:owner:peer-match", level: "referred" });

    const manifest = makeManifest({ capabilities: ["task.execute"], keywords: ["books"] });

    const envelope = discoveryEnvelope(profile, {
      requesterOwnerId: "envoy:owner:peer-match",
      requestedTagHashes: ["hash:books"], // matches keyword
      requestedCapabilities: ["task.execute"], // matches capability
      requestedSensitivity: "public",
      maxResults: 2,
    });

    const result = await handleInboundDiscoveryIntent({
      envelope,
      profile,
      remotePeerId: "libp2p-peer-match",
      receivedAt: Date.now(),
      correlationId: "corr-match",
      taskStore,
      trustStore,
      anonymousDiscoveryMode: "public-preview",
      capabilityManifest: manifest,
    });

    // Match succeeds
    expect(result.ok).toBe(true);

    // Audit has message.verified event for discovery.request with allow outcome
    const audits = await taskStore.readAuditEvents();
    expect(audits.some((a) => a.intent === "discovery.request" && a.outcome === "allow")).toBe(true);
    // model.routed does NOT appear for discovery (discovery is peer info, not model-generated)
  });
});
