import { describe, expect, it } from "vitest";
import {
  formatA2aChatSystemLine,
  shouldPostA2aChatLine,
  shouldPushAgentActivity,
} from "../src/agent-visibility.js";

describe("shouldPushAgentActivity", () => {
  it("silent mode suppresses push", () => {
    expect(
      shouldPushAgentActivity("task_progress", { social: "silent" }, "social"),
    ).toBe(false);
  });

  it("brief mode allows milestones only", () => {
    expect(
      shouldPushAgentActivity("task_completed", { social: "brief" }, "social"),
    ).toBe(true);
    expect(
      shouldPushAgentActivity("task_progress", { social: "brief" }, "social"),
    ).toBe(false);
  });

  it("approval mode allows reports and approval_needed", () => {
    expect(
      shouldPushAgentActivity("report_received", { knowledge: "approval" }, "knowledge"),
    ).toBe(true);
    expect(
      shouldPushAgentActivity("task_started", { knowledge: "approval" }, "knowledge"),
    ).toBe(false);
  });
});

describe("shouldPostA2aChatLine", () => {
  it("off never posts", () => {
    expect(shouldPostA2aChatLine("task_completed", "off")).toBe(false);
  });

  it("milestones_only filters progress", () => {
    expect(shouldPostA2aChatLine("task_completed", "milestones_only")).toBe(true);
    expect(shouldPostA2aChatLine("intro_sync", "milestones_only")).toBe(false);
  });

  it("all_reports posts any kind", () => {
    expect(shouldPostA2aChatLine("intro_sync", "all_reports")).toBe(true);
  });
});

describe("formatA2aChatSystemLine", () => {
  it("includes summary and optional context", () => {
    const line = formatA2aChatSystemLine({
      kind: "task_completed",
      summary: "Research done",
      remoteOwnerId: "envoy:owner:abc",
      taskId: "task_1",
    });
    expect(line).toContain("Research done");
    expect(line).toContain("envoy:owner:abc");
    expect(line).toContain("task_1");
  });
});
