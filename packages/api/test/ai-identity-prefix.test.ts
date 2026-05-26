import { describe, expect, it } from "vitest";
import {
  applyAiIdentityPrefix,
  applyAiIdentityToDraftText,
  resolveEffectiveAiIdentityMode,
} from "../src/ai-identity-prefix.js";

describe("applyAiIdentityPrefix", () => {
  it("adds prefix in transparent mode", () => {
    expect(applyAiIdentityPrefix("Hello there", "transparent")).toBe("[AI Agent]: Hello there");
  });

  it("adds prefix in defensive mode", () => {
    expect(applyAiIdentityPrefix("I'll pass this along", "defensive", "[Assistant]")).toBe(
      "[Assistant]: I'll pass this along",
    );
  });

  it("does not prefix in invisible mode", () => {
    expect(applyAiIdentityPrefix("Yeah sure", "invisible")).toBe("Yeah sure");
  });

  it("does not double-prefix", () => {
    expect(applyAiIdentityPrefix("[AI Agent]: Already tagged", "transparent")).toBe(
      "[AI Agent]: Already tagged",
    );
    expect(applyAiIdentityPrefix("[AI Agent] Already tagged", "transparent")).toBe(
      "[AI Agent] Already tagged",
    );
  });

  it("respects rule identity override via applyAiIdentityToDraftText", () => {
    expect(
      applyAiIdentityToDraftText(
        "Hi",
        { mode: "transparent" },
        { action: { type: "draft", aiIdentityOverride: "invisible" } },
      ),
    ).toBe("Hi");
    expect(
      applyAiIdentityToDraftText(
        "Hi",
        { mode: "invisible" },
        { action: { type: "draft", aiIdentityOverride: "transparent" } },
      ),
    ).toBe("[AI Agent]: Hi");
  });
});

describe("resolveEffectiveAiIdentityMode", () => {
  it("prefers rule override over global identity", () => {
    expect(
      resolveEffectiveAiIdentityMode({ mode: "transparent" }, {
        action: { type: "draft", aiIdentityOverride: "defensive" },
      }),
    ).toBe("defensive");
  });
});
