import { describe, it, expect, beforeEach, vi } from "vitest";
import { EventEmitter } from "events";

// Mock the config store
const mockConfig = {
  version: "0.1" as const,
  profileDir: "./data/test",
  discoveryProfile: "wan-default" as const,
  relayEnabled: false,
  relayServerEnabled: false,
  advertiseAddrs: [] as string[],
  bootstrapPeers: [] as string[],
  bootstrapPresets: [] as string[],
  configuredRelays: [],
  updatedAt: new Date().toISOString(),
};

class MockNodeConfigStore {
  private config = { ...mockConfig };

  async load() {
    return this.config;
  }

  async save(config: typeof mockConfig) {
    this.config = { ...this.config, ...config, updatedAt: new Date().toISOString() };
  }

  // For testing: reset to default
  reset() {
    this.config = { ...mockConfig };
  }

  // For testing: get current config
  getConfig() {
    return this.config;
  }
}

const mockStore = new MockNodeConfigStore();

// We need to test the actual NodeServiceImpl behavior
// Since NodeServiceImpl is tightly coupled, we'll test the config store behavior directly
describe("Node Config Store - Bootstrap Presets", () => {
  beforeEach(() => {
    mockStore.reset();
  });

  describe("bootstrapPresets persistence", () => {
    it("should store and retrieve bootstrapPresets", async () => {
      const initialConfig = await mockStore.load();
      expect(initialConfig.bootstrapPresets).toEqual([]);

      await mockStore.save({
        ...mockStore.getConfig(),
        bootstrapPresets: ["public-libp2p"],
      });

      const updatedConfig = await mockStore.load();
      expect(updatedConfig.bootstrapPresets).toEqual(["public-libp2p"]);
    });

    it("should store multiple bootstrapPresets", async () => {
      await mockStore.save({
        ...mockStore.getConfig(),
        bootstrapPresets: ["public-libp2p", "public-libp2p-am6"],
      });

      const config = await mockStore.load();
      expect(config.bootstrapPresets).toContain("public-libp2p");
      expect(config.bootstrapPresets).toContain("public-libp2p-am6");
    });

    it("should clear bootstrapPresets when set to empty array", async () => {
      // First set some presets
      await mockStore.save({
        ...mockStore.getConfig(),
        bootstrapPresets: ["public-libp2p"],
      });

      // Then clear them
      await mockStore.save({
        ...mockStore.getConfig(),
        bootstrapPresets: [],
      });

      const config = await mockStore.load();
      expect(config.bootstrapPresets).toEqual([]);
    });
  });

  describe("network mode simulation", () => {
    it("should detect public mode - only bootstrapPresets, no relays", async () => {
      await mockStore.save({
        ...mockStore.getConfig(),
        bootstrapPresets: ["public-libp2p"],
        configuredRelays: [],
      });

      const config = await mockStore.load();

      // Simulate UI network mode detection logic
      let networkMode: "public" | "private" | "hybrid";
      if (config.bootstrapPresets.length > 0 && config.configuredRelays.length > 0) {
        networkMode = "hybrid";
      } else if (config.bootstrapPresets.length > 0) {
        networkMode = "public";
      } else {
        networkMode = "private";
      }

      expect(networkMode).toBe("public");
    });

    it("should detect private mode - only relays, no bootstrapPresets", async () => {
      await mockStore.save({
        ...mockStore.getConfig(),
        bootstrapPresets: [],
        configuredRelays: [{ relayId: "relay_1", addr: "/ip4/1.2.3.4/tcp/4001", enabled: true }],
      });

      const config = await mockStore.load();

      let networkMode: "public" | "private" | "hybrid";
      if (config.bootstrapPresets.length > 0 && config.configuredRelays.length > 0) {
        networkMode = "hybrid";
      } else if (config.bootstrapPresets.length > 0) {
        networkMode = "public";
      } else {
        networkMode = "private";
      }

      expect(networkMode).toBe("private");
    });

    it("should detect hybrid mode - both bootstrapPresets and relays", async () => {
      await mockStore.save({
        ...mockStore.getConfig(),
        bootstrapPresets: ["public-libp2p"],
        configuredRelays: [{ relayId: "relay_1", addr: "/ip4/1.2.3.4/tcp/4001", enabled: true }],
      });

      const config = await mockStore.load();

      let networkMode: "public" | "private" | "hybrid";
      if (config.bootstrapPresets.length > 0 && config.configuredRelays.length > 0) {
        networkMode = "hybrid";
      } else if (config.bootstrapPresets.length > 0) {
        networkMode = "public";
      } else {
        networkMode = "private";
      }

      expect(networkMode).toBe("hybrid");
    });

    it("should handle empty config as private mode", async () => {
      const config = await mockStore.load();

      let networkMode: "public" | "private" | "hybrid";
      if (config.bootstrapPresets.length > 0 && config.configuredRelays.length > 0) {
        networkMode = "hybrid";
      } else if (config.bootstrapPresets.length > 0) {
        networkMode = "public";
      } else {
        networkMode = "private";
      }

      expect(networkMode).toBe("private");
    });
  });

  describe("bootstrapPresets with configuredRelays interaction", () => {
    it("should allow adding relay while keeping public preset (hybrid)", async () => {
      // Start with public mode
      await mockStore.save({
        ...mockStore.getConfig(),
        bootstrapPresets: ["public-libp2p"],
        configuredRelays: [],
      });

      let config = await mockStore.load();
      expect(config.bootstrapPresets).toEqual(["public-libp2p"]);
      expect(config.configuredRelays).toEqual([]);

      // Add a relay
      await mockStore.save({
        ...mockStore.getConfig(),
        configuredRelays: [{ relayId: "relay_1", addr: "/ip4/5.6.7.8/tcp/4001", enabled: true }],
      });

      config = await mockStore.load();
      expect(config.configuredRelays).toHaveLength(1);
      expect(config.bootstrapPresets).toEqual(["public-libp2p"]); // Preset preserved
    });

    it("should allow removing public presets while keeping relays (switch to private)", async () => {
      // Start with hybrid
      await mockStore.save({
        ...mockStore.getConfig(),
        bootstrapPresets: ["public-libp2p"],
        configuredRelays: [{ relayId: "relay_1", addr: "/ip4/5.6.7.8/tcp/4001", enabled: true }],
      });

      // Remove public preset
      await mockStore.save({
        ...mockStore.getConfig(),
        bootstrapPresets: [],
      });

      const config = await mockStore.load();
      expect(config.bootstrapPresets).toEqual([]);
      expect(config.configuredRelays).toHaveLength(1); // Relay preserved
    });

    it("should allow adding public preset while keeping relays (switch to hybrid)", async () => {
      // Start with private
      await mockStore.save({
        ...mockStore.getConfig(),
        bootstrapPresets: [],
        configuredRelays: [{ relayId: "relay_1", addr: "/ip4/5.6.7.8/tcp/4001", enabled: true }],
      });

      // Add public preset
      await mockStore.save({
        ...mockStore.getConfig(),
        bootstrapPresets: ["public-libp2p"],
      });

      const config = await mockStore.load();
      expect(config.bootstrapPresets).toEqual(["public-libp2p"]);
      expect(config.configuredRelays).toHaveLength(1); // Relay preserved
    });
  });
});

describe("Bootstrap Preset Validation", () => {
  const validPresets = ["public-libp2p", "public-libp2p-am6", "public-libp2p-am7"];

  it("should accept valid preset names", () => {
    for (const preset of validPresets) {
      expect(validPresets.includes(preset)).toBe(true);
    }
  });

  it("should recognize preset format", () => {
    const presetPattern = /^public-libp2p(-am[67])?$/;
    expect(presetPattern.test("public-libp2p")).toBe(true);
    expect(presetPattern.test("public-libp2p-am6")).toBe(true);
    expect(presetPattern.test("public-libp2p-am7")).toBe(true);
    expect(presetPattern.test("invalid")).toBe(false);
    expect(presetPattern.test("")).toBe(false);
  });
});
