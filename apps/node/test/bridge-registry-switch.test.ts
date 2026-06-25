/**
 * Phase 44 — registry switch: forwardToAgent targets change when activeExtAgent changes.
 */
import { createServer, type Server } from "node:http";
import { createServer as createNetServer } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BridgeConfigSchema, applyBridgeConfigResolution, forwardToAgent } from "../src/bridge/index.js";

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

async function startMockAgent(name: string): Promise<{ url: string; close: () => Promise<void>; hits: string[] }> {
  const port = await getFreePort();
  const hits: string[] = [];
  const server: Server = createServer(async (req, res) => {
    const path = (req.url ?? "").split("?")[0] ?? "";
    if (req.method === "GET" && path === "/status") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "OK", name }));
      return;
    }
    if (req.method === "POST" && path === "/message") {
      hits.push(name);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
  return {
    url: `http://127.0.0.1:${port}/message`,
    hits,
    close: () => new Promise((resolve, reject) => server.close((e) => (e ? reject(e) : resolve()))),
  };
}

describe("bridge registry switch", () => {
  const agents: Array<{ close: () => Promise<void> }> = [];

  afterEach(async () => {
    await Promise.all(agents.splice(0).map((a) => a.close()));
  });

  it("forwardToAgent uses resolved URL after activeExtAgent switch", async () => {
    const a = await startMockAgent("homeclaw");
    const b = await startMockAgent("hermes");
    agents.push(a, b);

    let config = applyBridgeConfigResolution(
      BridgeConfigSchema.parse({
        enabled: true,
        activeExtAgent: "homeclaw",
        extAgents: [
          { id: "homeclaw", name: "HomeClaw", url: a.url, enabled: true },
          { id: "hermes", name: "Hermes", url: b.url, enabled: true },
        ],
      }),
    );

    await forwardToAgent(config, {
      senderPeerId: "envoy_peer_a",
      senderOwnerId: "envoy:owner:abc",
      text: "hello",
    });
    expect(a.hits).toEqual(["homeclaw"]);
    expect(b.hits).toEqual([]);

    config = applyBridgeConfigResolution(
      BridgeConfigSchema.parse({
        ...config,
        activeExtAgent: "hermes",
      }),
    );

    await forwardToAgent(config, {
      senderPeerId: "envoy_peer_a",
      senderOwnerId: "envoy:owner:abc",
      text: "second",
    });
    expect(a.hits).toEqual(["homeclaw"]);
    expect(b.hits).toEqual(["hermes"]);
  });

  it("createBridge updateConfig changes forward target", async () => {
    const { createBridge } = await import("../src/bridge/index.js");
    const { createAgentCredential, generateAgentIdentity, generateOwnerIdentity } = await import(
      "@envoymesh/identity"
    );

    const a = await startMockAgent("a");
    const b = await startMockAgent("b");
    agents.push(a, b);
    const bridgePort = await getFreePort();

    const owner = generateOwnerIdentity();
    const agent = generateAgentIdentity(owner.ownerId);
    const identity = {
      agentPeerId: agent.agentPeerId,
      agentPublicKeyPem: agent.publicKeyPem,
      agentPrivateKeyPem: agent.privateKeyPem,
      ownerId: owner.ownerId,
      agentCredential: createAgentCredential({ owner, agent, scope: ["chat.message"] }),
    };

    const bridge = createBridge({
      config: applyBridgeConfigResolution(
        BridgeConfigSchema.parse({
          enabled: true,
          listenPort: bridgePort,
          activeExtAgent: "a",
          extAgents: [
            { id: "a", name: "A", url: a.url, enabled: true },
            { id: "b", name: "B", url: b.url, enabled: true },
          ],
        }),
      ),
      identity,
      mesh: { peerId: "self", sendChat: vi.fn() } as any,
      getRecipientPeerId: async () => "peer",
    });

    await bridge._handleMessage(
      {
        intent: "chat.message",
        recipientPeerId: identity.agentPeerId,
        senderPeerId: "remote",
        payload: { senderOwnerId: "envoy:owner:x", text: "hi" },
      },
      "remote",
    );
    await new Promise((r) => setTimeout(r, 50));
    expect(a.hits).toEqual(["a"]);

    bridge.updateConfig(
      BridgeConfigSchema.parse({
        enabled: true,
        listenPort: bridgePort,
        activeExtAgent: "b",
        extAgents: [
          { id: "a", name: "A", url: a.url, enabled: true },
          { id: "b", name: "B", url: b.url, enabled: true },
        ],
      }),
    );

    await bridge._handleMessage(
      {
        intent: "chat.message",
        recipientPeerId: identity.agentPeerId,
        senderPeerId: "remote",
        payload: { senderOwnerId: "envoy:owner:x", text: "again" },
      },
      "remote",
    );
    await new Promise((r) => setTimeout(r, 50));
    expect(b.hits).toEqual(["b"]);

    await bridge.stop();
  });
});
