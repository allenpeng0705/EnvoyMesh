/**
 * Tests for the runOwnerAgentTurn runtime.
 */
import { describe, expect, it, vi } from "vitest";

import {
  runOwnerAgentTurnViaRuntime,
  type RunOwnerAgentTurnContext,
} from "../src/node-service-handlers-run-owner-agent-turn.js";

function makeCtx(
  overrides: Partial<RunOwnerAgentTurnContext> = {},
): { ctx: RunOwnerAgentTurnContext; spies: Record<string, ReturnType<typeof vi.fn>> } {
  const spies: Record<string, ReturnType<typeof vi.fn>> = {
    recordOwnerActivity: vi.fn(),
    ensureOpenClawReady: vi.fn(async () => false),
    beginOpenClawToolTracking: vi.fn(),
    endOpenClawToolTracking: vi.fn(() => []),
    buildOpenClawTurnContext: vi.fn(async () => ({})),
    askOpenClaw: vi.fn(async () => "answer"),
    // Phase 8 / Step 5 — defaults for the
    // signal-router integration. Tests that
    // don't care about routing get
    // `signalOptIn: "disabled"` (router picks
    // OpenClaw regardless) + `isEnvoyHarnessReady:
    // () => false` (EH dispatch branch is
    // unreachable). Tests that DO exercise
    // routing override these in the
    // `overrides` arg.
    isEnvoyHarnessReady: vi.fn(() => false),
    askEnvoyHarness: vi.fn(async () => {
      throw new Error("askEnvoyHarness should not be called when isEnvoyHarnessReady is false");
    }),
    signalOptIn: "disabled",
    persistEnvoyAiChatExchange: vi.fn(async () => undefined),
    recordEnvoyAiHumanOutgoing: vi.fn(async () => undefined),
    maybeIngestTerminalAssistantReply: vi.fn(),
    getRagService: vi.fn(() => ({})),
    getTaskStore: vi.fn(() => ({})),
    runDocumentAgentTurnCore: vi.fn(async () => ({})),
    getApprovalQueue: vi.fn(() => ({})),
  };
  const ctx: RunOwnerAgentTurnContext = {
    ...spies,
    ...overrides,
  } as never;
  return { ctx, spies };
}

describe("runOwnerAgentTurnViaRuntime", () => {
  it("happy path: uses OpenClaw and returns a knowledge turn", async () => {
    const { ctx, spies } = makeCtx({
      ensureOpenClawReady: async () => true,
      endOpenClawToolTracking: () => ["tool1", "tool2"],
    });
    const out = (await runOwnerAgentTurnViaRuntime(
      ctx,
      "what is the capital of France?",
    )) as Record<string, unknown>;
    expect(out.answer).toBe("answer");
    expect(out.modelUsed).toBe("openclaw");
    expect(out.toolsUsed).toEqual(["tool1", "tool2"]);
    expect(spies.recordOwnerActivity).toHaveBeenCalledTimes(1);
    expect(spies.recordEnvoyAiHumanOutgoing).toHaveBeenCalledTimes(1);
    expect(spies.persistEnvoyAiChatExchange).toHaveBeenCalledTimes(1);
  });

  it("falls back to native planner when OpenClaw unavailable", async () => {
    const nativeCore = vi.fn(async () => ({
      answer: "native answer",
      domain: "document",
    }));
    const { ctx, spies } = makeCtx({
      ensureOpenClawReady: async () => false,
    });
    // Replace the ctx's runDocumentAgentTurnCore with our own vi.fn so
    // we can assert on it via spies (we use the spy in the ctx to keep
    // everything in the same closure).
    spies.runDocumentAgentTurnCore.mockImplementation(nativeCore.getMockImplementation()!);
    const out = (await runOwnerAgentTurnViaRuntime(ctx, "hi")) as Record<string, unknown>;
    expect(spies.askOpenClaw).not.toHaveBeenCalled();
    expect(spies.runDocumentAgentTurnCore).toHaveBeenCalled();
    expect(out.answer).toBe("native answer");
    expect(out.modelUsed).toBe("native");
    expect(spies.persistEnvoyAiChatExchange).toHaveBeenCalledTimes(1);
  });

  it("falls back to native planner when OpenClaw throws", async () => {
    const nativeCore = vi.fn(async () => ({ answer: "fallback" }));
    const { ctx, spies } = makeCtx({
      ensureOpenClawReady: async () => true,
      askOpenClaw: vi.fn(async () => {
        throw new Error("openclaw down");
      }),
    });
    spies.runDocumentAgentTurnCore.mockImplementation(nativeCore.getMockImplementation()!);
    const out = (await runOwnerAgentTurnViaRuntime(ctx, "hi")) as Record<string, unknown>;
    expect(out.answer).toBe("fallback");
    expect(out.modelUsed).toBe("native");
    expect(spies.persistEnvoyAiChatExchange).toHaveBeenCalledTimes(1);
    expect(spies.beginOpenClawToolTracking).toHaveBeenCalledTimes(1);
    expect(spies.endOpenClawToolTracking).toHaveBeenCalledTimes(1);
  });

  it("throws if no RAG service or task store when falling back", async () => {
    const { ctx } = makeCtx({
      ensureOpenClawReady: async () => false,
      getRagService: () => null,
      getTaskStore: () => undefined,
    });
    await expect(runOwnerAgentTurnViaRuntime(ctx, "x")).rejects.toThrow(
      /RAG service/,
    );
  });
});