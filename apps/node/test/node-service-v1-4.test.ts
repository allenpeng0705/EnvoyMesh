/**
 * Phase 8 / v1.4 — tests for the Tauri
 * settings API on `NodeServiceImpl`:
 *
 * - `getSignalOptIn` / `setSignalOptIn`
 * - `getVerifyModeDefault` / `setVerifyModeDefault`
 *
 * **What this covers:**
 * - **Read path:** the new methods return
 *   the same effective value the runtime
 *   uses (persisted config + env var for
 *   signalOptIn; persisted config +
 *   per-runtime default for
 *   verifyModeDefault).
 * - **Write path:** the new methods
 *   persist the value to the config
 *   store; subsequent reads return the
 *   new value.
 * - **Clear semantics (verifyMode):**
 *   `setVerifyModeDefault(undefined)`
 *   removes the persisted key (the
 *   helper falls back to the per-runtime
 *   default).
 *
 * **Test shape:** hermetic — uses a fake
 * `NodeConfigStore` that captures
 * `load()` / `save()` calls. No real
 * disk I/O, no mesh, no LLM. Mirrors the
 * pattern in `rendezvous-integration.test.ts`
 * (the closest existing test for
 * `NodeServiceImpl` config methods).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NodeServiceImpl } from "../src/node-service-impl.js";
import type { NodeConfigStore, PersistedNodeConfig } from "../src/node-config-store.js";

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

/**
 * In-memory `NodeConfigStore` that records
 * the last `save()` for assertions. The
 * `peek()` reads from the in-memory
 * snapshot (mirrors the real
 * `createNodeConfigStore` behavior).
 */
function createFakeConfigStore(
  initial?: PersistedNodeConfig,
): NodeConfigStore & {
  saves: PersistedNodeConfig[];
  loads: number;
} {
  let snapshot: PersistedNodeConfig | undefined = initial;
  const saves: PersistedNodeConfig[] = [];
  let loads = 0;
  return {
    saves,
    get loads() {
      return loads;
    },
    async load() {
      loads += 1;
      return snapshot;
    },
    async save(config: PersistedNodeConfig) {
      snapshot = { ...config };
      saves.push(config);
    },
    async exists() {
      return snapshot !== undefined;
    },
    peek(): PersistedNodeConfig | undefined {
      return snapshot;
    },
  };
}

function setConfigStore(nodeService: any, configStore: NodeConfigStore): void {
  Object.defineProperty(nodeService, "_configStore", {
    value: configStore,
    writable: true,
    configurable: true,
  });
}

const validBaseConfig: PersistedNodeConfig = {
  version: "0.1",
  profileDir: "/tmp/test",
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
  updatedAt: "2026-08-21T00:00:00.000Z",
};

const SIGNAL_OPT_IN_ENV_VAR = "ENVOY_HARNESS_SIGNAL_OPT_IN";

// ---------------------------------------------------------------------------
// 1. getSignalOptIn
// ---------------------------------------------------------------------------

describe("NodeServiceImpl.getSignalOptIn (Phase 8 v1.4)", () => {
  const original = process.env[SIGNAL_OPT_IN_ENV_VAR];

  beforeEach(() => {
    delete process.env[SIGNAL_OPT_IN_ENV_VAR];
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env[SIGNAL_OPT_IN_ENV_VAR];
    } else {
      process.env[SIGNAL_OPT_IN_ENV_VAR] = original;
    }
  });

  it("returns 'enabled' when the persisted field is unset and env var is unset", async () => {
    const nodeService = new NodeServiceImpl(
      undefined,
      undefined,
      undefined,
      undefined,
      "/tmp/test",
    );
    setConfigStore(nodeService, createFakeConfigStore({ ...validBaseConfig }));

    expect(await nodeService.getSignalOptIn()).toBe("enabled");
  });

  it("returns the persisted 'disabled' even when env var says 'enabled'", async () => {
    process.env[SIGNAL_OPT_IN_ENV_VAR] = "enabled";
    const nodeService = new NodeServiceImpl(
      undefined,
      undefined,
      undefined,
      undefined,
      "/tmp/test",
    );
    setConfigStore(
      nodeService,
      createFakeConfigStore({ ...validBaseConfig, signalOptIn: "disabled" }),
    );

    expect(await nodeService.getSignalOptIn()).toBe("disabled");
  });

  it("returns the env var when the persisted field is unset", async () => {
    process.env[SIGNAL_OPT_IN_ENV_VAR] = "disabled";
    const nodeService = new NodeServiceImpl(
      undefined,
      undefined,
      undefined,
      undefined,
      "/tmp/test",
    );
    setConfigStore(nodeService, createFakeConfigStore({ ...validBaseConfig }));

    expect(await nodeService.getSignalOptIn()).toBe("disabled");
  });
});

// ---------------------------------------------------------------------------
// 2. setSignalOptIn
// ---------------------------------------------------------------------------

describe("NodeServiceImpl.setSignalOptIn (Phase 8 v1.4)", () => {
  const original = process.env[SIGNAL_OPT_IN_ENV_VAR];

  beforeEach(() => {
    delete process.env[SIGNAL_OPT_IN_ENV_VAR];
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env[SIGNAL_OPT_IN_ENV_VAR];
    } else {
      process.env[SIGNAL_OPT_IN_ENV_VAR] = original;
    }
  });

  it("persists 'disabled' and returns the new effective state", async () => {
    const store = createFakeConfigStore({ ...validBaseConfig });
    const nodeService = new NodeServiceImpl(
      undefined,
      undefined,
      undefined,
      undefined,
      "/tmp/test",
    );
    setConfigStore(nodeService, store);

    const result = await nodeService.setSignalOptIn("disabled");
    expect(result).toBe("disabled");
    // The save was recorded.
    expect(store.saves).toHaveLength(1);
    expect(store.saves[0]?.signalOptIn).toBe("disabled");
    // The in-memory snapshot reflects the new value.
    expect(store.peek()?.signalOptIn).toBe("disabled");
  });

  it("persists 'enabled' and returns the new effective state", async () => {
    const store = createFakeConfigStore({
      ...validBaseConfig,
      signalOptIn: "disabled",
    });
    const nodeService = new NodeServiceImpl(
      undefined,
      undefined,
      undefined,
      undefined,
      "/tmp/test",
    );
    setConfigStore(nodeService, store);

    const result = await nodeService.setSignalOptIn("enabled");
    expect(result).toBe("enabled");
    expect(store.peek()?.signalOptIn).toBe("enabled");
  });

  it("a subsequent getSignalOptIn returns the persisted value", async () => {
    const store = createFakeConfigStore({ ...validBaseConfig });
    const nodeService = new NodeServiceImpl(
      undefined,
      undefined,
      undefined,
      undefined,
      "/tmp/test",
    );
    setConfigStore(nodeService, store);

    await nodeService.setSignalOptIn("disabled");
    expect(await nodeService.getSignalOptIn()).toBe("disabled");

    await nodeService.setSignalOptIn("enabled");
    expect(await nodeService.getSignalOptIn()).toBe("enabled");
  });
});

// ---------------------------------------------------------------------------
// 3. getVerifyModeDefault
// ---------------------------------------------------------------------------

describe("NodeServiceImpl.getVerifyModeDefault (Phase 8 v1.4)", () => {
  it("returns the per-runtime default when the persisted field is unset", async () => {
    const nodeService = new NodeServiceImpl(
      undefined,
      undefined,
      undefined,
      undefined,
      "/tmp/test",
    );
    setConfigStore(nodeService, createFakeConfigStore({ ...validBaseConfig }));

    expect(await nodeService.getVerifyModeDefault("envoy-harness")).toBe(
      "cross-runtime",
    );
    expect(await nodeService.getVerifyModeDefault("openclaw")).toBe("rule-only");
    expect(await nodeService.getVerifyModeDefault("ext")).toBe("rule-only");
  });

  it("returns the persisted value when set (overrides the per-runtime default)", async () => {
    const nodeService = new NodeServiceImpl(
      undefined,
      undefined,
      undefined,
      undefined,
      "/tmp/test",
    );
    setConfigStore(
      nodeService,
      createFakeConfigStore({
        ...validBaseConfig,
        verifyModeDefault: "cross-runtime-strict",
      }),
    );

    // The persisted value applies to all
    // runtimes (Q3 — single value, not a
    // per-runtime map).
    expect(await nodeService.getVerifyModeDefault("envoy-harness")).toBe(
      "cross-runtime-strict",
    );
    expect(await nodeService.getVerifyModeDefault("openclaw")).toBe(
      "cross-runtime-strict",
    );
    expect(await nodeService.getVerifyModeDefault("ext")).toBe(
      "cross-runtime-strict",
    );
  });
});

// ---------------------------------------------------------------------------
// 4. setVerifyModeDefault
// ---------------------------------------------------------------------------

describe("NodeServiceImpl.setVerifyModeDefault (Phase 8 v1.4)", () => {
  it("persists a value and returns the same value", async () => {
    const store = createFakeConfigStore({ ...validBaseConfig });
    const nodeService = new NodeServiceImpl(
      undefined,
      undefined,
      undefined,
      undefined,
      "/tmp/test",
    );
    setConfigStore(nodeService, store);

    const result = await nodeService.setVerifyModeDefault("rule-only");
    expect(result).toBe("rule-only");
    expect(store.saves).toHaveLength(1);
    expect(store.saves[0]?.verifyModeDefault).toBe("rule-only");
    expect(store.peek()?.verifyModeDefault).toBe("rule-only");
  });

  it("a subsequent getVerifyModeDefault returns the persisted value", async () => {
    const store = createFakeConfigStore({ ...validBaseConfig });
    const nodeService = new NodeServiceImpl(
      undefined,
      undefined,
      undefined,
      undefined,
      "/tmp/test",
    );
    setConfigStore(nodeService, store);

    await nodeService.setVerifyModeDefault("cross-runtime-strict");
    expect(await nodeService.getVerifyModeDefault("envoy-harness")).toBe(
      "cross-runtime-strict",
    );
    expect(await nodeService.getVerifyModeDefault("openclaw")).toBe(
      "cross-runtime-strict",
    );
  });

  it("setVerifyModeDefault(undefined) removes the field (clear path)", async () => {
    const store = createFakeConfigStore({
      ...validBaseConfig,
      verifyModeDefault: "rule-only",
    });
    const nodeService = new NodeServiceImpl(
      undefined,
      undefined,
      undefined,
      undefined,
      "/tmp/test",
    );
    setConfigStore(nodeService, store);

    const result = await nodeService.setVerifyModeDefault(undefined);
    // Returns undefined to signal the
    // override is cleared (the loop will
    // fall back to the per-runtime default).
    expect(result).toBeUndefined();
    // The in-memory snapshot has the field
    // removed (the spread + JSON omits the
    // key). `readEffectiveVerifyModeDefault`
    // treats `undefined` as "fall back".
    expect(store.peek()?.verifyModeDefault).toBeUndefined();
  });

  it("clear path: a subsequent getVerifyModeDefault returns the per-runtime default", async () => {
    const store = createFakeConfigStore({
      ...validBaseConfig,
      verifyModeDefault: "rule-only",
    });
    const nodeService = new NodeServiceImpl(
      undefined,
      undefined,
      undefined,
      undefined,
      "/tmp/test",
    );
    setConfigStore(nodeService, store);

    await nodeService.setVerifyModeDefault(undefined);
    // Per-runtime default restored: envoy-harness → cross-runtime.
    expect(await nodeService.getVerifyModeDefault("envoy-harness")).toBe(
      "cross-runtime",
    );
    expect(await nodeService.getVerifyModeDefault("openclaw")).toBe("rule-only");
  });

  it("setVerifyModeDefault is a no-op when the field is already undefined", async () => {
    const store = createFakeConfigStore({ ...validBaseConfig });
    const nodeService = new NodeServiceImpl(
      undefined,
      undefined,
      undefined,
      undefined,
      "/tmp/test",
    );
    setConfigStore(nodeService, store);

    // No save happens because the field is
    // already at the default; but the
    // method still returns undefined.
    const result = await nodeService.setVerifyModeDefault(undefined);
    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 5. Auth + audit: setSignalOptIn / setVerifyModeDefault hit updateNodeConfig
// ---------------------------------------------------------------------------

describe("NodeServiceImpl signalOptIn/verifyModeDefault — auth (Phase 8 v1.4)", () => {
  it("setSignalOptIn delegates to updateNodeConfig (same auth path)", async () => {
    // We spy on `updateNodeConfig` to
    // confirm the new methods go through
    // the canonical write path (which
    // enforces `requireOwnerProfile`).
    const store = createFakeConfigStore({ ...validBaseConfig });
    const nodeService = new NodeServiceImpl(
      undefined,
      undefined,
      undefined,
      undefined,
      "/tmp/test",
    );
    setConfigStore(nodeService, store);
    const updateSpy = vi.spyOn(nodeService, "updateNodeConfig");

    await nodeService.setSignalOptIn("disabled");
    expect(updateSpy).toHaveBeenCalledWith({ signalOptIn: "disabled" });
  });

  it("setVerifyModeDefault delegates to updateNodeConfig (same auth path)", async () => {
    const store = createFakeConfigStore({ ...validBaseConfig });
    const nodeService = new NodeServiceImpl(
      undefined,
      undefined,
      undefined,
      undefined,
      "/tmp/test",
    );
    setConfigStore(nodeService, store);
    const updateSpy = vi.spyOn(nodeService, "updateNodeConfig");

    await nodeService.setVerifyModeDefault("cross-runtime");
    expect(updateSpy).toHaveBeenCalledWith({
      verifyModeDefault: "cross-runtime",
    });

    await nodeService.setVerifyModeDefault(undefined);
    expect(updateSpy).toHaveBeenCalledWith({ verifyModeDefault: undefined });
  });
});
