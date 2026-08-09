import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildEnvoyLocalHfModelId,
  parseEnvoyLocalHfModelId,
  pickPreferredHfGgufFiles,
  resolveEnvoyLocalDownloadModel,
  searchHuggingFaceGgufs,
  shouldListHfGgufFile,
} from "../src/envoy-local-hf.js";

describe("envoy-local-hf", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("builds and parses hf: model ids", () => {
    const id = buildEnvoyLocalHfModelId(
      "unsloth/Qwen3.5-0.8B-GGUF",
      "Qwen3.5-0.8B-Q4_K_M.gguf",
    );
    expect(id).toBe("hf:unsloth/Qwen3.5-0.8B-GGUF/Qwen3.5-0.8B-Q4_K_M.gguf");
    const parsed = parseEnvoyLocalHfModelId(id);
    expect(parsed?.fileName).toBe("Qwen3.5-0.8B-Q4_K_M.gguf");
    expect(parsed?.url).toContain("huggingface.co/unsloth/Qwen3.5-0.8B-GGUF/resolve/main/");
    expect(parsed?.source).toBe("huggingface");
  });

  it("rejects unsafe file names and non-hf ids", () => {
    expect(parseEnvoyLocalHfModelId("qwen3.5-0.8b-q4_k_m")).toBeUndefined();
    expect(
      parseEnvoyLocalHfModelId("hf:evil/repo/../escape.gguf"),
    ).toBeUndefined();
    expect(shouldListHfGgufFile("mmproj-F16.gguf", 1_000_000)).toBe(false);
    expect(shouldListHfGgufFile("model-00001-of-00005.gguf", 1_000_000)).toBe(false);
    expect(shouldListHfGgufFile("Qwen3.5-0.8B-BF16.gguf", 1_000_000)).toBe(false);
    expect(shouldListHfGgufFile("Qwen3.5-0.8B-Q4_K_M.gguf", 500_000_000)).toBe(true);
  });

  it("prefers Q4_K_M among repo files", () => {
    const picked = pickPreferredHfGgufFiles([
      { path: "Qwen3.5-0.8B-Q8_0.gguf", size: 800 },
      { path: "Qwen3.5-0.8B-Q4_K_M.gguf", size: 500 },
      { path: "Qwen3.5-0.8B-Q3_K_M.gguf", size: 400 },
      { path: "mmproj-F16.gguf", size: 200 },
    ]);
    expect(picked[0]?.path).toBe("Qwen3.5-0.8B-Q4_K_M.gguf");
    expect(picked.every((p) => !p.path.startsWith("mmproj"))).toBe(true);
  });

  it("resolveEnvoyLocalDownloadModel prefers curated then hf:", () => {
    const curated = resolveEnvoyLocalDownloadModel("curated-id", (id) =>
      id === "curated-id"
        ? {
            id,
            label: "C",
            description: "d",
            fileName: "a.gguf",
            url: "https://huggingface.co/x/y/resolve/main/a.gguf",
            approxBytes: 1,
            tags: [],
          }
        : undefined,
    );
    expect(curated?.source).toBe("curated");
    const hf = resolveEnvoyLocalDownloadModel(
      "hf:unsloth/Qwen3.5-0.8B-GGUF/Qwen3.5-0.8B-Q4_K_M.gguf",
      () => undefined,
    );
    expect(hf?.fileName).toBe("Qwen3.5-0.8B-Q4_K_M.gguf");
  });

  it("searchHuggingFaceGgufs expands Hub model hits into GGUF entries", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const u = String(url);
        if (u.includes("/api/models?") && u.includes("search=")) {
          return {
            ok: true,
            json: async () => [{ id: "unsloth/Qwen3.5-0.8B-GGUF" }],
          };
        }
        if (u.includes("/tree/main")) {
          return {
            ok: true,
            json: async () => [
              { type: "file", path: "Qwen3.5-0.8B-Q4_K_M.gguf", size: 532_000_000 },
              { type: "file", path: "mmproj-F16.gguf", size: 200_000_000 },
              { type: "file", path: "Qwen3.5-0.8B-BF16.gguf", size: 1_500_000_000 },
            ],
          };
        }
        return { ok: false, status: 404, json: async () => ({}) };
      }),
    );

    const models = await searchHuggingFaceGgufs("qwen3.5", { region: "global" });
    expect(models.length).toBeGreaterThan(0);
    expect(models[0]?.id).toContain("hf:unsloth/Qwen3.5-0.8B-GGUF/");
    expect(models.every((m) => m.source === "huggingface")).toBe(true);
    expect(models.every((m) => !m.fileName.startsWith("mmproj"))).toBe(true);
  });
});
