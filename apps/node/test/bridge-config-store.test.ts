import { describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  applyExtAgentSettingsPatch,
  extractExtAgentSettingsPatch,
  loadBridgeConfigFromProfile,
  saveBridgeConfigToProfile,
  shouldRebindAgentBridge,
} from "../src/bridge/bridge-config-store.js";
import { createCoalescedRunner } from "../src/bridge/coalesced-runner.js";

describe("bridge-config-store", () => {
  it("round-trips active agent selection and applies agentUrl/agentName", async () => {
    const profileDir = await mkdtemp(join(tmpdir(), "envoy-bridge-"));
    try {
      await saveBridgeConfigToProfile(profileDir, {
        enabled: true,
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
        activeExtAgent: "homeclaw",
      });

      const switched = await applyExtAgentSettingsPatch(profileDir, {
        activeExtAgentId: "hermes",
      });
      expect(switched.activeExtAgent).toBe("hermes");
      expect(switched.agentUrl).toBe("http://127.0.0.1:8020/message");
      expect(switched.agentName).toBe("Hermes");
    } finally {
      await rm(profileDir, { recursive: true, force: true });
    }
  });

  it("loads defaults when bridge-config.json is missing", async () => {
    const profileDir = await mkdtemp(join(tmpdir(), "envoy-bridge-"));
    try {
      const cfg = await loadBridgeConfigFromProfile(profileDir);
      expect(cfg.activeExtAgent).toBe("homeclaw");
      expect(cfg.extAgents?.some((a) => a.id === "openhuman")).toBe(true);
    } finally {
      await rm(profileDir, { recursive: true, force: true });
    }
  });

  it("extractExtAgentSettingsPatch peels Ext Agent keys out of node config", () => {
    const { nodePatch, extPatch } = extractExtAgentSettingsPatch({
      bridgeEnabled: true,
      activeExtAgentId: "hermes",
      bridgeListenPort: 3031,
      bridgeSecret: "s3cret",
      openclawEnabled: true,
    });
    expect(extPatch).toEqual({
      activeExtAgentId: "hermes",
      bridgeListenPort: 3031,
      secret: "s3cret",
    });
    expect(nodePatch).toEqual({
      bridgeEnabled: true,
      openclawEnabled: true,
    });
  });

  it("shouldRebindAgentBridge ignores unchanged listenPort/bridgeEnabled from Social save", () => {
    const decision = shouldRebindAgentBridge({
      nodePatch: { bridgeEnabled: true },
      extPatch: {
        activeExtAgentId: "hermes",
        bridgeListenPort: 3031,
      },
      previous: {
        bridgeEnabled: true,
        listenPort: 3031,
      },
    });
    expect(decision.needed).toBe(false);
    expect(decision.reasons).toEqual([]);
  });

  it("shouldRebindAgentBridge detects enable / port / secret deltas", () => {
    expect(
      shouldRebindAgentBridge({
        nodePatch: { bridgeEnabled: true },
        extPatch: {},
        previous: { bridgeEnabled: false, listenPort: 3031 },
      }).reasons,
    ).toEqual(["bridgeEnabled"]);

    expect(
      shouldRebindAgentBridge({
        nodePatch: {},
        extPatch: { bridgeListenPort: 4040 },
        previous: { bridgeEnabled: true, listenPort: 3031 },
      }).reasons,
    ).toEqual(["listenPort"]);

    expect(
      shouldRebindAgentBridge({
        nodePatch: {},
        extPatch: { secret: "new" },
        previous: { bridgeEnabled: true, listenPort: 3031, secret: "old" },
      }).reasons,
    ).toEqual(["secret"]);

    expect(
      shouldRebindAgentBridge({
        nodePatch: {},
        extPatch: { secret: "  same  " },
        previous: { bridgeEnabled: true, listenPort: 3031, secret: "same" },
      }).needed,
    ).toBe(false);
  });

  it("applyExtAgentSettingsPatch persists listenPort and secret", async () => {
    const profileDir = await mkdtemp(join(tmpdir(), "envoy-bridge-"));
    try {
      const next = await applyExtAgentSettingsPatch(profileDir, {
        bridgeListenPort: 4099,
        secret: "tok",
      });
      expect(next.listenPort).toBe(4099);
      expect(next.secret).toBe("tok");
      const reloaded = await loadBridgeConfigFromProfile(profileDir);
      expect(reloaded.listenPort).toBe(4099);
      expect(reloaded.secret).toBe("tok");
    } finally {
      await rm(profileDir, { recursive: true, force: true });
    }
  });
});

describe("createCoalescedRunner", () => {
  it("runs once for a single call", async () => {
    const run = vi.fn(async () => {});
    const coalesce = createCoalescedRunner(run);
    await coalesce("a");
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith("a");
  });

  it("coalesces overlapping callers and runs a follow-up with the latest reason", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const reasons: string[] = [];
    const run = vi.fn(async (reason: string) => {
      reasons.push(reason);
      if (reasons.length === 1) await gate;
    });
    const coalesce = createCoalescedRunner(run);

    const first = coalesce("listenPort");
    // Let the first run enter the gate.
    await Promise.resolve();
    await Promise.resolve();
    const second = coalesce("secret");
    release();
    await Promise.all([first, second]);

    expect(run.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(reasons[0]).toBe("listenPort");
    expect(reasons.at(-1)).toBe("secret");
  });

  it("does not drop a request that arrives in the finally gap", async () => {
    const reasons: string[] = [];
    let pass = 0;
    const run = vi.fn(async (reason: string) => {
      reasons.push(reason);
      pass += 1;
      if (pass === 1) {
        // Simulate a late arriver after this pass clears pending but before
        // the outer promise settles — schedule after microtasks of the runner.
        await Promise.resolve();
      }
    });
    const coalesce = createCoalescedRunner(run);
    const first = coalesce("a");
    await Promise.resolve();
    const second = coalesce("b");
    await Promise.all([first, second]);
    expect(reasons).toContain("a");
    expect(reasons).toContain("b");
  });
});
