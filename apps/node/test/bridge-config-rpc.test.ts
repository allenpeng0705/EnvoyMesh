import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { NodeServiceImpl } from "../src/node-service-impl.js";
import {
  createHumanProfileStore,
  createLocalPeerDirectoryStore,
  createLocalTrustStore,
} from "@envoymesh/local-store";

describe("NodeServiceImpl bridge config RPC", () => {
  let tmpDir: string;
  let svc: NodeServiceImpl;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "bridge-cfg-"));
    writeFileSync(
      join(tmpDir, "bridge-config.json"),
      JSON.stringify(
        {
          enabled: true,
          listenPort: 3031,
          activeExtAgent: "homeclaw",
          extAgents: [
            {
              id: "homeclaw",
              name: "HomeClaw",
              adapter: "envoymesh-message",
              url: "http://127.0.0.1:8010/message",
              enabled: true,
            },
            {
              id: "hermes",
              name: "Hermes",
              adapter: "envoymesh-message",
              url: "http://127.0.0.1:8020/message",
              enabled: true,
            },
          ],
        },
        null,
        2,
      ) + "\n",
    );
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

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("getBridgeConfig returns registry view", async () => {
    const view = await svc.getBridgeConfig();
    expect(view.extAgents).toHaveLength(2);
    expect(view.activeExtAgentId).toBe("homeclaw");
    expect(view.agentUrl).toBe("http://127.0.0.1:8010/message");
  });

  it("updateBridgeConfig switches activeExtAgent and emits status", async () => {
    const events: unknown[] = [];
    svc.on("bridge:status", (s) => events.push(s));

    const result = await svc.updateBridgeConfig({ activeExtAgent: "hermes" });
    expect(result.ok).toBe(true);
    expect(result.config?.activeExtAgentId).toBe("hermes");
    expect(result.config?.agentUrl).toBe("http://127.0.0.1:8020/message");

    const status = await svc.getBridgeStatus();
    expect(status.activeExtAgentId).toBe("hermes");
    expect(status.agentName).toBe("Hermes");
    expect(status.agentType).toBe("external");
    expect(events.length).toBeGreaterThan(0);

    const disk = JSON.parse(readFileSync(join(tmpDir, "bridge-config.json"), "utf-8"));
    expect(disk.activeExtAgent).toBe("hermes");
  });
});
