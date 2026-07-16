import { describe, expect, it, beforeEach } from "vitest";
import { mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createSensitivityOverrideStore } from "../src/sensitivity-overrides.js";

describe("sensitivity-overrides", () => {
  let profileDir: string;

  beforeEach(async () => {
    profileDir = join(tmpdir(), `envoymesh-profile-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(profileDir, { recursive: true });
  });

  async function cleanup() {
    await rm(profileDir, { recursive: true, force: true });
  }

  it("returns empty map when file does not exist", async () => {
    const store = createSensitivityOverrideStore(profileDir);
    const overrides = await store.load();
    expect(overrides).toBeInstanceOf(Map);
    expect(overrides.size).toBe(0);
    await cleanup();
  });

  it("creates vault-sensitivity-overrides.json on first write", async () => {
    const store = createSensitivityOverrideStore(profileDir);
    await store.set("doc_abc123", "public");

    const content = await readFile(join(profileDir, "vault-sensitivity-overrides.json"), "utf8");
    const parsed = JSON.parse(content);
    expect(parsed.version).toBe(1);
    expect(parsed.overrides["doc_abc123"]).toBe("public");
    await cleanup();
  });

  it("set and get round-trips correctly", async () => {
    const store = createSensitivityOverrideStore(profileDir);

    await store.set("doc_aaa", "public");
    await store.set("doc_bbb", "friends");
    await store.set("doc_ccc", "private");

    expect(await store.get("doc_aaa")).toBe("public");
    expect(await store.get("doc_bbb")).toBe("friends");
    expect(await store.get("doc_ccc")).toBe("private");
    expect(await store.get("doc_unknown")).toBeUndefined();
    await cleanup();
  });

  it("update overwrites existing value", async () => {
    const store = createSensitivityOverrideStore(profileDir);

    await store.set("doc_abc", "public");
    expect(await store.get("doc_abc")).toBe("public");

    await store.set("doc_abc", "private");
    expect(await store.get("doc_abc")).toBe("private");
    await cleanup();
  });

  it("delete removes override and returns true", async () => {
    const store = createSensitivityOverrideStore(profileDir);

    await store.set("doc_abc", "friends");
    const removed = await store.delete("doc_abc");
    expect(removed).toBe(true);
    expect(await store.get("doc_abc")).toBeUndefined();

    // Verify it's gone from disk
    const overrides = await store.load();
    expect(overrides.has("doc_abc")).toBe(false);
    await cleanup();
  });

  it("delete returns false for non-existent key", async () => {
    const store = createSensitivityOverrideStore(profileDir);
    const removed = await store.delete("doc_nonexistent");
    expect(removed).toBe(false);
    await cleanup();
  });

  it("clear removes all overrides", async () => {
    const store = createSensitivityOverrideStore(profileDir);

    await store.set("doc_a", "public");
    await store.set("doc_b", "private");
    await store.clear();

    const overrides = await store.load();
    expect(overrides.size).toBe(0);
    await cleanup();
  });

  it("load returns full map after multiple writes", async () => {
    const store = createSensitivityOverrideStore(profileDir);

    await store.set("doc_1", "public");
    await store.set("doc_2", "friends");
    await store.set("doc_3", "private");

    const overrides = await store.load();
    expect(overrides.size).toBe(3);
    expect(overrides.get("doc_1")).toBe("public");
    expect(overrides.get("doc_2")).toBe("friends");
    expect(overrides.get("doc_3")).toBe("private");
    await cleanup();
  });

  it("persists across store instances (reads from disk)", async () => {
    const store1 = createSensitivityOverrideStore(profileDir);
    await store1.set("doc_persist", "friends");

    // Create a new store instance pointing to same profile dir
    const store2 = createSensitivityOverrideStore(profileDir);
    expect(await store2.get("doc_persist")).toBe("friends");
    const overrides = await store2.load();
    expect(overrides.size).toBe(1);
    await cleanup();
  });

  it("handles corrupt JSON gracefully (returns empty map)", async () => {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(join(profileDir, "vault-sensitivity-overrides.json"), "NOT JSON{{{", "utf8");

    const store = createSensitivityOverrideStore(profileDir);
    const overrides = await store.load();
    expect(overrides.size).toBe(0);
    await cleanup();
  });

  it("handles wrong version gracefully (returns empty map)", async () => {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(
      join(profileDir, "vault-sensitivity-overrides.json"),
      JSON.stringify({ version: 99, overrides: { doc_bad: "public" } }),
      "utf8",
    );

    const store = createSensitivityOverrideStore(profileDir);
    const overrides = await store.load();
    expect(overrides.size).toBe(0);
    await cleanup();
  });

  it("file is written with mode 0o600", async () => {
    const { stat } = await import("node:fs/promises");
    const store = createSensitivityOverrideStore(profileDir);
    await store.set("doc_perm", "public");

    const fileStat = await stat(join(profileDir, "vault-sensitivity-overrides.json"));
    // On macOS/Linux, mode & 0o777 should give 0o600
    expect(fileStat.mode & 0o777).toBe(0o600);
    await cleanup();
  });
});
