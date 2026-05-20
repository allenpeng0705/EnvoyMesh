/**
 * Phase 12 exit criterion: integration scenario across two logical nodes (temp dirs + profiles).
 * Covers discovery.request → social.intro.sync → social.intro.propose → credential-bearing bond.request → bond.accept
 * with a shared correlation id on audited intents where applicable.
 */
import {
  createAgentCredential,
  createDeviceCertificate,
  derivePeerId,
  generateAgentIdentity,
  generateDeviceIdentity,
  generateOwnerIdentity,
} from "@envoymesh/identity";
import {
  createLocalTaskStore,
  createLocalTrustStore,
  type NodeProfile,
} from "@envoymesh/local-store";
import {
  createBondAcceptPayload,
  createBondRequestPayload,
  createDiscoveryRequestPayload,
  createHumanProfileFragmentPayload,
  createSocialIntroProposePayload,
  createSocialIntroSyncPayload,
  createUnsignedEnvelope,
  type EnvoyEnvelope,
} from "@envoymesh/protocol";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleInboundBondIntent } from "../src/bond-inbound.js";
import { __resetDiscoveryState, handleInboundDiscoveryIntent } from "../src/discovery-inbound.js";
import { __resetSocialIntroInboundTestState, handleInboundSocialIntroIntent } from "../src/social-intro-inbound.js";

let aliceDir: string;
let bobDir: string;

beforeEach(async () => {
  __resetDiscoveryState();
  __resetSocialIntroInboundTestState();
  aliceDir = await mkdtemp(join(tmpdir(), "envoymesh-alice-intro-"));
  bobDir = await mkdtemp(join(tmpdir(), "envoymesh-bob-intro-"));
});

afterEach(async () => {
  await rm(aliceDir, { recursive: true, force: true });
  await rm(bobDir, { recursive: true, force: true });
});

function deviceProfile(): NodeProfile {
  const owner = generateOwnerIdentity();
  const device = generateDeviceIdentity();
  return {
    owner,
    device,
    deviceCertificate: createDeviceCertificate({
      owner,
      device,
      deviceProfile: "primary",
      capabilities: ["message.send", "mesh.listen", "mesh.discovery", "task.execute"],
    }),
  };
}

describe("Trust-mode intro → bond (two logical nodes)", () => {
  it("audits discovery + intro intents + bond.accept with correlated ids", async () => {
    const aliceProfile = deviceProfile();
    const bobProfile = deviceProfile();

    const aliceTaskStore = createLocalTaskStore(aliceDir);
    const aliceTrustStore = createLocalTrustStore(aliceDir);
    const bobTaskStore = createLocalTaskStore(bobDir);
    const bobTrustStore = createLocalTrustStore(bobDir);

    const aliceOwnerId = aliceProfile.owner.ownerId;
    const bobOwnerId = bobProfile.owner.ownerId;

    await bobTrustStore.setTrustRecord({
      peerOwnerId: aliceOwnerId,
      displayName: "Alice",
      level: "referred",
      now: new Date().toISOString(),
    });
    await aliceTrustStore.setTrustRecord({
      peerOwnerId: bobOwnerId,
      displayName: "Bob",
      level: "referred",
      now: new Date().toISOString(),
    });

    const correlationId = "corr-phase12-intro-bond";
    const introCorrelationId = "ic-phase12-intro-bond";
    const aliceLibp2pPeer = "libp2p-alice";
    const bobLibp2pPeer = "libp2p-bob";

    const aliceAgent = generateAgentIdentity(aliceOwnerId);
    const aliceCredential = createAgentCredential({
      owner: aliceProfile.owner,
      agent: aliceAgent,
      scope: ["discovery.request", "social.intro.sync", "social.intro.propose", "bond.request"],
    });

    const discoveryEnvelope: EnvoyEnvelope = {
      ...createUnsignedEnvelope({
        senderPeerId: derivePeerId(aliceProfile.device.publicKeyPem),
        senderPublicKey: aliceProfile.device.publicKeyPem,
        intent: "discovery.request",
        payload: createDiscoveryRequestPayload({
          requesterOwnerId: aliceOwnerId,
          requestedTagHashes: ["hash:trust-intro"],
          requestedCapabilities: [],
          maxResults: 3,
        }),
        createdAt: "2026-06-15T12:00:00.000Z",
        messageId: "disc-intro-bond-1",
      }),
      signature: "signature",
    };

    const discoveryBob = await handleInboundDiscoveryIntent({
      envelope: discoveryEnvelope,
      profile: bobProfile,
      remotePeerId: aliceLibp2pPeer,
      receivedAt: Date.now(),
      correlationId,
      taskStore: bobTaskStore,
      trustStore: bobTrustStore,
      anonymousDiscoveryMode: "contacts-only",
    });
    expect(discoveryBob.ok).toBe(true);

    const syncEnvelope: EnvoyEnvelope = {
      ...createUnsignedEnvelope({
        senderPeerId: aliceAgent.agentPeerId,
        senderPublicKey: aliceAgent.publicKeyPem,
        senderRole: "agent",
        recipientPeerId: derivePeerId(bobProfile.device.publicKeyPem),
        recipientRole: "agent",
        intent: "social.intro.sync",
        payload: createSocialIntroSyncPayload({
          introCorrelationId,
          ownerId: aliceOwnerId,
          interest: "explore",
          profileFragmentRefs: [],
        }),
        agentCredential: aliceCredential,
        createdAt: "2026-06-15T12:01:00.000Z",
        messageId: "soc-intro-sync-1",
      }),
      signature: "signature",
    };

    await handleInboundSocialIntroIntent({
      envelope: syncEnvelope,
      profile: bobProfile,
      remotePeerId: aliceLibp2pPeer,
      receivedAt: Date.now(),
      correlationId,
      taskStore: bobTaskStore,
      trustStore: bobTrustStore,
      trustModeEnabled: true,
    });

    const fragment = createHumanProfileFragmentPayload({
      ownerId: aliceOwnerId,
      purpose: "trust-mode-intro",
      expiresAt: "2035-01-01T00:00:00.000Z",
      bio: "Introduced via Phase 12 smoke.",
      signature: "sig-placeholder",
    });

    const proposeEnvelope: EnvoyEnvelope = {
      ...createUnsignedEnvelope({
        senderPeerId: aliceAgent.agentPeerId,
        senderPublicKey: aliceAgent.publicKeyPem,
        senderRole: "agent",
        recipientPeerId: derivePeerId(bobProfile.device.publicKeyPem),
        recipientRole: "human",
        intent: "social.intro.propose",
        payload: createSocialIntroProposePayload({
          introCorrelationId,
          candidateOwnerId: bobOwnerId,
          candidatePeerId: derivePeerId(bobProfile.device.publicKeyPem),
          profileFragment: fragment,
          rationale: "Phase 12 integration scenario.",
        }),
        agentCredential: aliceCredential,
        createdAt: "2026-06-15T12:02:00.000Z",
        messageId: "soc-intro-propose-1",
      }),
      signature: "signature",
    };

    await handleInboundSocialIntroIntent({
      envelope: proposeEnvelope,
      profile: bobProfile,
      remotePeerId: aliceLibp2pPeer,
      receivedAt: Date.now(),
      correlationId,
      taskStore: bobTaskStore,
      trustStore: bobTrustStore,
      trustModeEnabled: true,
    });

    const bondRequestEnvelope: EnvoyEnvelope = {
      ...createUnsignedEnvelope({
        senderPeerId: aliceAgent.agentPeerId,
        senderPublicKey: aliceAgent.publicKeyPem,
        senderRole: "agent",
        recipientPeerId: derivePeerId(bobProfile.device.publicKeyPem),
        recipientRole: "human",
        intent: "bond.request",
        payload: createBondRequestPayload({
          requesterOwnerId: aliceOwnerId,
          message: "Trust-mode hello after intro approval.",
          requestedLevel: "direct",
          introCorrelationId,
          ownerCommitmentRef: "owner-commit-phase12-smoke",
        }),
        agentCredential: aliceCredential,
        createdAt: "2026-06-15T12:03:00.000Z",
        messageId: "bond-request-intro-1",
        correlationId,
      }),
      signature: "signature",
    };

    const bondResult = await handleInboundBondIntent({
      envelope: bondRequestEnvelope,
      profile: bobProfile,
      remotePeerId: aliceLibp2pPeer,
      receivedAt: Date.now(),
      correlationId,
      taskStore: bobTaskStore,
      trustStore: bobTrustStore,
    });

    expect(bondResult.ok).toBe(true);
    if (bondResult.ok) {
      expect(bondResult.bondAcceptToRequester?.requesterOwnerId).toBe(aliceOwnerId);
    }

    const bobRecordAfterRequest = await bobTrustStore.getTrustRecord(aliceOwnerId);
    expect(bobRecordAfterRequest?.level).toBe("direct");

    const acceptEnvelope: EnvoyEnvelope = {
      ...createUnsignedEnvelope({
        senderPeerId: derivePeerId(bobProfile.device.publicKeyPem),
        senderPublicKey: bobProfile.device.publicKeyPem,
        senderRole: "human",
        recipientPeerId: derivePeerId(aliceProfile.device.publicKeyPem),
        recipientRole: "human",
        intent: "bond.accept",
        payload: createBondAcceptPayload({
          responderOwnerId: bobOwnerId,
          requesterOwnerId: aliceOwnerId,
          message: "Hello from Bob Node!",
        }),
        createdAt: "2026-06-15T12:04:00.000Z",
        messageId: "bond-accept-intro-1",
        correlationId,
      }),
      signature: "signature",
    };

    const acceptAlice = await handleInboundBondIntent({
      envelope: acceptEnvelope,
      profile: aliceProfile,
      remotePeerId: bobLibp2pPeer,
      receivedAt: Date.now(),
      correlationId,
      taskStore: aliceTaskStore,
      trustStore: aliceTrustStore,
    });
    expect(acceptAlice).toEqual({ ok: true });

    const aliceBobRecord = await aliceTrustStore.getTrustRecord(bobOwnerId);
    expect(aliceBobRecord?.level).toBe("direct");

    const bobAudits = await bobTaskStore.readAuditEvents();
    const bobCorrelated = bobAudits.filter((a) => a.correlationId === correlationId);
    expect(bobCorrelated.length).toBeGreaterThanOrEqual(3);
    const intents = bobCorrelated.map((a) => a.intent);
    expect(intents).toContain("discovery.request");
    expect(intents.filter((i) => i === "social.intro.sync").length).toBeGreaterThanOrEqual(1);
    expect(intents.filter((i) => i === "social.intro.propose").length).toBeGreaterThanOrEqual(1);
    expect(intents.filter((i) => i === "bond.request").length).toBeGreaterThanOrEqual(1);

    const aliceAudits = await aliceTaskStore.readAuditEvents();
    expect(aliceAudits.some((a) => a.correlationId === correlationId && a.intent === "bond.accept")).toBe(true);
  });
});
