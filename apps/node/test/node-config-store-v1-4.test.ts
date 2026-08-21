/**
 * Phase 8 / v1.4 — tests for the new
 * `signalOptIn` + `verifyModeDefault` persisted
 * fields and the new sync `peek()` accessor
 * on `NodeConfigStore`.
 *
 * **What this covers:**
 * - **Round-trip** — the two new fields
 *   survive save → load (the Tauri UI's
 *   primary write path).
 * - **`peek()`** — the sync accessor returns
 *   the in-memory snapshot, updated by
 *   every `load()` + `save()`.
 * - **Backward compatibility** — a config
 *   file without the v1.4 fields still
 *   loads (the migration path doesn't strip
 *   unknown fields, and the helpers treat
 *   `undefined` as the v0 default).
 * - **Stub store** — `createStubNodeConfigStore`
 *   returns `undefined` from `peek()` (the
 *   consumers fall back to the v0 defaults).
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createNodeConfigStore,
  createStubNodeConfigStore,
  type PersistedNodeConfig,
} from "../src/node-config-store.js";

let profileDir: string;

const validBaseConfig: Omit<PersistedNodeConfig, "updatedAt"> = {
  version: "0.1",
  profileDir: "",
  discoveryProfile: "lan-fast",
  relayEnabled: true,
  relayServerEnabled: false,
  advertiseAddrs: [],
  bootstrapPeers: [],
  bootstrapPresets: [],
  configuredRelays: [],
  modelProviders: { mode: "disabled" },
  chatAssistEnabled: false,
  contactAiPreferences: [],
};

function makeConfig(
  overrides: Partial<PersistedNodeConfig> = {},
): PersistedNodeConfig {
  return {
    ...validBaseConfig,
    profileDir,
    ...overrides,
    updatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

describe("NodeConfigStore — Phase 8 v1.4 (signalOptIn + verifyModeDefault)", () => {
  beforeEach(async () => {
    profileDir = await mkdtemp(join(tmpdir(), "envoymesh-node-config-v1-4-"));
  });

  afterEach(async () => {
    await rm(profileDir, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // 1. Round-trip: signalOptIn
  // -------------------------------------------------------------------------

  describe("signalOptIn round-trip", () => {
    it("persists 'enabled' across save → load", async () => {
      const store = createNodeConfigStore(profileDir);
      await store.save(makeConfig({ signalOptIn: "enabled" }));
      const loaded = await store.load();
      expect(loaded?.signalOptIn).toBe("enabled");
    });

    it("persists 'disabled' across save → load", async () => {
      const store = createNodeConfigStore(profileDir);
      await store.save(makeConfig({ signalOptIn: "disabled" }));
      const loaded = await store.load();
      expect(loaded?.signalOptIn).toBe("disabled");
    });

    it("loads undefined when the field is absent (backward compat — pre-v1.4 file)", async () => {
      // The Tauri UI hasn't written the field
      // yet. The helper falls back to the env
      // var + implicit default.
      const store = createNodeConfigStore(profileDir);
      await store.save(makeConfig({ /* signalOptIn unset */ }));
      const loaded = await store.load();
      expect(loaded?.signalOptIn).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // 2. Round-trip: verifyModeDefault
  // -------------------------------------------------------------------------

  describe("verifyModeDefault round-trip", () => {
    it("persists 'rule-only' across save → load", async () => {
      const store = createNodeConfigStore(profileDir);
      await store.save(makeConfig({ verifyModeDefault: "rule-only" }));
      const loaded = await store.load();
      expect(loaded?.verifyModeDefault).toBe("rule-only");
    });

    it("persists 'cross-runtime' across save → load", async () => {
      const store = createNodeConfigStore(profileDir);
      await store.save(makeConfig({ verifyModeDefault: "cross-runtime" }));
      const loaded = await store.load();
      expect(loaded?.verifyModeDefault).toBe("cross-runtime");
    });

    it("persists 'cross-runtime-strict' across save → load", async () => {
      const store = createNodeConfigStore(profileDir);
      await store.save(
        makeConfig({ verifyModeDefault: "cross-runtime-strict" }),
      );
      const loaded = await store.load();
      expect(loaded?.verifyModeDefault).toBe("cross-runtime-strict");
    });

    it("loads undefined when the field is absent (backward compat — pre-v1.4 file)", async () => {
      const store = createNodeConfigStore(profileDir);
      await store.save(makeConfig({ /* verifyModeDefault unset */ }));
      const loaded = await store.load();
      expect(loaded?.verifyModeDefault).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // 3. Both fields together (the Tauri UI toggles both at once)
  // -------------------------------------------------------------------------

  it("round-trips both fields when set together", async () => {
    const store = createNodeConfigStore(profileDir);
    await store.save(
      makeConfig({
        signalOptIn: "disabled",
        verifyModeDefault: "cross-runtime-strict",
      }),
    );
    const loaded = await store.load();
    expect(loaded?.signalOptIn).toBe("disabled");
    expect(loaded?.verifyModeDefault).toBe("cross-runtime-strict");
  });

  // -------------------------------------------------------------------------
  // 4. Pre-v1.4 file (no v1.4 fields) loads cleanly
  // -------------------------------------------------------------------------

  it("loads a pre-v1.4 config file (no v1.4 fields) without dropping fields", async () => {
    // Simulate an existing node that hasn't
    // been touched by the Tauri UI. The
    // v1.4 fields are absent; everything
    // else (a few existing fields) must
    // survive the load.
    const legacy = {
      version: "0.1",
      profileDir,
      discoveryProfile: "wan-default",
      relayEnabled: true,
      relayServerEnabled: false,
      relayReservationEnabled: true,
      advertiseAddrs: ["/ip4/1.2.3.4/tcp/4001"],
      bootstrapPeers: ["/ip4/5.6.7.8/tcp/4001/p2p/QmTest"],
      bootstrapPresets: ["public-libp2p"],
      configuredRelays: [],
      modelProviders: { mode: "mock" },
      chatAssistEnabled: true,
      contactAiPreferences: [],
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    await writeFile(
      join(profileDir, "node-config.json"),
      JSON.stringify(legacy),
      "utf8",
    );

    const store = createNodeConfigStore(profileDir);
    const loaded = await store.load();

    // v1.4 fields: undefined (Q6 — no
    // migration; the consumers fall back to
    // the v0 defaults).
    expect(loaded?.signalOptIn).toBeUndefined();
    expect(loaded?.verifyModeDefault).toBeUndefined();

    // Existing fields survive.
    expect(loaded?.chatAssistEnabled).toBe(true);
    expect(loaded?.relayReservationEnabled).toBe(true);
    expect(loaded?.advertiseAddrs).toEqual([
      "/ip4/1.2.3.4/tcp/4001",
    ]);
    expect(loaded?.bootstrapPeers).toEqual([
      "/ip4/5.6.7.8/tcp/4001/p2p/QmTest",
    ]);
  });

  // -------------------------------------------------------------------------
  // 5. peek() — sync accessor for the in-memory snapshot
  // -------------------------------------------------------------------------

  describe("peek() — sync in-memory snapshot", () => {
    it("returns undefined when the store has never been loaded or saved", async () => {
      const store = createNodeConfigStore(profileDir);
      expect(store.peek()).toBeUndefined();
    });

    it("returns the loaded config after load()", async () => {
      await writeFile(
        join(profileDir, "node-config.json"),
        JSON.stringify(
          makeConfig({ signalOptIn: "disabled", verifyModeDefault: "rule-only" }),
        ),
        "utf8",
      );
      const store = createNodeConfigStore(profileDir);
      await store.load();
      const peeked = store.peek();
      expect(peeked?.signalOptIn).toBe("disabled");
      expect(peeked?.verifyModeDefault).toBe("rule-only");
    });

    it("returns the saved config after save() (no subsequent load)", async () => {
      const store = createNodeConfigStore(profileDir);
      await store.save(
        makeConfig({ signalOptIn: "enabled", verifyModeDefault: "cross-runtime" }),
      );
      const peeked = store.peek();
      expect(peeked?.signalOptIn).toBe("enabled");
      expect(peeked?.verifyModeDefault).toBe("cross-runtime");
    });

    it("reflects the latest write when save() is called multiple times", async () => {
      const store = createNodeConfigStore(profileDir);
      await store.save(makeConfig({ signalOptIn: "enabled" }));
      expect(store.peek()?.signalOptIn).toBe("enabled");
      await store.save(makeConfig({ signalOptIn: "disabled" }));
      expect(store.peek()?.signalOptIn).toBe("disabled");
    });

    it("stub store always returns undefined from peek()", () => {
      const stub = createStubNodeConfigStore();
      expect(stub.peek()).toBeUndefined();
    });
  });
});
