/**
 * Unit tests for the cross-device continuity runtime
 * (Phase 25).
 */
import { mkdtemp, rm, writeFile as fsWriteFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  buildContinuityFilePath,
  completeContinuitySessionViaRuntime,
  ContinuityStore,
  getResumableSessionsViaRuntime,
  startContinuitySessionViaRuntime,
  updateContinuitySessionViaRuntime,
  type ContinuityContext,
} from "../src/node-service-continuity.js";
import type { ContinuitySession } from "../src/continuity-service.js";

let tempDir = "";
let filePath = "";

function makeSession(overrides: Partial<ContinuitySession> = {}): ContinuitySession {
  return {
    sessionId: "s-1",
    correlationId: "c-1",
    description: "doing a thing",
    progress: "in progress",
    currentStep: 0,
    totalSteps: 5,
    originDevice: "device-1",
    lastUpdatedAt: "2026-06-30T00:00:00.000Z",
    active: true,
    ...overrides,
  };
}

function makeContext(
  store: ContinuityStore,
  deviceId = "local-owner",
): ContinuityContext {
  return {
    store,
    getDeviceId: () => deviceId,
  };
}

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "envoy-continuity-test-"));
  filePath = join(tempDir, "continuity-sessions.json");
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

/* ---------- file-path helper ---------- */

describe("buildContinuityFilePath", () => {
  it("returns null when profileDir is null", () => {
    expect(buildContinuityFilePath(null)).toBeNull();
  });
  it("joins profileDir + filename", () => {
    expect(buildContinuityFilePath("/x/y")).toBe("/x/y/continuity-sessions.json");
  });
});

/* ---------- Store ---------- */

describe("ContinuityStore", () => {
  it("loadFromDisk returns [] when file is absent", async () => {
    const store = new ContinuityStore({ getFilePath: () => filePath });
    const out = await store.loadFromDisk();
    expect(out).toEqual([]);
  });

  it("loadFromDisk drops malformed entries", async () => {
    await fsWriteFile(
      filePath,
      JSON.stringify({
        version: "0.1",
        sessions: [
          { sessionId: "ok", description: "valid" },
          { sessionId: "missing-desc" }, // missing description
          { notAValidEntry: true },
          "string-instead-of-object",
        ],
      }),
    );
    const store = new ContinuityStore({ getFilePath: () => filePath });
    const out = await store.loadFromDisk();
    expect(out).toHaveLength(1);
    expect(out[0]?.sessionId).toBe("ok");
  });

  it("list() returns a defensive copy", async () => {
    const store = new ContinuityStore({ getFilePath: () => filePath });
    await store.loadFromDisk();
    await store.upsert(makeSession());
    const snapshot = store.list();
    snapshot.pop();
    expect(store.list()).toHaveLength(1);
  });

  it("upsert replaces an existing session with the same id", async () => {
    const store = new ContinuityStore({ getFilePath: () => filePath });
    await store.loadFromDisk();
    await store.upsert(makeSession({ sessionId: "s-1", currentStep: 1 }));
    await store.upsert(makeSession({ sessionId: "s-1", currentStep: 2 }));
    const all = store.list();
    expect(all).toHaveLength(1);
    expect(all[0]?.currentStep).toBe(2);
  });

  it("upsert persists the full list to disk", async () => {
    const store = new ContinuityStore({ getFilePath: () => filePath });
    await store.loadFromDisk();
    await store.upsert(makeSession({ sessionId: "s-1" }));
    await store.upsert(makeSession({ sessionId: "s-2" }));
    // Re-open from disk to confirm
    const store2 = new ContinuityStore({ getFilePath: () => filePath });
    const out = await store2.loadFromDisk();
    expect(out.map((s) => s.sessionId).sort()).toEqual(["s-1", "s-2"]);
  });

  it("setAll overwrites the in-memory list and persists", async () => {
    const store = new ContinuityStore({ getFilePath: () => filePath });
    await store.loadFromDisk();
    await store.upsert(makeSession({ sessionId: "old" }));
    await store.setAll([makeSession({ sessionId: "new" })]);
    expect(store.list().map((s) => s.sessionId)).toEqual(["new"]);
  });

  it("clear() drops all in-memory entries", () => {
    const store = new ContinuityStore({ getFilePath: () => filePath });
    store.clear();
    expect(store.list()).toEqual([]);
  });

  it("upsert is a no-op (no persistence) when getFilePath returns null", async () => {
    const store = new ContinuityStore({ getFilePath: () => null });
    await expect(store.upsert(makeSession())).resolves.toBeUndefined();
    expect(store.list()).toHaveLength(1);
  });
});

/* ---------- High-level operations ---------- */

describe("startContinuitySessionViaRuntime", () => {
  it("creates a session, persists it, and returns it with deviceType applied", async () => {
    const store = new ContinuityStore({ getFilePath: () => filePath });
    const ctx = makeContext(store);
    const session = await startContinuitySessionViaRuntime(ctx, "researching", {
      deviceType: "phone",
    });
    expect(session.description).toBe("researching");
    expect(session.deviceType).toBe("phone");
    expect(session.active).toBe(true);
    expect(session.originDevice).toBe("phone");
    // Persisted to store
    expect(store.list().map((s) => s.sessionId)).toEqual([session.sessionId]);
  });

  it("falls back to getDeviceId() when deviceType is not provided", async () => {
    const store = new ContinuityStore({ getFilePath: () => filePath });
    const ctx = makeContext(store, "laptop");
    const session = await startContinuitySessionViaRuntime(ctx, "x");
    expect(session.originDevice).toBe("laptop");
    expect(session.deviceType).toBeUndefined();
  });
});

describe("updateContinuitySessionViaRuntime", () => {
  it("updates the matching active session and persists it", async () => {
    const store = new ContinuityStore({ getFilePath: () => filePath });
    await store.loadFromDisk();
    const started = await startContinuitySessionViaRuntime(makeContext(store), "x");
    const updated = await updateContinuitySessionViaRuntime(
      makeContext(store),
      started.sessionId,
      { progress: "halfway", currentStep: 2 },
    );
    expect(updated?.progress).toBe("halfway");
    expect(updated?.currentStep).toBe(2);
    expect(store.list()[0]?.progress).toBe("halfway");
  });

  it("returns null when no matching active session", async () => {
    const store = new ContinuityStore({ getFilePath: () => filePath });
    await store.loadFromDisk();
    const out = await updateContinuitySessionViaRuntime(makeContext(store), "nope", {
      progress: "x",
    });
    expect(out).toBeNull();
  });
});

describe("completeContinuitySessionViaRuntime", () => {
  it("marks the matching session as inactive and persists it", async () => {
    const store = new ContinuityStore({ getFilePath: () => filePath });
    await store.loadFromDisk();
    const started = await startContinuitySessionViaRuntime(makeContext(store), "x");
    await completeContinuitySessionViaRuntime(makeContext(store), started.sessionId);
    const all = store.list();
    expect(all[0]?.active).toBe(false);
  });

  it("no-ops when the session does not exist", async () => {
    const store = new ContinuityStore({ getFilePath: () => filePath });
    await store.loadFromDisk();
    await expect(
      completeContinuitySessionViaRuntime(makeContext(store), "nope"),
    ).resolves.toBeUndefined();
  });
});

describe("getResumableSessionsViaRuntime", () => {
  it("returns active sessions sorted by lastUpdatedAt desc", async () => {
    const store = new ContinuityStore({ getFilePath: () => filePath });
    await store.loadFromDisk();
    await store.setAll([
      makeSession({ sessionId: "old", lastUpdatedAt: "2026-01-01T00:00:00.000Z" }),
      makeSession({ sessionId: "new", lastUpdatedAt: "2026-06-30T00:00:00.000Z" }),
      makeSession({
        sessionId: "done",
        lastUpdatedAt: "2026-03-01T00:00:00.000Z",
        active: false,
      }),
    ]);
    const out = await getResumableSessionsViaRuntime(makeContext(store));
    expect(out.map((s) => s.sessionId)).toEqual(["new", "old"]);
  });
});