import { describe, expect, it } from "vitest";
import {
  estimateEmbeddingTokenCount,
  maxVaultChunkCharsForEmbeddingTokens,
  resolveEmbeddingMaxInputTokens,
  truncateTextForEmbedding,
} from "../src/ai-embedding-limits.js";

describe("ai-embedding-limits", () => {
  it("defaults embo-01 to 4096 tokens", () => {
    expect(resolveEmbeddingMaxInputTokens({ modelName: "embo-01" })).toBe(4096);
  });

  it("prefers explicit maxInputTokens override", () => {
    expect(resolveEmbeddingMaxInputTokens({ modelName: "embo-01", maxInputTokens: 2048 })).toBe(2048);
  });

  it("caps vault chunk chars for 4096 token limit under CJK worst case", () => {
    const cap = maxVaultChunkCharsForEmbeddingTokens(4096);
    expect(cap).toBeGreaterThan(800);
    expect(cap).toBeLessThanOrEqual(4096);
    expect(estimateEmbeddingTokenCount("文".repeat(cap))).toBeLessThanOrEqual(4096);
    expect(estimateEmbeddingTokenCount("文".repeat(cap + 1))).toBeGreaterThan(4096);
  });

  it("truncates long embed payloads", () => {
    const long = "文".repeat(5000);
    const trimmed = truncateTextForEmbedding(long, 4096);
    expect(trimmed.length).toBeLessThan(long.length);
    expect(estimateEmbeddingTokenCount(trimmed)).toBeLessThanOrEqual(4096);
  });
});
