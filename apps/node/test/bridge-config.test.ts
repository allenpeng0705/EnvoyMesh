import { describe, expect, it } from "vitest";
import {
  applyBridgeConfigResolution,
  bridgeForwardAuthSecret,
  BridgeConfigSchema,
  extAgentHealthUrl,
  probeAllExtAgents,
  probeExtAgentHealth,
  resolveActiveExtAgent,
  resolveBridgeStatusAgentType,
} from "../src/bridge/config.js";
import { createServer } from "node:http";
import { createServer as createNetServer } from "node:net";

describe("resolveActiveExtAgent", () => {
  it("uses legacy agentUrl when no registry", () => {
    const cfg = BridgeConfigSchema.parse({
      agentUrl: "http://127.0.0.1:8010/message",
      agentName: "HomeClaw",
    });
    const r = resolveActiveExtAgent(cfg);
    expect(r.id).toBeNull();
    expect(r.url).toBe("http://127.0.0.1:8010/message");
    expect(r.name).toBe("HomeClaw");
    expect(r.adapter).toBe("envoymesh-message");
  });

  it("picks activeExtAgent from registry", () => {
    const cfg = BridgeConfigSchema.parse({
      activeExtAgent: "hermes",
      extAgents: [
        { id: "homeclaw", name: "HomeClaw", url: "http://127.0.0.1:8010/message", enabled: true },
        { id: "hermes", name: "Hermes", url: "http://127.0.0.1:8020/message", enabled: true },
      ],
    });
    const r = resolveActiveExtAgent(cfg);
    expect(r.id).toBe("hermes");
    expect(r.url).toBe("http://127.0.0.1:8020/message");
    expect(r.name).toBe("Hermes");
  });

  it("falls back to first enabled when active id invalid", () => {
    const cfg = BridgeConfigSchema.parse({
      activeExtAgent: "missing",
      extAgents: [
        { id: "homeclaw", name: "HomeClaw", url: "http://127.0.0.1:8010/message", enabled: false },
        { id: "hermes", name: "Hermes", url: "http://127.0.0.1:8020/message", enabled: true },
      ],
    });
    const r = resolveActiveExtAgent(cfg);
    expect(r.id).toBe("hermes");
  });

  it("uses per-agent inboundSecret", () => {
    const cfg = BridgeConfigSchema.parse({
      secret: "global",
      activeExtAgent: "openclaw-ext",
      extAgents: [
        {
          id: "openclaw-ext",
          name: "OpenClaw",
          adapter: "openclaw-webhook",
          url: "http://127.0.0.1:18789/webhook/envoymesh",
          inboundSecret: "agent-secret",
          enabled: true,
        },
      ],
    });
    const resolved = applyBridgeConfigResolution(cfg);
    expect(bridgeForwardAuthSecret(resolved)).toBe("agent-secret");
  });

  it("resolveBridgeStatusAgentType is external for all ext backends", () => {
    expect(resolveBridgeStatusAgentType()).toBe("external");
  });

  it("applyBridgeConfigResolution derives agentUrl and agentName", () => {
    const cfg = BridgeConfigSchema.parse({
      agentUrl: "http://127.0.0.1:9999/stale",
      activeExtAgent: "homeclaw",
      extAgents: [
        { id: "homeclaw", name: "HomeClaw", url: "http://127.0.0.1:8010/message", enabled: true },
      ],
    });
    const resolved = applyBridgeConfigResolution(cfg);
    expect(resolved.agentUrl).toBe("http://127.0.0.1:8010/message");
    expect(resolved.agentName).toBe("HomeClaw");
    expect(resolved.resolvedActiveExtAgentId).toBe("homeclaw");
    expect(resolved.resolvedAdapter).toBe("envoymesh-message");
  });
});

describe("probeAllExtAgents", () => {
  it("marks disabled entries as disabled", async () => {
    const results = await probeAllExtAgents([
      {
        id: "pi",
        name: "Pi",
        adapter: "envoymesh-message",
        url: "http://127.0.0.1:8022/message",
        enabled: false,
      },
    ]);
    expect(results[0]?.reachability).toBe("disabled");
    expect(results[0]?.healthy).toBe(false);
  });
});

describe("probeExtAgentHealth", () => {
  it("derives /status from /message url", () => {
    expect(extAgentHealthUrl("http://127.0.0.1:8010/message", "envoymesh-message")).toBe(
      "http://127.0.0.1:8010/status",
    );
  });

  it("returns true when status is OK", async () => {
    const server = createNetServer();
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const port = (server.address() as { port: number }).port;
    const httpServer = createServer((req, res) => {
      if (req.url === "/status") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "OK" }));
        return;
      }
      res.writeHead(404).end();
    });
    await new Promise<void>((r) => httpServer.listen(port + 1, "127.0.0.1", r));
    const ok = await probeExtAgentHealth(`http://127.0.0.1:${port + 1}/message`, "envoymesh-message");
    httpServer.close();
    server.close();
    expect(ok).toBe(true);
  });
});
