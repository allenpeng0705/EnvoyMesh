import {
  createAgentCredential,
  createDeviceCertificate,
  derivePeerId,
  generateAgentIdentity,
  generateDeviceIdentity,
  generateOwnerIdentity,
} from "@envoymesh/identity";
import { handleBondIntentViaRuntime } from "../src/node-service-handlers-bond-intent.js";
import {
  createLocalTaskStore,
  createLocalTrustStore,
  type NodeProfile,
} from "@envoymesh/local-store";
import { createUnsignedEnvelope, createBondAcceptPayload, createBondRequestPayload, type EnvoyEnvelope } from "@envoymesh/protocol";
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
        requesterPeerId: "libp2p-mac-peer",
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

    // The contract: the handler refuses to accept the bond. The handler
    // also emits a `message.rejected` audit for diagnostic purposes, but
    // the audit store deliberately drops `message.rejected` events to
    // keep the log volume manageable (see `LocalTaskStore.appendAuditEvent`).
    // Assert the rejection result, not the audit log.
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

  it("rejects bond.request from agent without ownerCommitmentRef", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);
    const strangerOwner = generateOwnerIdentity();
    const strangerAgent = generateAgentIdentity(strangerOwner.ownerId);
    const credential = createAgentCredential({
      owner: strangerOwner,
      agent: strangerAgent,
      scope: ["bond.request"],
    });
    const envelope: EnvoyEnvelope = {
      ...createUnsignedEnvelope({
        senderPeerId: strangerAgent.agentPeerId,
        senderPublicKey: strangerAgent.publicKeyPem,
        senderRole: "agent",
        recipientPeerId: derivePeerId(profile.device.publicKeyPem),
        recipientRole: "human",
        intent: "bond.request",
        payload: createBondRequestPayload({
          requesterOwnerId: strangerOwner.ownerId,
          message: "Agent-mediated hello",
          requestedLevel: "referred",
        }),
        agentCredential: credential,
        createdAt: "2026-04-27T10:00:00.000Z",
        messageId: "bond-agent-no-ref",
      }),
      signature: "signature",
    };

    const result = await handleInboundBondIntent({
      envelope,
      profile,
      remotePeerId: "libp2p-remote",
      receivedAt: Date.now(),
      correlationId: undefined,
      taskStore,
      trustStore,
    });

    expect(result).toEqual({
      ok: false,
      reason: "bond.request from agent requires ownerCommitmentRef",
    });
    expect(await taskStore.readAuditEvents()).toHaveLength(0);
  });

  // Phase 19 — bond_autonomy posture: agent-sent bond.accept
  it("rejects bond.accept from agent without agentCredential", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);
    const envelope: EnvoyEnvelope = {
      ...createUnsignedEnvelope({
        senderPeerId: "peer-remote",
        senderPublicKey: profile.device.publicKeyPem,
        senderRole: "agent",
        recipientPeerId: derivePeerId(profile.device.publicKeyPem),
        recipientRole: "human",
        intent: "bond.accept",
        payload: {
          responderOwnerId: "envoy:owner:win",
          requesterOwnerId: profile.owner.ownerId,
          message: "Hello from Win!",
        },
        createdAt: "2026-04-27T10:00:00.000Z",
        messageId: "bond-agent-accept-no-cred",
      }),
      signature: "signature",
    };

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
      expect(result.reason).toContain("bond_autonomy");
    }
  });

  it("rejects bond.accept from agent without bond_autonomy scope in credential", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);
    const strangerOwner = generateOwnerIdentity();
    const strangerAgent = generateAgentIdentity(strangerOwner.ownerId);
    const credential = createAgentCredential({
      owner: strangerOwner,
      agent: strangerAgent,
      scope: ["emp.social_proxy"], // NOT emp.bond_autonomy
    });
    const envelope: EnvoyEnvelope = {
      ...createUnsignedEnvelope({
        senderPeerId: strangerAgent.agentPeerId,
        senderPublicKey: strangerAgent.publicKeyPem,
        senderRole: "agent",
        recipientPeerId: derivePeerId(profile.device.publicKeyPem),
        recipientRole: "human",
        intent: "bond.accept",
        payload: {
          responderOwnerId: strangerOwner.ownerId,
          requesterOwnerId: profile.owner.ownerId,
          message: "Hello from Win!",
        },
        agentCredential: credential,
        createdAt: "2026-04-27T10:00:00.000Z",
        messageId: "bond-agent-accept-wrong-scope",
      }),
      signature: "signature",
    };

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
      expect(result.reason).toContain("bond_autonomy scope");
    }
  });

  it("accepts bond.accept from agent with valid bond_autonomy credential", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);
    const strangerOwner = generateOwnerIdentity();
    const strangerAgent = generateAgentIdentity(strangerOwner.ownerId);
    const credential = createAgentCredential({
      owner: strangerOwner,
      agent: strangerAgent,
      scope: ["emp.bond_autonomy", "emp.social_proxy"],
    });
    const envelope: EnvoyEnvelope = {
      ...createUnsignedEnvelope({
        senderPeerId: strangerAgent.agentPeerId,
        senderPublicKey: strangerAgent.publicKeyPem,
        senderRole: "agent",
        recipientPeerId: derivePeerId(profile.device.publicKeyPem),
        recipientRole: "human",
        intent: "bond.accept",
        payload: {
          responderOwnerId: strangerOwner.ownerId,
          requesterOwnerId: profile.owner.ownerId,
          message: "Hello from Win!",
        },
        agentCredential: credential,
        createdAt: "2026-04-27T10:00:00.000Z",
        messageId: "bond-agent-accept-valid",
      }),
      signature: "signature",
    };

    const result = await handleInboundBondIntent({
      envelope,
      profile,
      remotePeerId: "libp2p-win",
      receivedAt: Date.now(),
      correlationId: undefined,
      taskStore,
      trustStore,
    });

    expect(result.ok).toBe(true);
    // Trust store should now have the bond
    const record = await trustStore.getTrustRecord(strangerOwner.ownerId);
    expect(record?.level).toBe("direct");
  });
});

// ---------------------------------------------------------------------------
// Regression: handleBondIntentViaRuntime must thread trustStore into
// handleInboundBondIntent for bond.accept.
//
// Background: previously the embedded NodeService path passed
//   trustStore: undefined as never
// to handleInboundBondIntent, which crashed inside the bond.accept branch
// with "Cannot read properties of undefined (reading 'setTrustRecord')".
// The crash was caught by the outer try/catch and surfaced only as a
// "rejected bond" audit event, so bonds became asymmetric (the accepter
// recorded the requester, but the requester never recorded the accepter).
//
// These tests exercise the production wrapper end-to-end.
// ---------------------------------------------------------------------------

describe("handleBondIntentViaRuntime — bond.accept trustStore wiring", () => {
  function buildRuntimeCtx(args: {
    profile: NodeProfile;
    taskStore: ReturnType<typeof createLocalTaskStore>;
    trustStore: ReturnType<typeof createLocalTrustStore>;
    peerDirectory: { ensurePeerFromInboundChat: ReturnType<typeof import("vitest").vi.fn> };
  }) {
    return {
      getTaskStore: () => args.taskStore,
      getProfile: () => args.profile,
      getTrustStore: () => args.trustStore,
      storePendingHelloRequest: () => undefined,
      emit: () => undefined,
      flushPendingRoomSyncs: () => undefined,
      flushPendingRoomMessages: () => undefined,
      ensurePeerFromInboundChat: args.peerDirectory.ensurePeerFromInboundChat,
      tagBondedContactReachability: () => undefined,
    };
  }

  it("writes a direct trust record when B accepts A's bond request", async () => {
    const profileA = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);
    const ensurePeerFromInboundChat = (await import("vitest")).vi.fn(async () => undefined);
    const ctx = buildRuntimeCtx({ profile: profileA, taskStore, trustStore, peerDirectory: { ensurePeerFromInboundChat } });

    // B sends a bond.accept to A; A is the requester.
    const profileB = testProfile();
    const envelope: EnvoyEnvelope = {
      ...createUnsignedEnvelope({
        senderPeerId: "libp2p-b",
        senderPublicKey: profileB.device.publicKeyPem,
        senderRole: "human",
        recipientPeerId: derivePeerId(profileA.device.publicKeyPem),
        recipientRole: "human",
        intent: "bond.accept",
        payload: createBondAcceptPayload({
          responderOwnerId: profileB.owner.ownerId,
          requesterOwnerId: profileA.owner.ownerId,
          message: "Hello from B!",
        }),
        createdAt: "2026-04-27T10:00:00.000Z",
        messageId: "bond-accept-1",
      }),
      signature: "signature",
    };

    const consumed = await handleBondIntentViaRuntime(ctx, {
      envelope: envelope as any,
      remotePeerId: "libp2p-b",
      remoteAddr: "/ip4/127.0.0.1/tcp/4001",
    });

    expect(consumed).toBe(true);
    const record = await trustStore.getTrustRecord(profileB.owner.ownerId);
    expect(record?.level).toBe("direct");
    expect(record?.displayName).toBe("B");
  });

  it("surfaces a 'wiring bug' diagnostic when getTrustStore is missing — no silent bond asymmetry", async () => {
    const profileA = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);
    const ensurePeerFromInboundChat = (await import("vitest")).vi.fn(async () => undefined);
    const ctx = buildRuntimeCtx({ profile: profileA, taskStore, trustStore, peerDirectory: { ensurePeerFromInboundChat } });
    // Sabotage: replace getTrustStore with one that returns undefined.
    (ctx as { getTrustStore: () => unknown }).getTrustStore = () => undefined;

    const profileB = testProfile();
    const envelope: EnvoyEnvelope = {
      ...createUnsignedEnvelope({
        senderPeerId: "libp2p-b",
        senderPublicKey: profileB.device.publicKeyPem,
        senderRole: "human",
        recipientPeerId: derivePeerId(profileA.device.publicKeyPem),
        recipientRole: "human",
        intent: "bond.accept",
        payload: createBondAcceptPayload({
          responderOwnerId: profileB.owner.ownerId,
          requesterOwnerId: profileA.owner.ownerId,
          message: "Hello from B!",
        }),
        createdAt: "2026-04-27T10:00:00.000Z",
        messageId: "bond-accept-2",
      }),
      signature: "signature",
    };

    // Spy on console.warn so we can verify the diagnostic is loud.
    const warnSpy = (await import("vitest")).vi.spyOn(console, "warn").mockImplementation(() => {});

    // The wrapper doesn't propagate the inner throw — it catches and
    // turns it into a `rejected bond: <reason>` warning (and an audit
    // event). That's the right path: callers don't crash, but operators
    // get a greppable signal that A's bond was rejected for an internal
    // reason rather than a protocol-level rejection.
    const consumed = await handleBondIntentViaRuntime(ctx, {
      envelope: envelope as any,
      remotePeerId: "libp2p-b",
      remoteAddr: "/ip4/127.0.0.1/tcp/4001",
    });
    expect(consumed).toBe(true);

    // The rejection log must mention the wiring problem so it's
    // identifiable, not just a generic "invalid bond payload".
    const warnCalls = warnSpy.mock.calls.map((args) => String(args[0]));
    expect(
      warnCalls.some((line) => /bond\.accept requires a LocalTrustStore/.test(line)),
    ).toBe(true);

    warnSpy.mockRestore();

    // And critically, no half-written trust record leaked into the store.
    expect(await trustStore.getTrustRecord(profileB.owner.ownerId)).toBeUndefined();
  });
});
