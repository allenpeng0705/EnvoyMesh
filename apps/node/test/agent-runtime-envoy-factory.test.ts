/**
 * Phase 8 Step 1 — factory unit test.
 *
 * **Acceptance:** the design doc's Step 1 §5.1 says
 *   "1 unit test that factory() returns a valid AgentAdapter stub"
 *
 * This test is the canary. It proves:
 *   1. The factory returns a non-null object.
 *   2. The returned object satisfies the `AgentAdapter` interface —
 *      `runtime === "envoy-harness"`, `describeSkills()` returns the
 *      bridge's catalog, the four methods exist.
 *   3. `execute()` throws the documented Step 1 stub error
 *      (Step 2 wires the model adapter + BuildAgentFn).
 *
 * If the cross-monorepo dep breaks (Step 0 regression), the import
 * line fails and this test fails to load. The test is a regression
 * guard for the whole "Step 0 unblocked Step 1" chain.
 */

import { describe, expect, it } from "vitest";

import {
  createEnvoyHarnessAdapter,
  loadEnvoyHarnessRuntimeConfig,
  resolveEnvoyHarnessProvider,
} from "../src/agent-runtime-envoy/index.js";
import { ENVOY_HARNESS_RUNTIME_SKILLS } from "../src/agent-runtime-envoy/manifest.js";

describe("agent-runtime-envoy (Phase 8 Step 1)", () => {
  describe("resolveEnvoyHarnessProvider", () => {
    it("maps provider:model strings to known provider IDs", () => {
      expect(resolveEnvoyHarnessProvider("deepseek:deepseek-chat")).toBe("deepseek");
      expect(resolveEnvoyHarnessProvider("openai:gpt-4o")).toBe("openai");
      expect(resolveEnvoyHarnessProvider("anthropic:claude-3-5-sonnet")).toBe(
        "anthropic",
      );
      expect(resolveEnvoyHarnessProvider("claude:claude-3-5-sonnet")).toBe(
        "anthropic",
      );
      expect(resolveEnvoyHarnessProvider("stub:fixture")).toBe("stub");
    });

    it("defaults to deepseek for unknown providers (matches openclaw default)", () => {
      expect(resolveEnvoyHarnessProvider("mystery:model")).toBe("deepseek");
      expect(resolveEnvoyHarnessProvider("")).toBe("deepseek");
    });
  });

  describe("loadEnvoyHarnessRuntimeConfig", () => {
    it("returns a not-ready stub in Step 1", () => {
      const cfg = loadEnvoyHarnessRuntimeConfig();
      expect(cfg.ready).toBe(false);
      expect(cfg.reason).toBe("envoy_harness_stub_phase_8_step_1");
      // Default model is deepseek (matches envoy-harness QUICKSTART.md).
      expect(cfg.model).toBe("deepseek:deepseek-chat");
      // cwd is process.cwd() when ENVOY_HARNESS_CWD is unset.
      expect(cfg.cwd).toBe(process.cwd());
    });
  });

  describe("createEnvoyHarnessAdapter (factory smoke)", () => {
    const cfg = loadEnvoyHarnessRuntimeConfig();

    it("returns a valid AgentAdapter with runtime === 'envoy-harness'", () => {
      const adapter = createEnvoyHarnessAdapter({
        workerPeerId: "12D3KooWTest",
        config: cfg,
      });
      expect(adapter).toBeDefined();
      expect(adapter.runtime).toBe("envoy-harness");
    });

    it("describes the bridge's skill catalog (no duplication)", () => {
      const adapter = createEnvoyHarnessAdapter({
        workerPeerId: "12D3KooWTest",
        config: cfg,
      });
      const skills = adapter.describeSkills();
      expect(Array.isArray(skills)).toBe(true);
      expect(skills.length).toBeGreaterThan(0);
      // The runtime manifest + the adapter's describeSkills must be
      // value-equal: the bridge is the source of truth, the runtime
      // manifest is a re-export, and the adapter's describeSkills
      // returns the same catalog. Use deep equality because the
      // adapter may return a fresh array reference per call.
      expect(skills).toEqual(ENVOY_HARNESS_RUNTIME_SKILLS);
    });

    it("exposes buildManifest / execute / verify (the 3-contract AgentAdapter)", () => {
      const adapter = createEnvoyHarnessAdapter({
        workerPeerId: "12D3KooWTest",
        config: cfg,
      });
      expect(typeof adapter.buildManifest).toBe("function");
      expect(typeof adapter.execute).toBe("function");
      expect(typeof adapter.verify).toBe("function");
    });

    it("execute() throws the Step 1 stub error (Step 2 wires the model)", async () => {
      const adapter = createEnvoyHarnessAdapter({
        workerPeerId: "12D3KooWTest",
        config: cfg,
      });
      // The buildAgent closure inside the factory throws when called
      // by the adapter's execute() path. The Step 1 contract is that
      // the throw carries the documented stub code, so the orchestrator
      // can render a clean "envoy-harness is not yet wired" error
      // instead of a generic "adapter execute failed" message.
      await expect(
        adapter.execute({
          skillId: "research",
          objective: "test",
          inputArtifacts: [],
          costCeilingUsd: 1,
          deadlineMs: 1000,
          correlationId: "test-corr",
          signal: new AbortController().signal,
        }),
      ).rejects.toThrow(/envoy_harness_stub_phase_8_step_1/);
    });
  });
});
