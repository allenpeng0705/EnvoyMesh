/**
 * Worker profile saves must push our Agent Card when Join Agent Network is on,
 * so bonded peers (e.g. Mac) see updated skills without a manual refresh.
 */
import { mkdir, mkdtemp, rm } from "node:fs/promises";
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
  profileDir = await mkdtemp(join(tmpdir(), "envoy-an-profile-announce-"));
  vaultDir = await mkdtemp(join(tmpdir(), "envoy-vault-an-announce-"));
  await mkdir(vaultDir, { recursive: true });
});

afterEach(async () => {
  vi.useRealTimers();
  // Drain pending microtasks + I/O so `updateNodeConfig`'s fire-and-forget
  // fs writes (`void this.refreshNearbyDiscovery()`, etc.) finish before we
  // `rm` the temp dir. Without this, on macOS the second+ test in a file
  // can race: rm runs while a write is still in flight → ENOTEMPTY.
  await new Promise<void>((resolve) => setImmediate(resolve));
  await new Promise<void>((resolve) => setImmediate(resolve));
  // Retry the rm up to 5 times in case the OS is still releasing file
  // handles from the service. Each retry waits 50 ms — bounded total
  // ~250 ms vs. the underlying tests (each <100 ms).
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await rm(profileDir, { recursive: true, force: true });
      break;
    } catch (err) {
      if (attempt === 4) throw err;
      await new Promise<void>((resolve) => setTimeout(resolve, 50));
    }
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await rm(vaultDir, { recursive: true, force: true });
      break;
    } catch (err) {
      if (attempt === 4) throw err;
      await new Promise<void>((resolve) => setTimeout(resolve, 50));
    }
  }
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
  return svc;
}

const SAMPLE_PROFILE = {
  modelFreshness: 8,
  spendPosture: "subscription" as const,
  contextWindow: "256k" as const,
  skills: [{ id: "coding", kind: "domain" as const, source: "owner" as const }],
};

describe("updateNodeConfig announces Agent Card after worker profile save", () => {
  it("schedules announceLocalAgentCardToBondedPeers when Join is on", async () => {
    vi.useFakeTimers();
    const svc = createService();
    vi.spyOn(svc, "refreshAgentNetworkWorkers").mockResolvedValue({ requested: 0, failed: 0 });
    await svc.updateNodeConfig({ capabilityProviderEnabled: true });

    const spy = vi
      .spyOn(svc, "announceLocalAgentCardToBondedPeers")
      .mockResolvedValue({ announced: 0, failed: 0 });

    await svc.updateNodeConfig({ agentNetworkProfile: SAMPLE_PROFILE });
    expect(spy).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1_000);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("does not announce when Join Agent Network is off", async () => {
    vi.useFakeTimers();
    const svc = createService();
    vi.spyOn(svc, "refreshAgentNetworkWorkers").mockResolvedValue({ requested: 0, failed: 0 });
    await svc.updateNodeConfig({ capabilityProviderEnabled: false });

    const spy = vi
      .spyOn(svc, "announceLocalAgentCardToBondedPeers")
      .mockResolvedValue({ announced: 0, failed: 0 });

    await svc.updateNodeConfig({ agentNetworkProfile: SAMPLE_PROFILE });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(spy).not.toHaveBeenCalled();
  });

  it("debounces rapid profile saves into one announce", async () => {
    vi.useFakeTimers();
    const svc = createService();
    vi.spyOn(svc, "refreshAgentNetworkWorkers").mockResolvedValue({ requested: 0, failed: 0 });
    await svc.updateNodeConfig({ capabilityProviderEnabled: true });

    const spy = vi
      .spyOn(svc, "announceLocalAgentCardToBondedPeers")
      .mockResolvedValue({ announced: 0, failed: 0 });

    await svc.updateNodeConfig({
      agentNetworkProfile: { ...SAMPLE_PROFILE, modelFreshness: 7 },
    });
    await svc.updateNodeConfig({
      agentNetworkProfile: { ...SAMPLE_PROFILE, modelFreshness: 9 },
    });
    expect(spy).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1_000);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
