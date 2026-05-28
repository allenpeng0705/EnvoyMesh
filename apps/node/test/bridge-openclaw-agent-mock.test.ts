/**
 * Simulates an OpenClaw (or HomeClaw-compatible) HTTP agent endpoint.
 * Verifies the EnvoyMesh bridge wire contract without running OpenClaw.
 */
import { createServer, type Server } from "node:http";
import { createServer as createNetServer } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAgentCredential, generateAgentIdentity, generateOwnerIdentity } from "@envoymesh/identity";
import { createChatMessagePayload, EnvoyEnvelopeSchema } from "@envoymesh/protocol";
import { createBridge, forwardToAgent, type BridgeIdentity } from "../src/bridge/index.js";

type OpenClawMockInbound = {
  from: string;
  fromOwnerId: string;
  fromName: string;
  text: string;
};

type OpenClawMockAgent = {
  url: string;
  secret: string;
  close: () => Promise<void>;
  getLastInbound: () => OpenClawMockInbound | null;
  getInboundCount: () => number;
};

async function getFreePort(): Promise<number> {
  const server = createNetServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return port;
}

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

async function startOpenClawMockAgent(params: {
  secret?: string;
  webhookPath?: string;
  onInbound?: (msg: OpenClawMockInbound) => void | Promise<void>;
}): Promise<OpenClawMockAgent> {
  const secret = params.secret ?? "";
  const webhookPath = params.webhookPath ?? "/webhook/envoymesh";
  let lastInbound: OpenClawMockInbound | null = null;
  let inboundCount = 0;

  const server: Server = createServer(async (req, res) => {
    const path = (req.url ?? "").split("?")[0] ?? "";
    if (req.method !== "POST" || path !== webhookPath) {
      res.writeHead(404).end();
      return;
    }
    if (secret) {
      const auth = req.headers.authorization;
      if (auth !== `Bearer ${secret}`) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "unauthorized" }));
        return;
      }
    }
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk as Buffer);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
    if (body.type === "mesh.async_reply") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }
    const msg: OpenClawMockInbound = {
      from: String(body.from ?? "").trim(),
      fromOwnerId: String(body.fromOwnerId ?? "").trim(),
      fromName: String(body.fromName ?? body.fromOwnerId ?? "").trim(),
      text: String(body.text ?? "").trim(),
    };
    if (!msg.fromOwnerId || !msg.text) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "fromOwnerId and text are required" }));
      return;
    }
    lastInbound = msg;
    inboundCount += 1;
    await params.onInbound?.(msg);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
  });

  const port = await getFreePort();
  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", () => resolve()));

  return {
    url: `http://127.0.0.1:${port}${webhookPath}`,
    secret,
    getLastInbound: () => lastInbound,
    getInboundCount: () => inboundCount,
    close: () =>
      new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}

describe("OpenClaw-compatible agent mock", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("forwardToAgent sends HomeClaw/OpenClaw JSON to /message or /webhook/envoymesh", async () => {
    const secret = "openclaw-test-secret";
    const mock = await startOpenClawMockAgent({ secret });
    try {
      await forwardToAgent(
        {
          enabled: true,
          agentUrl: mock.url,
          listenPort: 3031,
          secret,
          agentName: "OpenClaw",
        },
        {
          senderPeerId: "envoy_peer_roundtrip",
          senderOwnerId: "envoy:owner:alice",
          senderDisplayName: "Alice",
          text: "hello from mesh",
        },
      );
      expect(mock.getInboundCount()).toBe(1);
      expect(mock.getLastInbound()).toEqual({
        from: "envoy_peer_roundtrip",
        fromOwnerId: "envoy:owner:alice",
        fromName: "Alice",
        text: "hello from mesh",
      });
    } finally {
      await mock.close();
    }
  });

  it("HomeClaw-style /message path accepts the same wire format", async () => {
    const secret = "homeclaw-path-secret";
    const mock = await startOpenClawMockAgent({ secret, webhookPath: "/message" });
    try {
      await forwardToAgent(
        {
          enabled: true,
          agentUrl: mock.url,
          listenPort: 3031,
          secret,
          agentName: "HomeClaw",
        },
        {
          senderPeerId: "envoy_peer_hc",
          senderOwnerId: "envoy:owner:alice",
          text: "via /message",
        },
      );
      expect(mock.getInboundCount()).toBe(1);
    } finally {
      await mock.close();
    }
  });

  it("round-trip: bridge forwards chat to mock agent then agent replies via /bridge/send", async () => {
    const secret = "openclaw-roundtrip-secret";
    const bridgePort = await getFreePort();
    const identity = makeBridgeIdentity();
    const sendChat = vi.fn().mockResolvedValue(1);
    const senderPeerId = "envoy_peer_sender99";
    const senderOwnerId = "envoy:owner:bob";

    const mock = await startOpenClawMockAgent({
      secret,
      onInbound: async (msg) => {
        const res = await fetch(`http://127.0.0.1:${bridgePort}/bridge/send`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${secret}`,
          },
          body: JSON.stringify({ to: msg.from, text: "openclaw mock reply" }),
        });
        expect(res.ok).toBe(true);
      },
    });

    const bridge = createBridge({
      config: {
        enabled: true,
        agentUrl: mock.url,
        listenPort: bridgePort,
        secret,
        agentName: "OpenClaw",
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
            senderOwnerId,
            senderDisplayName: "Bob",
            text: "ping openclaw",
          }),
        },
        senderPeerId,
      );

      await vi.waitFor(() => expect(mock.getInboundCount()).toBe(1), { timeout: 5000 });
      await vi.waitFor(() => expect(sendChat).toHaveBeenCalledTimes(1), { timeout: 5000 });

      const [recipientPeerId, envelope] = sendChat.mock.calls[0]!;
      expect(recipientPeerId).toBe(senderPeerId);
      expect(EnvoyEnvelopeSchema.safeParse(envelope).success).toBe(true);
      expect((envelope.payload as { text: string }).text).toContain("openclaw mock reply");
    } finally {
      await bridge.stop();
      await mock.close();
    }
  });

  it("mock webhook accepts mesh.async_reply without chat fields", async () => {
    const mock = await startOpenClawMockAgent({});
    try {
    const res = await fetch(mock.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "mesh.async_reply",
          intent: "knowledge.response",
          fromPeerId: "envoy_peer_async",
          messageId: "msg-async-1",
          payload: { answer: "42" },
        }),
      });
      expect(res.ok).toBe(true);
      expect(mock.getInboundCount()).toBe(0);
    } finally {
      await mock.close();
    }
  });
});
