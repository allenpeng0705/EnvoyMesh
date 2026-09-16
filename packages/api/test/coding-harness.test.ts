import { describe, expect, it } from "vitest";
import {
  CODING_ALL_HARNESSES,
  CODING_FEATURED_HARNESSES,
  CODING_PROVIDER_CATALOG,
  CODING_TIER_A_HARNESSES,
  CODING_TIER_B_HARNESSES,
  codingHarnessLabel,
  codingHarnessToExtAgentId,
  getCodingProvider,
  isCodingHarnessId,
  isCodingTierBHarness,
} from "../src/coding-harness.js";

describe("coding-harness catalog", () => {
  it("Tier A is Envoy built-in + Pi", () => {
    expect(CODING_TIER_A_HARNESSES).toEqual(["envoy-harness", "pi"]);
  });

  it("includes Paseo-shaped providers including DeepSeek Harness", () => {
    const ids = new Set(CODING_ALL_HARNESSES);
    expect(ids.has("envoy-harness")).toBe(true);
    expect(ids.has("deepseek-harness")).toBe(true);
    expect(ids.has("deepseek-tui")).toBe(true);
    expect(ids.has("grok")).toBe(true);
    expect(ids.has("gemini")).toBe(true);
    expect(ids.has("traecli")).toBe(true);
    expect(ids.has("qoder")).toBe(true);
    expect(ids.has("copilot")).toBe(true);
    expect(ids.has("minimax-code")).toBe(true);
    expect(ids.has("cline")).toBe(true);
    expect(ids.has("goose")).toBe(true);
    expect(CODING_PROVIDER_CATALOG.length).toBeGreaterThan(30);
    expect(CODING_ALL_HARNESSES).toHaveLength(
      CODING_TIER_A_HARNESSES.length + CODING_TIER_B_HARNESSES.length,
    );
    expect(new Set(CODING_ALL_HARNESSES).size).toBe(CODING_ALL_HARNESSES.length);
  });

  it("isCodingHarnessId / isCodingTierBHarness", () => {
    expect(isCodingHarnessId("codex")).toBe(true);
    expect(isCodingHarnessId("gemini")).toBe(true);
    expect(isCodingHarnessId("nope")).toBe(false);
    expect(isCodingTierBHarness("opencode")).toBe(true);
    expect(isCodingTierBHarness("deepseek-harness")).toBe(true);
    expect(isCodingTierBHarness("pi")).toBe(false);
  });

  it("maps dedicated + DeepSeek aliases onto sidecars; catalog ACP keeps own id", () => {
    expect(codingHarnessToExtAgentId("claudecode")).toBe("claudecode");
    expect(codingHarnessToExtAgentId("deepseek-harness")).toBe("codewhale");
    expect(codingHarnessToExtAgentId("deepseek-tui")).toBe("codewhale");
    expect(codingHarnessToExtAgentId("gemini")).toBe("gemini");
    expect(codingHarnessToExtAgentId("envoy-harness")).toBeNull();
    expect(codingHarnessToExtAgentId("pi")).toBeNull();
  });

  it("labels and featured set", () => {
    expect(codingHarnessLabel("claudecode")).toBe("Claude Code");
    expect(codingHarnessLabel("deepseek-harness")).toBe("DeepSeek Harness");
    expect(codingHarnessLabel("minimax-code")).toBe("MiniMax Code");
    expect(codingHarnessLabel("envoy-harness")).toBe("Envoy");
    expect(CODING_FEATURED_HARNESSES).toContain("envoy-harness");
    expect(CODING_FEATURED_HARNESSES).toContain("deepseek-harness");
    expect(CODING_FEATURED_HARNESSES).toContain("minimax-code");
    expect(getCodingProvider("grok")?.command[0]).toBe("grok");
    expect(getCodingProvider("minimax-code")?.command).toEqual(["mcode", "acp"]);
  });
});
