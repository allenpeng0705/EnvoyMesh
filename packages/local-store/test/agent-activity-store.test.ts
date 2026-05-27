import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, afterEach } from "vitest";
import { createLocalAgentActivityStore } from "../src/agent-activity-store.js";

describe("createLocalAgentActivityStore", () => {
  let profileDir: string;

  afterEach(async () => {
    if (profileDir) {
      await rm(profileDir, { recursive: true, force: true });
    }
  });

  it("appends and lists activity rows newest-first", async () => {
    profileDir = await mkdtemp(join(tmpdir(), "envoy-activity-"));
    const store = createLocalAgentActivityStore(profileDir);
    await store.append({
      activityId: "a1",
      domain: "social",
      kind: "task_started",
      summary: "Started intro sync",
      createdAt: "2026-05-20T10:00:00.000Z",
    });
    await store.append({
      activityId: "a2",
      domain: "research",
      kind: "task_completed",
      summary: "Finished research task",
      createdAt: "2026-05-20T11:00:00.000Z",
    });

    const rows = await store.list();
    expect(rows).toHaveLength(2);
    expect(rows[0]?.activityId).toBe("a2");
    expect(rows[1]?.activityId).toBe("a1");
  });

  it("filters by domain and since", async () => {
    profileDir = await mkdtemp(join(tmpdir(), "envoy-activity-"));
    const store = createLocalAgentActivityStore(profileDir);
    await store.append({
      activityId: "old",
      domain: "knowledge",
      kind: "knowledge_answered",
      summary: "old",
      createdAt: "2026-05-19T10:00:00.000Z",
    });
    await store.append({
      activityId: "new",
      domain: "social",
      kind: "intro_sync",
      summary: "new",
      createdAt: "2026-05-20T10:00:00.000Z",
    });

    const social = await store.list({ domain: "social" });
    expect(social).toHaveLength(1);
    expect(social[0]?.activityId).toBe("new");

    const since = await store.countSince("2026-05-20T00:00:00.000Z");
    expect(since).toBe(1);
  });

  it("filters by remoteOwnerId and until", async () => {
    profileDir = await mkdtemp(join(tmpdir(), "envoy-activity-"));
    const store = createLocalAgentActivityStore(profileDir);
    await store.append({
      activityId: "bob",
      domain: "research",
      kind: "task_progress",
      summary: "with bob",
      remoteOwnerId: "envoy:owner:bob",
      createdAt: "2026-05-20T10:00:00.000Z",
    });
    await store.append({
      activityId: "carol",
      domain: "research",
      kind: "task_progress",
      summary: "with carol",
      remoteOwnerId: "envoy:owner:carol",
      createdAt: "2026-05-20T11:00:00.000Z",
    });

    const bobOnly = await store.list({ remoteOwnerId: "envoy:owner:bob" });
    expect(bobOnly).toHaveLength(1);
    expect(bobOnly[0]?.activityId).toBe("bob");

    const beforeNoon = await store.list({ until: "2026-05-20T11:00:00.000Z" });
    expect(beforeNoon.map((row) => row.activityId)).toEqual(["bob"]);
  });
});
