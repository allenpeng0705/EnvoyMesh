/**
 * E2E: hop-2 multi-hop discovery — A → B (approve forward) → C → relay-back → A session.
 */
import { derivePeerId, signUnsignedEnvelope, verifyInboundEnvelope } from "@envoymesh/identity";
import {
  createCapabilityManifestStore,
  type CapabilityManifest,
} from "@envoymesh/local-store";
import {
  createDiscoveryResponsePayload,
  createUnsignedEnvelope,
  parseDiscoveryRequestPayload,
  parseDiscoveryResponsePayload,
} from "@envoymesh/protocol";
import { ApprovalQueue } from "@envoymesh/api";
import { afterEach, describe, expect, it } from "vitest";
import { handleInboundDiscoveryIntent, __resetDiscoveryState } from "../src/discovery-inbound.js";
import {
  cleanupPhase13Harness,
  createPhase13TestNode,
  registerBondedPeer,
  waitForPhase13,
  type Phase13TestNode,
} from "./phase13-e2e-harness.js";

afterEach(async () => {
  await cleanupPhase13Harness();
});

function musicManifest(ownerId: string): CapabilityManifest {
  const now = new Date().toISOString();
  return {
    version: "0.1",
    id: `manifest_${ownerId.slice(-8)}`,
    versionTag: "1.0.0",
    visibility: "contacts-only",
    sensitivityCeiling: "friends",
    keywords: ["music"],
    capabilities: ["music"],
    approvedAt: now,
    updatedAt: now,
  };
}

async function saveMusicManifest(node: Phase13TestNode): Promise<void> {
  const store = createCapabilityManifestStore(node.profileDir);
  await store.saveManifest(musicManifest(node.profile.owner.ownerId));
}

function wireMultihopDiscovery(
  node: Phase13TestNode,
  opts?: {
    approvalQueue?: ApprovalQueue;
    ownerKeyByOwnerId?: Map<string, string>;
    onDiscoveryRequest?: (matchCount: number) => void;
    onDiscoveryResponse?: (
      payload: ReturnType<typeof parseDiscoveryResponsePayload>,
      correlationId?: string,
    ) => void;
  },
): void {
  if (opts?.approvalQueue) {
    node.service.bindApprovalQueue(opts.approvalQueue);
  }

  node.mesh.onMessage(async ({ envelope, remotePeerId, replyWithEnvelope }) => {
    if (!verifyInboundEnvelope(envelope)) return;
    if (envelope.intent !== "discovery.request" && envelope.intent !== "discovery.response") {
      return;
    }

    const receivedAt = Date.now();
    const correlationId = envelope.correlationId;
    const manifestStore = createCapabilityManifestStore(node.profileDir);
    const capabilityManifest = await manifestStore.loadManifest();

    const discovery = await handleInboundDiscoveryIntent({
      envelope,
      profile: node.profile,
      remotePeerId,
      receivedAt,
      correlationId,
      taskStore: node.taskStore,
      trustStore: node.trustStore,
      capabilityManifest,
      anonymousDiscoveryMode: "off",
      vaultDir: node.vaultDir,
      profileDir: node.profileDir,
      resolveReferralOwnerPublicKey: async (ownerId) => opts?.ownerKeyByOwnerId?.get(ownerId),
    });

    if (!discovery.ok) {
      return;
    }

    if (envelope.intent === "discovery.request" && discovery.responsePayload) {
      opts?.onDiscoveryRequest?.(discovery.responsePayload.matches.length);
      const unsignedResponse = createUnsignedEnvelope({
        senderPeerId: derivePeerId(node.profile.device.publicKeyPem),
        senderPublicKey: node.profile.device.publicKeyPem,
        senderRole: "human",
        recipientPeerId: envelope.senderPeerId,
        recipientRole: "human",
        intent: "discovery.response",
        payload: createDiscoveryResponsePayload(discovery.responsePayload),
        correlationId,
      });
      const signedResponse = signUnsignedEnvelope(unsignedResponse, node.profile.device.privateKeyPem);
      if (replyWithEnvelope) {
        await replyWithEnvelope(signedResponse);
      } else {
        await node.mesh.send(remotePeerId, signedResponse);
      }

      const requestPayload = parseDiscoveryRequestPayload(envelope.payload);
      const requesterTrust = await node.trustStore.getTrustRecord(requestPayload.requesterOwnerId);
      node.service.queueDiscoveryForwardFromInbound({
        envelope,
        requesterOwnerId: requestPayload.requesterOwnerId,
        trustLevel: requesterTrust?.level ?? "public",
        correlationId,
      });
    }

    if (envelope.intent === "discovery.response" && correlationId) {
      const responsePayload = parseDiscoveryResponsePayload(envelope.payload);
      opts?.onDiscoveryResponse?.(responsePayload, correlationId);
      await node.service.ingestInboundMultiHopDiscoveryResponse({
        correlationId,
        responderOwnerId: responsePayload.responderOwnerId,
        matches: responsePayload.matches,
        forwardPendingAck: responsePayload.forwardPendingAck,
      });
    } else if (envelope.intent === "discovery.response") {
      opts?.onDiscoveryResponse?.(parseDiscoveryResponsePayload(envelope.payload), envelope.correlationId);
    }
  });
}

describe("E2E multi-hop discovery hop-2 relay-back", () => {
  it("A receives hop-2 matches after B approves forward to C", async () => {
    const alice = await createPhase13TestNode();
    const bob = await createPhase13TestNode();
    const carol = await createPhase13TestNode();

    await saveMusicManifest(bob);
    await saveMusicManifest(carol);

    await registerBondedPeer(alice, bob, "Bob");
    await registerBondedPeer(bob, alice, "Alice");
    await registerBondedPeer(bob, carol, "Carol");
    await registerBondedPeer(carol, bob, "Bob");

    const bobApprovalQueue = new ApprovalQueue();
    const carolHopMatchCounts: number[] = [];
    const aliceDiscoveryResponses: Array<{
      payload: ReturnType<typeof parseDiscoveryResponsePayload>;
      correlationId?: string;
    }> = [];
    const ownerKeys = new Map<string, string>([
      [alice.profile.owner.ownerId, alice.profile.owner.publicKeyPem],
      [bob.profile.owner.ownerId, bob.profile.owner.publicKeyPem],
      [carol.profile.owner.ownerId, carol.profile.owner.publicKeyPem],
    ]);

    wireMultihopDiscovery(alice, {
      ownerKeyByOwnerId: ownerKeys,
      onDiscoveryResponse: (payload, correlationId) =>
        aliceDiscoveryResponses.push({ payload, correlationId }),
    });
    wireMultihopDiscovery(bob, { approvalQueue: bobApprovalQueue, ownerKeyByOwnerId: ownerKeys });
    wireMultihopDiscovery(carol, {
      ownerKeyByOwnerId: ownerKeys,
      onDiscoveryRequest: (count) => carolHopMatchCounts.push(count),
    });

    await alice.mesh.dial(bob.mesh.multiaddrs[0]!);
    await bob.mesh.dial(alice.mesh.multiaddrs[0]!);
    await bob.mesh.dial(carol.mesh.multiaddrs[0]!);
    await carol.mesh.dial(bob.mesh.multiaddrs[0]!);

    const started = await alice.service.requestMultiHopDiscovery({
      requestedCapabilities: ["music"],
      maxHops: 2,
      maxBonds: 1,
    });

    expect(started.correlationId).toBeTruthy();
    expect(started.pendingForwardApprovals).toBeGreaterThan(0);

    await waitForPhase13(async () => bobApprovalQueue.listPending().length > 0, 8000);
    const pending = bobApprovalQueue.listPending();
    expect(pending[0]?.actionType).toBe("discovery_forward");
    const forwardDraft = JSON.parse(pending[0]!.draftContent) as { correlationId?: string };
    expect(forwardDraft.correlationId).toBe(started.correlationId);

    __resetDiscoveryState();
    const approved = await bob.service.approvePendingApproval(pending[0]!.id);
    expect(approved.ok).toBe(true);
    expect(carolHopMatchCounts.some((count) => count > 0)).toBe(true);

    await waitForPhase13(async () => {
      const bobAudits = await bob.taskStore.readAuditEvents();
      return bobAudits.some((row) => row.protocol === "discovery.forward.relay.ok");
    }, 8000);

    await waitForPhase13(async () => {
      return aliceDiscoveryResponses.some((row) => (row.payload?.matches.length ?? 0) > 0);
    }, 8000);

    const bobAudits = await bob.taskStore.readAuditEvents();
    const relayFail = bobAudits.find((row) => row.protocol === "discovery.forward.relay.fail");
    const forwardReply = bobAudits.find((row) => row.protocol === "discovery.forward.reply");
    expect(relayFail?.summary).toBeUndefined();
    expect(forwardReply?.summary).toMatch(/matches=[1-9]/);
    expect(bobAudits.some((row) => row.protocol === "discovery.forward.relay.ok")).toBe(true);
    expect(aliceDiscoveryResponses.some((row) => row.payload.matches.length > 0)).toBe(true);

    await waitForPhase13(async () => {
      const session = await alice.service.getMultiHopDiscoverySession(started.correlationId);
      return session?.matches.some((row) => row.ownerId === carol.profile.owner.ownerId) ?? false;
    }, 8000);

    const session = await alice.service.getMultiHopDiscoverySession(started.correlationId);
    expect(session).toBeDefined();
    const hop2 = session!.matches.find((row) => row.ownerId === carol.profile.owner.ownerId);
    expect(hop2?.hopDistance).toBeGreaterThanOrEqual(2);
    expect(session!.pendingForwardApprovals).toBe(0);
  }, 45_000);
});
