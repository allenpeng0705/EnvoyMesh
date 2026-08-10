/**
 * @vitest-environment jsdom
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { AIChatPanel } from "../../src/components/views/AIChatPanel.js";
import { renderWithI18n } from "../helpers/render-with-i18n.js";

const runOwnerAgentTurn = vi.fn();
const listChatHistory = vi.fn();
const deleteChatMessage = vi.fn();
const clearChatHistory = vi.fn();
const approvePendingApproval = vi.fn();
const rejectPendingApproval = vi.fn();
const sendSyncStateUpdate = vi.fn().mockResolvedValue({ ok: true, recipients: 0 });
const activityHandlers = new Set<(data: unknown) => void>();
const chatMessageHandlers = new Set<(data: unknown) => void>();
const on = vi.fn((event: string, handler: (data: unknown) => void) => {
  if (event === "agent:activity") {
    activityHandlers.add(handler);
  }
  if (event === "chat:message") {
    chatMessageHandlers.add(handler);
  }
  return () => {
    activityHandlers.delete(handler);
    chatMessageHandlers.delete(handler);
  };
});

const getEnvoyLocalStatus = vi.fn().mockResolvedValue({
  enabled: false,
  running: false,
  activeModelId: undefined,
});
const listPendingApprovals = vi.fn().mockResolvedValue([]);
const getNodeConfig = vi.fn().mockResolvedValue({});
const generateMeshIntelligenceReport = vi.fn();
const saveWebSearchEnabled = vi.fn();

const mockNodeService = {
  runOwnerAgentTurn,
  listChatHistory,
  deleteChatMessage,
  clearChatHistory,
  approvePendingApproval,
  rejectPendingApproval,
  sendSyncStateUpdate,
  getEnvoyLocalStatus,
  listPendingApprovals,
  getNodeConfig,
  generateMeshIntelligenceReport,
  saveWebSearchEnabled,
  on,
};

let storedHistory: Array<Record<string, unknown>> = [];

let nodeConfig = {
  modelProviders: { mode: "mock" as const, modelName: "test-model" },
};

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useNodeService: () => mockNodeService,
  useIsInProcessMobileNode: () => false,
}));

let nodeStatus: "offline" | "starting" | "running" | "stopping" = "running";
const humanProfile = { ownerId: "envoy:owner:test" };

vi.mock("../../src/context/NodeStateContext.js", () => ({
  useNodeState: () => ({
    nodeConfig,
    nodeStatus,
    humanProfile,
    bridgeStatus: null,
    connectionStatus: null,
    bonds: [],
  }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  activityHandlers.clear();
  chatMessageHandlers.clear();
});

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  localStorage.clear();
  nodeStatus = "running";
  storedHistory = [];
  nodeConfig = { modelProviders: { mode: "mock", modelName: "test-model" } };
  listChatHistory.mockImplementation(async () => storedHistory);
  deleteChatMessage.mockResolvedValue({ ok: true });
  clearChatHistory.mockResolvedValue({ deletedCount: 0 });
  approvePendingApproval.mockResolvedValue({ ok: true, messageId: "msg-1" });
  rejectPendingApproval.mockResolvedValue({ ok: true });
  runOwnerAgentTurn.mockImplementation(async () => {
    storedHistory = [
      {
        messageId: "u-1",
        sender: { ownerId: "envoy:owner:test", nodeId: "n1", displayName: "Me" },
        recipient: { ownerId: "__envoy_ai__", nodeId: "agent" },
        content: { text: "list my library files" },
        metadata: { timestamp: new Date().toISOString() },
        signature: "",
      },
      {
        messageId: "a-1",
        sender: { ownerId: "__envoy_ai__", nodeId: "agent", displayName: "AI", actorRole: "agent" },
        recipient: { ownerId: "envoy:owner:test", nodeId: "n1" },
        content: { text: "Found 1 file(s) in your library:\n• report.txt" },
        metadata: {
          timestamp: new Date().toISOString(),
          deliveryChannel: "ai",
          assistantTurn: {
            domain: "document",
            intent: "list_library",
          },
        },
        signature: "",
      },
    ];
    return {
      answer: "Found 1 file(s) in your library:\n• report.txt",
      domain: "document",
      intent: "list_library",
      toolsUsed: ["mesh.library_list"],
    };
  });
});

describe("AIChatPanel", () => {
  it("calls runOwnerAgentTurn and displays the agent answer", async () => {
    renderWithI18n(<AIChatPanel />);

    const input = screen.getByPlaceholderText(/Ask Envoy AI anything/i);
    fireEvent.change(input, { target: { value: "list my library files" } });
    fireEvent.click(screen.getByRole("button", { name: /^Send$/i }));

    await waitFor(() => {
      // The component calls `runOwnerAgentTurn(outbound, { humanMessageId, locale })`
      // — two args: the user message and an options object. Verify the
      // first arg contains the user's text.
      expect(runOwnerAgentTurn).toHaveBeenCalled();
      const [outbound] = runOwnerAgentTurn.mock.calls[0] ?? [];
      expect(outbound?.text ?? outbound).toContain("list my library files");
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
    runOwnerAgentTurn.mockReset();
    runOwnerAgentTurn.mockImplementation(() =>
      Promise.reject(new Error("Node not initialized")),
    );
    renderWithI18n(<AIChatPanel />);

    const input = screen.getByPlaceholderText(/Ask Envoy AI anything/i);
    fireEvent.change(input, { target: { value: "who has golden" } });
    fireEvent.click(screen.getByRole("button", { name: /^Send$/i }));

    expect(await screen.findByText(/Error: Node not initialized/i)).toBeDefined();
  });

  it("shows job and domain chips when turn includes job metadata", async () => {
    runOwnerAgentTurn.mockImplementation(async () => {
      storedHistory = [
        {
          messageId: "u-job",
          sender: { ownerId: "envoy:owner:test", nodeId: "n1", displayName: "Me" },
          recipient: { ownerId: "__envoy_ai__", nodeId: "agent" },
          content: { text: "find quarterly report" },
          metadata: { timestamp: new Date().toISOString() },
          signature: "",
        },
        {
          messageId: "a-job",
          sender: { ownerId: "__envoy_ai__", nodeId: "agent", displayName: "AI", actorRole: "agent" },
          recipient: { ownerId: "envoy:owner:test", nodeId: "n1" },
          content: { text: "Started document acquisition." },
          metadata: {
            timestamp: new Date().toISOString(),
            deliveryChannel: "ai",
            assistantTurn: {
              domain: "document",
              intent: "document.published-library",
              jobId: "job-doc-abc12345",
              correlationId: "corr-1",
            },
          },
          signature: "",
        },
      ];
      return {
        answer: "Started document acquisition.",
        domain: "document",
        intent: "document.published-library",
        toolsUsed: ["startDocumentAcquisitionJob"],
        jobId: "job-doc-abc12345",
        correlationId: "corr-1",
      };
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
    runOwnerAgentTurn.mockImplementation(async () => {
      storedHistory = [
        {
          messageId: "u-appr",
          sender: { ownerId: "envoy:owner:test", nodeId: "n1", displayName: "Me" },
          recipient: { ownerId: "__envoy_ai__", nodeId: "agent" },
          content: { text: "find hiking friends" },
          metadata: { timestamp: new Date().toISOString() },
          signature: "",
        },
        {
          messageId: "a-appr",
          sender: { ownerId: "__envoy_ai__", nodeId: "agent", displayName: "AI", actorRole: "agent" },
          recipient: { ownerId: "envoy:owner:test", nodeId: "n1" },
          content: { text: "I need your approval before sending this message." },
          metadata: { timestamp: new Date().toISOString(), deliveryChannel: "ai" },
          signature: "",
        },
      ];
      return {
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
      };
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
    expect(await screen.findByText(/Approved/i, { timeout: 3000 })).toBeDefined();
  });

  it("updates job stage chip when agent:activity arrives for tracked job", async () => {
    runOwnerAgentTurn.mockImplementation(async () => {
      storedHistory = [
        {
          messageId: "u-cap",
          sender: { ownerId: "envoy:owner:test", nodeId: "n1", displayName: "Me" },
          recipient: { ownerId: "__envoy_ai__", nodeId: "agent" },
          content: { text: "find a rust expert" },
          metadata: { timestamp: new Date().toISOString() },
          signature: "",
        },
        {
          messageId: "a-cap",
          sender: { ownerId: "__envoy_ai__", nodeId: "agent", displayName: "AI", actorRole: "agent" },
          recipient: { ownerId: "envoy:owner:test", nodeId: "n1" },
          content: { text: "Started capability provider job." },
          metadata: {
            timestamp: new Date().toISOString(),
            deliveryChannel: "ai",
            assistantTurn: { domain: "service", jobId: "job-cap-live-1", correlationId: "corr-cap-live" },
          },
          signature: "",
        },
      ];
      return {
        answer: "Started capability provider job.",
        domain: "service",
        intent: "service.task-negotiation",
        toolsUsed: ["mesh.capability_provider.start"],
        jobId: "job-cap-live-1",
        correlationId: "corr-cap-live",
      };
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

  it("shows bridge reminder from chat log stream", async () => {
    renderWithI18n(<AIChatPanel />);

    for (const handler of chatMessageHandlers) {
      handler({
        messageId: "bridge-reminder-1",
        sender: {
          nodeId: "envoy_agent_test123",
          ownerId: "__envoy_ai__",
          displayName: "EnvoyAI",
          actorRole: "agent",
        },
        recipient: { nodeId: "n1", ownerId: "envoy:owner:test" },
        content: { text: "💧 Hey Allen! Time to drink some water." },
        metadata: {
          timestamp: new Date().toISOString(),
          deliveryReceipt: "delivered",
          deliveryChannel: "ai",
        },
        signature: "",
      });
    }

    expect(await screen.findByText(/Time to drink some water/i)).toBeDefined();
  });

  it("ignores bridge heartbeat noise in AI chat", async () => {
    renderWithI18n(<AIChatPanel />);

    for (const handler of chatMessageHandlers) {
      handler({
        messageId: "bridge-heartbeat-1",
        sender: { nodeId: "envoy_agent_test123", ownerId: "__envoy_ai__", displayName: "" },
        recipient: { nodeId: "n1", ownerId: "envoy:owner:test" },
        content: { text: "🕸️ Heartbeat acknowledged. System nominal." },
        metadata: { timestamp: new Date().toISOString(), deliveryReceipt: "delivered" },
      });
    }

    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText(/Heartbeat acknowledged/i)).toBeNull();
  });

  it("restores transcript from node chat history after remount", async () => {
    storedHistory = [
      {
        messageId: "a-persisted",
        sender: { ownerId: "__envoy_ai__", nodeId: "agent", displayName: "AI", actorRole: "agent" },
        recipient: { ownerId: "envoy:owner:test", nodeId: "n1" },
        content: { text: "Persist me" },
        metadata: { timestamp: new Date().toISOString(), deliveryChannel: "ai" },
        signature: "",
      },
    ];
    const { unmount } = renderWithI18n(<AIChatPanel />);
    expect(await screen.findByText(/Persist me/i)).toBeDefined();
    unmount();
    renderWithI18n(<AIChatPanel />);
    expect(await screen.findByText(/Persist me/i)).toBeDefined();
  });
});
