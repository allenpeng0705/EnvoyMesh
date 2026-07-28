/**
 * Ext Agent save path: Social always resends bridgeEnabled + listenPort.
 * Unchanged values must hot-swap via updateLiveConfig; real deltas rebind HTTP.
 */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createHumanProfileStore,
  createLocalPeerDirectoryStore,
  createLocalTaskStore,
  createLocalTrustStore,
} from "@envoymesh/local-store";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NodeServiceImpl } from "../src/node-service-impl.js";

let profileDir: string;
let vaultDir: string;

beforeEach(async () => {
  profileDir = await mkdtemp(join(tmpdir(), "envoy-bridge-rebind-"));
  vaultDir = await mkdtemp(join(tmpdir(), "envoy-vault-rebind-"));
  await mkdir(vaultDir, { recursive: true });
  await writeFile(
    join(profileDir, "bridge-config.json"),
    JSON.stringify(
      {
        enabled: true,
        listenPort: 3031,
        activeExtAgent: "homeclaw",
        agentUrl: "http://127.0.0.1:8010/message",
        agentName: "HomeClaw",
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
    "utf-8",
  );
});

afterEach(async () => {
  await rm(profileDir, { recursive: true, force: true });
  await rm(vaultDir, { recursive: true, force: true });
});

function createService(): NodeServiceImpl {
  const trustStore = createLocalTrustStore(profileDir);
  const peerDirectory = createLocalPeerDirectoryStore(profileDir);
  const human = createHumanProfileStore(profileDir);
  const svc = new NodeServiceImpl(
    undefined,
    trustStore,
    peerDirectory,
    human,
    profileDir,
    undefined,
    vaultDir,
  );
  svc.bindCliTaskStore(createLocalTaskStore(profileDir));
  svc.setBridgeStatus({
    enabled: true,
    agentPeerId: "envoy_agent_test",
    agentUrl: "http://127.0.0.1:8010/message",
    listenPort: 3031,
    agentName: "HomeClaw",
    activeExtAgentId: "homeclaw",
  });
  return svc;
}

describe("updateNodeConfig Ext Agent bridge wiring", () => {
  it("hot-swaps active Ext Agent when listenPort/enabled are unchanged", async () => {
    const svc = createService();
    const live = vi.fn((cfg: { activeExtAgent?: string; agentUrl?: string }) => cfg);
    const rebind = vi.fn(async () => {});
    svc.setBridgeLiveConfigUpdater(live as never);
    svc.setBridgeRebindHandler(rebind);

    await svc.updateNodeConfig({
      bridgeEnabled: true,
      activeExtAgentId: "hermes",
      bridgeListenPort: 3031,
    } as never);

    expect(rebind).not.toHaveBeenCalled();
    expect(live).toHaveBeenCalled();
    expect(svc.getBridgeStatusSnapshot()?.activeExtAgentId).toBe("hermes");
    expect(svc.getBridgeStatusSnapshot()?.agentUrl).toContain(":8020/message");
  });

  it("rebinds HTTP when listenPort actually changes", async () => {
    const svc = createService();
    const live = vi.fn((cfg: unknown) => cfg);
    const rebind = vi.fn(async (_reason: string) => {});
    svc.setBridgeLiveConfigUpdater(live as never);
    svc.setBridgeRebindHandler(rebind);

    await svc.updateNodeConfig({
      bridgeEnabled: true,
      bridgeListenPort: 4099,
    } as never);

    expect(rebind).toHaveBeenCalledOnce();
    expect(rebind.mock.calls[0]![0]).toContain("listenPort");
    // Rebind owns status refresh after HTTP restart.
    expect(live).not.toHaveBeenCalled();
  });

  it("rebinds when bridgeEnabled flips", async () => {
    const svc = createService();
    const rebind = vi.fn(async () => {});
    svc.setBridgeRebindHandler(rebind);

    await svc.updateNodeConfig({ bridgeEnabled: false } as never);

    expect(rebind).toHaveBeenCalledOnce();
    expect(rebind.mock.calls[0]![0]).toContain("bridgeEnabled");
  });
});
