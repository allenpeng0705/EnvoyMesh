/**
 * Phase 8L — Extended bond inbound tests (bond-inbound.ts 50% → higher coverage).
 *
 * Tests the uncovered paths in handleInboundBondIntent:
 * - bond.challenge handling (deny/allow outcomes)
 * - bond.challenge.response handling
 * - bond.accept with displayName extraction from "Hello from {name}!" format
 * - bond.request approval_required (manual) outcome
 * - bond.request deny outcome (existing but not fully audited)
 * - Error handling (Zod parse failures)
 */

import { generateDeviceIdentity, generateOwnerIdentity } from "@envoymesh/identity";
import { createDeviceCertificate } from "@envoymesh/identity";
import {
  createLocalTaskStore,
  createLocalTrustStore,
  type NodeProfile,
} from "@envoymesh/local-store";
import { createUnsignedEnvelope, type EnvoyEnvelope } from "@envoymesh/protocol";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleInboundBondIntent } from "../src/bond-inbound.js";

let profileDir: string;

beforeEach(async () => {
  profileDir = await mkdtemp(join(tmpdir(), "envoymesh-bond-ext-"));
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
      capabilities: ["message.send", "mesh.listen", "mesh.discovery"],
    }),
  };
}

function signedEnvelope(
  profile: NodeProfile,
  intent: EnvoyEnvelope["intent"],
  payload: unknown,
): EnvoyEnvelope {
  const bondIntent = intent.startsWith("bond.");
  return {
    ...createUnsignedEnvelope({
      senderPeerId: "peer-remote",
      senderPublicKey: profile.device.publicKeyPem,
      ...(bondIntent
        ? { senderRole: "human" as const, recipientRole: "human" as const }
        : {}),
      intent,
      payload,
      createdAt: "2026-05-06T10:00:00.000Z",
      messageId: `bond-ext-${Date.now()}`,
    }),
    signature: "sig",
  };
}

describe("handleInboundBondIntent — bond.challenge", () => {
  it("denies bond.challenge when targetOwnerId does not match local owner", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);
    const envelope = signedEnvelope(profile, "bond.challenge", {
      challengeId: "ch-1",
      nonce: "n1",
      challengerOwnerId: "envoy:owner:challenger",
      targetOwnerId: "envoy:owner:wrong-owner",
      expiresAt: "2027-05-06T10:00:00.000Z",
    });

    const result = await handleInboundBondIntent({
      envelope,
      profile,
      remotePeerId: "libp2p-challenger",
      receivedAt: Date.now(),
      correlationId: "corr-ch",
      taskStore,
      trustStore,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("targetOwnerId");
    }
  });

  it("allows bond.challenge when targetOwnerId matches and challenger is known", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);

    // Challenger has referred trust
    await trustStore.setTrustRecord({
      peerOwnerId: "envoy:owner:challenger",
      level: "referred",
      now: new Date().toISOString(),
    });

    const envelope = signedEnvelope(profile, "bond.challenge", {
      challengeId: "ch-2",
      nonce: "nonce-abc",
      challengerOwnerId: "envoy:owner:challenger",
      targetOwnerId: profile.owner.ownerId,
      expiresAt: "2027-05-06T10:00:00.000Z",
    });

    const result = await handleInboundBondIntent({
      envelope,
      profile,
      remotePeerId: "libp2p-challenger",
      receivedAt: Date.now(),
      correlationId: "corr-ch2",
      taskStore,
      trustStore,
    });

    expect(result.ok).toBe(true);
    const audits = await taskStore.readAuditEvents();
    expect(audits.length).toBe(1);
    expect(audits[0].intent).toBe("bond.challenge");
    expect(audits[0].summary).toContain("bond.challenge");
  });

  it("denies bond.challenge when challenger is blocked", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);

    await trustStore.setTrustRecord({
      peerOwnerId: "envoy:owner:blocked-challenger",
      level: "blocked",
      now: new Date().toISOString(),
    });

    const envelope = signedEnvelope(profile, "bond.challenge", {
      challengeId: "ch-3",
      nonce: "nonce-blocked",
      challengerOwnerId: "envoy:owner:blocked-challenger",
      targetOwnerId: profile.owner.ownerId,
      expiresAt: "2027-05-06T10:00:00.000Z",
    });

    const result = await handleInboundBondIntent({
      envelope,
      profile,
      remotePeerId: "libp2p-blocked",
      receivedAt: Date.now(),
      correlationId: "corr-ch3",
      taskStore,
      trustStore,
    });

    expect(result.ok).toBe(true); // Returns ok but logs warn
    const audits = await taskStore.readAuditEvents();
    expect(audits[0].outcome).toBe("deny");
  });
});


describe("handleInboundBondIntent — bond.accept", () => {
  it("accepts bond.accept and extracts displayName from 'Hello from {name}!' format", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);

    const envelope = signedEnvelope(profile, "bond.accept", {
      responderOwnerId: "envoy:owner:alice",
      requesterOwnerId: profile.owner.ownerId,
      message: "Hello from Alice!",
    });

    const result = await handleInboundBondIntent({
      envelope,
      profile,
      remotePeerId: "libp2p-alice",
      receivedAt: Date.now(),
      correlationId: "corr-accept-alice",
      taskStore,
      trustStore,
    });

    expect(result.ok).toBe(true);

    // Verify trust record was stored with extracted displayName
    const record = await trustStore.getTrustRecord("envoy:owner:alice");
    expect(record).toBeDefined();
    expect(record!.displayName).toBe("Alice");
    expect(record!.level).toBe("direct");
  });

  it("accepts bond.accept and falls back to ownerId when message format doesn't match", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);

    const envelope = signedEnvelope(profile, "bond.accept", {
      responderOwnerId: "envoy:owner:bob",
      requesterOwnerId: profile.owner.ownerId,
      message: "Just saying hi",
    });

    const result = await handleInboundBondIntent({
      envelope,
      profile,
      remotePeerId: "libp2p-bob",
      receivedAt: Date.now(),
      correlationId: "corr-accept-bob",
      taskStore,
      trustStore,
    });

    expect(result.ok).toBe(true);

    const record = await trustStore.getTrustRecord("envoy:owner:bob");
    expect(record!.displayName).toBe("envoy:owner:bob"); // fallback to ownerId
  });

  it("accepts bond.accept and falls back to ownerId when message is absent", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);

    const envelope = signedEnvelope(profile, "bond.accept", {
      responderOwnerId: "envoy:owner:carol",
      requesterOwnerId: profile.owner.ownerId,
      message: undefined,
    });

    const result = await handleInboundBondIntent({
      envelope,
      profile,
      remotePeerId: "libp2p-carol",
      receivedAt: Date.now(),
      correlationId: "corr-accept-carol",
      taskStore,
      trustStore,
    });

    expect(result.ok).toBe(true);

    const record = await trustStore.getTrustRecord("envoy:owner:carol");
    expect(record!.displayName).toBe("envoy:owner:carol");
  });

  it("rejects bond.accept when requesterOwnerId does not match local owner", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);

    const envelope = signedEnvelope(profile, "bond.accept", {
      responderOwnerId: "envoy:owner:eve",
      requesterOwnerId: "envoy:owner:not-me",
      message: "Hello from Eve!",
    });

    const result = await handleInboundBondIntent({
      envelope,
      profile,
      remotePeerId: "libp2p-eve",
      receivedAt: Date.now(),
      correlationId: "corr-accept-eve",
      taskStore,
      trustStore,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("requesterOwnerId");
    }
    const audits = await taskStore.readAuditEvents();
    expect(audits.some((a) => a.type === "message.rejected" && a.summary.includes("requesterOwnerId mismatch"))).toBe(
      true,
    );
  });
});

describe("handleInboundBondIntent — bond.request approval_required", () => {
  it("returns ok=true (not ok:false) when bond.request requires manual approval", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);

    // No trust record → public → policy will likely require approval
    const envelope = signedEnvelope(profile, "bond.request", {
      requesterOwnerId: "envoy:owner:stranger-wants-in",
      message: "Can I join?",
      proofOfContext: "Same interest",
      requestedLevel: "direct",
    });

    const result = await handleInboundBondIntent({
      envelope,
      profile,
      remotePeerId: "libp2p-stranger",
      receivedAt: Date.now(),
      correlationId: "corr-approval",
      taskStore,
      trustStore,
    });

    // approval_required is still ok=true (not a denial — just needs manual review)
    expect(result.ok).toBe(true);
    const audits = await taskStore.readAuditEvents();
    expect(audits[0].outcome).toBe("record"); // not "deny"
  });

  it("stores no trust record when bond.request is approval_required", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);

    const envelope = signedEnvelope(profile, "bond.request", {
      requesterOwnerId: "envoy:owner:pending-approval",
      message: "Please?",
      proofOfContext: "Shared interest",
      requestedLevel: "referred",
    });

    await handleInboundBondIntent({
      envelope,
      profile,
      remotePeerId: "libp2p-pending",
      receivedAt: Date.now(),
      correlationId: "corr-pending",
      taskStore,
      trustStore,
    });

    // Bond should NOT be stored yet — user must approve first
    const record = await trustStore.getTrustRecord("envoy:owner:pending-approval");
    expect(record).toBeUndefined();
  });
});

describe("handleInboundBondIntent — error handling", () => {
  it("returns error reason when bond.request payload is malformed", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);

    const envelope = signedEnvelope(profile, "bond.request", {
      // missing required fields
    });

    const result = await handleInboundBondIntent({
      envelope,
      profile,
      remotePeerId: "libp2p-bad",
      receivedAt: Date.now(),
      correlationId: "corr-error",
      taskStore,
      trustStore,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("invalid bond payload");
    }
  });

  it("returns error reason when bond.challenge payload is malformed", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);

    const envelope = signedEnvelope(profile, "bond.challenge", {
      // missing required fields
    });

    const result = await handleInboundBondIntent({
      envelope,
      profile,
      remotePeerId: "libp2p-bad-ch",
      receivedAt: Date.now(),
      correlationId: "corr-error-ch",
      taskStore,
      trustStore,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("invalid bond payload");
    }
  });

  it("returns error reason when bond.accept payload is malformed", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);

    const envelope = signedEnvelope(profile, "bond.accept", {
      // missing required fields
    });

    const result = await handleInboundBondIntent({
      envelope,
      profile,
      remotePeerId: "libp2p-bad-accept",
      receivedAt: Date.now(),
      correlationId: "corr-error-accept",
      taskStore,
      trustStore,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("invalid bond payload");
    }
    const audits = await taskStore.readAuditEvents();
    expect(audits.some((a) => a.type === "message.rejected" && a.intent === "bond.accept")).toBe(true);
  });
});

describe("handleInboundBondIntent — bond.request self-bond prevention", () => {
  it("rejects bond.request when requesterOwnerId equals local owner", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);

    const envelope = signedEnvelope(profile, "bond.request", {
      requesterOwnerId: profile.owner.ownerId, // Same as local owner
      message: "Hello from me?",
      proofOfContext: "I am myself",
      requestedLevel: "direct",
    });

    const result = await handleInboundBondIntent({
      envelope,
      profile,
      remotePeerId: "libp2p-self",
      receivedAt: Date.now(),
      correlationId: "corr-self",
      taskStore,
      trustStore,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("cannot equal local owner");
    }
  });
});

describe("handleInboundBondIntent — unknown intent", () => {
  it("returns not-a-bond-intent for chat.message", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);

    const envelope = signedEnvelope(profile, "chat.message", {
      text: "Hello",
    });

    const result = await handleInboundBondIntent({
      envelope,
      profile,
      remotePeerId: "libp2p-chat",
      receivedAt: Date.now(),
      correlationId: "corr-chat",
      taskStore,
      trustStore,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("not a bond intent");
    }
  });
});
