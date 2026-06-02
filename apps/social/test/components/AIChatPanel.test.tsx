/**
 * @vitest-environment jsdom
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { AIChatPanel } from "../../src/components/views/AIChatPanel.js";
import { renderWithI18n } from "../helpers/render-with-i18n.js";

const runOwnerAgentTurn = vi.fn();
const approvePendingApproval = vi.fn();
const rejectPendingApproval = vi.fn();
const sendSyncStateUpdate = vi.fn().mockResolvedValue({ ok: true, recipients: 0 });
const activityHandlers = new Set<(data: unknown) => void>();
const on = vi.fn((event: string, handler: (data: unknown) => void) => {
  if (event === "agent:activity") {
    activityHandlers.add(handler);
  }
  return () => {
    activityHandlers.delete(handler);
  };
});

let nodeConfig = {
  modelProviders: { mode: "mock" as const, modelName: "test-model" },
};

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useNodeService: () => ({
    runOwnerAgentTurn,
    approvePendingApproval,
    rejectPendingApproval,
    sendSyncStateUpdate,
    on,
  }),
}));

let nodeStatus: "offline" | "starting" | "running" | "stopping" = "running";

vi.mock("../../src/context/NodeStateContext.js", () => ({
  useNodeState: () => ({ nodeConfig, nodeStatus }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  activityHandlers.clear();
});

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  nodeStatus = "running";
  nodeConfig = { modelProviders: { mode: "mock", modelName: "test-model" } };
  approvePendingApproval.mockResolvedValue({ ok: true, messageId: "msg-1" });
  rejectPendingApproval.mockResolvedValue({ ok: true });
  runOwnerAgentTurn.mockResolvedValue({
    answer: "Found 1 file(s) in your library:\n• report.txt",
    domain: "document",
    intent: "list_library",
    toolsUsed: ["mesh.library_list"],
  });
});

describe("AIChatPanel", () => {
  it("calls runOwnerAgentTurn and displays the agent answer", async () => {
    renderWithI18n(<AIChatPanel />);

    const input = screen.getByPlaceholderText(/Ask Envoy AI anything/i);
    fireEvent.change(input, { target: { value: "list my library files" } });
    fireEvent.click(screen.getByRole("button", { name: /^Send$/i }));

    await waitFor(() => {
      expect(runOwnerAgentTurn).toHaveBeenCalledWith("list my library files");
    });
    expect(await screen.findByText(/report\.txt/i)).toBeDefined();
  });

  it("does not call runOwnerAgentTurn while node is starting", async () => {
    nodeStatus = "starting";
    renderWithI18n(<AIChatPanel />);

    const input = screen.getByPlaceholderText(/Ask Envoy AI anything/i);
    fireEvent.change(input, { target: { value: "hello" } });
    fireEvent.click(screen.getByRole("button", { name: /^Send$/i }));

    expect(await screen.findByText(/Node is still starting/i)).toBeDefined();
    expect(runOwnerAgentTurn).not.toHaveBeenCalled();
  });

  it("shows error message when runOwnerAgentTurn fails", async () => {
    runOwnerAgentTurn.mockRejectedValue(new Error("Node not initialized"));
    renderWithI18n(<AIChatPanel />);

    const input = screen.getByPlaceholderText(/Ask Envoy AI anything/i);
    fireEvent.change(input, { target: { value: "who has golden" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(await screen.findByText(/Error: Node not initialized/i)).toBeDefined();
  });

  it("shows job and domain chips when turn includes job metadata", async () => {
    runOwnerAgentTurn.mockResolvedValue({
      answer: "Started document acquisition.",
      domain: "document",
      intent: "document.published-library",
      toolsUsed: ["startDocumentAcquisitionJob"],
      jobId: "job-doc-abc12345",
      correlationId: "corr-1",
    });
    renderWithI18n(<AIChatPanel onOpenActivity={vi.fn()} />);

    const input = screen.getByPlaceholderText(/Ask Envoy AI anything/i);
    fireEvent.change(input, { target: { value: "find quarterly report" } });
    fireEvent.click(screen.getByRole("button", { name: /^Send$/i }));

    expect(await screen.findByText(/Started document acquisition/i)).toBeDefined();
    expect(screen.getByText(/Documents/i)).toBeDefined();
    expect(screen.getByText(/Job job-doc-/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /View in Activity/i })).toBeDefined();
  });

  it("renders inline approve/reject for pending approval items", async () => {
    runOwnerAgentTurn.mockResolvedValue({
      answer: "I need your approval before sending this message.",
      domain: "social",
      intent: "social.intro",
      toolsUsed: ["mesh.intro.broadcast_search"],
      pendingApproval: true,
      approvalItems: [
        {
          id: "appr-1",
          actionType: "send_chat",
          title: "Send draft reply",
          description: "Reply to Alex",
          draftContent: "Thanks for reaching out!",
          priority: "normal",
          requestedAt: new Date().toISOString(),
        },
      ],
    });
    renderWithI18n(<AIChatPanel />);

    const input = screen.getByPlaceholderText(/Ask Envoy AI anything/i);
    fireEvent.change(input, { target: { value: "find hiking friends" } });
    fireEvent.click(screen.getByRole("button", { name: /^Send$/i }));

    expect(await screen.findByText(/Send draft reply/i)).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: /^Approve$/i }));

    await waitFor(() => {
      expect(approvePendingApproval).toHaveBeenCalledWith("appr-1");
    });
    expect(await screen.findByText(/Approved/i)).toBeDefined();
  });

  it("updates job stage chip when agent:activity arrives for tracked job", async () => {
    runOwnerAgentTurn.mockResolvedValue({
      answer: "Started capability provider job.",
      domain: "service",
      intent: "service.task-negotiation",
      toolsUsed: ["mesh.capability_provider.start"],
      jobId: "job-cap-live-1",
      correlationId: "corr-cap-live",
    });
    renderWithI18n(<AIChatPanel />);

    const input = screen.getByPlaceholderText(/Ask Envoy AI anything/i);
    fireEvent.change(input, { target: { value: "find a rust expert" } });
    fireEvent.click(screen.getByRole("button", { name: /^Send$/i }));

    expect(await screen.findByText(/Started capability provider job/i)).toBeDefined();
    expect(screen.getByText(/Job job-cap-/i)).toBeDefined();

    for (const handler of activityHandlers) {
      handler({
        activityId: "act-1",
        taskId: "job-cap-live-1",
        kind: "capability_provider_stage",
        domain: "research",
        summary: "executing: task.propose sent",
        createdAt: new Date().toISOString(),
      });
    }

    expect(await screen.findByText(/Stage: executing/i)).toBeDefined();
  });
});
