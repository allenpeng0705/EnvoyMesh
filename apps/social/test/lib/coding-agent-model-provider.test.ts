import { describe, expect, it } from "vitest";
import { snapCodingAgentToReady } from "../../src/lib/coding-agent-model-provider.js";

describe("snapCodingAgentToReady", () => {
  it("leaves the value alone while the ready list is empty", () => {
    const prev = {
      harness: "codex" as const,
      model: "m",
      providerKind: "" as const,
      endpoint: "",
      apiKey: "",
    };
    expect(snapCodingAgentToReady(prev, [])).toBe(prev);
  });

  it("keeps a ready agent", () => {
    const prev = {
      harness: "codex" as const,
      model: "m",
      providerKind: "" as const,
      endpoint: "",
      apiKey: "",
    };
    expect(snapCodingAgentToReady(prev, ["pi", "codex"]).harness).toBe("codex");
  });

  it("moves off a not-ready agent onto the first ready one", () => {
    const prev = {
      harness: "opencode" as const,
      model: "m",
      providerKind: "openai-compatible" as const,
      endpoint: "https://x",
      apiKey: "k",
    };
    // Model/provider are agent-specific — clear them when the harness changes.
    expect(snapCodingAgentToReady(prev, ["envoy-harness", "pi"])).toEqual({
      harness: "envoy-harness",
      model: "",
      providerKind: "",
      endpoint: "",
      apiKey: "",
    });
  });
});
