/**
 * Phase 8 / v1.4 — tests for the node-config
 * resolution helpers (`node-config-loader.ts`).
 *
 * **What this covers:**
 * - `readEffectiveSignalOptIn` — the
 *   persisted-wins-over-env-var resolution
 *   (Q2 of the v1.4 sub-plan).
 * - `readEffectiveVerifyModeDefault` — the
 *   per-node override + per-runtime fallback
 *   (Q3 of the v1.4 sub-plan).
 * - `defaultVerifyModeForWorker` re-export —
 *   sanity check the re-export works (the
 *   per-runtime default lives in
 *   `chain-verify-loop.ts`; the loader just
 *   re-exports it).
 *
 * **Why these tests are pure (no I/O, no
 * mocks):** the helpers are pure functions of
 * `(nodeConfig, runtime)` + the env var. The
 * env var is the only "side effect", and we
 * snapshot / restore it in `beforeEach` /
 * `afterEach` like `user-prompt-router.test.ts`
 * does for `readSignalOptInEnv`.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { AgentRuntime, VerifyMode } from "@envoymesh/protocol";
import type { PersistedNodeConfig } from "../src/node-config-store.js";
import {
  defaultVerifyModeForWorker,
  readEffectiveSignalOptIn,
  readEffectiveVerifyModeDefault,
} from "../src/node-config-loader.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SIGNAL_OPT_IN_ENV_VAR = "ENVOY_HARNESS_SIGNAL_OPT_IN";

// ---------------------------------------------------------------------------
// 1. readEffectiveSignalOptIn
// ---------------------------------------------------------------------------

describe("readEffectiveSignalOptIn", () => {
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

  /**
   * **Q2 — persisted wins, env var as
   * fallback (Tauri UI overrides the env
   * var when set).** When the persisted
   * config is `undefined` (no config loaded
   * yet), the helper falls back to the env
   * var. This is the v0 behavior, preserved.
   */
  describe("env var fallback (persisted undefined)", () => {
    it("returns 'enabled' when env var is unset and persisted is undefined", () => {
      expect(readEffectiveSignalOptIn(undefined)).toBe("enabled");
    });

    it("returns 'disabled' when env var is 'disabled' and persisted is undefined", () => {
      process.env[SIGNAL_OPT_IN_ENV_VAR] = "disabled";
      expect(readEffectiveSignalOptIn(undefined)).toBe("disabled");
    });

    it("returns 'enabled' when env var is 'enabled' explicitly and persisted is undefined", () => {
      process.env[SIGNAL_OPT_IN_ENV_VAR] = "enabled";
      expect(readEffectiveSignalOptIn(undefined)).toBe("enabled");
    });
  });

  /**
   * **Q2 — persisted wins.** When the
   * persisted config has the field set, it
   * overrides the env var. The Tauri UI sets
   * the field explicitly when the owner
   * toggles the switch.
   */
  describe("persisted wins over env var", () => {
    it("returns 'enabled' when persisted is 'enabled' even if env var says 'disabled'", () => {
      process.env[SIGNAL_OPT_IN_ENV_VAR] = "disabled";
      const persisted: PersistedNodeConfig = {
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
        updatedAt: new Date().toISOString(),
        signalOptIn: "enabled",
      };
      expect(readEffectiveSignalOptIn(persisted)).toBe("enabled");
    });

    it("returns 'disabled' when persisted is 'disabled' even if env var says 'enabled'", () => {
      process.env[SIGNAL_OPT_IN_ENV_VAR] = "enabled";
      const persisted: PersistedNodeConfig = {
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
        updatedAt: new Date().toISOString(),
        signalOptIn: "disabled",
      };
      expect(readEffectiveSignalOptIn(persisted)).toBe("disabled");
    });

    it("returns 'enabled' (env var default) when persisted is set but field is undefined", () => {
      // The persisted config exists (the file
      // was loaded) but the field is unset
      // (older node / before v1.4). The
      // helper falls back to the env var.
      process.env[SIGNAL_OPT_IN_ENV_VAR] = "disabled";
      const persisted: PersistedNodeConfig = {
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
        updatedAt: new Date().toISOString(),
        // signalOptIn undefined
      };
      expect(readEffectiveSignalOptIn(persisted)).toBe("disabled");
    });
  });
});

// ---------------------------------------------------------------------------
// 2. readEffectiveVerifyModeDefault
// ---------------------------------------------------------------------------

describe("readEffectiveVerifyModeDefault", () => {
  /**
   * **Q3 — single value, all runtimes.**
   * When the persisted field is unset, the
   * helper falls back to the per-runtime
   * default (`defaultVerifyModeForWorker`).
   * The per-mandate override is handled
   * by `runChainVerificationLoop`, not by
   * this helper.
   */
  describe("per-runtime default fallback (persisted undefined)", () => {
    it("returns cross-runtime for envoy-harness when persisted is undefined", () => {
      expect(
        readEffectiveVerifyModeDefault(undefined, "envoy-harness"),
      ).toBe("cross-runtime");
    });

    it("returns rule-only for openclaw when persisted is undefined", () => {
      expect(
        readEffectiveVerifyModeDefault(undefined, "openclaw"),
      ).toBe("rule-only");
    });

    it("returns rule-only for ext when persisted is undefined", () => {
      expect(
        readEffectiveVerifyModeDefault(undefined, "ext"),
      ).toBe("rule-only");
    });

    it("returns rule-only for pi when persisted is undefined", () => {
      expect(
        readEffectiveVerifyModeDefault(undefined, "pi"),
      ).toBe("rule-only");
    });

    it("returns rule-only for openhuman when persisted is undefined", () => {
      expect(
        readEffectiveVerifyModeDefault(undefined, "openhuman" as AgentRuntime),
      ).toBe("rule-only");
    });
  });

  /**
   * **Q3 — persisted wins.** When the
   * persisted field is set, it overrides
   * the per-runtime default. The Tauri UI
   * sets the field to apply a node-wide
   * posture.
   */
  describe("persisted wins over per-runtime default", () => {
    const cases: Array<{
      field: VerifyMode;
      runtime: AgentRuntime;
      expected: VerifyMode;
    }> = [
      // Tighter posture (envoy-harness default
      // is cross-runtime, owner wants stricter):
      { field: "cross-runtime-strict", runtime: "envoy-harness", expected: "cross-runtime-strict" },
      // Looser posture (envoy-harness default
      // is cross-runtime, owner wants cheaper
      // rule-only):
      { field: "rule-only", runtime: "envoy-harness", expected: "rule-only" },
      // Override for non-envoy-harness runtime
      // (openclaw default is rule-only, owner
      // wants cross-runtime):
      { field: "cross-runtime", runtime: "openclaw", expected: "cross-runtime" },
      { field: "cross-runtime-strict", runtime: "openclaw", expected: "cross-runtime-strict" },
      // ext / pi
      { field: "cross-runtime", runtime: "ext", expected: "cross-runtime" },
      { field: "rule-only", runtime: "pi", expected: "rule-only" },
    ];

    for (const { field, runtime, expected } of cases) {
      it(`returns ${expected} when persisted.${field} and runtime=${runtime}`, () => {
        const persisted: PersistedNodeConfig = {
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
          updatedAt: new Date().toISOString(),
          verifyModeDefault: field,
        };
        expect(readEffectiveVerifyModeDefault(persisted, runtime)).toBe(expected);
      });
    }
  });

  /**
   * **Backward compatibility (Q6).** The
   * field is additive. An existing node
   * without the field set keeps the v0
   * behavior (per-runtime default).
   */
  it("returns the per-runtime default when persisted is set but verifyModeDefault is undefined", () => {
    const persisted: PersistedNodeConfig = {
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
      updatedAt: new Date().toISOString(),
      // verifyModeDefault undefined
    };
    // Even though persisted is provided, the
    // field is unset, so the helper falls
    // back to the per-runtime default.
    expect(
      readEffectiveVerifyModeDefault(persisted, "envoy-harness"),
    ).toBe("cross-runtime");
    expect(
      readEffectiveVerifyModeDefault(persisted, "openclaw"),
    ).toBe("rule-only");
  });
});

// ---------------------------------------------------------------------------
// 3. defaultVerifyModeForWorker — re-export sanity check
// ---------------------------------------------------------------------------

/**
 * The function lives in `chain-verify-loop.ts`
 * and is re-exported from `node-config-loader.ts`
 * so the settings API can call it without
 * pulling in the heavier chain-verify-loop
 * module. This block checks the re-export
 * works + the behavior matches
 * `chain-verify-loop.test.ts` (the canonical
 * location for the function's tests).
 */
describe("defaultVerifyModeForWorker re-export", () => {
  it("matches the per-runtime defaults", () => {
    expect(defaultVerifyModeForWorker("envoy-harness")).toBe("cross-runtime");
    expect(defaultVerifyModeForWorker("openclaw")).toBe("rule-only");
    expect(defaultVerifyModeForWorker("ext")).toBe("rule-only");
  });

  it("falls back to rule-only for unknown runtimes (matches the v0 policy)", () => {
    // The v0 policy: only envoy-harness gets
    // cross-runtime by default. Everything
    // else gets rule-only. Future runtimes
    // follow the same default until a Q4
    // follow-up changes it.
    expect(
      defaultVerifyModeForWorker("pi" as AgentRuntime),
    ).toBe("rule-only");
    expect(
      defaultVerifyModeForWorker("openhuman" as AgentRuntime),
    ).toBe("rule-only");
  });
});
