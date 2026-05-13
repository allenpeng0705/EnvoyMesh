import { describe, expect, it, vi, afterEach } from "vitest";
import { createServer } from "node:net";
import { createAgentCredential, generateAgentIdentity, generateOwnerIdentity } from "@envoymesh/identity";
import { createChatMessagePayload } from "@envoymesh/protocol";
import { createBridge, type BridgeIdentity } from "../src/bridge/index.js";
import {
  ExternalAgentGateway,
  createExternalAgentSession,
  DEFAULT_AGENT_CAPABILITIES,
} from "../src/external-agent-gateway.js";

describe("bridge-gateway integration", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── helpers ──────────────────────────────────────────────

  function makeBridgeIdentity(): BridgeIdentity {
    const owner = generateOwnerIdentity();
    const agent = generateAgentIdentity(owner.ownerId);
    return {
      agentPeerId: agent.agentPeerId,
      agentPublicKeyPem: agent.publicKeyPem,
      agentPrivateKeyPem: agent.privateKeyPem,
      ownerId: owner.ownerId,
      agentCredential: createAgentCredential({ owner, agent, scope: ["chat.message"] }),
    };
  }

  function makeMesh(overrides: Record<string, unknown> = {}) {
    return { peerId: "12D3Self", sendChat: vi.fn().mockResolvedValue(1), ...overrides } as any;
  }

  async function getFreePort(): Promise<number> {
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    return port;
  }

  async function httpPost(port: number, secret: string, body: unknown) {
    return fetch(`http://127.0.0.1:${port}/bridge/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
      body: JSON.stringify(body),
    });
  }

  // ── HTTP gateway auth tests ──────────────────────────────

  it("rejects HTTP requests (403) when agent is not registered in gateway", async () => {
    const port = await getFreePort();
    const identity = makeBridgeIdentity();
    const gateway = new ExternalAgentGateway();
    // Agent NOT registered

    const bridge = createBridge({
      config: { enabled: true, agentUrl: "http://localhost:8080/message", listenPort: port, secret: "test-secret-min-16-chars" },
      identity,
      mesh: makeMesh(),
      getRecipientPeerId: async (id) => id,
      gateway,
    });

    try {
      const res = await httpPost(port, "test-secret-min-16-chars", { to: "envoy_recipient", text: "hello" });
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.reason).toBe("agent revoked");
    } finally {
      await bridge.stop();
    }
  });

  it("rejects HTTP requests (403) when agent is revoked in gateway", async () => {
    const port = await getFreePort();
    const identity = makeBridgeIdentity();
    const gateway = new ExternalAgentGateway();
    const agentId = identity.agentCredential.agentId;

    // Register then revoke
    gateway.registerAgent(
      createExternalAgentSession(agentId, identity.agentPeerId, "Test Agent", identity.ownerId),
    );
    gateway.revokeAgent(agentId);

    const bridge = createBridge({
      config: { enabled: true, agentUrl: "http://localhost:8080/message", listenPort: port, secret: "test-secret-min-16-chars" },
      identity,
      mesh: makeMesh(),
      getRecipientPeerId: async (id) => id,
      gateway,
    });

    try {
      const res = await httpPost(port, "test-secret-min-16-chars", { to: "envoy_recipient", text: "hello" });
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.reason).toBe("agent revoked");
    } finally {
      await bridge.stop();
    }
  });

  it("accepts HTTP requests when agent is authorized", async () => {
    const port = await getFreePort();
    const identity = makeBridgeIdentity();
    const gateway = new ExternalAgentGateway();
    const agentId = identity.agentCredential.agentId;

    gateway.registerAgent(
      createExternalAgentSession(agentId, identity.agentPeerId, "Test Agent", identity.ownerId),
    );

    const bridge = createBridge({
      config: { enabled: true, agentUrl: "http://localhost:8080/message", listenPort: port, secret: "test-secret-min-16-chars" },
      identity,
      mesh: makeMesh(),
      getRecipientPeerId: async (id) => id,
      gateway,
    });

    try {
      const res = await httpPost(port, "test-secret-min-16-chars", { to: "envoy_recipient", text: "hello" });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(typeof body.messageId).toBe("string");
    } finally {
      await bridge.stop();
    }
  });

  // ── P2P handler gateway action logging ──────────────────

  it("logs P2P forward actions to gateway", async () => {
    const port = await getFreePort();
    const identity = makeBridgeIdentity();
    const gateway = new ExternalAgentGateway();
    const agentId = identity.agentCredential.agentId;

    gateway.registerAgent(
      createExternalAgentSession(agentId, identity.agentPeerId, "Test Agent", identity.ownerId),
    );

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ text: null }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const bridge = createBridge({
      config: { enabled: true, agentUrl: "http://localhost:8080/message", listenPort: port, secret: "test-secret-min-16-chars" },
      identity,
      mesh: makeMesh(),
      getRecipientPeerId: async (id) => id,
      gateway,
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

      // Gateway should have an action log for the forward
      const actions = gateway.getAgentActions(agentId);
      expect(actions.length).toBeGreaterThan(0);

      const forwardAction = actions.find((a) => a.toolName === "bridge.forward_to_agent");
      expect(forwardAction).toBeDefined();
      expect(forwardAction?.agentId).toBe(agentId);
      expect(forwardAction?.outcome).toBe("success");
      expect(forwardAction?.requiresApproval).toBe(false);
      expect(forwardAction?.durationMs).toBeGreaterThanOrEqual(0);

      // Agent's lastActivityAt should be updated
      const agent = gateway.getAgent(agentId);
      expect(agent).toBeDefined();
      expect(agent?.isRevoked).toBe(false);
    } finally {
      await bridge.stop();
      vi.unstubAllGlobals();
    }
  });

  it("logs P2P reply actions to gateway via receiveFromAgent deps", async () => {
    const port = await getFreePort();
    const identity = makeBridgeIdentity();
    const gateway = new ExternalAgentGateway();
    const agentId = identity.agentCredential.agentId;

    gateway.registerAgent(
      createExternalAgentSession(agentId, identity.agentPeerId, "Test Agent", identity.ownerId),
    );

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ text: "agent reply" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const bridge = createBridge({
      config: { enabled: true, agentUrl: "http://localhost:8080/message", listenPort: port, secret: "test-secret-min-16-chars" },
      identity,
      mesh: makeMesh(),
      getRecipientPeerId: async (id) => id,
      gateway,
    });

    try {
      await bridge._handleMessage(
        {
          intent: "chat.message",
          recipientPeerId: identity.agentPeerId,
          payload: createChatMessagePayload({
            senderOwnerId: "envoy:owner:sender",
            text: "hello",
          }),
        },
        "12D3Sender",
      );

      const actions = gateway.getAgentActions(agentId);
      const sendAction = actions.find((a) => a.toolName === "bridge.send_message");
      expect(sendAction).toBeDefined();
      expect(sendAction?.agentId).toBe(agentId);
      expect(sendAction?.outcome).toBe("success");
    } finally {
      await bridge.stop();
      vi.unstubAllGlobals();
    }
  });

  it("logs errors in P2P handler to gateway", async () => {
    const port = await getFreePort();
    const identity = makeBridgeIdentity();
    const gateway = new ExternalAgentGateway();
    const agentId = identity.agentCredential.agentId;

    gateway.registerAgent(
      createExternalAgentSession(agentId, identity.agentPeerId, "Test Agent", identity.ownerId),
    );

    const fetchMock = vi.fn().mockRejectedValue(new Error("agent timeout"));
    vi.stubGlobal("fetch", fetchMock);

    const bridge = createBridge({
      config: { enabled: true, agentUrl: "http://localhost:8080/message", listenPort: port, secret: "test-secret-min-16-chars" },
      identity,
      mesh: makeMesh(),
      getRecipientPeerId: async (id) => id,
      gateway,
    });

    try {
      await bridge._handleMessage(
        {
          intent: "chat.message",
          recipientPeerId: identity.agentPeerId,
          payload: createChatMessagePayload({
            senderOwnerId: "envoy:owner:sender",
            text: "hello",
          }),
        },
        "12D3Sender",
      );

      const actions = gateway.getAgentActions(agentId);
      const errorAction = actions.find(
        (a) => a.toolName === "bridge.forward_to_agent" && a.outcome === "error",
      );
      expect(errorAction).toBeDefined();
      expect(errorAction?.error).toBe("agent timeout");
    } finally {
      await bridge.stop();
      vi.unstubAllGlobals();
    }
  });

  // ── Graceful no-op without gateway ──────────────────────

  it("works without a gateway (no-op — backward compatible)", async () => {
    const port = await getFreePort();
    const identity = makeBridgeIdentity();

    const bridge = createBridge({
      config: { enabled: true, agentUrl: "http://localhost:8080/message", listenPort: port, secret: "test-secret-min-16-chars" },
      identity,
      mesh: makeMesh(),
      getRecipientPeerId: async (id) => id,
      // gateway omitted intentionally
    });

    try {
      // HTTP should work without gateway
      const res = await httpPost(port, "test-secret-min-16-chars", { to: "envoy_recipient", text: "hello" });
      expect(res.status).toBe(200);

      // P2P handler should work without gateway
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ text: null }),
      });
      vi.stubGlobal("fetch", fetchMock);

      await bridge._handleMessage(
        {
          intent: "chat.message",
          recipientPeerId: identity.agentPeerId,
          payload: createChatMessagePayload({
            senderOwnerId: "envoy:owner:sender",
            text: "hello",
          }),
        },
        "12D3Sender",
      );

      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      await bridge.stop();
      vi.unstubAllGlobals();
    }
  });

  // ── HTTP gateway action logging ─────────────────────────

  it("logs HTTP send actions to gateway with correct metadata", async () => {
    const port = await getFreePort();
    const identity = makeBridgeIdentity();
    const gateway = new ExternalAgentGateway();
    const agentId = identity.agentCredential.agentId;

    gateway.registerAgent(
      createExternalAgentSession(agentId, identity.agentPeerId, "Test Agent", identity.ownerId),
    );

    const bridge = createBridge({
      config: { enabled: true, agentUrl: "http://localhost:8080/message", listenPort: port, secret: "test-secret-min-16-chars" },
      identity,
      mesh: makeMesh(),
      getRecipientPeerId: async (id) => id,
      gateway,
    });

    try {
      await httpPost(port, "test-secret-min-16-chars", { to: "envoy_recipient", text: "hello via http" });

      const actions = gateway.getAgentActions(agentId);
      const msgAction = actions.find((a) => a.toolName === "bridge.send_message");
      expect(msgAction).toBeDefined();
      expect(msgAction?.agentId).toBe(agentId);
      expect(msgAction?.params).toEqual({ to: "envoy_recipient", textLength: 14 });
      expect(msgAction?.outcome).toBe("success");
      expect(msgAction?.durationMs).toBeGreaterThanOrEqual(0);
    } finally {
      await bridge.stop();
    }
  });

  // ── HTTPServer gateway guard is before body read ────────

  it("rejects revoked agent before reading the body (DOS guard)", async () => {
    const port = await getFreePort();
    const identity = makeBridgeIdentity();
    const gateway = new ExternalAgentGateway();
    const agentId = identity.agentCredential.agentId;

    gateway.registerAgent(
      createExternalAgentSession(agentId, identity.agentPeerId, "Test Agent", identity.ownerId),
    );
    gateway.revokeAgent(agentId);

    const bridge = createBridge({
      config: { enabled: true, agentUrl: "http://localhost:8080/message", listenPort: port, secret: "test-secret-min-16-chars" },
      identity,
      mesh: makeMesh(),
      getRecipientPeerId: async (id) => id,
      gateway,
    });

    try {
      // Gateway auth check runs before body read — revoked agents get 403
      const res = await fetch(`http://127.0.0.1:${port}/bridge/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer test-secret-min-16-chars" },
        body: JSON.stringify({ to: "envoy_test", text: "hi" }),
      });
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ ok: false, reason: "agent revoked" });
    } finally {
      await bridge.stop();
    }
  });
});
