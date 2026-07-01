import { describe, expect, it, vi } from "vitest";
import {
  createAgentCredential,
  derivePeerId,
  generateDeviceIdentity,
  generateOwnerIdentity,
} from "@envoymesh/identity";
import type { SendAgentChatContext } from "../src/node-service-outbound-messaging.js";
import { sendAgentChatViaRuntime } from "../src/node-service-outbound-messaging.js";

function mockAgentChatContext(overrides: Partial<SendAgentChatContext> = {}): SendAgentChatContext {
  const owner = generateOwnerIdentity();
  const agent = generateDeviceIdentity();
  return {
    assertOnline: vi.fn(),
    recordOwnerActivity: vi.fn(),
    requireMesh: vi.fn(() => ({
      peerId: "12D3KooWSelf",
      getPeerConnectionInfo: vi.fn().mockReturnValue({ connected: false, direct: false }),
      getConnectedPeerIds: vi.fn().mockReturnValue([]),
    })),
    loadConfig: vi.fn().mockResolvedValue(undefined),
    getReachableMesh: vi.fn(),
    getDiscoverySeedStore: vi.fn(),
    getProfileDir: vi.fn(() => "/tmp/profile"),
    peerDirectoryStore: {} as SendAgentChatContext["peerDirectoryStore"],
    getTransportCache: vi.fn(() => new Map()),
    setTransportCache: vi.fn(),
    deleteTransportCache: vi.fn(),
    getPendingHelloRequesterPeerIds: vi.fn(() => []),
    learnInboundDialHints: vi.fn(),
    requireProfile: vi.fn(),
    loadHumanProfile: vi.fn().mockResolvedValue({ displayName: "Agent Owner" }),
    getTrustDisplayName: vi.fn(),
    tagBondedContactReachability: vi.fn(),
    flushPendingRoomSyncs: vi.fn(),
    flushPendingRoomMessages: vi.fn(),
    getBridgeAgentPeerId: vi.fn(),
    getSelfOwnerId: vi.fn(),
    getBridgeChatHandler: vi.fn(),
    persistChatMessage: vi.fn(),
    emitChatMessage: vi.fn(),
    markOutboundChatDelivered: vi.fn().mockResolvedValue(undefined),
    learnFromMessage: vi.fn(),
    resolvePeerTransportForOwner: vi.fn().mockResolvedValue({
      transportPeerId: "12D3KooWPeer",
      recipientEnvelopePeerId: "envoy:owner:peer",
      listenAddrs: ["/p2p/12D3KooWPeer"],
    }),
    dialHintsForChat: vi.fn().mockResolvedValue(["/p2p/12D3KooWPeer"]),
    deliverChatEnvelope: vi.fn().mockResolvedValue({ delivered: true, deliveredAt: "2026-01-01T00:00:00.000Z" }),
    ensureAgentIdentity: vi.fn().mockResolvedValue({
      agentPeerId: derivePeerId(agent.publicKeyPem),
      agentPublicKeyPem: agent.publicKeyPem,
      agentPrivateKeyPem: agent.privateKeyPem,
      ownerId: owner.ownerId,
      agentCredential: createAgentCredential({
        owner,
        agent: { ...agent, agentId: "agent-1", agentPeerId: derivePeerId(agent.publicKeyPem) },
        scope: ["message.send"],
      }),
    }),
    getNodeConfig: vi.fn().mockResolvedValue({ aiSettings: { identity: { name: "Nova" } } }),
    getTrustRecord: vi.fn().mockResolvedValue({ displayName: "Peer" }),
    ...overrides,
  };
}

describe("sendAgentChatViaRuntime", () => {
  it("throws when agent identity is unavailable", async () => {
    const ctx = mockAgentChatContext({
      ensureAgentIdentity: vi.fn().mockResolvedValue(null),
    });
    await expect(sendAgentChatViaRuntime(ctx, "envoy:owner:peer", "hello")).rejects.toThrow(
      "Agent identity is not available",
    );
  });

  it("delivers agent chat and emits local message", async () => {
    const ctx = mockAgentChatContext();
    const result = await sendAgentChatViaRuntime(ctx, "envoy:owner:peer", "hello agent");

    expect(result.deliveryReceipt).toBe("delivered");
    expect(ctx.deliverChatEnvelope).toHaveBeenCalledTimes(1);
    expect(ctx.persistChatMessage).toHaveBeenCalledWith(
      "envoy:owner:peer",
      expect.objectContaining({
        sender: expect.objectContaining({ actorRole: "agent", agentVerified: true }),
        content: expect.objectContaining({ text: expect.any(String) }),
      }),
    );
    expect(ctx.emitChatMessage).toHaveBeenCalledTimes(1);
  });
});
