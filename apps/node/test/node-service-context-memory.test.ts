import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { AiSettings, ContextMemorySettings } from "@envoymesh/api";
import { resolveContextMemorySettings } from "@envoymesh/api";
import {
  ensureContextMemoryForOpenClaw,
  getContextMemoryStatusViaRuntime,
  syncContextMemoryFromConfig,
  type ContextMemoryHost,
} from "../src/node-service-context-memory.js";
import type { ContextMemoryBackend } from "../src/context-memory-runtime.js";

function makeHost(profileDir: string, aiSettings: AiSettings): ContextMemoryHost {
  let settings = { ...aiSettings };
  const host: ContextMemoryHost = {
    _profileDir: profileDir,
    _contextMemoryRuntime: null,
    _contextMemorySyncPromise: null,
    _contextMemorySkipResync: false,
    _contextMemorySyncDirty: false,
    async getNodeConfig() {
      return { aiSettings: settings };
    },
    async updateNodeConfig(config) {
      if (config.aiSettings) settings = { ...settings, ...config.aiSettings };
    },
    async persistContextMemorySettings(partial: ContextMemorySettings) {
      settings = {
        ...settings,
        contextMemory: resolveContextMemorySettings({
          ...settings.contextMemory,
          ...partial,
        }),
      };
    },
  };
  return host;
}

describe("node-service-context-memory host bridge", () => {
  const dirs: string[] = [];
  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
  });

  it("persists runtime across host object recreations via shared fields", async () => {
    const profile = await mkdtemp(join(tmpdir(), "cm-host-"));
    dirs.push(profile);
    const shared = {
      _contextMemoryRuntime: null as ContextMemoryBackend | null,
      _contextMemorySyncPromise: null as Promise<void> | null,
      _contextMemorySkipResync: false,
      _contextMemorySyncDirty: false,
      settings: {
        contextMemory: resolveContextMemorySettings({ enabled: true, backend: "native" }),
      } as AiSettings,
    };

    const bridge = (): ContextMemoryHost => ({
      _profileDir: profile,
      getNodeConfig: async () => ({ aiSettings: shared.settings }),
      updateNodeConfig: async (config) => {
        if (config.aiSettings) shared.settings = { ...shared.settings, ...config.aiSettings };
      },
      get _contextMemoryRuntime() {
        return shared._contextMemoryRuntime;
      },
      set _contextMemoryRuntime(v) {
        shared._contextMemoryRuntime = v ?? null;
      },
      get _contextMemorySyncPromise() {
        return shared._contextMemorySyncPromise;
      },
      set _contextMemorySyncPromise(v) {
        shared._contextMemorySyncPromise = v ?? null;
      },
      get _contextMemorySkipResync() {
        return shared._contextMemorySkipResync;
      },
      set _contextMemorySkipResync(v) {
        shared._contextMemorySkipResync = v === true;
      },
      get _contextMemorySyncDirty() {
        return shared._contextMemorySyncDirty;
      },
      set _contextMemorySyncDirty(v) {
        shared._contextMemorySyncDirty = v === true;
      },
    });

    const snap = await getContextMemoryStatusViaRuntime(bridge());
    expect(snap.enabled).toBe(true);
    expect(snap.status).toBe("ready");
    expect(shared._contextMemoryRuntime).not.toBeNull();

    const again = await ensureContextMemoryForOpenClaw(bridge());
    expect(again?.status()).toBe("ready");
    expect(again).not.toBeNull();
  });

  it("coalesces concurrent sync without dropping a dirty re-sync", async () => {
    const profile = await mkdtemp(join(tmpdir(), "cm-sync-"));
    dirs.push(profile);
    let reads = 0;
    const host = makeHost(profile, {
      contextMemory: resolveContextMemorySettings({ enabled: true, backend: "native" }),
    });
    const origGet = host.getNodeConfig.bind(host);
    host.getNodeConfig = async () => {
      reads++;
      await new Promise((r) => setTimeout(r, 15));
      return origGet();
    };

    await Promise.all([
      syncContextMemoryFromConfig(host),
      syncContextMemoryFromConfig(host),
      syncContextMemoryFromConfig(host),
    ]);
    expect(host._contextMemoryRuntime?.status()).toBe("ready");
    // At least one apply; dirty coalescing may re-read once more, but not thrash.
    expect(reads).toBeGreaterThanOrEqual(1);
    expect(reads).toBeLessThanOrEqual(4);
  });

  it("skipResync marks dirty and does not throw", async () => {
    const profile = await mkdtemp(join(tmpdir(), "cm-skip-"));
    dirs.push(profile);
    const host = makeHost(profile, {
      contextMemory: resolveContextMemorySettings({ enabled: true, backend: "native" }),
    });
    await syncContextMemoryFromConfig(host);
    host._contextMemorySkipResync = true;
    host._contextMemorySyncDirty = false;
    await syncContextMemoryFromConfig(host);
    expect(host._contextMemorySyncDirty).toBe(true);
    host._contextMemorySkipResync = false;
    await syncContextMemoryFromConfig(host);
    expect(host._contextMemoryRuntime?.status()).toBe("ready");
  });

  it("ensureContextMemoryForOpenClaw returns null-safe handle when disabled", async () => {
    const profile = await mkdtemp(join(tmpdir(), "cm-off-"));
    dirs.push(profile);
    const host = makeHost(profile, {
      contextMemory: resolveContextMemorySettings({ enabled: false }),
    });
    const cm = await ensureContextMemoryForOpenClaw(host);
    expect(cm).not.toBeNull();
    expect(cm?.status()).toBe("off");
    expect(await cm?.recallForTurn("x")).toBe("");
  });
});
