/**
 * Phase 8 Step 2 / b2 — `createBridgeToEnvoyHarnessSkill` tests.
 *
 * **Acceptance (b2.3):**
 * 1. The skill translates an OpenClaw ask (text prompt)
 *    into a `SubagentInput` (objective = prompt,
 *    `capabilityTag` = "envoy-harness-bridge" by default,
 *    `costCeilingUsd: 0` (v0 no-cap), `deadlineMs: 5*60_000`).
 * 2. The skill calls `bridge.submitToEnvoyHarness` with
 *    the translated input + signal.
 * 3. The skill extracts the first text block from the
 *    `SubagentResult.content` (local shape — `{ type: "text" }`,
 *    not the wire shape `{ kind: "text" }`).
 * 4. Failed result (`verdict.kind === "fail"`) → throws
 *    `bridge_to_envoy_harness_failed: <reason>`.
 * 5. Empty result (no text block) → throws
 *    `bridge_to_envoy_harness_empty: no text in result`.
 * 6. Per-call `costCeilingUsd` + `deadlineMs` + `capabilityTag`
 *    overrides work correctly.
 * 7. Construction fails loud when the bridge doesn't
 *    implement `submitToEnvoyHarness` (it's optional on
 *    the `LocalRuntimeBridge` interface — the skill
 *    requires it).
 *
 * **Why a `LocalRuntimeBridge` mock:** the bridge is the
 * seam — the skill's only job is the translation.
 * Mocking the bridge lets us verify the translation
 * without a real envoy-harness runtime.
 */

import { describe, expect, it, vi } from "vitest";
import type { SubagentResult } from "@envoymesh/envoy-harness-adapter";
import type { LocalRuntimeBridge } from "@envoymesh/envoy-harness-adapter";

import {
  createBridgeToEnvoyHarnessSkill,
  type CreateBridgeToEnvoyHarnessSkillOptions,
} from "../src/agent-runtime-envoy/index.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/**
 * A scripted `LocalRuntimeBridge` mock that records
 * every `submitToEnvoyHarness` call and returns a
 * pre-configured `SubagentResult` (or throws). When
 * called with no args, returns a default "completed"
 * result.
 */
function makeBridgeMock(opts?: {
  result?: SubagentResult;
  error?: Error;
}): {
  bridge: LocalRuntimeBridge;
  calls: Array<{ input: unknown; signal: AbortSignal }>;
} {
  const calls: Array<{ input: unknown; signal: AbortSignal }> = [];
  const submitToEnvoyHarness = vi.fn(
    async (input: unknown, signal: AbortSignal): Promise<SubagentResult> => {
      calls.push({ input, signal });
      if (opts?.error) throw opts.error;
      return (
        opts?.result ?? {
          status: "completed",
          content: [
            { type: "text", text: "default-bridge-result" },
          ],
          workerPeerId: "stub-peer",
          workerRuntime: "envoy-harness",
          costUsd: 0,
          durationMs: 1,
          verdict: { kind: "pass", score: 0.5, confidence: "medium" },
          signature: "",
        }
      );
    },
  );
  const bridge: LocalRuntimeBridge = {
    submitToOpenClaw: vi.fn(),
    submitToEnvoyHarness,
  };
  return { bridge, calls };
}

/** A default options object for the skill. */
function makeOpts(overrides?: Partial<CreateBridgeToEnvoyHarnessSkillOptions>) {
  return {
    bridge: makeBridgeMock().bridge,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createBridgeToEnvoyHarnessSkill (Phase 8 Step 2 / b2)", () => {
  describe("translation (OpenClaw ask → SubagentInput)", () => {
    it("translates a text prompt into a SubagentInput with v0 defaults", async () => {
      // v0 defaults: costCeilingUsd=0 (no cap),
      // deadlineMs=5*60_000 (5 min), capabilityTag="envoy-harness-bridge".
      const { bridge, calls } = makeBridgeMock({
        result: {
          status: "completed",
          content: [{ type: "text", text: "ok" }],
          workerPeerId: "stub-peer",
          workerRuntime: "envoy-harness",
          costUsd: 0,
          durationMs: 1,
          verdict: { kind: "pass", score: 0.5, confidence: "medium" },
          signature: "",
        },
      });
      const skill = createBridgeToEnvoyHarnessSkill({ bridge });

      const result = await skill.ask("research the feasibility of X");

      // The bridge was called once with the right input.
      expect(calls).toHaveLength(1);
      const call = calls[0];
      expect(call?.input).toEqual({
        objective: "research the feasibility of X",
        capabilityTag: "envoy-harness-bridge",
        costCeilingUsd: 0,
        deadlineMs: 5 * 60 * 1000,
      });
      // The signal is a real AbortSignal (default when
      // not passed).
      expect(call?.signal).toBeInstanceOf(AbortSignal);
      // The text was returned.
      expect(result).toBe("ok");
    });

    it("honors per-call costCeilingUsd + deadlineMs + capabilityTag overrides", async () => {
      const { bridge, calls } = makeBridgeMock();
      const skill = createBridgeToEnvoyHarnessSkill({ bridge });

      await skill.ask("test", {
        costCeilingUsd: 1.5,
        deadlineMs: 10_000,
        capabilityTag: "custom-tag",
      });

      expect(calls[0]?.input).toEqual({
        objective: "test",
        capabilityTag: "custom-tag",
        costCeilingUsd: 1.5,
        deadlineMs: 10_000,
      });
    });

    it("honors defaultCostCeilingUsd / defaultDeadlineMs / defaultCapabilityTag in the constructor", async () => {
      const { bridge, calls } = makeBridgeMock();
      const skill = createBridgeToEnvoyHarnessSkill({
        bridge,
        defaultCostCeilingUsd: 0.75,
        defaultDeadlineMs: 30_000,
        defaultCapabilityTag: "custom-default",
      });

      await skill.ask("test");

      // The per-call overrides are undefined → defaults apply.
      expect(calls[0]?.input).toEqual({
        objective: "test",
        capabilityTag: "custom-default",
        costCeilingUsd: 0.75,
        deadlineMs: 30_000,
      });
    });
  });

  describe("result extraction (SubagentResult → text)", () => {
    it("extracts the first text block from a multi-block content array", async () => {
      const { bridge } = makeBridgeMock({
        result: {
          status: "completed",
          content: [
            { type: "text", text: "first" },
            { type: "text", text: "second (ignored — only first is returned)" },
          ],
          workerPeerId: "stub-peer",
          workerRuntime: "envoy-harness",
          costUsd: 0,
          durationMs: 1,
          verdict: { kind: "pass", score: 0.5, confidence: "medium" },
          signature: "",
        },
      });
      const skill = createBridgeToEnvoyHarnessSkill({ bridge });
      const result = await skill.ask("test");
      expect(result).toBe("first");
    });

    it("skips non-text blocks (tool_call, tool_result) and finds the text", async () => {
      // The local `ContentBlock` shape is
      // `{ type: "text" | "tool_call" | "tool_result" }`.
      // The skill must skip the non-text blocks.
      const { bridge } = makeBridgeMock({
        result: {
          status: "completed",
          content: [
            {
              type: "tool_call",
              id: "tc1",
              name: "read_file",
              args: { path: "/tmp/foo" },
            } as unknown as never, // tool_call is not a text block
            { type: "text", text: "the answer" },
          ],
          workerPeerId: "stub-peer",
          workerRuntime: "envoy-harness",
          costUsd: 0,
          durationMs: 1,
          verdict: { kind: "pass", score: 0.5, confidence: "medium" },
          signature: "",
        },
      });
      const skill = createBridgeToEnvoyHarnessSkill({ bridge });
      const result = await skill.ask("test");
      expect(result).toBe("the answer");
    });
  });

  describe("error handling", () => {
    it("throws bridge_to_envoy_harness_failed when the result status is 'failed'", async () => {
      const { bridge } = makeBridgeMock({
        result: {
          status: "failed",
          content: [
            { type: "text", text: "sub-agent failed" },
          ],
          workerPeerId: "stub-peer",
          workerRuntime: "envoy-harness",
          costUsd: 0,
          durationMs: 1,
          verdict: {
            kind: "fail",
            reason: "sub-agent aborted",
            rollback: false,
          },
          signature: "",
        },
      });
      const skill = createBridgeToEnvoyHarnessSkill({ bridge });
      await expect(skill.ask("test")).rejects.toThrow(
        /bridge_to_envoy_harness_failed: sub-agent aborted/,
      );
    });

    it("throws bridge_to_envoy_harness_empty when no text block in content", async () => {
      // The result is 'completed' but content has no text
      // block (e.g. only a tool_call). The skill surfaces
      // a clean error matching the openclaw / ext engine
      // behavior.
      const { bridge } = makeBridgeMock({
        result: {
          status: "completed",
          content: [
            {
              type: "tool_call",
              id: "tc1",
              name: "read_file",
              args: {},
            } as unknown as never,
          ],
          workerPeerId: "stub-peer",
          workerRuntime: "envoy-harness",
          costUsd: 0,
          durationMs: 1,
          verdict: { kind: "pass", score: 0.5, confidence: "medium" },
          signature: "",
        },
      });
      const skill = createBridgeToEnvoyHarnessSkill({ bridge });
      await expect(skill.ask("test")).rejects.toThrow(
        /bridge_to_envoy_harness_empty/,
      );
    });

    it("throws bridge_to_envoy_harness_empty when the text block is empty", async () => {
      const { bridge } = makeBridgeMock({
        result: {
          status: "completed",
          content: [{ type: "text", text: "" }],
          workerPeerId: "stub-peer",
          workerRuntime: "envoy-harness",
          costUsd: 0,
          durationMs: 1,
          verdict: { kind: "pass", score: 0.5, confidence: "medium" },
          signature: "",
        },
      });
      const skill = createBridgeToEnvoyHarnessSkill({ bridge });
      await expect(skill.ask("test")).rejects.toThrow(
        /bridge_to_envoy_harness_empty/,
      );
    });

    it("propagates the bridge's throw (e.g. when the underlying agent errors)", async () => {
      // The bridge's `submitToEnvoyHarness` can throw
      // for unhandled cases (e.g. the harness's
      // `LocalMeshSubmitter` only throws for
      // unhandled errors; most failures are mapped to
      // a `failed` SubagentResult). The skill
      // propagates the throw — the host (chain worker
      // or OpenClaw) handles it.
      const { bridge } = makeBridgeMock({
        error: new Error("unexpected bridge error"),
      });
      const skill = createBridgeToEnvoyHarnessSkill({ bridge });
      await expect(skill.ask("test")).rejects.toThrow(
        /unexpected bridge error/,
      );
    });
  });

  describe("abort signal", () => {
    it("forwards the parent's abort signal to the bridge", async () => {
      const { bridge, calls } = makeBridgeMock();
      const skill = createBridgeToEnvoyHarnessSkill({ bridge });
      const controller = new AbortController();
      await skill.ask("test", { signal: controller.signal });
      expect(calls[0]?.signal).toBe(controller.signal);
    });
  });

  describe("log events", () => {
    it("emits start + done log events on a successful ask", async () => {
      const events: Array<{ event: string; fields?: Record<string, unknown> }> = [];
      const { bridge } = makeBridgeMock({
        result: {
          status: "completed",
          content: [{ type: "text", text: "ok" }],
          workerPeerId: "stub-peer",
          workerRuntime: "envoy-harness",
          costUsd: 0,
          durationMs: 1,
          verdict: { kind: "pass", score: 0.5, confidence: "medium" },
          signature: "",
        },
      });
      const skill = createBridgeToEnvoyHarnessSkill({
        bridge,
        log: (event, fields) => {
          events.push({ event, ...(fields ? { fields } : {}) });
        },
      });
      await skill.ask("test");
      const eventNames = events.map((e) => e.event);
      expect(eventNames).toContain("envoy_harness.bridge.openclaw.start");
      expect(eventNames).toContain("envoy_harness.bridge.openclaw.done");
    });

    it("emits start + empty log events on an empty result", async () => {
      const events: string[] = [];
      const { bridge } = makeBridgeMock({
        result: {
          status: "completed",
          content: [],
          workerPeerId: "stub-peer",
          workerRuntime: "envoy-harness",
          costUsd: 0,
          durationMs: 1,
          verdict: { kind: "pass", score: 0.5, confidence: "medium" },
          signature: "",
        },
      });
      const skill = createBridgeToEnvoyHarnessSkill({
        bridge,
        log: (event) => {
          events.push(event);
        },
      });
      await expect(skill.ask("test")).rejects.toThrow();
      expect(events).toContain("envoy_harness.bridge.openclaw.start");
      expect(events).toContain("envoy_harness.bridge.openclaw.empty");
    });
  });

  describe("construction validation", () => {
    it("throws when the bridge doesn't implement submitToEnvoyHarness", () => {
      // The bridge is optional on `LocalRuntimeBridge`
      // (only the openclaw direction is required for v0
      // Step 2). The skill requires it; this test
      // verifies the construction-time check.
      const bridge: LocalRuntimeBridge = {
        submitToOpenClaw: vi.fn(),
        // submitToEnvoyHarness intentionally omitted.
      };
      expect(() => createBridgeToEnvoyHarnessSkill({ bridge })).toThrow(
        /bridge.submitToEnvoyHarness is not implemented/,
      );
    });
  });
});
