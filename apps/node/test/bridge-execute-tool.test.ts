import { describe, expect, it, vi, afterEach } from "vitest";
import { createServer } from "node:net";
import { createAgentCredential, generateAgentIdentity, generateOwnerIdentity } from "@envoymesh/identity";
import { createBridge } from "../src/bridge/index.js";

describe("bridge execute-tool (ADB-E)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("runs executeTool via POST /bridge/execute-tool", async () => {
    const port = await getFreePort();
    const owner = generateOwnerIdentity();
    const agent = generateAgentIdentity(owner.ownerId);
    const executeTool = vi.fn(async () => ({
      ok: true,
      result: { items: [] },
      toolName: "mesh.library_list",
      correlationId: "c1",
      latencyMs: 1,
    }));

    const bridge = createBridge({
      config: { enabled: true, agentUrl: "http://127.0.0.1:8080/message", listenPort: port, secret: "secret" },
      identity: {
        agentPeerId: agent.agentPeerId,
        agentPublicKeyPem: agent.publicKeyPem,
        agentPrivateKeyPem: agent.privateKeyPem,
        ownerId: owner.ownerId,
        agentCredential: createAgentCredential({ owner, agent, scope: ["chat.message"] }),
      },
      mesh: { peerId: "12D3Self", sendChat: vi.fn() } as any,
      getRecipientPeerId: async (id) => id,
      executeTool,
      listTools: () => [{ name: "mesh.library_list" } as any],
    });

    try {
      await waitForPort(port);
      const res = await fetch(`http://127.0.0.1:${port}/bridge/execute-tool`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer secret" },
        body: JSON.stringify({ toolName: "mesh.library_list", params: {} }),
      });
      expect(res.ok).toBe(true);
      const json = (await res.json()) as { ok: boolean; result: { ok: boolean } };
      expect(json.ok).toBe(true);
      expect(json.result.ok).toBe(true);
      expect(executeTool).toHaveBeenCalledWith("mesh.library_list", {});
    } finally {
      await bridge.stop();
    }
  });
});

async function getFreePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  return port;
}

async function waitForPort(port: number): Promise<void> {
  for (let i = 0; i < 20; i++) {
    try {
      await fetch(`http://127.0.0.1:${port}/bridge/list-tools`, {
        headers: { Authorization: "Bearer secret" },
      });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 25));
    }
  }
}
