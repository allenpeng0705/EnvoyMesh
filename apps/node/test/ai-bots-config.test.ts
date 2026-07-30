/**
 * Smoke tests for AI character bot config + thread helpers.
 * Full sendToAiBot LLM path is covered by runtime smoke; here we lock
 * the config round-trip and thread-key contract used by Social/EnvoyGo.
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  aiBotThreadKey,
  isAiBotThread,
  parseBotIdFromThreadKey,
  type AiBotDefinition,
} from "@envoymesh/api";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createNodeConfigStore } from "../src/node-config-store.js";
import {
  getNodeConfigViaRuntime,
  updateNodeConfigViaRuntime,
  type NodeConfigContext,
} from "../src/node-service-config.js";

describe("AI character bots — config + thread keys", () => {
  let profileDir: string;

  beforeEach(async () => {
    profileDir = await mkdtemp(join(tmpdir(), "envoy-ai-bots-"));
  });

  afterEach(async () => {
    await rm(profileDir, { recursive: true, force: true });
  });

  it("thread helpers round-trip bot ids", () => {
    expect(aiBotThreadKey("librarian")).toBe("bot:librarian");
    expect(parseBotIdFromThreadKey("bot:librarian")).toBe("librarian");
    expect(isAiBotThread("bot:librarian")).toBe(true);
    expect(isAiBotThread("envoyai")).toBe(false);
  });

  it("persists aiBots via updateNodeConfig and returns them from getNodeConfig", async () => {
    const store = createNodeConfigStore(profileDir);
    const ctx: NodeConfigContext = {
      getProfileDir: () => profileDir,
      loadNodeConfig: () => store.load(),
      saveNodeConfig: (cfg) => store.save(cfg),
      getBridgeStatus: () => undefined,
      getRelayPublicWsUrl: () => null,
      loadBridgeConfigSkillApiKeys: async () => ({}),
      loadBridgeConfigWebSearchEnabled: async () => false,
      loadBridgeExtAgentSettings: async () => ({
        extAgents: [],
        bridgeListenPort: 3031,
      }),
      getProfile: () => undefined,
    };

    // Seed a valid default config first.
    const seed = await getNodeConfigViaRuntime(ctx);
    await updateNodeConfigViaRuntime(ctx, {
      profileDir,
      discoveryProfile: seed.discoveryProfile,
      enableMdns: seed.enableMdns ?? false,
      relayEnabled: seed.relayEnabled ?? false,
      relayServerEnabled: seed.relayServerEnabled ?? false,
      advertiseAddrs: seed.advertiseAddrs ?? [],
      bootstrapPeers: seed.bootstrapPeers ?? [],
      bootstrapPresets: seed.bootstrapPresets ?? [],
      configuredRelays: seed.configuredRelays ?? [],
      modelProviders: seed.modelProviders ?? { mode: "disabled" },
      chatAssistEnabled: seed.chatAssistEnabled ?? false,
    } as never);

    const bot: AiBotDefinition = {
      id: "luna",
      name: "Luna",
      systemPrompt: "You are a helpful librarian.",
      avatarColor: "#6366f1",
      description: "Knowledge guide",
      enabled: true,
    };

    await updateNodeConfigViaRuntime(ctx, { aiBots: [bot] });

    const loaded = await getNodeConfigViaRuntime(ctx);
    expect(loaded.aiBots).toHaveLength(1);
    expect(loaded.aiBots![0]).toMatchObject({
      id: "luna",
      name: "Luna",
      avatarColor: "#6366f1",
      description: "Knowledge guide",
      enabled: true,
    });
    // On-save normalizer prepends "You are Luna." when missing.
    expect(loaded.aiBots![0]!.systemPrompt).toContain("You are Luna.");
    expect(loaded.aiBots![0]!.systemPrompt).toContain("You are a helpful librarian.");

    // Unrelated patch must not wipe aiBots.
    await updateNodeConfigViaRuntime(ctx, { chatAssistEnabled: true });
    const again = await getNodeConfigViaRuntime(ctx);
    expect(again.aiBots).toEqual(loaded.aiBots);
    expect(again.chatAssistEnabled).toBe(true);

    const raw = await readFile(join(profileDir, "node-config.json"), "utf8");
    expect(raw).toContain('"id": "luna"');
  });
});
