import { describe, expect, it } from "vitest";
import {
  ENVOY_LOCAL_EMBED_CTX_SIZE,
  estimateEmbeddingTokenCount,
  maxVaultChunkCharsForEmbeddingTokens,
  recommendedVaultChunkCharsForEmbedding,
  resolveEffectiveEmbeddingMaxInputTokens,
  resolveEmbeddingMaxInputTokens,
  truncateTextForEmbedding,
} from "../src/ai-embedding-limits.js";
import {
  buildVaultIndexOptionsFromKnowledgeBase,
  normalizeKnowledgeEmbedding,
  resolveAiKnowledgeBaseSettings,
} from "../src/ai-knowledge-base.js";

describe("ai-embedding-limits", () => {
  it("defaults embo-01 to 4096 tokens", () => {
    expect(resolveEmbeddingMaxInputTokens({ modelName: "embo-01" })).toBe(4096);
  });

  it("prefers explicit maxInputTokens override", () => {
    expect(resolveEmbeddingMaxInputTokens({ modelName: "embo-01", maxInputTokens: 2048 })).toBe(2048);
  });

  it("caps Envoy Local effective tokens at sidecar ctx even when model card is 8k", () => {
    expect(
      resolveEffectiveEmbeddingMaxInputTokens({
        mode: "envoy-local",
        modelName: "qwen3-embedding-4b-q4_k_m",
        maxInputTokens: 8192,
      }),
    ).toBe(ENVOY_LOCAL_EMBED_CTX_SIZE);
  });

  it("recommends vault chunk size under Envoy Local budget", () => {
    const cap = recommendedVaultChunkCharsForEmbedding({ mode: "envoy-local" });
    expect(cap).toBeDefined();
    expect(cap!).toBeLessThanOrEqual(ENVOY_LOCAL_EMBED_CTX_SIZE);
    expect(estimateEmbeddingTokenCount("文".repeat(cap!))).toBeLessThanOrEqual(
      ENVOY_LOCAL_EMBED_CTX_SIZE,
    );
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

describe("knowledge embedding auto-config", () => {
  it("normalizes envoy-local embedding to sidecar maxInputTokens", () => {
    const emb = normalizeKnowledgeEmbedding({
      mode: "envoy-local",
      maxInputTokens: 8192,
      modelName: "qwen3-embedding-4b-q4_k_m",
    });
    expect(emb.maxInputTokens).toBe(ENVOY_LOCAL_EMBED_CTX_SIZE);
    expect(emb.mode).toBe("envoy-local");
  });

  it("caps oversized chunkSizeChars when resolving Envoy Local KB", () => {
    const kb = resolveAiKnowledgeBaseSettings({
      chunkSizeChars: 4000,
      embedding: { mode: "envoy-local", maxInputTokens: 8192 },
    });
    expect(kb.embedding?.maxInputTokens).toBe(ENVOY_LOCAL_EMBED_CTX_SIZE);
    expect(kb.chunkSizeChars).toBeLessThanOrEqual(
      recommendedVaultChunkCharsForEmbedding(kb.embedding)!,
    );
  });

  it("buildVaultIndexOptions respects Envoy Local token budget", () => {
    const opts = buildVaultIndexOptionsFromKnowledgeBase("/vault", {
      chunkSizeChars: 4000,
      embedding: { mode: "envoy-local" },
    });
    expect(opts.maxChunkChars).toBeLessThanOrEqual(ENVOY_LOCAL_EMBED_CTX_SIZE);
  });
});
