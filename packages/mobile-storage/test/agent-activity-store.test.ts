import { describe, expect, it } from "vitest";
import {
  createInMemoryDb,
  createMobileAgentActivityStore,
  mobileStorageSchema,
} from "../src/index.js";

describe("createMobileAgentActivityStore", () => {
  it("appends and lists activity rows newest first", async () => {
    const db = createInMemoryDb();
    for (const sql of mobileStorageSchema()) {
      await db.execute(sql);
    }
    const store = createMobileAgentActivityStore(db);
    await store.append({
      activityId: "a1",
      domain: "social",
      kind: "task_completed",
      summary: "First",
      createdAt: "2026-05-20T10:00:00.000Z",
    });
    await store.append({
      activityId: "a2",
      domain: "knowledge",
      kind: "knowledge_answered",
      summary: "Second",
      createdAt: "2026-05-20T11:00:00.000Z",
    });
    const all = await store.list({ limit: 10 });
    expect(all.map((r) => r.activityId)).toEqual(["a2", "a1"]);
    const socialOnly = await store.list({ domain: "social" });
    expect(socialOnly).toHaveLength(1);
    expect(socialOnly[0]?.summary).toBe("First");
  });
});
