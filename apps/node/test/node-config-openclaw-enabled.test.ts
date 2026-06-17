import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createNodeConfigStore } from "../src/node-config-store.js";

let profileDir: string;

describe("node config store — openclawEnabled (Phase 32)", () => {
  beforeEach(async () => {
    profileDir = await mkdtemp(join(tmpdir(), "envoymesh-node-config-openclaw-"));
  });

  afterEach(async () => {
    await rm(profileDir, { recursive: true, force: true });
  });

  it("preserves an explicit openclawEnabled: true across save/load (D1C: existing installs not retroactively changed)", async () => {
    const store = createNodeConfigStore(profileDir);
    const initial = {
      version: "0.1",
      profileDir,
      discoveryProfile: "lan-fast",
      enableMdns: true,
      relayEnabled: true,
      relayServerEnabled: false,
      advertiseAddrs: [],
      bootstrapPeers: [],
      bootstrapPresets: [],
      configuredRelays: [],
      modelProviders: { mode: "disabled" },
      chatAssistEnabled: false,
      contactAiPreferences: [],
      openclawEnabled: true,
      updatedAt: new Date().toISOString(),
    } as const;
    await store.save(initial);

    const loaded = await store.load();
    expect(loaded?.openclawEnabled).toBe(true);

    // Reload from disk to confirm the value was actually persisted (not just held in memory).
    const onDisk = JSON.parse(await readFile(join(profileDir, "node-config.json"), "utf8"));
    expect(onDisk.openclawEnabled).toBe(true);
  });

  it("preserves an explicit openclawEnabled: false across save/load", async () => {
    const store = createNodeConfigStore(profileDir);
    const initial = {
      version: "0.1",
      profileDir,
      discoveryProfile: "lan-fast",
      enableMdns: true,
      relayEnabled: true,
      relayServerEnabled: false,
      advertiseAddrs: [],
      bootstrapPeers: [],
      bootstrapPresets: [],
      configuredRelays: [],
      modelProviders: { mode: "disabled" },
      chatAssistEnabled: false,
      contactAiPreferences: [],
      openclawEnabled: false,
      updatedAt: new Date().toISOString(),
    } as const;
    await store.save(initial);

    const loaded = await store.load();
    expect(loaded?.openclawEnabled).toBe(false);
  });

  it("omitting openclawEnabled does not throw — field is optional (backwards-compatible)", async () => {
    const store = createNodeConfigStore(profileDir);
    // No openclawEnabled key in the legacy config — should be valid (undefined).
    const legacy = {
      version: "0.1",
      profileDir,
      discoveryProfile: "lan-fast",
      enableMdns: true,
      relayEnabled: true,
      relayServerEnabled: false,
      advertiseAddrs: [],
      bootstrapPeers: [],
      bootstrapPresets: [],
      configuredRelays: [],
      modelProviders: { mode: "disabled" },
      chatAssistEnabled: false,
      contactAiPreferences: [],
      updatedAt: new Date().toISOString(),
    };
    await writeFile(join(profileDir, "node-config.json"), JSON.stringify(legacy), "utf8");

    const loaded = await store.load();
    expect(loaded).toBeDefined();
    expect(loaded?.openclawEnabled).toBeUndefined();
  });
});
