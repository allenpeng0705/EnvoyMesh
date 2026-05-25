import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createNodeConfigStore } from "../src/node-config-store.js";

let profileDir: string;

describe("node config store migration", () => {
  beforeEach(async () => {
    profileDir = await mkdtemp(join(tmpdir(), "envoymesh-node-config-migrate-"));
  });

  afterEach(async () => {
    await rm(profileDir, { recursive: true, force: true });
  });

  it("migrates legacy config missing bootstrapPresets and chatAssistEnabled", async () => {
    const legacy = {
      version: "0.1",
      profileDir,
      discoveryProfile: "wan-default",
      relayEnabled: true,
      relayServerEnabled: false,
      advertiseAddrs: [],
      bootstrapPeers: [],
      configuredRelays: [],
      modelProviders: { mode: "mock" },
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    await writeFile(join(profileDir, "node-config.json"), JSON.stringify(legacy), "utf8");

    const store = createNodeConfigStore(profileDir);
    const loaded = await store.load();
    expect(loaded?.bootstrapPresets.length).toBeGreaterThan(0);
    expect(loaded?.chatAssistEnabled).toBe(false);
    expect(loaded?.contactAiPreferences).toEqual([]);

    const raw = await readFile(join(profileDir, "node-config.json"), "utf8");
    expect(raw).toContain("bootstrapPresets");
  });

  it("loads node-config.json with JSONC line and block comments", async () => {
    const raw = `{
      // profile comment
      "version": "0.1",
      "profileDir": "${profileDir.replace(/\\/g, "\\\\")}",
      "discoveryProfile": "wan-default",
      "relayEnabled": true,
      "relayServerEnabled": false,
      "advertiseAddrs": [],
      "bootstrapPeers": [],
      "bootstrapPresets": ["public-libp2p"],
      "configuredRelays": [],
      "modelProviders": { "mode": "mock" },
      "chatAssistEnabled": false,
      "contactAiPreferences": [],
      "updatedAt": "2026-01-01T00:00:00.000Z"
      /* trailing block ok before close */
    }`;
    await writeFile(join(profileDir, "node-config.json"), raw, "utf8");

    const store = createNodeConfigStore(profileDir);
    const loaded = await store.load();
    expect(loaded?.discoveryProfile).toBe("wan-default");
  });
});
