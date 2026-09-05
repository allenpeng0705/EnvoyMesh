import { describe, expect, it } from "vitest";
import type { EnvoyLocalCatalogModel } from "@envoymesh/api";
import {
  ENVOY_LOCAL_CURATED_MODELS,
  findCuratedSuccessor,
  findCuratedSuccessorIn,
  getEnvoyLocalCatalogModel,
  searchEnvoyLocalCatalog,
} from "../src/envoy-local-catalog.js";
import { ENVOY_LOCAL_MODEL_TIER_IDS } from "../src/envoy-local-hw.js";
import { DEFAULT_ENVOY_LOCAL_MODEL } from "../src/envoy-local-platform.js";

describe("envoy-local-catalog", () => {
  it("includes the default enable model", () => {
    const model = getEnvoyLocalCatalogModel(DEFAULT_ENVOY_LOCAL_MODEL.id);
    expect(model?.id).toBe(DEFAULT_ENVOY_LOCAL_MODEL.id);
    // Region-aware mirror (CN → hf-mirror.com; global → huggingface.co).
    expect(model?.url).toMatch(/huggingface\.co|hf-mirror\.com/);
    expect(model?.url).toContain(DEFAULT_ENVOY_LOCAL_MODEL.fileName);
    expect(DEFAULT_ENVOY_LOCAL_MODEL.id).toMatch(/qwen3\.5/i);
  });

  it("requires family/sizeClass/quant on every curated entry", () => {
    for (const m of ENVOY_LOCAL_CURATED_MODELS) {
      expect(m.family, m.id).toBeTruthy();
      expect(m.sizeClass, m.id).toBeTruthy();
      expect(m.quant, m.id).toBe("q4_k_m");
      expect(m.source).toBe("curated");
    }
  });

  it("hardware tier ids all exist in the curated catalog with metadata", () => {
    for (const id of Object.values(ENVOY_LOCAL_MODEL_TIER_IDS)) {
      const entry = ENVOY_LOCAL_CURATED_MODELS.find((m) => m.id === id);
      expect(entry, id).toBeTruthy();
      expect(entry?.family).toBeTruthy();
      expect(entry?.sizeClass).toBeTruthy();
    }
  });

  it("findCuratedSuccessorIn resolves explicit supersedes", () => {
    const fake: EnvoyLocalCatalogModel[] = [
      {
        id: "old-id",
        label: "Old",
        description: "old",
        fileName: "old.gguf",
        url: "https://example.com/old.gguf",
        approxBytes: 1,
        tags: [],
        family: "qwen3.5",
        sizeClass: "4b",
        quant: "q4_k_m",
      },
      {
        id: "new-id",
        label: "New",
        description: "new",
        fileName: "new.gguf",
        url: "https://example.com/new.gguf",
        approxBytes: 1,
        tags: [],
        family: "qwen3.6",
        sizeClass: "4b",
        quant: "q4_k_m",
        supersedes: ["old-id"],
      },
    ];
    expect(findCuratedSuccessorIn("old-id", fake)?.id).toBe("new-id");
    expect(findCuratedSuccessorIn("new-id", fake)).toBeUndefined();
    // Shipped allowlist has no successors yet.
    expect(findCuratedSuccessor(DEFAULT_ENVOY_LOCAL_MODEL.id)).toBeUndefined();
  });

  it("filters curated models by query", () => {
    const prev = process.env.ENVOYMESH_ENVOY_LOCAL_MODEL_REGION;
    process.env.ENVOYMESH_ENVOY_LOCAL_MODEL_REGION = "global";
    try {
      const hits = searchEnvoyLocalCatalog("qwen3.5");
      expect(hits.some((m) => m.id.includes("qwen3.5"))).toBe(true);
      expect(hits.every((m) => m.url.startsWith("https://huggingface.co/"))).toBe(true);
      expect(hits.every((m) => m.source === "curated")).toBe(true);
    } finally {
      if (prev === undefined) delete process.env.ENVOYMESH_ENVOY_LOCAL_MODEL_REGION;
      else process.env.ENVOYMESH_ENVOY_LOCAL_MODEL_REGION = prev;
    }
  });

  it("sets chat-template for Gemma 4 and labels Llama as 3.2", () => {
    const gemma = getEnvoyLocalCatalogModel("gemma-4-e2b-it-q4_k_m");
    expect(gemma?.chatTemplate).toBe("gemma");
    const llama = ENVOY_LOCAL_CURATED_MODELS.find((m) => m.id.includes("llama"));
    expect(llama?.label).toMatch(/Llama 3\.2/);
    expect(llama?.description).toMatch(/Llama 4/);
  });

  it("returns the full allowlist for empty query", () => {
    expect(searchEnvoyLocalCatalog().length).toBe(ENVOY_LOCAL_CURATED_MODELS.length);
  });

  it("curates Qwen3.5 (incl. 9B), Llama, and Gemma 4 edge models", () => {
    const ids = ENVOY_LOCAL_CURATED_MODELS.map((m) => m.id).join(" ");
    expect(ids).toMatch(/qwen3\.5/i);
    expect(ids).toMatch(/qwen3\.5-9b/i);
    expect(ids).toMatch(/llama/i);
    expect(ids).toMatch(/gemma-4/i);
    expect(searchEnvoyLocalCatalog("gemma").some((m) => m.id.includes("gemma"))).toBe(
      true,
    );
  });
});
