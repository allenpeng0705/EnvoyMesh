/**
 * Tests for the agent.card.* arm runtime.
 */
import { describe, expect, it, vi } from "vitest";
import { handleAgentCardViaRuntime } from "../src/cli-mesh-inbound-agent-card.js";

function makeMockCtx(handled: boolean) {
  return {
    handleDaemonAgentCardInbound: vi.fn(async () => ({ handled })),
    getProfile: vi.fn(() => ({})),
    getTaskStore: vi.fn(() => ({})),
    getTrustStore: vi.fn(() => ({})),
    getAgentCardStore: vi.fn(() => ({})),
    getHumanProfileStore: vi.fn(() => ({})),
    getBridgeIdentity: vi.fn(() => null),
    getMesh: vi.fn(() => ({})),
    getNodeService: vi.fn(() => null),
  };
}

const params = {
  envelope: {
    messageId: "m1",
    senderPeerId: "sp",
    intent: "agent.card.response",
    payload: {},
  },
  remotePeerId: "rp",
  receivedAt: 1,
  correlationId: "c1",
};

describe("cli-mesh-inbound-agent-card", () => {
  it("returns silently when handled=true", async () => {
    const ctx = makeMockCtx(true);
    await handleAgentCardViaRuntime(ctx, params);
    expect(ctx.handleDaemonAgentCardInbound).toHaveBeenCalledTimes(1);
  });

  it("returns silently when handled=false (fall through is implicit)", async () => {
    const ctx = makeMockCtx(false);
    await handleAgentCardViaRuntime(ctx, params);
    expect(ctx.handleDaemonAgentCardInbound).toHaveBeenCalledTimes(1);
  });
});