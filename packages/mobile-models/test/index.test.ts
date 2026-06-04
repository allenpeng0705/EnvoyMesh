import { describe, expect, it } from "vitest";
import { selectBestModel, getMobileModelInfo, generateWithFallback } from "../src/index.js";

function mockDeps(ramMb: number, modelExists: boolean) {
  return {
    getDeviceCapability: async () => ({ ramMb, cpuCores: 4 }),
    fileExists: async (path: string) => modelExists,
    downloadModel: async () => {},
  };
}

describe("mobile-models", () => {
  it("selects llama on 4GB+ device", async () => {
    const deps = mockDeps(4096, true);
    const model = await selectBestModel(deps);
    expect(model).not.toBeNull();
    expect(model!.modelType).toBe("llama");
    expect(model!.maxTokens).toBe(512);
  });

  it("returns null on low-RAM device", async () => {
    const deps = mockDeps(1500, false);
    const model = await selectBestModel(deps);
    expect(model).toBeNull();
  });

  it("reports unavailable when model not downloaded", async () => {
    const deps = mockDeps(4096, false);
    const info = await getMobileModelInfo(deps, "models/test.gguf");
    expect(info.available).toBe(false);
  });

  it("reports available when model exists", async () => {
    const deps = mockDeps(4096, true);
    const info = await getMobileModelInfo(deps, "models/test.gguf");
    expect(info.available).toBe(true);
  });

  it("falls back to home node when model unavailable", async () => {
    const deps = mockDeps(4096, false);
    let fallbackCalled = false;
    const result = await generateWithFallback(
      deps,
      { modelPath: "missing.gguf", modelType: "llama", maxTokens: 512, temperature: 0.7, topP: 0.9 },
      "test prompt",
      async () => { fallbackCalled = true; return "fallback response"; },
    );
    expect(fallbackCalled).toBe(true);
    expect(result).toBe("fallback response");
  });

  it("selects tinyllama on 2-4GB device (fills the 2-4GB tier gap)", async () => {
    const deps = mockDeps(3000, true);
    const model = await selectBestModel(deps);
    expect(model).not.toBeNull();
    expect(model!.modelType).toBe("llama");
    expect(model!.modelPath).toContain("tinyllama");
    expect(model!.maxTokens).toBe(256);
  });

  it("reports tinyllama name and lower ram when tinyllama model is on disk", async () => {
    const deps = mockDeps(3000, true);
    const info = await getMobileModelInfo(deps, "models/tinyllama-1.1b-q4.gguf");
    expect(info.available).toBe(true);
    expect(info.modelName).toContain("TinyLlama");
    expect(info.ramUsageMb).toBe(600);
  });
});
