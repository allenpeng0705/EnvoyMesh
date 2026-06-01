/**
 * @vitest-environment jsdom
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type { AgentActivityRecord, AuditEventSummary, TaskJournalSummary } from "@envoymesh/api";
import { ActivityView } from "../../src/components/views/ActivityView.js";
import { renderWithI18n } from "../helpers/render-with-i18n.js";

const sampleRow: AgentActivityRecord = {
  activityId: "act-ui-1",
  domain: "social",
  kind: "task_started",
  summary: "Your agent started a task with Bob's agent",
  taskId: "task-ui-1",
  correlationId: "corr-ui-abcdef123456",
  remoteOwnerId: "envoy:owner:bob",
  createdAt: "2026-05-20T12:00:00.000Z",
};

const sampleAudit: AuditEventSummary = {
  eventId: "audit-ui-1",
  type: "message.verified",
  createdAt: "2026-05-20T12:00:01.000Z",
  outcome: "allow",
  summary: "Verified task.propose",
  taskId: "task-ui-1",
  correlationId: "corr-ui-abcdef123456",
};

const sampleJournal: TaskJournalSummary = {
  eventId: "journal-ui-1",
  taskId: "task-ui-1",
  eventType: "proposed",
  summary: "Task proposed on mesh",
  createdAt: "2026-05-20T12:00:02.000Z",
};

const listAgentActivity = vi.fn();
const listAuditEvents = vi.fn();
const listTaskJournalEntries = vi.fn();
const getBonds = vi.fn();
const on = vi.fn();

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useNodeService: () => ({
    listAgentActivity,
    listAuditEvents,
    listTaskJournalEntries,
    getBonds,
    on,
  }),
}));

beforeEach(() => {
  listAgentActivity.mockResolvedValue([]);
  listAuditEvents.mockResolvedValue([]);
  listTaskJournalEntries.mockResolvedValue([]);
  getBonds.mockResolvedValue([
    {
      peerOwnerId: "envoy:owner:bob",
      level: "direct",
      displayName: "Bob",
      createdAt: "2026-05-20T00:00:00.000Z",
    },
  ]);
  on.mockReturnValue(() => {});
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ActivityView — Phase 13D", () => {
  it("shows empty state when no activity rows", async () => {
    renderWithI18n(<ActivityView />);

    expect(await screen.findByText(/No agent activity yet/i)).toBeDefined();
  });

  it("lists activity rows with kind and summary", async () => {
    listAgentActivity.mockResolvedValue([sampleRow]);
    renderWithI18n(<ActivityView />);

    expect(await screen.findByText(/Task started/i)).toBeDefined();
    expect(screen.getByText(sampleRow.summary)).toBeDefined();
    expect(screen.getByText(/task: task-ui-1/i)).toBeDefined();
  });

  it("opens audit drill-down when a row is selected", async () => {
    listAgentActivity.mockResolvedValue([sampleRow]);
    listAuditEvents.mockResolvedValue([sampleAudit]);
    listTaskJournalEntries.mockResolvedValue([sampleJournal]);

    renderWithI18n(<ActivityView />);

    fireEvent.click(await screen.findByRole("button", { name: new RegExp(sampleRow.summary.slice(0, 20)) }));

    await waitFor(() => {
      expect(listAuditEvents).toHaveBeenCalledWith({
        correlationId: sampleRow.correlationId,
        taskId: sampleRow.taskId,
        limit: 50,
      });
      expect(listTaskJournalEntries).toHaveBeenCalledWith({
        taskId: sampleRow.taskId,
        limit: 50,
      });
    });

    expect(await screen.findByText(/Task journal/i)).toBeDefined();
    expect(screen.getByText(/Audit events/i)).toBeDefined();
    expect(screen.getByText(/Task proposed on mesh/i)).toBeDefined();
    expect(screen.getByText(/Verified task\.propose/i)).toBeDefined();
  });

  it("passes contact and date filters to listAgentActivity", async () => {
    listAgentActivity.mockResolvedValue([sampleRow]);
    renderWithI18n(<ActivityView />);

    await screen.findByText(sampleRow.summary);

    fireEvent.change(screen.getByLabelText(/Contact/i), {
      target: { value: "envoy:owner:bob" },
    });

    await waitFor(() => {
      expect(listAgentActivity).toHaveBeenCalledWith(
        expect.objectContaining({ remoteOwnerId: "envoy:owner:bob" }),
      );
    });

    fireEvent.change(screen.getByLabelText(/When/i), {
      target: { value: "today" },
    });

    await waitFor(() => {
      expect(listAgentActivity).toHaveBeenLastCalledWith(
        expect.objectContaining({
          remoteOwnerId: "envoy:owner:bob",
          since: expect.any(String),
          until: expect.any(String),
        }),
      );
    });
  });
});
