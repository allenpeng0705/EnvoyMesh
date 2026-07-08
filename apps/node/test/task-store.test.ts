import { createTaskJournalEntry } from "@envoymesh/protocol";
import {
  createApprovalRequest,
  auditEventForDispatcherDecision,
  createAuditEvent,
  createLocalTaskStore,
} from "@envoymesh/local-store";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

let profileDir: string;

beforeEach(async () => {
  profileDir = await mkdtemp(join(tmpdir(), "envoymesh-task-store-"));
});

afterEach(async () => {
  await rm(profileDir, { recursive: true, force: true });
});

describe("task store", () => {
  it("returns empty collections when journal and audit files do not exist", async () => {
    const store = createLocalTaskStore(profileDir);

    await expect(store.readTaskJournalEntries()).resolves.toEqual([]);
    await expect(store.readAuditEvents()).resolves.toEqual([]);
    await expect(store.readApprovalRequests()).resolves.toEqual([]);
  });

  it("appends and reads task journal entries in order", async () => {
    const store = createLocalTaskStore(profileDir);
    const first = createTaskJournalEntry({
      eventId: "event-1",
      taskId: "task-1",
      mandateId: "mandate-1",
      eventType: "proposed",
      state: "negotiating",
      summary: "Proposed a task.",
      createdAt: "2026-04-27T10:00:00.000Z",
    });
    const second = createTaskJournalEntry({
      eventId: "event-2",
      taskId: "task-1",
      mandateId: "mandate-1",
      eventType: "accepted",
      state: "running",
      summary: "Accepted a task.",
      createdAt: "2026-04-27T10:01:00.000Z",
    });

    await store.appendTaskJournalEntry(first);
    await store.appendTaskJournalEntry(second);

    await expect(store.readTaskJournalEntries()).resolves.toEqual([first, second]);
  });

  it("appends and reads audit events in order", async () => {
    const store = createLocalTaskStore(profileDir);
    // NOTE: `LocalTaskStore.appendAuditEvent` deliberately skips events
    // with `type === "p2p.trace" || type === "message.rejected"` (see
    // packages/local-store/src/index.ts `appendAuditEvent`) — those are
    // classified as transient traces, not persistent audit records. Use
    // `task.handled` and `task.denied` here so the store actually persists
    // them.
    const handled = {
      eventId: "audit-1",
      type: "task.handled",
      intent: "task.propose",
      taskId: "task-1",
      mandateId: "mandate-1",
      outcome: "record",
      summary: "Handled task proposal.",
      createdAt: "2026-04-27T10:00:00.000Z",
    };
    const denied = {
      eventId: "audit-2",
      type: "task.denied",
      intent: "task.propose",
      taskId: "task-2",
      mandateId: "mandate-2",
      outcome: "deny",
      summary: "Denied task proposal.",
      createdAt: "2026-04-27T10:01:00.000Z",
    };

    await store.appendAuditEvent(createAuditEvent(handled));
    await store.appendAuditEvent(createAuditEvent(denied));

    // The store uses JSON.stringify for append and JSON.parse for read, so
    // fields that are `undefined` on the input are dropped from the on-disk
    // JSONL line. The round-trip object therefore has fewer keys than the
    // freshly-created `AuditEvent`. Assert the meaningful keys are preserved
    // and the order is correct.
    const events = await store.readAuditEvents();
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject(handled);
    expect(events[1]).toMatchObject(denied);
  });

  it("appends and reads owner approval requests in order", async () => {
    const store = createLocalTaskStore(profileDir);
    const purchaseApproval = createApprovalRequest({
      approvalId: "approval-1",
      ownerId: "envoy:owner:alice",
      taskId: "task-1",
      mandateId: "mandate-1",
      requestedAction: "purchase",
      reason: "purchase is outside mandate actions",
      createdAt: "2026-04-27T10:00:00.000Z",
    });
    const contactApproval = createApprovalRequest({
      approvalId: "approval-2",
      ownerId: "envoy:owner:alice",
      taskId: "task-1",
      mandateId: "mandate-1",
      requestedAction: "raw_contact_exchange",
      reason: "raw_contact_exchange requires owner approval",
      createdAt: "2026-04-27T10:01:00.000Z",
    });

    await store.appendApprovalRequest(purchaseApproval);
    await store.appendApprovalRequest(contactApproval);

    await expect(store.readApprovalRequests()).resolves.toEqual([
      purchaseApproval,
      contactApproval,
    ]);
  });

  it("updates approval request status", async () => {
    const store = createLocalTaskStore(profileDir);
    const request = createApprovalRequest({
      approvalId: "approval-1",
      ownerId: "envoy:owner:alice",
      taskId: "task-1",
      requestedAction: "purchase",
      reason: "purchase requires owner approval",
      createdAt: "2026-04-27T10:00:00.000Z",
    });

    await store.appendApprovalRequest(request);
    await expect(store.updateApprovalRequestStatus("approval-1", "approved")).resolves.toMatchObject({
      approvalId: "approval-1",
      status: "approved",
    });
    await expect(store.readApprovalRequests()).resolves.toMatchObject([
      {
        approvalId: "approval-1",
        status: "approved",
      },
    ]);
  });

  it("creates audit events from dispatcher decisions", () => {
    const handledAudit = auditEventForDispatcherDecision(
      {
        action: "handled",
        intent: "task.cancel",
        taskId: "task-1",
        mandateId: "mandate-1",
        state: "cancelled",
        journalEntry: createTaskJournalEntry({
          eventId: "event-1",
          taskId: "task-1",
          mandateId: "mandate-1",
          eventType: "cancelled",
          state: "cancelled",
          summary: "Owner cancelled.",
          createdAt: "2026-04-27T10:00:00.000Z",
        }),
      },
      {
        messageId: "message-1",
        remotePeerId: "peer-a",
        createdAt: "2026-04-27T10:00:00.000Z",
      },
    );
    const rejectedAudit = auditEventForDispatcherDecision(
      {
        action: "rejected",
        intent: "task.propose",
        reason: "invalid task.propose payload",
      },
      {
        messageId: "message-2",
        createdAt: "2026-04-27T10:02:00.000Z",
      },
    );

    expect(handledAudit).toMatchObject({
      type: "task.handled",
      intent: "task.cancel",
      taskId: "task-1",
      outcome: "record",
    });
    expect(rejectedAudit).toMatchObject({
      type: "task.rejected",
      intent: "task.propose",
      outcome: "deny",
      summary: "invalid task.propose payload",
    });
  });
});
