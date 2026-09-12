import { describe, expect, it } from "vitest";
import {
  CODING_ALL_HARNESSES,
  CODING_TIER_A_HARNESSES,
  CODING_TIER_B_HARNESSES,
  codingHarnessLabel,
  codingHarnessToExtAgentId,
  isCodingHarnessId,
  isCodingTierBHarness,
} from "../src/coding-harness.js";

describe("coding-harness (Phase 68-C3)", () => {
  it("Tier A + Tier B cover all harnesses without overlap", () => {
    expect(CODING_TIER_A_HARNESSES).toEqual(["envoy-harness", "pi"]);
    expect(CODING_TIER_B_HARNESSES).toEqual([
      "claudecode",
      "codex",
      "opencode",
      "cursor",
      "codewhale",
    ]);
    expect(CODING_ALL_HARNESSES).toHaveLength(
      CODING_TIER_A_HARNESSES.length + CODING_TIER_B_HARNESSES.length,
    );
    const seen = new Set(CODING_ALL_HARNESSES);
    expect(seen.size).toBe(CODING_ALL_HARNESSES.length);
  });

  it("isCodingHarnessId / isCodingTierBHarness", () => {
    expect(isCodingHarnessId("codex")).toBe(true);
    expect(isCodingHarnessId("nope")).toBe(false);
    expect(isCodingTierBHarness("opencode")).toBe(true);
    expect(isCodingTierBHarness("pi")).toBe(false);
  });

  it("codingHarnessToExtAgentId maps Tier B 1:1 and Tier A to null", () => {
    expect(codingHarnessToExtAgentId("claudecode")).toBe("claudecode");
    expect(codingHarnessToExtAgentId("codex")).toBe("codex");
    expect(codingHarnessToExtAgentId("opencode")).toBe("opencode");
    expect(codingHarnessToExtAgentId("cursor")).toBe("cursor");
    expect(codingHarnessToExtAgentId("codewhale")).toBe("codewhale");
    expect(codingHarnessToExtAgentId("envoy-harness")).toBeNull();
    expect(codingHarnessToExtAgentId("pi")).toBeNull();
  });

  it("codingHarnessLabel returns end-user names", () => {
    expect(codingHarnessLabel("claudecode")).toBe("Claude Code");
    expect(codingHarnessLabel("opencode")).toBe("OpenCode");
    expect(codingHarnessLabel("codewhale")).toBe("CodeWhale");
  });
});
