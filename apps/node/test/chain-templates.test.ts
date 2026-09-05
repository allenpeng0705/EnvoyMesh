/**
 * Phase 67A / Phase 42D — ChainTemplateStore unit tests.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ChainTemplateStore } from "../src/chain-templates.js";

describe("ChainTemplateStore", () => {
  let dir: string;
  let store: ChainTemplateStore;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "chain-templates-"));
    store = new ChainTemplateStore();
    await store.init(dir);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("seeds built-in templates on first init", () => {
    const list = store.list();
    expect(list.length).toBeGreaterThanOrEqual(4);
    expect(store.get("translate-review-summarize")?.name).toMatch(/Translate/i);
  });

  it("saves a user template and lists it", async () => {
    await store.save({
      id: "my-custom",
      name: "My Custom",
      description: "Owner saved",
      keywords: ["custom"],
    });
    expect(store.get("my-custom")?.name).toBe("My Custom");
    expect(store.list().some((t) => t.id === "my-custom")).toBe(true);
    const raw = JSON.parse(await readFile(join(dir, "chain-templates.json"), "utf8"));
    expect(raw.some((t: { id: string }) => t.id === "my-custom")).toBe(true);
  });

  it("deletes user templates but refuses built-ins", async () => {
    await store.save({
      id: "to-delete",
      name: "Temp",
      description: "x",
      keywords: [],
    });
    expect(await store.delete("to-delete")).toBe(true);
    expect(store.get("to-delete")).toBeUndefined();
    expect(await store.delete("translate-review-summarize")).toBe(false);
    expect(store.get("translate-review-summarize")).toBeDefined();
  });

  it("find matches keywords and name", () => {
    const hits = store.find("research report");
    expect(hits.some((t) => t.id === "find-best-research")).toBe(true);
  });
});
