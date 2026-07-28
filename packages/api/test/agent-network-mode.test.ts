import { describe, expect, it } from "vitest";
import {
  AI_ENGINE_MODE_KEYS,
  computeAiEngineMode,
  type AiEngineMode,
} from "../src/agent-network-mode.js";

describe("computeAiEngineMode", () => {
  it("returns 'both' when both flags are true", () => {
    expect(computeAiEngineMode(true, true)).toBe("both");
  });

  it("returns 'openclaw-only' when only built-in is enabled", () => {
    expect(computeAiEngineMode(false, true)).toBe("openclaw-only");
  });

  it("returns 'both' when bridge is undefined and openclaw is true (D1C: both ship on)", () => {
    expect(computeAiEngineMode(undefined, true)).toBe("both");
  });

  it("returns 'ext-only' when only the bridge is enabled", () => {
    expect(computeAiEngineMode(true, false)).toBe("ext-only");
  });

  it("returns 'off' when both are explicitly false", () => {
    expect(computeAiEngineMode(false, false)).toBe("off");
  });

  it("returns 'both' when both flags are undefined (fresh install)", () => {
    expect(computeAiEngineMode(undefined, undefined)).toBe("both");
  });
});

describe("AI_ENGINE_MODE_KEYS", () => {
  it("exposes a key for every AiEngineMode value", () => {
    const expected: AiEngineMode[] = ["both", "openclaw-only", "ext-only", "off"];
    for (const mode of expected) {
      expect(AI_ENGINE_MODE_KEYS[mode]).toBeTruthy();
    }
  });
});
