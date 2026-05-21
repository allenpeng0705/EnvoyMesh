import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPublishedExternalStore } from "../src/published-external-store.js";

let profileDir: string;

beforeEach(async () => {
  profileDir = await mkdtemp(join(tmpdir(), "envoymesh-published-external-"));
  await mkdir(profileDir, { recursive: true });
});

afterEach(async () => {
  await rm(profileDir, { recursive: true, force: true });
});

describe("published-external-store", () => {
  it("records monotonic export revisions per document", async () => {
    const store = createPublishedExternalStore(profileDir);
    const first = await store.recordExport("doc-a", {
      cid: "bafyfirst",
      ipfsInteropRecipe: "kubo-ipfs-export-v1",
      kuboVersion: "0.24.0",
      contentHash: "hash-v1",
    });
    const second = await store.recordExport("doc-a", {
      cid: "bafysecond",
      ipfsInteropRecipe: "kubo-ipfs-export-v1",
      kuboVersion: "0.24.0",
      contentHash: "hash-v2",
    });

    expect(first.exportRevision).toBe(1);
    expect(second.exportRevision).toBe(2);
    expect(second.cid).toBe("bafysecond");

    const all = await store.loadAll();
    expect(all.get("doc-a")?.exportRevision).toBe(2);
  });

  it("loadAll returns empty map when file is missing", async () => {
    const store = createPublishedExternalStore(profileDir);
    expect((await store.loadAll()).size).toBe(0);
  });

  it("loadAll tolerates corrupt json", async () => {
    const { writeFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    await writeFile(join(profileDir, "published-external.json"), "{ not-json", "utf8");
    const store = createPublishedExternalStore(profileDir);
    expect((await store.loadAll()).size).toBe(0);
  });
});
