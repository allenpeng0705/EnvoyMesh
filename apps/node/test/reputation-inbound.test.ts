import { generateDeviceIdentity, generateOwnerIdentity } from "@envoymesh/identity";
import { createDeviceCertificate } from "@envoymesh/identity";
import {
  createLocalTaskStore,
  createLocalPeerReputationStore,
  createLocalPeerDirectoryStore,
  type NodeProfile,
} from "@envoymesh/local-store";
import { createUnsignedEnvelope } from "@envoymesh/protocol";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleInboundTaskFeedback, handleInboundOfficialCredential } from "../src/reputation-inbound.js";

let profileDir: string;

beforeEach(async () => {
  profileDir = await mkdtemp(join(tmpdir(), "envoymesh-reputation-"));
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

function signedEnvelope(profile: NodeProfile, intent: string, payload: unknown) {
  return {
    ...createUnsignedEnvelope({
      senderPeerId: "peer-feedback-sender",
      senderPublicKey: profile.device.publicKeyPem,
      intent,
      payload,
      createdAt: "2026-05-06T10:00:00.000Z",
      messageId: "feedback-msg-1",
    }),
    signature: "sig",
  };
}

describe("handleInboundTaskFeedback", () => {
  it("updates reputation score on successful task", async () => {
    const taskStore = createLocalTaskStore(profileDir);
    const reputationStore = createLocalPeerReputationStore(profileDir);

    const envelope = signedEnvelope(testProfile(), "task.feedback", {
      taskId: "task-001",
      outcome: "success",
      latencyMs: 500,
      abuseFlags: [],
    });

    const peerDirectoryStore = createLocalPeerDirectoryStore(profileDir);
    const result = await handleInboundTaskFeedback({ envelope, taskStore, reputationStore, peerDirectoryStore });

    expect(result.ok).toBe(true);

    const record = await reputationStore.getReputation(envelope.senderPeerId);
    expect(record).toBeDefined();
    expect(record!.score).toBeGreaterThan(50); // success should increase score
    expect(record!.successfulTasks).toBe(1);
    expect(record!.totalTasks).toBe(1);
  });

  it("decreases score on failed task", async () => {
    const taskStore = createLocalTaskStore(profileDir);
    const reputationStore = createLocalPeerReputationStore(profileDir);

    const envelope = signedEnvelope(testProfile(), "task.feedback", {
      taskId: "task-002",
      outcome: "failure",
      latencyMs: 2000,
      abuseFlags: [],
    });

    const peerDirectoryStore = createLocalPeerDirectoryStore(profileDir);
    const result = await handleInboundTaskFeedback({ envelope, taskStore, reputationStore, peerDirectoryStore });

    expect(result.ok).toBe(true);

    const record = await reputationStore.getReputation(envelope.senderPeerId);
    expect(record).toBeDefined();
    expect(record!.score).toBeLessThan(50); // failure should decrease score
    expect(record!.failedTasks).toBe(1);
  });

  it("records abuse flags and reduces score", async () => {
    const taskStore = createLocalTaskStore(profileDir);
    const reputationStore = createLocalPeerReputationStore(profileDir);

    const envelope = signedEnvelope(testProfile(), "task.feedback", {
      taskId: "task-003",
      outcome: "failure",
      latencyMs: 100,
      abuseFlags: ["malicious"],
    });

    const peerDirectoryStore = createLocalPeerDirectoryStore(profileDir);
    const result = await handleInboundTaskFeedback({ envelope, taskStore, reputationStore, peerDirectoryStore });

    expect(result.ok).toBe(true);

    const record = await reputationStore.getReputation(envelope.senderPeerId);
    expect(record).toBeDefined();
    expect(record!.abuseFlags).toContain("malicious");
    expect(record!.score).toBeLessThanOrEqual(40); // abuse flag should significantly decrease score
  });

  it("caps score at 100 on repeated successes", async () => {
    const taskStore = createLocalTaskStore(profileDir);
    const reputationStore = createLocalPeerReputationStore(profileDir);
    const peerDirectoryStore = createLocalPeerDirectoryStore(profileDir);

    const senderPeerId = "peer-feedback-sender";
    // Create multiple success feedback
    for (let i = 0; i < 20; i++) {
      const envelope = signedEnvelope(testProfile(), "task.feedback", {
        taskId: `task-suc-${i}`,
        outcome: "success",
        latencyMs: 100,
        abuseFlags: [],
      });
      await handleInboundTaskFeedback({ envelope, taskStore, reputationStore, peerDirectoryStore });
    }

    const record = await reputationStore.getReputation(senderPeerId);
    expect(record!.score).toBe(100);
    expect(record!.successfulTasks).toBe(20);
  });

  it("floors score at 0 on repeated failures", async () => {
    const taskStore = createLocalTaskStore(profileDir);
    const reputationStore = createLocalPeerReputationStore(profileDir);
    const peerDirectoryStore = createLocalPeerDirectoryStore(profileDir);

    const senderPeerId = "peer-feedback-sender";
    for (let i = 0; i < 20; i++) {
      const envelope = signedEnvelope(testProfile(), "task.feedback", {
        taskId: `task-fail-${i}`,
        outcome: "failure",
        latencyMs: 100,
        abuseFlags: [],
      });
      await handleInboundTaskFeedback({ envelope, taskStore, reputationStore, peerDirectoryStore });
    }

    const record = await reputationStore.getReputation(senderPeerId);
    expect(record!.score).toBe(0);
    expect(record!.failedTasks).toBe(20);
  });

  it("rejects non-task.feedback intent", async () => {
    const taskStore = createLocalTaskStore(profileDir);
    const reputationStore = createLocalPeerReputationStore(profileDir);

    const envelope = signedEnvelope(testProfile(), "discovery.request", {});

    const peerDirectoryStore = createLocalPeerDirectoryStore(profileDir);
    const result = await handleInboundTaskFeedback({ envelope, taskStore, reputationStore, peerDirectoryStore });

    expect(result).toEqual({ ok: false, reason: "not a task.feedback intent" });
  });
});

describe("handleInboundOfficialCredential", () => {
  it("rejects unknown anchor", async () => {
    const taskStore = createLocalTaskStore(profileDir);

    const envelope = signedEnvelope(testProfile(), "official.credential", {
      version: "0.1",
      anchorId: "envoy:anchor:unknown",
      peerId: "peer-credential-holder",
      ownerId: "envoy:owner:credential-holder",
      capabilities: ["mesh.listen"],
      expiresAt: "2030-01-01T00:00:00.000Z",
      issuedAt: "2026-05-06T00:00:00.000Z",
      signature: "fake-signature",
    });

    const result = await handleInboundOfficialCredential({
      envelope,
      taskStore,
      trustAnchorPublicKeys: {}, // empty — no anchors known
    });

    expect(result).toEqual({ ok: false, reason: "unknown anchor: envoy:anchor:unknown" });
  });

  it("rejects expired credential", async () => {
    const taskStore = createLocalTaskStore(profileDir);
    const { signCanonicalPayload, derivePeerId } = await import("@envoymesh/identity");
    const { createUnsignedEnvelope: createUnsignedEnv } = await import("@envoymesh/protocol");
    const anchorOwner = generateOwnerIdentity();
    const anchorDevice = generateDeviceIdentity();

    // Create a real signed credential
    const unsigned = {
      version: "0.1" as const,
      anchorId: "envoy:anchor:test",
      peerId: "peer-credential-holder",
      ownerId: "envoy:owner:credential-holder",
      capabilities: ["mesh.listen"],
      expiresAt: "2020-01-01T00:00:00.000Z", // expired
      issuedAt: "2019-01-01T00:00:00.000Z",
    };
    const signature = signCanonicalPayload(unsigned, anchorDevice.privateKeyPem);

    const envelope = {
      ...createUnsignedEnv({
        senderPeerId: "peer-credential-holder",
        senderPublicKey: anchorDevice.publicKeyPem,
        intent: "official.credential" as const,
        payload: { ...unsigned, signature },
        createdAt: "2026-05-06T10:00:00.000Z",
        messageId: "cred-msg-1",
      }),
      signature,
    };

    const result = await handleInboundOfficialCredential({
      envelope,
      taskStore,
      trustAnchorPublicKeys: { "envoy:anchor:test": anchorDevice.publicKeyPem },
    });

    expect(result).toEqual({ ok: false, reason: "credential has expired" });
  });

  it("rejects credential with invalid signature", async () => {
    const taskStore = createLocalTaskStore(profileDir);
    const { derivePeerId } = await import("@envoymesh/identity");
    const { createUnsignedEnvelope: createUnsignedEnv } = await import("@envoymesh/protocol");
    const anchorOwner = generateOwnerIdentity();
    const anchorDevice = generateDeviceIdentity();

    // Create credential with WRONG signature (using wrong key)
    const wrongDevice = generateDeviceIdentity();
    const unsigned = {
      version: "0.1" as const,
      anchorId: "envoy:anchor:test",
      peerId: "peer-credential-holder",
      ownerId: "envoy:owner:credential-holder",
      capabilities: ["mesh.listen"],
      expiresAt: "2030-01-01T00:00:00.000Z",
      issuedAt: "2026-05-06T00:00:00.000Z",
    };
    const signature = "fake-invalid-signature";

    const envelope = {
      ...createUnsignedEnv({
        senderPeerId: "peer-credential-holder",
        senderPublicKey: wrongDevice.publicKeyPem,
        intent: "official.credential" as const,
        payload: { ...unsigned, signature },
        createdAt: "2026-05-06T10:00:00.000Z",
        messageId: "cred-msg-2",
      }),
      signature,
    };

    const result = await handleInboundOfficialCredential({
      envelope,
      taskStore,
      trustAnchorPublicKeys: { "envoy:anchor:test": anchorDevice.publicKeyPem },
    });

    expect(result).toEqual({ ok: false, reason: "invalid credential signature" });
  });

  it("rejects non-official.credential intent", async () => {
    const taskStore = createLocalTaskStore(profileDir);

    const envelope = signedEnvelope(testProfile(), "discovery.request", {});

    const result = await handleInboundOfficialCredential({
      envelope,
      taskStore,
      trustAnchorPublicKeys: { "envoy:anchor:test": "some-pem" },
    });

    expect(result).toEqual({ ok: false, reason: "not an official.credential intent" });
  });
});
