import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createContextMemoryRuntime } from "../src/context-memory-runtime.js";

describe("context-memory LLM extract soft-fail", () => {
  const dirs: string[] = [];
  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
  });

  it("merges LLM facts when heuristic misses; soft-fails on extractor error", async () => {
    const profile = await mkdtemp(join(tmpdir(), "cm-llm-"));
    dirs.push(profile);
    const extract = vi.fn(async () => ["User deploys with Docker Compose exclusively"]);
    const rt = createContextMemoryRuntime({
      profileDir: profile,
      getSettings: () => ({ enabled: true, backend: "native" }),
      extractFactsWithModel: extract,
    });
    await rt.applySettings({ enabled: true, backend: "native" });
    // Long statement without heuristic cues — LLM path should run.
    await rt.rememberFromTurn({
      userText:
        "For production we stick with Docker Compose across every service rather than Kubernetes clusters.",
    });
    expect(extract).toHaveBeenCalled();
    const section = await rt.recallForTurn("Docker Compose deployment");
    expect(section).toMatch(/Docker Compose/i);

    const extractFail = vi.fn(async () => {
      throw new Error("model down");
    });
    const rt2 = createContextMemoryRuntime({
      profileDir: profile,
      getSettings: () => ({ enabled: true, backend: "native" }),
      extractFactsWithModel: extractFail,
    });
    await rt2.applySettings({ enabled: true, backend: "native" });
    await expect(
      rt2.rememberFromTurn({
        userText:
          "For all written docs we stick with British English spelling rather than American forms.",
      }),
    ).resolves.toBeUndefined();
    expect(rt2.status()).toBe("ready");
  });

  it("skips LLM when heuristic already extracted", async () => {
    const profile = await mkdtemp(join(tmpdir(), "cm-llm-skip-"));
    dirs.push(profile);
    const extract = vi.fn(async () => ["should not run"]);
    const rt = createContextMemoryRuntime({
      profileDir: profile,
      getSettings: () => ({ enabled: true, backend: "native" }),
      extractFactsWithModel: extract,
    });
    await rt.applySettings({ enabled: true, backend: "native" });
    await rt.rememberFromTurn({ userText: "I prefer dark mode please" });
    expect(extract).not.toHaveBeenCalled();
  });

  it("does not set lastError when extract throws", async () => {
    const profile = await mkdtemp(join(tmpdir(), "cm-llm-err-"));
    dirs.push(profile);
    const rt = createContextMemoryRuntime({
      profileDir: profile,
      getSettings: () => ({ enabled: true, backend: "native" }),
      extractFactsWithModel: async () => {
        throw new Error("boom");
      },
    });
    await rt.applySettings({ enabled: true, backend: "native" });
    await rt.rememberFromTurn({
      userText:
        "For production we stick with Docker Compose across every service rather than Kubernetes clusters.",
    });
    expect(rt.status()).toBe("ready");
    expect(rt.snapshot().lastError).toBeUndefined();
  });
});
