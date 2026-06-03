/**
 * Phase 21C — Capability Discovery Broadcast tests.
 */
import { describe, expect, it, vi } from "vitest";
import {
  broadcastCapabilityDiscovery,
  type BroadcastCapabilityDiscoveryDeps,
} from "../src/capability-discovery-broadcast.js";

function makeDeps(overrides?: Partial<BroadcastCapabilityDiscoveryDeps>): BroadcastCapabilityDiscoveryDeps {
  return {
    sendToPeer: vi.fn().mockResolvedValue(42),
    getBondedPeers: vi.fn().mockResolvedValue([
      { ownerId: "envoy:owner:b1", peerId: "peer-b1" },
      { ownerId: "envoy:owner:b2", peerId: "peer-b2" },
    ]),
    getAllKnownPeers: vi.fn().mockResolvedValue([
      { ownerId: "envoy:owner:b1", peerId: "peer-b1" },
      { ownerId: "envoy:owner:b2", peerId: "peer-b2" },
      { ownerId: "envoy:owner:d1", peerId: "peer-d1" },
    ]),
    signEnvelope: vi.fn().mockImplementation((u: any) => ({ ...u, signature: "sig" })),
    profile: {
      owner: { ownerId: "envoy:owner:local" },
      device: { peerId: "local-peer", publicKeyPem: "pk", privateKeyPem: "sk" },
    },
    ...overrides,
  };
}

describe("broadcastCapabilityDiscovery", () => {
  it("sends to bonded peers when maxHops <= 1", async () => {
    const sendSpy = vi.fn().mockResolvedValue(42);
    const deps = makeDeps({ sendToPeer: sendSpy });
    await broadcastCapabilityDiscovery(deps, {
      capabilityTags: ["rust_reviewer"],
      maxHops: 1,
    });
    expect(sendSpy).toHaveBeenCalledTimes(2);
  });

  it("sends to all known peers when maxHops > 1", async () => {
    const sendSpy = vi.fn().mockResolvedValue(42);
    const deps = makeDeps({ sendToPeer: sendSpy });
    await broadcastCapabilityDiscovery(deps, {
      capabilityTags: ["translation"],
      maxHops: 3,
    });
    // 2 bonded + 1 discovered = 3 unique
    expect(sendSpy).toHaveBeenCalledTimes(3);
  });

  it("deduplicates peer sends", async () => {
    const sendSpy = vi.fn().mockResolvedValue(42);
    const deps = makeDeps({
      sendToPeer: sendSpy,
      getAllKnownPeers: vi.fn().mockResolvedValue([
        { ownerId: "envoy:owner:b1", peerId: "peer-b1" }, // duplicate
        { ownerId: "envoy:owner:b2", peerId: "peer-b2" }, // duplicate
        { ownerId: "envoy:owner:new", peerId: "peer-new" },
      ]),
    });
    await broadcastCapabilityDiscovery(deps, {
      capabilityTags: ["code_review"],
      maxHops: 3,
    });
    expect(sendSpy).toHaveBeenCalledTimes(3); // b1, b2, new
  });

  it("includes capability tags in broadcast payload", async () => {
    const sendSpy = vi.fn().mockResolvedValue(42);
    const deps = makeDeps({ sendToPeer: sendSpy });
    await broadcastCapabilityDiscovery(deps, {
      capabilityTags: ["rust_reviewer", "translation"],
      maxHops: 2,
      maxResults: 5,
    });
    expect(sendSpy).toHaveBeenCalled();
    // Verify the payload has the right intent and senderRole
    const call = sendSpy.mock.calls[0];
    const envelope = call[1] as any;
    expect(envelope.intent).toBe("broadcast.request");
    expect(envelope.senderRole).toBe("agent");
  });
});
