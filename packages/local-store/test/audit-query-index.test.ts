import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createAuditEvent, createLocalTaskStore } from "../src/index.js";

describe("createLocalTaskStore audit query index", () => {
  let profileDir: string;

  afterEach(async () => {
    if (profileDir) {
      await rm(profileDir, { recursive: true, force: true });
    }
  });

  it("maintains audit-query-index.jsonl and serves indexed queries", async () => {
    profileDir = await mkdtemp(join(tmpdir(), "envoy-audit-index-"));
    const store = createLocalTaskStore(profileDir);

    await store.appendAuditEvent(
      createAuditEvent({
        type: "message.sent",
        outcome: "record",
        summary: "older row",
        createdAt: "2026-05-19T10:00:00.000Z",
        correlationId: "corr-old",
      }),
    );
    await store.appendAuditEvent(
      createAuditEvent({
        type: "policy.decided",
        outcome: "allow",
        summary: "newer row",
        createdAt: "2026-05-20T10:00:00.000Z",
        correlationId: "corr-new",
        taskId: "task-1",
      }),
    );

    const sinceRows = await store.queryAuditEvents({ since: "2026-05-20T00:00:00.000Z" });
    expect(sinceRows).toHaveLength(1);
    expect(sinceRows[0]?.correlationId).toBe("corr-new");

    const corrRows = await store.queryAuditEvents({ correlationId: "corr-old", limit: 10 });
    expect(corrRows).toHaveLength(1);
    expect(corrRows[0]?.summary).toBe("older row");

    const rebuilt = await store.rebuildAuditQueryIndex();
    expect(rebuilt).toBe(2);
    expect(await store.queryAuditEvents({ limit: 10 })).toHaveLength(2);
  });
});
