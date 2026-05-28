/**
 * @vitest-environment jsdom
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AIChatPanel } from "../../src/components/views/AIChatPanel.js";

const runDocumentAgentTurn = vi.fn();
const sendSyncStateUpdate = vi.fn().mockResolvedValue({ ok: true, recipients: 0 });
const on = vi.fn(() => () => {});

let nodeConfig = {
  modelProviders: { mode: "mock" as const, modelName: "test-model" },
};

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useNodeService: () => ({
    runDocumentAgentTurn,
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
});

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  nodeStatus = "running";
  nodeConfig = { modelProviders: { mode: "mock", modelName: "test-model" } };
  runDocumentAgentTurn.mockResolvedValue({
    answer: "Found 1 file(s) in your library:\n• report.txt",
    intent: "list_library",
    toolsUsed: ["mesh.library_list"],
  });
});

describe("AIChatPanel", () => {
  it("calls runDocumentAgentTurn and displays the tool-backed answer", async () => {
    render(<AIChatPanel />);

    const input = screen.getByPlaceholderText(/Ask Envoy AI anything/i);
    fireEvent.change(input, { target: { value: "list my library files" } });
    fireEvent.click(screen.getByRole("button", { name: /^Send$/i }));

    await waitFor(() => {
      expect(runDocumentAgentTurn).toHaveBeenCalledWith("list my library files");
    });
    expect(await screen.findByText(/report\.txt/i)).toBeDefined();
  });

  it("does not call runDocumentAgentTurn while node is starting", async () => {
    nodeStatus = "starting";
    render(<AIChatPanel />);

    const input = screen.getByPlaceholderText(/Ask Envoy AI anything/i);
    fireEvent.change(input, { target: { value: "hello" } });
    fireEvent.click(screen.getByRole("button", { name: /^Send$/i }));

    expect(await screen.findByText(/Node is still starting/i)).toBeDefined();
    expect(runDocumentAgentTurn).not.toHaveBeenCalled();
  });

  it("shows error message when runDocumentAgentTurn fails", async () => {
    runDocumentAgentTurn.mockRejectedValue(new Error("Node not initialized"));
    render(<AIChatPanel />);

    const input = screen.getByPlaceholderText(/Ask Envoy AI anything/i);
    fireEvent.change(input, { target: { value: "who has golden" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(await screen.findByText(/Error: Node not initialized/i)).toBeDefined();
  });
});
