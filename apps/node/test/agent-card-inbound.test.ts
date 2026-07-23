import {
  createAgentCardStore,
  createHumanProfileStore,
  createLocalTaskStore,
  createLocalTrustStore,
} from "@envoymesh/local-store";
import { generateAgentIdentity, generateOwnerIdentity, createAgentCredential } from "@envoymesh/identity";
import {
  createAgentCard,
  createAgentCardRequestPayload,
  createAgentCardResponsePayload,
  createUnsignedEnvelope,
  type EnvoyEnvelope,
} from "@envoymesh/protocol";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleInboundAgentCardIntent } from "../src/agent-card-inbound.js";

let profileDir: string;
let taskStore: ReturnType<typeof createLocalTaskStore>;
let trustStore: ReturnType<typeof createLocalTrustStore>;
let agentCardStore: ReturnType<typeof createAgentCardStore>;
let humanProfileStore: ReturnType<typeof createHumanProfileStore>;

const OWNER_ID = "envoy:owner:alice";
const PEER_OWNER_ID = "envoy:owner:bob";
const REMOTE_PEER = "envoy_peer_remote";

function makeTestProfile() {
  return {
    owner: {
      ownerId: OWNER_ID,
      publicKeyPem: "-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----",
    },
    device: {
      deviceId: "envoy:device:desktop",
      publicKeyPem: "-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----",
      privateKeyPem: "-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----",
    },
    deviceCertificate: {
      version: "0.1",
      deviceId: "envoy:device:desktop",
      ownerPublicKey: "-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----",
      deviceProfile: "primary",
      capabilities: ["message.send", "task.execute"],
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      signature: "sig",
    },
  };
}

const aliceOwner = generateOwnerIdentity();
const bobOwner = { ...generateOwnerIdentity(), ownerId: PEER_OWNER_ID };
const bobAgent = generateAgentIdentity(PEER_OWNER_ID);
const peerAgentCredential = createAgentCredential({
  owner: bobOwner,
  agent: bobAgent,
  scope: ["message.send", "task.execute"],
});

function agentEnvelope(
  intent: "agent.card.request" | "agent.card.response",
  payload: unknown,
  extra?: Partial<EnvoyEnvelope>,
): EnvoyEnvelope {
  return {
    ...createUnsignedEnvelope({
      senderPeerId: bobAgent.agentPeerId,
      senderPublicKey: bobAgent.publicKeyPem,
      senderRole: "agent",
      intent,
      payload,
      createdAt: "2026-05-20T10:00:00.000Z",
      messageId: `message-${intent}`,
      agentCredential: peerAgentCredential,
      ...extra,
    }),
    signature: "signature",
  };
}

const bridgeIdentity = {
  agentPeerId: "envoy_agent_alice",
  agentPublicKeyPem: "-----BEGIN PUBLIC KEY-----\nalice\n-----END PUBLIC KEY-----",
  agentPrivateKeyPem: "-----BEGIN PRIVATE KEY-----\nalice\n-----END PRIVATE KEY-----",
  ownerId: OWNER_ID,
  agentCredential: createAgentCredential({
    owner: { ...aliceOwner, ownerId: OWNER_ID },
    agent: generateAgentIdentity(OWNER_ID),
    scope: ["message.send", "task.execute"],
  }),
};

beforeEach(async () => {
  profileDir = await mkdtemp(join(tmpdir(), "envoymesh-agent-card-"));
  taskStore = createLocalTaskStore(profileDir);
  trustStore = createLocalTrustStore(profileDir);
  agentCardStore = createAgentCardStore(profileDir);
  humanProfileStore = createHumanProfileStore(profileDir);
  await trustStore.setTrustRecord({
    peerOwnerId: PEER_OWNER_ID,
    level: "direct",
    displayName: "Bob",
    createdAt: "2026-05-20T08:00:00.000Z",
  });
});

afterEach(async () => {
  await rm(profileDir, { recursive: true, force: true });
});

describe("handleInboundAgentCardIntent", () => {
  it("responds to agent.card.request with local card payload", async () => {
    const request = createAgentCardRequestPayload({
      requesterOwnerId: PEER_OWNER_ID,
      requesterDeviceId: "envoy:device:phone",
      requestedTopics: ["books"],
    });
    const result = await handleInboundAgentCardIntent({
      envelope: agentEnvelope("agent.card.request", request),
      profile: makeTestProfile(),
      remotePeerId: REMOTE_PEER,
      receivedAt: Date.now(),
      correlationId: "corr-card-1",
      taskStore,
      trustStore,
      agentCardStore,
      humanProfileStore,
      bridgeIdentity,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.action).toBe("respond");
      if (result.action === "respond") {
        expect(result.responsePayload.card.ownerId).toBe(OWNER_ID);
        expect(result.responsePayload.card.capabilities).toContain("message.send");
        // Private by default — not recruitable for Agent Network / Chains.
        expect(result.responsePayload.card.capabilities).not.toContain("capability-provider");
      }
    }
  });

  it("advertises capability-provider on agent card when Capability Provider is enabled", async () => {
    const request = createAgentCardRequestPayload({
      requesterOwnerId: PEER_OWNER_ID,
      requesterDeviceId: "envoy:device:phone",
    });
    const result = await handleInboundAgentCardIntent({
      envelope: agentEnvelope("agent.card.request", request),
      profile: makeTestProfile(),
      remotePeerId: REMOTE_PEER,
      receivedAt: Date.now(),
      correlationId: "corr-card-opt-in",
      taskStore,
      trustStore,
      agentCardStore,
      humanProfileStore,
      bridgeIdentity,
      capabilityProviderEnabled: true,
    });

    expect(result.ok).toBe(true);
    if (result.ok && result.action === "respond") {
      expect(result.responsePayload.card.capabilities).toContain("capability-provider");
      expect(result.responsePayload.card.capabilities).toContain("task.execute");
    }
  });

  it("advertises agentNetworkProfile on card when Capability Provider is enabled", async () => {
    const request = createAgentCardRequestPayload({
      requesterOwnerId: PEER_OWNER_ID,
      requesterDeviceId: "envoy:device:phone",
    });
    const result = await handleInboundAgentCardIntent({
      envelope: agentEnvelope("agent.card.request", request),
      profile: makeTestProfile(),
      remotePeerId: REMOTE_PEER,
      receivedAt: Date.now(),
      correlationId: "corr-card-profile",
      taskStore,
      trustStore,
      agentCardStore,
      humanProfileStore,
      bridgeIdentity,
      capabilityProviderEnabled: true,
      agentNetworkProfile: {
        modelFreshness: 8,
        spendPosture: "subscription",
        contextWindow: "512k",
        strengths: ["research"],
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok && result.action === "respond") {
      expect(result.responsePayload.card.agentNetworkProfile?.modelFreshness).toBe(8);
      expect(result.responsePayload.card.agentNetworkProfile?.contextWindow).toBe("512k");
      expect(result.responsePayload.card.capabilities).toContain("capability-provider");
    }
  });

  it("caches agent.card.response and persists in store", async () => {
    const card = createAgentCard({
      ownerId: PEER_OWNER_ID,
      displayName: "Bob's Envoy",
      nodeProfile: "primary",
      capabilities: ["task.execute"],
    });
    const response = createAgentCardResponsePayload(card);
    const result = await handleInboundAgentCardIntent({
      envelope: agentEnvelope("agent.card.response", response),
      profile: makeTestProfile(),
      remotePeerId: REMOTE_PEER,
      receivedAt: Date.now(),
      correlationId: "corr-card-2",
      taskStore,
      trustStore,
      agentCardStore,
      humanProfileStore,
      bridgeIdentity,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.action).toBe("cached");
      if (result.action === "cached") {
        expect(result.ownerId).toBe(PEER_OWNER_ID);
        expect(result.card.displayName).toBe("Bob's Envoy");
      }
    }
    const cached = await agentCardStore.get(PEER_OWNER_ID);
    expect(cached?.card.displayName).toBe("Bob's Envoy");
  });

  it("denies agent.card when bond is public", async () => {
    await trustStore.setTrustRecord({
      peerOwnerId: PEER_OWNER_ID,
      level: "public",
      displayName: "Bob",
      createdAt: "2026-05-20T08:00:00.000Z",
    });
    const request = createAgentCardRequestPayload({
      requesterOwnerId: PEER_OWNER_ID,
      requesterDeviceId: "envoy:device:phone",
    });
    const result = await handleInboundAgentCardIntent({
      envelope: agentEnvelope("agent.card.request", request),
      profile: makeTestProfile(),
      remotePeerId: REMOTE_PEER,
      receivedAt: Date.now(),
      correlationId: "corr-card-3",
      taskStore,
      trustStore,
      agentCardStore,
      humanProfileStore,
      bridgeIdentity,
    });

    expect(result.ok).toBe(false);
  });
});
