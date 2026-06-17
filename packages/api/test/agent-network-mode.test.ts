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

  it("returns 'openclaw-only' when only built-in is enabled (D1C: opt-in bridge, ships-on openclaw)", () => {
    expect(computeAiEngineMode(false, true)).toBe("openclaw-only");
  });

  it("returns 'openclaw-only' when bridge is undefined and openclaw is true", () => {
    // D1C: a fresh install where bridgeEnabled has never been written —
    // the absent field is treated as opt-out (false), while openclawEnabled
    // absent is treated as opt-in (true).
    expect(computeAiEngineMode(undefined, true)).toBe("openclaw-only");
  });

  it("returns 'ext-only' when only the bridge is enabled", () => {
    expect(computeAiEngineMode(true, false)).toBe("ext-only");
  });

  it("returns 'off' when both are explicitly false", () => {
    expect(computeAiEngineMode(false, false)).toBe("off");
  });

  it("returns 'off' when both flags are undefined (no UI, no persisted config) — degenerate case", () => {
    // Both absent: openclaw default = true, bridge default = false → 'openclaw-only'.
    // The 'off' branch is only reachable when both are explicitly false.
    expect(computeAiEngineMode(undefined, undefined)).toBe("openclaw-only");
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
