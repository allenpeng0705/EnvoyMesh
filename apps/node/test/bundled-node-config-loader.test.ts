/**
 * Tests for the bundled node-config loader — the file shipped with the
 * Tauri desktop bundle that gives fresh installs a working mesh on first
 * launch (CN relay + standard bootstrap presets + wan-default profile).
 *
 * Mirrors `bundled-sponsor-friend.test.ts` structure. Tests use unique
 * tmpdirs to avoid colliding with the repo-root `node-config.json` that
 * the staging script copies into the bundle.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  _bundledNodeConfigCandidatesForTests,
  loadBundledNodeConfig,
} from "../src/bundled-node-config-loader.js";

const validBundledConfig = {
  version: "0.1",
  profileDir: "./data/default",
  discoveryProfile: "wan-default",
  enableMdns: false,
  relayEnabled: true,
  relayServerEnabled: false,
  advertiseAddrs: [],
  bootstrapPeers: [
    "/ip4/47.93.11.212/tcp/4001/p2p/12D3KooWLNR4WYWHBswe8ux5zWsy6cuGywnYPJbdbaAbbpmJMjbo",
  ],
  bootstrapPresets: ["public-libp2p", "public-libp2p-am6", "public-libp2p-am7", "cn-relay"],
  configuredRelays: [
    {
      addr: "/ip4/47.93.11.212/tcp/4001/p2p/12D3KooWLNR4WYWHBswe8ux5zWsy6cuGywnYPJbdbaAbbpmJMjbo",
      enabled: true,
    },
  ],
  modelProviders: { mode: "disabled" },
  chatAssistEnabled: false,
  contactAiPreferences: [],
  updatedAt: "2026-07-11T00:00:00.000Z",
};

describe("loadBundledNodeConfig", () => {
  let dir: string;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "envoymesh-bundled-config-"));
    delete process.env.ENVOYMESH_BUNDLED_NODE_CONFIG_PATH;
    delete process.env.ENVOYMESH_BUNDLED_NODE_CONFIG_JSON;
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    process.env = { ...originalEnv };
  });

  it("returns the parsed config from a bundled file when the path arg is provided", async () => {
    const cfgPath = join(dir, "node-config.json");
    writeFileSync(cfgPath, JSON.stringify(validBundledConfig), "utf8");

    const cfg = await loadBundledNodeConfig(dir);
    expect(cfg).not.toBeNull();
    expect(cfg?.discoveryProfile).toBe("wan-default");
    expect(cfg?.bootstrapPresets).toEqual([
      "public-libp2p",
      "public-libp2p-am6",
      "public-libp2p-am7",
      "cn-relay",
    ]);
    expect(cfg?.configuredRelays).toHaveLength(1);
    expect(cfg?.configuredRelays[0]?.enabled).toBe(true);
  });

  it("returns null when the bundle dir has no file and no env var is set", async () => {
    const cfg = await loadBundledNodeConfig(dir);
    expect(cfg).toBeNull();
  });

  it("falls through to env-var JSON when the bundle dir has no file", async () => {
    process.env.ENVOYMESH_BUNDLED_NODE_CONFIG_JSON = JSON.stringify(validBundledConfig);
    const cfg = await loadBundledNodeConfig("/nonexistent/dir");
    expect(cfg).not.toBeNull();
    expect(cfg?.discoveryProfile).toBe("wan-default");
  });

  it("falls through to env-var PATH when the bundle dir has no file", async () => {
    const cfgPath = join(dir, "node-config.json");
    writeFileSync(cfgPath, JSON.stringify(validBundledConfig), "utf8");
    process.env.ENVOYMESH_BUNDLED_NODE_CONFIG_PATH = cfgPath;

    const cfg = await loadBundledNodeConfig("/nonexistent/dir");
    expect(cfg).not.toBeNull();
    expect(cfg?.discoveryProfile).toBe("wan-default");
  });

  it("env-var JSON takes priority over bundleDir", async () => {
    // env var has the GOOD config
    process.env.ENVOYMESH_BUNDLED_NODE_CONFIG_JSON = JSON.stringify({
      ...validBundledConfig,
      discoveryProfile: "lan-fast",
    });
    // bundleDir has a different one
    writeFileSync(
      join(dir, "node-config.json"),
      JSON.stringify(validBundledConfig),
      "utf8",
    );

    const cfg = await loadBundledNodeConfig(dir);
    expect(cfg?.discoveryProfile).toBe("lan-fast");
  });

  it("returns null when the bundled file is unreadable JSON", async () => {
    writeFileSync(join(dir, "node-config.json"), "{ not valid json", "utf8");
    const cfg = await loadBundledNodeConfig(dir);
    expect(cfg).toBeNull();
  });

  it("returns null when the bundled file has an invalid schema (wrong version)", async () => {
    writeFileSync(
      join(dir, "node-config.json"),
      JSON.stringify({ ...validBundledConfig, version: "0.2" }),
      "utf8",
    );
    const cfg = await loadBundledNodeConfig(dir);
    expect(cfg).toBeNull();
  });

  it("returns null when the bundled file has invalid discoveryProfile", async () => {
    writeFileSync(
      join(dir, "node-config.json"),
      JSON.stringify({ ...validBundledConfig, discoveryProfile: "not-a-real-profile" }),
      "utf8",
    );
    const cfg = await loadBundledNodeConfig(dir);
    expect(cfg).toBeNull();
  });

  it("returns null when env-var PATH points to a non-existent file", async () => {
    process.env.ENVOYMESH_BUNDLED_NODE_CONFIG_PATH = join(
      dir,
      "does-not-exist.json"
    );
    const cfg = await loadBundledNodeConfig(dir);
    expect(cfg).toBeNull();
  });

  it("returns null when env-var JSON is malformed", async () => {
    process.env.ENVOYMESH_BUNDLED_NODE_CONFIG_JSON = "{ broken";
    const cfg = await loadBundledNodeConfig(dir);
    expect(cfg).toBeNull();
  });

  it("candidate paths include the bundle dir + filename", () => {
    const candidates = _bundledNodeConfigCandidatesForTests("/some/bundle/dir");
    expect(candidates).toEqual([join("/some/bundle/dir", "node-config.json")]);
  });
});
