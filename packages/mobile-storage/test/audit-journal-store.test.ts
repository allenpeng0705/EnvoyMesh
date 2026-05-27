import { describe, expect, it } from "vitest";
import {
  createInMemoryDb,
  createMobileAuditJournalStore,
  createMobileTaskJournalStore,
  createMobileAgentCardStore,
  mobileStorageSchema,
} from "../src/index.js";

describe("mobile audit / task journal / agent card stores", () => {
  it("lists audit and task journal rows by correlationId and taskId", async () => {
    const db = createInMemoryDb();
    for (const sql of mobileStorageSchema()) {
      await db.execute(sql);
    }
    const audit = createMobileAuditJournalStore(db);
    const journal = createMobileTaskJournalStore(db);
    const cards = createMobileAgentCardStore(db);

    await audit.append({
      eventId: "audit-1",
      type: "task.handled",
      createdAt: "2026-05-20T10:00:00.000Z",
      intent: "task.propose",
      taskId: "task-1",
      correlationId: "corr-1",
      outcome: "record",
      summary: "proposed work",
    });
    await journal.append({
      eventId: "journal-1",
      taskId: "task-1",
      eventType: "proposed",
      summary: "proposed work",
      createdAt: "2026-05-20T10:00:00.000Z",
      mandateId: "mandate-1",
    });
    await cards.upsert({
      ownerId: "envoy:owner:bob",
      cardJson: JSON.stringify({
        version: "0.1",
        ownerId: "envoy:owner:bob",
        displayName: "Bob",
        nodeProfile: "primary",
        capabilities: ["task.execute"],
      }),
      cachedAt: "2026-05-20T10:00:00.000Z",
      sourceAgentPeerId: "envoy_agent_bob",
    });

    const auditRows = await audit.list({ correlationId: "corr-1", taskId: "task-1" });
    const journalRows = await journal.list({ taskId: "task-1" });
    const cardRows = await cards.list();

    expect(auditRows).toHaveLength(1);
    expect(journalRows[0]?.eventType).toBe("proposed");
    expect(cardRows[0]?.ownerId).toBe("envoy:owner:bob");
  });
});
