import { describe, expect, it } from "vitest";
import { createReport, createReportCreatePayload } from "@envoymesh/protocol";
import { ownerReportActivity } from "../src/agent-activity-hooks.js";

describe("ownerReportActivity", () => {
  it("maps report to local activity row", () => {
    const report = createReport({
      reportId: "report_1",
      taskId: "task_1",
      ownerId: "envoy:owner:abc",
      status: "completed",
      mode: "brief",
      summary: "Found two copies of the book.",
      evidence: [{ type: "peer_response", source: "envoy:owner:peer", sensitivity: "public" }],
      suggestedActions: [
        { label: "Continue", action: "task.continue", requiresApproval: true },
      ],
      createdAt: "2026-05-20T12:00:00.000Z",
    });
    const payload = createReportCreatePayload(report);
    const row = ownerReportActivity(payload.report);
    expect(row.kind).toBe("report_received");
    expect(row.summary).toContain("Found two copies");
    expect(row.requiresOwnerAction).toBe(true);
    expect(row.taskId).toBe("task_1");
  });
});
