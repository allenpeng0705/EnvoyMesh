import { describe, expect, it } from "vitest";
import { createReport } from "@envoymesh/protocol";
import { mapOwnerReportToActivity, mapTaskJournalToActivity } from "../src/agent-activity-map.js";

describe("mapTaskJournalToActivity", () => {
  it("maps journal entry to activity row", () => {
    const row = mapTaskJournalToActivity(
      {
        taskId: "task_1",
        eventType: "result_received",
        summary: "Task finished",
        createdAt: "2026-05-20T12:00:00.000Z",
        relatedMessageId: "msg_1",
      },
      {
        messageId: "msg_env",
        correlationId: "corr_1",
        senderPeerId: "envoy_agent_abc",
        senderRole: "agent",
      },
      "act_1",
    );
    expect(row.kind).toBe("task_completed");
    expect(row.remoteActorRole).toBe("agent");
    expect(row.activityId).toBe("act_1");
  });
});

describe("mapOwnerReportToActivity", () => {
  it("flags requiresOwnerAction from suggested actions", () => {
    const report = createReport({
      reportId: "r1",
      taskId: "task_1",
      ownerId: "envoy:owner:abc",
      status: "completed",
      mode: "brief",
      summary: "Done",
      evidence: [],
      suggestedActions: [{ label: "Approve", action: "task.continue", requiresApproval: true }],
      createdAt: "2026-05-20T12:00:00.000Z",
    });
    const row = mapOwnerReportToActivity(report, "act_2");
    expect(row.requiresOwnerAction).toBe(true);
    expect(row.kind).toBe("report_received");
  });
});
