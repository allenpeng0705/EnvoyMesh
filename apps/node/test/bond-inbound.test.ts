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
  profileDir = await mkdtemp(join(tmpdir(), "envoymesh-bond-"));
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

function signedEnvelope(profile: NodeProfile, intent: EnvoyEnvelope["intent"], payload: unknown): EnvoyEnvelope {
  return {
    ...createUnsignedEnvelope({
      senderPeerId: "peer-remote",
      senderPublicKey: profile.device.publicKeyPem,
      intent,
      payload,
      createdAt: "2026-04-27T10:00:00.000Z",
      messageId: "bond-msg-1",
    }),
    signature: "signature",
  };
}

describe("handleInboundBondIntent", () => {
  it("audits bond.request with policy outcome", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);
    const envelope = signedEnvelope(profile, "bond.request", {
      requesterOwnerId: "envoy:owner:stranger",
      message: "Hi",
      proofOfContext: "Same book club.",
      requestedLevel: "direct",
    });

    const result = await handleInboundBondIntent({
      envelope,
      profile,
      remotePeerId: "libp2p-remote",
      receivedAt: Date.now(),
      correlationId: "c1",
      taskStore,
      trustStore,
    });

    expect(result).toEqual({ ok: true });
    const audits = await taskStore.readAuditEvents();
    expect(audits.length).toBe(1);
    expect(audits[0].intent).toBe("bond.request");
    expect(audits[0].summary).toContain("bond.request from");
  });

  it("returns bondAcceptToRequester when bond.request is policy auto-accepted (referred)", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);
    await trustStore.setTrustRecord({
      peerOwnerId: "envoy:owner:stranger",
      level: "referred",
      now: new Date().toISOString(),
    });

    const envelope = signedEnvelope(profile, "bond.request", {
      requesterOwnerId: "envoy:owner:stranger",
      requesterDisplayName: "Stranger",
      message: "Hi",
      proofOfContext: "Same book club.",
      requestedLevel: "direct",
    });

    const result = await handleInboundBondIntent({
      envelope,
      profile,
      remotePeerId: "libp2p-mac-peer",
      receivedAt: Date.now(),
      correlationId: "c-auto",
      taskStore,
      trustStore,
    });

    expect(result).toEqual({
      ok: true,
      bondAcceptToRequester: {
        requesterPeerId: "peer-remote",
        requesterOwnerId: "envoy:owner:stranger",
      },
    });
    const record = await trustStore.getTrustRecord("envoy:owner:stranger");
    expect(record?.level).toBe("direct");
  });

  it("rejects bond.accept when requesterOwnerId does not match local owner", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);
    const envelope = signedEnvelope(profile, "bond.accept", {
      responderOwnerId: "envoy:owner:win",
      requesterOwnerId: "envoy:owner:someone-else",
      message: "Hello from Win!",
    });

    const result = await handleInboundBondIntent({
      envelope,
      profile,
      remotePeerId: "libp2p-win",
      receivedAt: Date.now(),
      correlationId: undefined,
      taskStore,
      trustStore,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("requesterOwnerId");
    }
  });

  it("rejects bond.challenge when targetOwnerId does not match local owner", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);
    const envelope = signedEnvelope(profile, "bond.challenge", {
      challengeId: "ch-1",
      nonce: "n1",
      challengerOwnerId: "envoy:owner:other",
      targetOwnerId: "envoy:owner:wrong-target",
      expiresAt: "2027-04-27T10:00:00.000Z",
    });

    const result = await handleInboundBondIntent({
      envelope,
      profile,
      remotePeerId: "libp2p-remote",
      receivedAt: Date.now(),
      correlationId: undefined,
      taskStore,
      trustStore,
    });

    expect(result.ok).toBe(false);
  });
});
