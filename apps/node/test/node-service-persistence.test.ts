/**
 * Unit tests for the local JSON-file persistence stores
 * (Phases 23 + 25D).
 */
import { mkdtemp, rm, writeFile as fsWriteFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  buildIntentHistoryFilePath,
  buildPublishedLibraryFilePath,
  IntentHistoryStore,
  PublishedLibraryStore,
} from "../src/node-service-persistence.js";

let tempDir = "";
let historyPath = "";
let libraryPath = "";
const fixedNow = () => new Date("2026-06-30T12:00:00.000Z");

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "envoy-persistence-test-"));
  historyPath = join(tempDir, "intent-history.json");
  libraryPath = join(tempDir, "published-library.json");
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

/* ---------- file-path helpers ---------- */

describe("file-path helpers", () => {
  it("buildIntentHistoryFilePath returns null when profileDir is null", () => {
    expect(buildIntentHistoryFilePath(null)).toBeNull();
  });
  it("buildIntentHistoryFilePath returns a join of the profileDir + filename", () => {
    expect(buildIntentHistoryFilePath("/x/y")).toBe("/x/y/intent-history.json");
  });
  it("buildPublishedLibraryFilePath mirrors the above", () => {
    expect(buildPublishedLibraryFilePath(null)).toBeNull();
    expect(buildPublishedLibraryFilePath("/x/y")).toBe("/x/y/published-library.json");
  });
});

/* ---------- IntentHistoryStore ---------- */

describe("IntentHistoryStore", () => {
  it("records and evicts oldest entries past maxEntries", () => {
    const store = new IntentHistoryStore({
      maxEntries: 3,
      getFilePath: () => null,
      now: () => new Date("2026-06-30T00:00:00.000Z"),
    });
    store.record("a", "q1");
    store.record("b", "q2");
    store.record("c", "q3");
    store.record("d", "q4");
    expect(store.getHistory().map((e) => e.intent)).toEqual(["b", "c", "d"]);
  });

  it("uses injected now() for timestamps", () => {
    const store = new IntentHistoryStore({
      maxEntries: 5,
      getFilePath: () => null,
      now: () => new Date("2026-01-01T00:00:00.000Z"),
    });
    store.record("a", "q");
    expect(store.getHistory()[0]?.timestamp).toBe("2026-01-01T00:00:00.000Z");
  });

  it("persist() is a no-op when getFilePath returns null", async () => {
    const store = new IntentHistoryStore({ maxEntries: 5, getFilePath: () => null });
    store.record("a", "q");
    await expect(store.persist()).resolves.toBeUndefined();
  });

  it("persist() writes the JSON file and loadFromDisk() restores it", async () => {
    const store = new IntentHistoryStore({
      maxEntries: 5,
      getFilePath: () => historyPath,
      now: fixedNow,
    });
    store.record("a", "q1");
    store.record("b", "q2");
    await store.persist();

    // New store instance reads the same file
    const store2 = new IntentHistoryStore({
      maxEntries: 5,
      getFilePath: () => historyPath,
    });
    await store2.loadFromDisk();
    expect(store2.getHistory()).toEqual([
      { intent: "a", query: "q1", timestamp: "2026-06-30T12:00:00.000Z" },
      { intent: "b", query: "q2", timestamp: "2026-06-30T12:00:00.000Z" },
    ]);
  });

  it("loadFromDisk() silently no-ops when the file doesn't exist", async () => {
    const store = new IntentHistoryStore({ maxEntries: 5, getFilePath: () => historyPath });
    await expect(store.loadFromDisk()).resolves.toBeUndefined();
    expect(store.getHistory()).toEqual([]);
  });

  it("loadFromDisk() caps restored entries at maxEntries", async () => {
    await fsWriteFile(
      historyPath,
      JSON.stringify({
        version: "0.1",
        history: [1, 2, 3, 4, 5].map((i) => ({
          intent: `i${i}`,
          query: `q${i}`,
          timestamp: "2026-06-30T00:00:00.000Z",
        })),
      }),
    );
    const store = new IntentHistoryStore({ maxEntries: 2, getFilePath: () => historyPath });
    await store.loadFromDisk();
    expect(store.getHistory().map((e) => e.intent)).toEqual(["i4", "i5"]);
  });

  it("clear() drops all in-memory entries", () => {
    const store = new IntentHistoryStore({ maxEntries: 5, getFilePath: () => null });
    store.record("a", "q");
    store.clear();
    expect(store.getHistory()).toEqual([]);
  });
});

/* ---------- PublishedLibraryStore ---------- */

describe("PublishedLibraryStore", () => {
  it("publish() appends to the 'local' owner with a default sensitivity of 'public'", () => {
    const store = new PublishedLibraryStore({ getFilePath: () => null, now: fixedNow });
    const entry = store.publish({ title: "T", topicTags: ["a"] });
    expect(entry).toEqual({
      title: "T",
      topicTags: ["a"],
      sensitivity: "public",
      publishedAt: "2026-06-30T12:00:00.000Z",
    });
    expect(store.getEntries("local")).toEqual([entry]);
  });

  it("publish() respects explicit sensitivity", () => {
    const store = new PublishedLibraryStore({ getFilePath: () => null, now: fixedNow });
    const entry = store.publish({ title: "T", topicTags: ["a"], sensitivity: "direct" });
    expect(entry.sensitivity).toBe("direct");
  });

  it("setForPeer() replaces the prior entry list and backfills publishedAt", () => {
    const store = new PublishedLibraryStore({ getFilePath: () => null, now: fixedNow });
    store.setForPeer("a", [{ title: "T", topicTags: [], sensitivity: "public" }]);
    store.setForPeer("a", [
      { title: "T2", topicTags: [], sensitivity: "public", publishedAt: "2026-01-01T00:00:00.000Z" },
    ]);
    expect(store.getEntries("a")).toEqual([
      {
        title: "T2",
        topicTags: [],
        sensitivity: "public",
        publishedAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
  });

  it("getEntries() returns all entries when no ownerId is provided", () => {
    const store = new PublishedLibraryStore({ getFilePath: () => null });
    store.setForPeer("a", [{ title: "TA", topicTags: [], sensitivity: "public" }]);
    store.setForPeer("b", [{ title: "TB", topicTags: [], sensitivity: "public" }]);
    expect(store.getEntries().map((e) => e.title).sort()).toEqual(["TA", "TB"]);
  });

  it("getEntries() returns a defensive copy (mutating it doesn't affect the store)", () => {
    const store = new PublishedLibraryStore({ getFilePath: () => null });
    store.setForPeer("a", [{ title: "T", topicTags: [], sensitivity: "public" }]);
    const list = store.getEntries("a");
    list.pop();
    expect(store.getEntries("a")).toHaveLength(1);
  });

  it("getTopicsForContact() returns the union of topicTags", () => {
    const store = new PublishedLibraryStore({ getFilePath: () => null });
    store.setForPeer("a", [
      { title: "T1", topicTags: ["wasm", "rust"], sensitivity: "public" },
      { title: "T2", topicTags: ["wasm", "python"], sensitivity: "public" },
    ]);
    expect(store.getTopicsForContact("a").sort()).toEqual(["python", "rust", "wasm"]);
  });

  it("getTopicsForContact() returns [] for unknown owners", () => {
    const store = new PublishedLibraryStore({ getFilePath: () => null });
    expect(store.getTopicsForContact("nope")).toEqual([]);
  });

  it("persist() + loadFromDisk() round-trip", async () => {
    const store = new PublishedLibraryStore({ getFilePath: () => libraryPath, now: fixedNow });
    store.setForPeer("a", [{ title: "T1", topicTags: ["a"], sensitivity: "public" }]);
    await store.persist();

    const store2 = new PublishedLibraryStore({ getFilePath: () => libraryPath });
    await store2.loadFromDisk();
    expect(store2.getEntries("a")).toEqual([
      { title: "T1", topicTags: ["a"], sensitivity: "public", publishedAt: "2026-06-30T12:00:00.000Z" },
    ]);
  });

  it("clear() drops all in-memory entries", () => {
    const store = new PublishedLibraryStore({ getFilePath: () => null });
    store.setForPeer("a", [{ title: "T", topicTags: [], sensitivity: "public" }]);
    store.clear();
    expect(store.getEntries()).toEqual([]);
  });
});