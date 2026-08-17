/**
 * Regression tests for the Apple-review package overlay in the node config
 * store.
 *
 * The Apple review build (`APPLE_REVIEW=1`) stages a family-only review
 * `node-config.json` into the Tauri node bundle. Previously the bundled
 * config was only read when the profile dir had NO `node-config.json`, so
 * any machine that had run EnvoyMesh before (stale profile config without
 * review fields) silently ignored the review build — every QR (including
 * the EnvoyGo pairing QR) then bound the scanner as the OWNER instead of a
 * family member.
 *
 * Fix: `load()`/`save()` now overlay the review-pairing fields from the
 * bundled config whenever the bundled file has `reviewPairingEnabled: true`,
 * so the Apple review build is family-only regardless of profile state.
 * Normal builds are unaffected (their bundled config has no review fields).
 */
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createNodeConfigStore,
  type PersistedNodeConfig,
} from "../src/node-config-store.js";

let profileDir: string;
let bundleDir: string;
const originalEnv = { ...process.env };

const validBase = {
  version: "0.1",
  discoveryProfile: "wan-default",
  enableMdns: true,
  relayEnabled: true,
  relayServerEnabled: false,
  advertiseAddrs: [],
  bootstrapPeers: [
    "/ip4/47.93.11.212/tcp/4001/p2p/12D3KooWLNR4WYWHBswe8ux5zWsy6cuGywnYPJbdbaAbbpmJMjbo",
  ],
  bootstrapPresets: ["public-libp2p", "cn-relay"],
  configuredRelays: [],
  modelProviders: { mode: "disabled" },
  chatAssistEnabled: false,
  contactAiPreferences: [],
  updatedAt: "2026-07-11T00:00:00.000Z",
};

const reviewBundled = {
  ...validBase,
  profileDir: "./data/default",
  reviewPairingEnabled: true,
  reviewPairingToken: "apple-review-secret",
  reviewPairingFamilyOnly: true,
  reviewPairingTtlDays: 30,
};

beforeEach(async () => {
  profileDir = await mkdtemp(join(tmpdir(), "envoymesh-review-overlay-"));
  bundleDir = await mkdtemp(join(tmpdir(), "envoymesh-review-bundle-"));
  delete process.env.ENVOYMESH_NODE_BUNDLE_DIR;
  delete process.env.ENVOYMESH_BUNDLED_NODE_CONFIG_PATH;
  delete process.env.ENVOYMESH_BUNDLED_NODE_CONFIG_JSON;
});

afterEach(async () => {
  await rm(profileDir, { recursive: true, force: true });
  await rm(bundleDir, { recursive: true, force: true });
  process.env = { ...originalEnv };
});

describe("node-config-store review overlay (Apple review package)", () => {
  it("overlays family-only review fields onto a stale profile-dir config", async () => {
    // Profile dir already has a config from an earlier normal run — no review
    // fields. This is the exact regression that made review QRs bind as owner.
    await writeFile(
      join(profileDir, "node-config.json"),
      JSON.stringify({ ...validBase, profileDir }),
      "utf8",
    );
    // Bundled review config (APPLE_REVIEW=1 build).
    await writeFile(
      join(bundleDir, "node-config.json"),
      JSON.stringify(reviewBundled),
      "utf8",
    );
    process.env.ENVOYMESH_NODE_BUNDLE_DIR = bundleDir;

    const store = createNodeConfigStore(profileDir);
    const loaded = await store.load();
    expect(loaded?.reviewPairingEnabled).toBe(true);
    expect(loaded?.reviewPairingToken).toBe("apple-review-secret");
    expect(loaded?.reviewPairingFamilyOnly).toBe(true);
    expect(loaded?.reviewPairingTtlDays).toBe(30);
  });

  it("fresh profile loads the bundled review config", async () => {
    await writeFile(
      join(bundleDir, "node-config.json"),
      JSON.stringify(reviewBundled),
      "utf8",
    );
    process.env.ENVOYMESH_NODE_BUNDLE_DIR = bundleDir;

    const store = createNodeConfigStore(profileDir);
    const loaded = await store.load();
    expect(loaded?.reviewPairingEnabled).toBe(true);
    expect(loaded?.reviewPairingFamilyOnly).toBe(true);
  });

  it("does not clobber review fields when the bundled config has none (normal build)", async () => {
    await writeFile(
      join(bundleDir, "node-config.json"),
      JSON.stringify(validBase),
      "utf8",
    );
    // Operator manually enabled review pairing via config on a normal build.
    await writeFile(
      join(profileDir, "node-config.json"),
      JSON.stringify({
        ...validBase,
        profileDir,
        reviewPairingEnabled: true,
        reviewPairingToken: "manual-secret",
        reviewPairingFamilyOnly: false,
      }),
      "utf8",
    );
    process.env.ENVOYMESH_NODE_BUNDLE_DIR = bundleDir;

    const store = createNodeConfigStore(profileDir);
    const loaded = await store.load();
    expect(loaded?.reviewPairingEnabled).toBe(true);
    expect(loaded?.reviewPairingToken).toBe("manual-secret");
    expect(loaded?.reviewPairingFamilyOnly).toBe(false);
  });

  it("save() persists bundled review fields when the bundled config has them", async () => {
    await writeFile(
      join(bundleDir, "node-config.json"),
      JSON.stringify(reviewBundled),
      "utf8",
    );
    process.env.ENVOYMESH_NODE_BUNDLE_DIR = bundleDir;

    const store = createNodeConfigStore(profileDir);
    // First-run setup writes a config that does not carry review fields.
    await store.save({ ...validBase, profileDir } as PersistedNodeConfig);
    const raw = await readFile(join(profileDir, "node-config.json"), "utf8");
    expect(raw).toContain('"reviewPairingEnabled": true');
    expect(raw).toContain('"reviewPairingFamilyOnly": true');
    expect(raw).toContain("apple-review-secret");
  });

  it("save() does not add review fields on a normal build", async () => {
    await writeFile(
      join(bundleDir, "node-config.json"),
      JSON.stringify(validBase),
      "utf8",
    );
    process.env.ENVOYMESH_NODE_BUNDLE_DIR = bundleDir;

    const store = createNodeConfigStore(profileDir);
    await store.save({ ...validBase, profileDir } as PersistedNodeConfig);
    const raw = await readFile(join(profileDir, "node-config.json"), "utf8");
    expect(raw).not.toContain("reviewPairingEnabled");
    expect(raw).not.toContain("apple-review-secret");
  });
});
