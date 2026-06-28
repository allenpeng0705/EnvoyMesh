/**
 * Phase 44 — probeExtAgents RPC.
 */
import { createServer, type Server } from "node:http";
import { createServer as createNetServer } from "node:net";
import { afterEach, describe, expect, it, beforeEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { NodeServiceImpl } from "../src/node-service-impl.js";
import {
  createHumanProfileStore,
  createLocalPeerDirectoryStore,
  createLocalTrustStore,
} from "@envoymesh/local-store";

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

async function startMockAgent(name: string): Promise<{ url: string; close: () => Promise<void> }> {
  const port = await getFreePort();
  const server: Server = createServer((req, res) => {
    const path = (req.url ?? "").split("?")[0] ?? "";
    if (req.method === "GET" && path === "/status") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "OK", name }));
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
  return {
    url: `http://127.0.0.1:${port}/message`,
    close: () => new Promise((resolve, reject) => server.close((e) => (e ? reject(e) : resolve()))),
  };
}

describe("NodeServiceImpl.probeExtAgents", () => {
  let tmpDir: string;
  let svc: NodeServiceImpl;
  const agents: Array<{ close: () => Promise<void> }> = [];

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "bridge-probe-"));
    svc = new NodeServiceImpl(
      undefined,
      createLocalTrustStore(tmpDir),
      createLocalPeerDirectoryStore(tmpDir),
      createHumanProfileStore(tmpDir),
      tmpDir,
    );
    svc.setBridgeStatus({
      enabled: true,
      agentPeerId: "envoy_agent_test",
      agentUrl: "http://127.0.0.1:8010/message",
      listenPort: 3031,
      agentName: "HomeClaw",
    });
  });

  afterEach(async () => {
    await Promise.all(agents.splice(0).map((a) => a.close()));
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns running/stopped for each registry entry", async () => {
    const up = await startMockAgent("homeclaw");
    agents.push(up);
    const downUrl = "http://127.0.0.1:59999/message";

    writeFileSync(
      join(tmpDir, "bridge-config.json"),
      JSON.stringify({
        enabled: true,
        listenPort: 3031,
        activeExtAgent: "homeclaw",
        extAgents: [
          { id: "homeclaw", name: "HomeClaw", url: up.url, enabled: true },
          { id: "hermes", name: "Hermes", url: downUrl, enabled: true },
        ],
      }, null, 2) + "\n",
    );

    const result = await svc.probeExtAgents();
    expect(result.entries).toHaveLength(2);
    const home = result.entries.find((e) => e.id === "homeclaw");
    const hermes = result.entries.find((e) => e.id === "hermes");
    expect(home?.reachability).toBe("running");
    expect(hermes?.reachability).toBe("stopped");
    expect(result.activeHealthy).toBe(true);

    const status = await svc.getBridgeStatus();
    expect(status.healthy).toBe(true);
  });
});
