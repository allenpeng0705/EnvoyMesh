/**
 * Step 19 tests — Node Configuration runtime.
 */
import { describe, expect, it } from "vitest";

import {
  getNodeConfigViaRuntime,
  updateNodeConfigViaRuntime,
  type NodeConfigContext,
} from "../src/node-service-config.js";
import type { PersistedNodeConfig } from "../src/node-config-store.js";

function makeCtx(
  overrides: Partial<NodeConfigContext> = {},
): NodeConfigContext {
  return {
    getProfileDir: () => "/profile",
    loadNodeConfig: async () => undefined,
    saveNodeConfig: async () => {},
    getBridgeStatus: () => undefined,
    getRelayPublicWsUrl: () => null,
    loadBridgeConfigSkillApiKeys: async () => ({}),
    loadBridgeConfigWebSearchEnabled: async () => false,
    loadBridgeExtAgentSettings: async () => ({
      activeExtAgentId: "homeclaw",
      extAgents: [],
      bridgeListenPort: 3031,
    }),
    getProfile: () => undefined,
    ...overrides,
  };
}

describe("getNodeConfigViaRuntime", () => {
  it("returns a sensible default when no persisted config exists", async () => {
    const out = await getNodeConfigViaRuntime(makeCtx());
    expect(out.profileDir).toBe("/profile");
    expect(out.discoveryProfile).toBe("lan-fast");
    expect(out.enableMdns).toBe(true);
    expect(out.relayEnabled).toBe(true);
    expect(out.relayServerEnabled).toBe(false);
    expect(out.configuredRelays).toEqual([]);
    expect(out.bridgeEnabled).toBe(true);
    expect(out.lanAutoBondEnabled).toBe(false);
    expect(out.openclawEnabled).toBe(true);
    expect(out.trustModeEnabled).toBe(false);
    expect(out.anonymousDiscoveryMode).toBe("off");
    expect(out.friendAutopilotIntervalHours).toBe(0);
  });

  it("applies env-var overrides on the model provider config", async () => {
    const orig = process.env.ENVOY_MODEL_MODE;
    process.env.ENVOY_MODEL_MODE = "remote";
    try {
      const out = await getNodeConfigViaRuntime(makeCtx());
      expect(out.modelProviders.mode).toBe("remote");
    } finally {
      if (orig === undefined) delete process.env.ENVOY_MODEL_MODE;
      else process.env.ENVOY_MODEL_MODE = orig;
    }
  });

  it("preserves friendAutopilotIntervalHours from persisted config when present", async () => {
    const persisted: Partial<PersistedNodeConfig> = {
      profileDir: "/profile",
      friendAutopilotIntervalHours: 24,
    };
    const out = await getNodeConfigViaRuntime(
      makeCtx({ loadNodeConfig: async () => persisted as PersistedNodeConfig }),
    );
    expect(out.friendAutopilotIntervalHours).toBe(24);
  });

  it("exposes LAN auto-bond fields from persisted config", async () => {
    const persisted: Partial<PersistedNodeConfig> = {
      profileDir: "/profile",
      lanAutoBondEnabled: true,
      lanAutoBondFleetToken: "office-token-xyz",
      lanAutoBondAutoJoinAgentNetwork: true,
    };
    const out = await getNodeConfigViaRuntime(
      makeCtx({ loadNodeConfig: async () => persisted as PersistedNodeConfig }),
    );
    expect(out.lanAutoBondEnabled).toBe(true);
    expect(out.lanAutoBondFleetToken).toBe("office-token-xyz");
    expect(out.lanAutoBondAutoJoinAgentNetwork).toBe(true);
  });
});

describe("updateNodeConfigViaRuntime", () => {
  it("merges partial updates into the persisted config", async () => {
    let saved: PersistedNodeConfig | undefined;
    const existing = {
      profileDir: "/profile",
      version: "0.1" as const,
      discoveryProfile: "lan-fast" as const,
      relayEnabled: true,
      relayServerEnabled: false,
      advertiseAddrs: [],
      bootstrapPeers: [],
      bootstrapPresets: [],
      configuredRelays: [],
      modelProviders: { mode: "disabled" as const },
      chatAssistEnabled: true,
      contactAiPreferences: [],
      updatedAt: "2020-01-01T00:00:00.000Z",
    };
    await updateNodeConfigViaRuntime(
      makeCtx({
        loadNodeConfig: async () => existing as PersistedNodeConfig,
        saveNodeConfig: async (c) => {
          saved = c as PersistedNodeConfig;
        },
      }),
      { relayEnabled: false },
    );
    expect(saved?.relayEnabled).toBe(false);
    expect(saved?.chatAssistEnabled).toBe(true);
  });

  it("rejects friendMatchingPreferencesSigned when no profile is set", async () => {
    await expect(
      updateNodeConfigViaRuntime(
        makeCtx({ getProfile: () => undefined }),
        {
          friendMatchingPreferencesSigned: {
            ownerId: "x",
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
            preferences: { tags: ["x"] },
            signature: "sig",
          } as never,
        },
      ),
    ).rejects.toThrow(/profile not initialized/);
  });
});