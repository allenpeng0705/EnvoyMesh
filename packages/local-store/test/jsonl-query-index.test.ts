import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createJsonlIndexAppender,
  queryJsonlIndex,
  readJsonlIndex,
  rebuildJsonlIndex,
  type JsonlIndexEntry,
} from "../src/jsonl-query-index.js";

describe("jsonl-query-index", () => {
  let workDir: string;

  afterEach(async () => {
    if (workDir) {
      await rm(workDir, { recursive: true, force: true });
    }
  });

  it("appends and queries by time range and correlationId", async () => {
    workDir = await mkdtemp(join(tmpdir(), "envoy-index-"));
    const indexPath = join(workDir, "audit-query-index.jsonl");
    const append = createJsonlIndexAppender(indexPath);

    const rows: JsonlIndexEntry[] = [
      {
        id: "e1",
        createdAt: "2026-05-19T10:00:00.000Z",
        correlationId: "corr-a",
        payload: { type: "message.sent" },
      },
      {
        id: "e2",
        createdAt: "2026-05-20T10:00:00.000Z",
        correlationId: "corr-b",
        taskId: "task-1",
        payload: { type: "policy.decided" },
      },
      {
        id: "e3",
        createdAt: "2026-05-20T11:00:00.000Z",
        correlationId: "corr-b",
        payload: { type: "message.verified" },
      },
    ];

    for (const row of rows) {
      await append(row);
    }

    const loaded = await readJsonlIndex(indexPath);
    expect(loaded).toHaveLength(3);

    const sinceOnly = queryJsonlIndex(loaded, { since: "2026-05-20T00:00:00.000Z" });
    expect(sinceOnly.map((row) => row.id)).toEqual(["e3", "e2"]);

    const corrOnly = queryJsonlIndex(loaded, { correlationId: "corr-b" });
    expect(corrOnly.map((row) => row.id)).toEqual(["e3", "e2"]);

    const taskOnly = queryJsonlIndex(loaded, { taskId: "task-1" });
    expect(taskOnly.map((row) => row.id)).toEqual(["e2"]);
  });

  it("rebuildJsonlIndex rewrites the index atomically from source rows", async () => {
    workDir = await mkdtemp(join(tmpdir(), "envoy-index-"));
    const indexPath = join(workDir, "activity-query-index.jsonl");
    const source = [
      { activityId: "a1", createdAt: "2026-05-20T10:00:00.000Z" },
      { activityId: "a2", createdAt: "2026-05-20T11:00:00.000Z" },
    ];

    const count = await rebuildJsonlIndex(source, indexPath, (row) => ({
      id: row.activityId,
      createdAt: row.createdAt,
      payload: {},
    }));

    expect(count).toBe(2);
    const contents = await readFile(indexPath, "utf8");
    expect(contents.split("\n").filter(Boolean)).toHaveLength(2);
  });
});
