import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CodingRuntimeStore,
  codingRuntimeToSpawnEnv,
} from "../src/coding-runtime-store.js";

describe("CodingRuntimeStore", () => {
  it("persists cwd/model/apiKey and maps spawn env", async () => {
    const dir = await mkdtemp(join(tmpdir(), "coding-runtime-"));
    const store = new CodingRuntimeStore();
    await store.init(dir);
    const rec = await store.set("sess-1", {
      cwd: "/projects/app",
      model: "gpt-5",
      providerKind: "openai-compatible",
      endpoint: "https://api.example/v1",
      apiKey: "sk-test",
    });
    expect(rec.hasOwnProperty("apiKey")).toBe(true);
    expect(store.get("sess-1")?.model).toBe("gpt-5");
    expect(codingRuntimeToSpawnEnv(store.get("sess-1"))).toEqual({
      OPENAI_API_KEY: "sk-test",
      OPENAI_BASE_URL: "https://api.example/v1",
    });

    const raw = await readFile(join(dir, "coding-harness-runtime.json"), "utf8");
    expect(raw).toContain("sk-test");
    expect(raw).toContain("/projects/app");

    await store.clear("sess-1");
    expect(store.get("sess-1")).toBeUndefined();
  });

  it("preserves prior apiKey when omitted on update", async () => {
    const dir = await mkdtemp(join(tmpdir(), "coding-runtime-"));
    const store = new CodingRuntimeStore();
    await store.init(dir);
    await store.set("s", { cwd: "/a", apiKey: "sk-1" });
    await store.set("s", { cwd: "/b", model: "m2" });
    expect(store.get("s")).toMatchObject({
      cwd: "/b",
      model: "m2",
      apiKey: "sk-1",
    });
  });
});
