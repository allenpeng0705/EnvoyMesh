import { describe, expect, it } from "vitest";
import {
  applyAiIdentityPrefix,
  applyAiIdentityToDraftText,
  chatMessageTextForDisplay,
  resolveEffectiveAiIdentityMode,
  stripAiIdentityPrefixMarkers,
} from "../src/ai-identity-prefix.js";

describe("applyAiIdentityPrefix", () => {
  it("does not embed prefix by default (transparent mode)", () => {
    expect(applyAiIdentityPrefix("Hello there", "transparent")).toBe("Hello there");
  });

  it("embeds prefix when debugPrefixInText is true", () => {
    expect(
      applyAiIdentityPrefix("Hello there", "transparent", undefined, { debugPrefixInText: true }),
    ).toBe("[AI Agent]: Hello there");
    expect(
      applyAiIdentityPrefix("I'll pass this along", "defensive", "[Assistant]", {
        debugPrefixInText: true,
      }),
    ).toBe("[Assistant]: I'll pass this along");
  });

  it("does not prefix in invisible mode", () => {
    expect(applyAiIdentityPrefix("Yeah sure", "invisible")).toBe("Yeah sure");
  });

  it("strips model echoes without embedding when debug is off", () => {
    expect(applyAiIdentityPrefix("[AI Agent]: Already tagged", "transparent")).toBe("Already tagged");
    expect(applyAiIdentityPrefix("[AI Agent] Already tagged", "transparent")).toBe("Already tagged");
    expect(applyAiIdentityPrefix("[AI Agent]: \n\n[AI Agent] 嗨！", "transparent")).toBe("嗨！");
  });

  it("strips then embeds once when debug is on", () => {
    expect(
      applyAiIdentityPrefix("[AI Agent]: \n\n[AI Agent] 嗨！", "transparent", undefined, {
        debugPrefixInText: true,
      }),
    ).toBe("[AI Agent]: 嗨！");
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
    ).toBe("Hi");
    expect(
      applyAiIdentityToDraftText(
        "Hi",
        { mode: "transparent", debugPrefixInMessageText: true },
        { action: { type: "draft", aiIdentityOverride: "transparent" } },
      ),
    ).toBe("[AI Agent]: Hi");
  });
});

describe("chatMessageTextForDisplay", () => {
  it("hides debug prefix in UI", () => {
    expect(
      chatMessageTextForDisplay("[AI Agent]: hello", { transparentPrefix: "[AI Agent]" }),
    ).toBe("hello");
  });
});

describe("stripAiIdentityPrefixMarkers", () => {
  it("removes leading prefix-only lines", () => {
    expect(stripAiIdentityPrefixMarkers("[AI Agent]: \n\n[AI Agent] body")).toBe("body");
  });

  it("leaves in-body mentions after the leading block", () => {
    expect(stripAiIdentityPrefixMarkers("[AI Agent]: See [AI Agent] docs for info")).toBe(
      "See [AI Agent] docs for info",
    );
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
