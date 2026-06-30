/**
 * Unit tests for node-service-manifest.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => {
  let currentManifest: unknown = undefined;
  const capStore = {
    loadManifest: () => currentManifest,
    saveManifest: (m: unknown) => {
      currentManifest = m;
    },
    createDefaultManifest: (params: Record<string, unknown> | undefined) => ({
      version: "0.1",
      ...(params ?? {}),
      createdAt: "2026-06-30T00:00:00Z",
      updatedAt: "2026-06-30T00:00:00Z",
    }),
  };
  return {
    capStore,
    reset() {
      currentManifest = undefined;
    },
  };
});

vi.mock("../src/bootstrap-resolver.js", () => ({
  looksLikeDomain: (_addr: string) => false,
  resolveBootstrapAddresses: async () => [],
}));

import {
  getCapabilityManifestViaRuntime,
  updateCapabilityManifestViaRuntime,
  addRelayViaRuntime,
  removeRelayViaRuntime,
  type CapabilityManifestContext,
} from "../src/node-service-manifest.js";
import type {
  CapabilityManifest,
  ManifestVisibility,
  PersistedNodeConfig,
  RelayConfig,
} from "@envoymesh/api";

function makeContext(
  overrides: Partial<CapabilityManifestContext> = {},
): CapabilityManifestContext {
  let config: PersistedNodeConfig | undefined = undefined;
  return {
    getProfileDir: () => "/profile",
    getCapabilityManifestStore: () => store.capStore as never,
    loadNodeConfig: async () => config as never,
    saveNodeConfig: async (cfg) => {
      config = cfg as never;
    },
    ...overrides,
  };
}

beforeEach(() => {
  store.reset();
});

afterEach(() => {
  vi.clearAllMocks();
});

function makeManifest(): CapabilityManifest {
  return {
    version: "0.1",
    capabilities: [],
    keywords: [],
    sensitivityCeiling: "public",
    visibility: "public" as ManifestVisibility,
    createdAt: "2026-06-30T00:00:00Z",
    updatedAt: "2026-06-30T00:00:00Z",
  };
}

function makeConfig(
  relays: RelayConfig[] = [],
): PersistedNodeConfig {
  return {
    version: "0.1",
    profileDir: "/profile",
    discoveryProfile: "lan-fast",
    relayEnabled: true,
    relayServerEnabled: false,
    advertiseAddrs: [],
    bootstrapPeers: [],
    bootstrapPresets: [],
    configuredRelays: relays,
    modelProviders: { mode: "disabled" },
    chatAssistEnabled: false,
    autonomousKillSwitch: false,
    autonomousPolicies: [],
    contactAiPreferences: [],
    updatedAt: "2026-06-30T00:00:00Z",
  };
}

describe("getCapabilityManifestViaRuntime", () => {
  it("returns undefined when the store is not initialised", async () => {
    const out = await getCapabilityManifestViaRuntime(
      makeContext({ getCapabilityManifestStore: () => undefined }),
    );
    expect(out).toBeUndefined();
  });

  it("returns the current manifest when the store has one", async () => {
    store.capStore.saveManifest({ ...makeManifest(), capabilities: ["x"] });
    const out = (await getCapabilityManifestViaRuntime(makeContext())) as CapabilityManifest;
    expect(out?.capabilities).toEqual(["x"]);
  });
});

describe("updateCapabilityManifestViaRuntime", () => {
  it("merges updates into the existing manifest", async () => {
    store.capStore.saveManifest(makeManifest());
    const out = await updateCapabilityManifestViaRuntime(makeContext(), {
      capabilities: ["wasm", "rust"],
      visibility: "friends",
    });
    expect(out.capabilities).toEqual(["wasm", "rust"]);
    expect(out.visibility).toBe("friends");
    expect(out.sensitivityCeiling).toBe("public");
    expect(out.updatedAt).not.toBe("2026-06-30T00:00:00Z");
  });

  it("falls back to createDefaultManifest when the store has no manifest", async () => {
    const out = await updateCapabilityManifestViaRuntime(makeContext(), {
      capabilities: ["x"],
    });
    expect(out.capabilities).toEqual(["x"]);
  });

  it("throws when the store is not available", async () => {
    await expect(
      updateCapabilityManifestViaRuntime(
        makeContext({ getCapabilityManifestStore: () => undefined }),
        { capabilities: ["x"] },
      ),
    ).rejects.toThrow(/not available/);
  });
});

describe("addRelayViaRuntime", () => {
  it("appends a relay and saves the merged config", async () => {
    const ctx = makeContext();
    const out: RelayConfig = await addRelayViaRuntime(
      ctx,
      "/ip4/1.2.3.4/tcp/4001/p2p/abc",
      2,
      "us-west",
    );
    expect(out.addr).toBe("/ip4/1.2.3.4/tcp/4001/p2p/abc");
    expect(out.level).toBe(2);
    expect(out.region).toBe("us-west");
    expect(out.enabled).toBe(true);
  });

  it("uses a default config when none is loaded", async () => {
    const ctx = makeContext();
    await addRelayViaRuntime(ctx, "/ip4/1.2.3.4/tcp/4001");
    const cfg = await ctx.loadNodeConfig();
    expect(cfg).toBeDefined();
  });
});

describe("removeRelayViaRuntime", () => {
  it("filters out the matching relay id", async () => {
    const ctx = makeContext();
    ctx.loadNodeConfig = async () =>
      makeConfig([
        { relayId: "relay_a", addr: "/addr/a", enabled: true },
        { relayId: "relay_b", addr: "/addr/b", enabled: true },
      ]) as never;
    let saved: PersistedNodeConfig | undefined;
    ctx.saveNodeConfig = async (cfg) => {
      saved = cfg as never;
    };
    await removeRelayViaRuntime(ctx, "relay_a");
    expect(saved?.configuredRelays).toHaveLength(1);
    expect(saved?.configuredRelays[0]?.relayId).toBe("relay_b");
  });

  it("no-ops when there is no current config", async () => {
    await removeRelayViaRuntime(makeContext(), "any-id"); // should not throw
  });
});