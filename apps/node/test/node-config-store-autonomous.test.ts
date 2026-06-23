/**
 * Phase 8L — Autonomous policy config store tests.
 *
 * Tests that autonomousKillSwitch and autonomousPolicies are correctly
 * serialized and deserialized by the node config store.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createNodeConfigStore } from "../src/node-config-store.js";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

let profileDir: string;

describe("node config store with autonomous fields", () => {
  beforeEach(async () => {
    profileDir = await mkdtemp(join(tmpdir(), "envoymesh-autonomous-config-"));
  });

  afterEach(async () => {
    await rm(profileDir, { recursive: true, force: true });
  });

  describe("autonomousKillSwitch", () => {
    it("defaults to undefined when not set", async () => {
      const store = createNodeConfigStore(profileDir);
      await store.save({
        version: "0.1",
        profileDir,
        discoveryProfile: "wan-default",
        relayEnabled: false,
        relayServerEnabled: false,
        advertiseAddrs: [],
        bootstrapPeers: [],
        bootstrapPresets: [],
        configuredRelays: [],
        modelProviders: { mode: "mock" },
        chatAssistEnabled: true,
        updatedAt: new Date().toISOString(),
      });

      const loaded = await store.load();
      expect(loaded?.autonomousKillSwitch).toBeUndefined();
    });

    it("saves and loads autonomousKillSwitch: true", async () => {
      const store = createNodeConfigStore(profileDir);
      await store.save({
        version: "0.1",
        profileDir,
        discoveryProfile: "wan-default",
        relayEnabled: false,
        relayServerEnabled: false,
        advertiseAddrs: [],
        bootstrapPeers: [],
        bootstrapPresets: [],
        configuredRelays: [],
        modelProviders: { mode: "mock" },
        chatAssistEnabled: true,
        updatedAt: new Date().toISOString(),
        autonomousKillSwitch: true,
      });

      const loaded = await store.load();
      expect(loaded?.autonomousKillSwitch).toBe(true);
    });

    it("saves and loads autonomousKillSwitch: false", async () => {
      const store = createNodeConfigStore(profileDir);
      await store.save({
        version: "0.1",
        profileDir,
        discoveryProfile: "wan-default",
        relayEnabled: false,
        relayServerEnabled: false,
        advertiseAddrs: [],
        bootstrapPeers: [],
        bootstrapPresets: [],
        configuredRelays: [],
        modelProviders: { mode: "mock" },
        chatAssistEnabled: true,
        updatedAt: new Date().toISOString(),
        autonomousKillSwitch: false,
      });

      const loaded = await store.load();
      expect(loaded?.autonomousKillSwitch).toBe(false);
    });

    it("exists() returns true after saving", async () => {
      const store = createNodeConfigStore(profileDir);
      await store.save({
        version: "0.1",
        profileDir,
        discoveryProfile: "wan-default",
        relayEnabled: false,
        relayServerEnabled: false,
        advertiseAddrs: [],
        bootstrapPeers: [],
        bootstrapPresets: [],
        configuredRelays: [],
        modelProviders: { mode: "mock" },
        chatAssistEnabled: true,
        updatedAt: new Date().toISOString(),
        autonomousKillSwitch: true,
      });

      const exists = await store.exists();
      expect(exists).toBe(true);
    });

    it("exists() returns false when config not saved", async () => {
      const store = createNodeConfigStore(profileDir);
      const exists = await store.exists();
      expect(exists).toBe(false);
    });
  });

  describe("autonomousPolicies", () => {
    it("defaults to undefined when not set and model is disabled", async () => {
      const store = createNodeConfigStore(profileDir);
      await store.save({
        version: "0.1",
        profileDir,
        discoveryProfile: "wan-default",
        relayEnabled: false,
        relayServerEnabled: false,
        advertiseAddrs: [],
        bootstrapPeers: [],
        bootstrapPresets: [],
        configuredRelays: [],
        modelProviders: { mode: "disabled" },
        chatAssistEnabled: true,
        updatedAt: new Date().toISOString(),
      });

      const loaded = await store.load();
      expect(loaded?.autonomousPolicies).toBeUndefined();
    });

    it("persists default social auto-send policy on load when model is configured", async () => {
      const store = createNodeConfigStore(profileDir);
      await store.save({
        version: "0.1",
        profileDir,
        discoveryProfile: "wan-default",
        relayEnabled: false,
        relayServerEnabled: false,
        advertiseAddrs: [],
        bootstrapPeers: [],
        bootstrapPresets: [],
        configuredRelays: [],
        modelProviders: { mode: "ollama" },
        chatAssistEnabled: true,
        updatedAt: new Date().toISOString(),
      });

      const loaded = await store.load();
      expect(loaded?.autonomousPolicies).toEqual([
        {
          domain: "social",
          maxSensitivity: "friends",
          autoAnswer: false,
          autoSendChat: true,
        },
      ]);

      const reloaded = await store.load();
      expect(reloaded?.autonomousPolicies).toEqual(loaded?.autonomousPolicies);
    });

    it("adds default social policy on first load when model is mock", async () => {
      const store = createNodeConfigStore(profileDir);
      await store.save({
        version: "0.1",
        profileDir,
        discoveryProfile: "wan-default",
        relayEnabled: false,
        relayServerEnabled: false,
        advertiseAddrs: [],
        bootstrapPeers: [],
        bootstrapPresets: [],
        configuredRelays: [],
        modelProviders: { mode: "mock" },
        chatAssistEnabled: true,
        updatedAt: new Date().toISOString(),
      });

      const loaded = await store.load();
      expect(loaded?.autonomousPolicies?.[0]).toMatchObject({
        domain: "social",
        autoSendChat: true,
      });
    });

    it("saves and loads empty autonomousPolicies array", async () => {
      const store = createNodeConfigStore(profileDir);
      await store.save({
        version: "0.1",
        profileDir,
        discoveryProfile: "wan-default",
        relayEnabled: false,
        relayServerEnabled: false,
        advertiseAddrs: [],
        bootstrapPeers: [],
        bootstrapPresets: [],
        configuredRelays: [],
        modelProviders: { mode: "disabled" },
        chatAssistEnabled: true,
        updatedAt: new Date().toISOString(),
        autonomousPolicies: [],
      });

      const loaded = await store.load();
      expect(loaded?.autonomousPolicies).toEqual([]);
    });

    it("saves and loads single autonomous policy", async () => {
      const store = createNodeConfigStore(profileDir);
      const policies = [
        {
          domain: "social" as const,
          maxSensitivity: "friends" as const,
          autoAnswer: true,
          autoSendChat: false,
        },
      ];

      await store.save({
        version: "0.1",
        profileDir,
        discoveryProfile: "wan-default",
        relayEnabled: false,
        relayServerEnabled: false,
        advertiseAddrs: [],
        bootstrapPeers: [],
        bootstrapPresets: [],
        configuredRelays: [],
        modelProviders: { mode: "mock" },
        chatAssistEnabled: true,
        updatedAt: new Date().toISOString(),
        autonomousPolicies: policies,
      });

      const loaded = await store.load();
      expect(loaded?.autonomousPolicies).toHaveLength(1);
      expect(loaded?.autonomousPolicies?.[0]).toEqual({
        domain: "social",
        maxSensitivity: "friends",
        autoAnswer: true,
        autoSendChat: false,
      });
    });

    it("saves and loads multiple autonomous policies", async () => {
      const store = createNodeConfigStore(profileDir);
      const policies = [
        {
          domain: "social" as const,
          maxSensitivity: "friends" as const,
          autoAnswer: true,
          autoSendChat: false,
        },
        {
          domain: "knowledge" as const,
          maxSensitivity: "public" as const,
          autoAnswer: true,
          autoSendChat: true,
        },
        {
          domain: "home" as const,
          maxSensitivity: "private" as const,
          autoAnswer: true,
          autoSendChat: true,
        },
        {
          domain: "research" as const,
          maxSensitivity: "friends" as const,
          autoAnswer: false,
          autoSendChat: false,
        },
      ];

      await store.save({
        version: "0.1",
        profileDir,
        discoveryProfile: "wan-default",
        relayEnabled: false,
        relayServerEnabled: false,
        advertiseAddrs: [],
        bootstrapPeers: [],
        bootstrapPresets: [],
        configuredRelays: [],
        modelProviders: { mode: "mock" },
        chatAssistEnabled: true,
        updatedAt: new Date().toISOString(),
        autonomousPolicies: policies,
      });

      const loaded = await store.load();
      expect(loaded?.autonomousPolicies).toHaveLength(4);
      expect(loaded?.autonomousPolicies?.[0].domain).toBe("social");
      expect(loaded?.autonomousPolicies?.[1].domain).toBe("knowledge");
      expect(loaded?.autonomousPolicies?.[2].domain).toBe("home");
      expect(loaded?.autonomousPolicies?.[3].domain).toBe("research");
    });

    it("preserves other config fields when saving autonomous policies", async () => {
      const store = createNodeConfigStore(profileDir);

      await store.save({
        version: "0.1",
        profileDir,
        discoveryProfile: "lan-fast",
        relayEnabled: true,
        relayServerEnabled: true,
        advertiseAddrs: ["/ip4/1.2.3.4/tcp/4001"],
        bootstrapPeers: ["/ip4/5.6.7.8/tcp/4001/p2p/QmPeer"],
        bootstrapPresets: ["public-libp2p"],
        configuredRelays: [{ relayId: "r1", addr: "/ip4/1.2.3.4/tcp/4001", enabled: true }],
        modelProviders: { mode: "ollama", modelName: "llama3.1", endpoint: "http://127.0.0.1:11434" },
        chatAssistEnabled: true,
        updatedAt: new Date().toISOString(),
        autonomousPolicies: [
          { domain: "social", maxSensitivity: "public", autoAnswer: true, autoSendChat: false },
        ],
        autonomousKillSwitch: false,
      });

      const loaded = await store.load();
      expect(loaded?.discoveryProfile).toBe("lan-fast");
      expect(loaded?.relayEnabled).toBe(true);
      expect(loaded?.bootstrapPresets).toEqual(["public-libp2p"]);
      expect(loaded?.modelProviders).toEqual({ mode: "ollama", modelName: "llama3.1", endpoint: "http://127.0.0.1:11434" });
      expect(loaded?.autonomousPolicies).toHaveLength(1);
      expect(loaded?.autonomousKillSwitch).toBe(false);
    });
  });

  describe("all autonomous-related fields together", () => {
    it("saves and loads kill switch + policies simultaneously", async () => {
      const store = createNodeConfigStore(profileDir);
      const fullConfig = {
        version: "0.1" as const,
        profileDir,
        discoveryProfile: "wan-default" as const,
        relayEnabled: false,
        relayServerEnabled: false,
        advertiseAddrs: [] as string[],
        bootstrapPeers: [] as string[],
        bootstrapPresets: [] as string[],
        configuredRelays: [] as any[],
        modelProviders: { mode: "mock" as const },
        chatAssistEnabled: true,
        updatedAt: new Date().toISOString(),
        autonomousKillSwitch: true,
        autonomousPolicies: [
          { domain: "social" as const, maxSensitivity: "friends" as const, autoAnswer: true, autoSendChat: true },
          { domain: "knowledge" as const, maxSensitivity: "public" as const, autoAnswer: false, autoSendChat: false },
        ],
        anonymousDiscoveryMode: "off" as const,
        anonymousIntentAllowlist: ["discovery.request"] as readonly string[],
        anonymousSensitivityCeiling: "public" as const,
        trustAnchorPublicKeys: { "envoy:anchor:test": "pem-value" },
      };

      await store.save(fullConfig);

      const loaded = await store.load();
      expect(loaded?.autonomousKillSwitch).toBe(true);
      expect(loaded?.autonomousPolicies).toHaveLength(2);
      expect(loaded?.autonomousPolicies?.[0].domain).toBe("social");
      expect(loaded?.autonomousPolicies?.[1].domain).toBe("knowledge");
      expect(loaded?.anonymousDiscoveryMode).toBe("off");
      expect(loaded?.trustAnchorPublicKeys).toEqual({ "envoy:anchor:test": "pem-value" });
    });
  });

  describe("updatedAt is set on save", () => {
    it("sets updatedAt when saving", async () => {
      const store = createNodeConfigStore(profileDir);
      const before = new Date().toISOString();

      await store.save({
        version: "0.1",
        profileDir,
        discoveryProfile: "wan-default",
        relayEnabled: false,
        relayServerEnabled: false,
        advertiseAddrs: [],
        bootstrapPeers: [],
        bootstrapPresets: [],
        configuredRelays: [],
        modelProviders: { mode: "mock" },
        chatAssistEnabled: true,
        updatedAt: before,
      });

      const loaded = await store.load();
      expect(loaded?.updatedAt).toBeDefined();
      expect(new Date(loaded?.updatedAt!).getTime()).toBeGreaterThanOrEqual(new Date(before).getTime() - 1000);
    });
  });
});
