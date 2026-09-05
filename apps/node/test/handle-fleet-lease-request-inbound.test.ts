import { describe, expect, it, vi } from "vitest";
import { fulfillInboundFleetLeaseRequest } from "../src/handle-fleet-lease-request-inbound.js";

describe("fulfillInboundFleetLeaseRequest", () => {
  it("enables Join and publishes for a bonded requester", async () => {
    const enableJoin = vi.fn(async () => undefined);
    const publishNow = vi.fn(async () => undefined);
    const result = await fulfillInboundFleetLeaseRequest({
      requesterPeerId: "envoy_agent_bob",
      requesterOwnerId: "envoy:owner:bob",
      getBonds: async () => [{ peerOwnerId: "envoy:owner:bob", level: "direct" }],
      getJoinEnabled: async () => false,
      enableJoin,
      ensureLeaseBroadcaster: async () => ({ publishNow }),
    });
    expect(result.ok).toBe(true);
    expect(enableJoin).toHaveBeenCalledTimes(1);
    expect(publishNow).toHaveBeenCalledTimes(1);
  });

  it("rejects unbonded / public requesters", async () => {
    const enableJoin = vi.fn(async () => undefined);
    const result = await fulfillInboundFleetLeaseRequest({
      requesterPeerId: "envoy_agent_stranger",
      requesterOwnerId: "envoy:owner:stranger",
      getBonds: async () => [{ peerOwnerId: "envoy:owner:stranger", level: "public" }],
      getJoinEnabled: async () => false,
      enableJoin,
      ensureLeaseBroadcaster: async () => ({ publishNow: async () => undefined }),
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("requester_not_trusted");
    expect(enableJoin).not.toHaveBeenCalled();
  });
});
