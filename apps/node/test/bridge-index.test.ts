import { describe, expect, it, vi } from "vitest";
import { createServer } from "node:net";
import { createAgentCredential, generateAgentIdentity, generateOwnerIdentity } from "@envoymesh/identity";
import { createChatMessagePayload, EnvoyEnvelopeSchema } from "@envoymesh/protocol";
import { createBridge, type BridgeIdentity } from "../src/bridge/index.js";

describe("bridge runtime", () => {
  it("starts HTTP bridge without Bearer auth when secret is omitted", async () => {
    const port = await getFreePort();
    const bridge = createBridge({
      config: { enabled: true, agentUrl: "http://localhost:8080/message", listenPort: port },
      identity: makeBridgeIdentity(),
      mesh: makeMesh(),
      getRecipientPeerId: async () => null,
    });
    expect(bridge.agentPeerId).toBeTruthy();
    await bridge.stop();
  });

  it("forwards addressed P2P chat to the agent", async () => {
    const port = await getFreePort();
    const identity = makeBridgeIdentity();
    const sendChat = vi.fn().mockResolvedValue(1);
    // Mock agent endpoint calls (forwardToAgent). Bridge HTTP server uses node:http,
    // which bypasses the fetch stub, so we don't need routing logic here.
    const agentFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ text: null }),
    });
    vi.stubGlobal("fetch", agentFetch);

    const bridge = createBridge({
      config: {
        enabled: true,
        agentUrl: "http://localhost:8080/message",
        listenPort: port,
        secret: "test-secret-token",
      },
      identity,
      mesh: makeMesh({ sendChat }),
      getRecipientPeerId: async (id) => id,
    });

    try {
      await bridge._handleMessage(
        {
          intent: "chat.message",
          recipientPeerId: identity.agentPeerId,
          payload: createChatMessagePayload({
            senderOwnerId: "envoy:owner:sender",
            text: "hello agent",
          }),
        },
        "12D3Sender",
      );

      // forwardToAgent calls the agent HTTP endpoint via fetch
      expect(agentFetch).toHaveBeenCalledTimes(1);
      // HomeClaw/OpenClaw deliver via POST /bridge/send only — sync JSON text must not P2P-send.
      expect(sendChat).not.toHaveBeenCalled();
    } finally {
      await bridge.stop();
      vi.unstubAllGlobals();
    }
  });

  it("ignores sync HTTP text from agentUrl on chat.message (no duplicate P2P)", async () => {
    const port = await getFreePort();
    const identity = makeBridgeIdentity();
    const sendChat = vi.fn().mockResolvedValue(1);
    const agentFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ text: "would-duplicate-if-used" }),
    });
    vi.stubGlobal("fetch", agentFetch);

    const bridge = createBridge({
      config: {
        enabled: true,
        agentUrl: "http://localhost:8010/message",
        listenPort: port,
      },
      identity,
      mesh: makeMesh({ sendChat }),
      getRecipientPeerId: async (id) => id,
    });

    try {
      await bridge._handleMessage(
        {
          intent: "chat.message",
          recipientPeerId: identity.agentPeerId,
          payload: createChatMessagePayload({
            senderOwnerId: "envoy:owner:sender",
            text: "ping",
          }),
        },
        "envoy_peer_homeclaw_style",
      );

      await vi.waitFor(() => expect(agentFetch).toHaveBeenCalledTimes(1), { timeout: 3000 });
      await new Promise((r) => setTimeout(r, 100));
      expect(sendChat).not.toHaveBeenCalled();
    } finally {
      await bridge.stop();
      vi.unstubAllGlobals();
    }
  });

  it("sends agent reply back via P2P when agent returns text", async () => {
    const port = await getFreePort();
    const identity = makeBridgeIdentity();
    const sendChat = vi.fn().mockResolvedValue(1);
    // No fetch stub needed. receiveFromAgent uses deps.sendChat (P2P), not fetch.
    // The bridge server uses node:http directly, so native fetch works for testing.

    const bridge = createBridge({
      config: {
        enabled: true,
        agentUrl: "http://localhost:8080/message",
        listenPort: port,
        secret: "test-secret-token",
      },
      identity,
      mesh: makeMesh({ sendChat }),
      getRecipientPeerId: async (id) => id,
    });

    try {
      // Wait for the bridge server to be fully listening before making the HTTP call.
      // The server uses http.createServer() which fires the 'listening' event after bind().
      await new Promise<void>((resolve) => {
        const server = createServer();
        server.on("error", () => resolve()); // port already taken means bridge is listening
        server.listen(port, "127.0.0.1", () => {
          server.close(() => resolve());
        });
      });

      // Simulate agent reply via HTTP POST to /bridge/send
      const httpRes = await globalThis.fetch(`http://127.0.0.1:${port}/bridge/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer test-secret-token" },
        body: JSON.stringify({ to: "12D3Sender", text: "agent reply" }),
      });
      expect(httpRes.ok).toBe(true);
      // receiveFromAgent is async (getRecipientPeerId + sign + sendChat).
      // Use vi.waitFor to poll until sendChat completes.
      await vi.waitFor(() => expect(sendChat).toHaveBeenCalledTimes(1), { timeout: 5000 });

      const [recipientPeerId, envelope] = sendChat.mock.calls[0];
      expect(recipientPeerId).toBe("12D3Sender");
      expect(EnvoyEnvelopeSchema.safeParse(envelope).success).toBe(true);
      expect(envelope.agentCredential).toEqual(identity.agentCredential);
    } finally {
      await bridge.stop();
      vi.unstubAllGlobals();
    }
  });

  it("forwards dial hints from getRecipientDialHints to mesh.sendChat for NAT-traversed peers", async () => {
    const port = await getFreePort();
    const identity = makeBridgeIdentity();
    const sendChat = vi.fn().mockResolvedValue(1);
    const relayHints = [
      "/ip4/192.168.3.42/tcp/4001/p2p/12D3KooWRelay/p2p-circuit/p2p/12D3Sender",
    ];
    const getRecipientDialHints = vi.fn().mockResolvedValue(relayHints);

    const bridge = createBridge({
      config: {
        enabled: true,
        agentUrl: "http://localhost:8080/message",
        listenPort: port,
        secret: "test-secret-token",
      },
      identity,
      mesh: makeMesh({ sendChat }),
      getRecipientPeerId: async (id) => id,
      getRecipientDialHints,
    });

    try {
      await new Promise<void>((resolve) => {
        const server = createServer();
        server.on("error", () => resolve());
        server.listen(port, "127.0.0.1", () => {
          server.close(() => resolve());
        });
      });

      const httpRes = await globalThis.fetch(`http://127.0.0.1:${port}/bridge/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer test-secret-token" },
        body: JSON.stringify({ to: "12D3Sender", text: "agent reply" }),
      });
      expect(httpRes.ok).toBe(true);
      await vi.waitFor(() => expect(sendChat).toHaveBeenCalledTimes(1), { timeout: 5000 });

      expect(getRecipientDialHints).toHaveBeenCalledWith("12D3Sender");
      const [, , sendOptions] = sendChat.mock.calls[0];
      expect(sendOptions?.dialHints).toEqual(relayHints);
    } finally {
      await bridge.stop();
      vi.unstubAllGlobals();
    }
  });

  it("forwards discovery.response to external agent as async mesh reply", async () => {
    const port = await getFreePort();
    const identity = makeBridgeIdentity();
    const agentFetch = vi.fn().mockResolvedValue({ ok: true, text: async () => "" });
    vi.stubGlobal("fetch", agentFetch);

    const bridge = createBridge({
      config: {
        enabled: true,
        agentUrl: "http://localhost:8080/message",
        listenPort: port,
      },
      identity,
      mesh: makeMesh(),
      getRecipientPeerId: async (id) => id,
    });

    try {
      await bridge._handleMessage(
        {
          intent: "discovery.response",
          recipientPeerId: identity.agentPeerId,
          senderPeerId: "envoy_agent_peer",
          messageId: "msg-disc",
          correlationId: "corr-disc",
          payload: { requestMessageId: "req-1", responderOwnerId: "envoy:owner:responder", matches: [], truncated: false },
        },
        "12D3Peer",
      );

      await vi.waitFor(() => expect(agentFetch).toHaveBeenCalledTimes(1), { timeout: 3000 });
      const body = JSON.parse(String(agentFetch.mock.calls[0]![1]?.body));
      expect(body.type).toBe("mesh.async_reply");
      expect(body.intent).toBe("discovery.response");
    } finally {
      await bridge.stop();
      vi.unstubAllGlobals();
    }
  });
});

function makeBridgeIdentity(): BridgeIdentity {
  const owner = generateOwnerIdentity();
  const agent = generateAgentIdentity(owner.ownerId);
  return {
    agentPeerId: agent.agentPeerId,
    agentPublicKeyPem: agent.publicKeyPem,
    agentPrivateKeyPem: agent.privateKeyPem,
    ownerId: owner.ownerId,
    agentCredential: createAgentCredential({
      owner,
      agent,
      scope: ["chat.message"],
    }),
  };
}

function makeMesh(overrides: Record<string, unknown> = {}) {
  return {
    peerId: "12D3Self",
    sendChat: vi.fn().mockResolvedValue(1),
    ...overrides,
  } as any;
}

async function getFreePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  return port;
}