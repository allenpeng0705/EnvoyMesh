import { describe, expect, it, vi, afterEach } from "vitest";
import { forwardAsyncMeshReply, resetBridgeAsyncReplyRateLimitForTests, checkBridgeAsyncReplyRateLimit } from "../src/bridge/async-mesh-reply.js";

describe("forwardAsyncMeshReply (ADB-E)", () => {
  afterEach(() => {
    resetBridgeAsyncReplyRateLimitForTests();
    vi.unstubAllGlobals();
  });

  it("POSTs structured async mesh reply to agent URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => "" });
    vi.stubGlobal("fetch", fetchMock);

    await forwardAsyncMeshReply(
      { enabled: true, agentUrl: "http://127.0.0.1:9999/message", listenPort: 3031, agentName: "Test" },
      {
        intent: "discovery.response",
        correlationId: "corr-1",
        senderPeerId: "envoy_agent_x",
        remotePeerId: "12D3Peer",
        messageId: "msg-1",
        payload: { matches: [] },
      },
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body.type).toBe("mesh.async_reply");
    expect(body.intent).toBe("discovery.response");
    expect(body.correlationId).toBe("corr-1");
  });

  it("rate limits async forwards per minute", async () => {
    resetBridgeAsyncReplyRateLimitForTests();
    for (let i = 0; i < 60; i++) {
      expect(checkBridgeAsyncReplyRateLimit()).toBe(true);
    }
    expect(checkBridgeAsyncReplyRateLimit()).toBe(false);
  });

  it("forwardAsyncMeshReply throws when rate limit exceeded", async () => {
    resetBridgeAsyncReplyRateLimitForTests();
    for (let i = 0; i < 60; i++) {
      checkBridgeAsyncReplyRateLimit();
    }
    await expect(
      forwardAsyncMeshReply(
        { enabled: true, agentUrl: "http://127.0.0.1:9999/message", listenPort: 3031, agentName: "Test" },
        {
          intent: "discovery.response",
          correlationId: "corr-rate",
          senderPeerId: "envoy_agent_x",
          remotePeerId: "12D3Peer",
          messageId: "msg-rate",
          payload: { matches: [] },
        },
      ),
    ).rejects.toThrow(/rate limit/i);
  });
});
