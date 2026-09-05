/**
 * @vitest-environment jsdom
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ChatTeamJobEntry } from "../../src/components/ChatTeamJobEntry.js";
import { ToastProvider } from "../../src/hooks/useToast.js";
import { I18nTestProvider } from "../../src/context/I18nContext.js";

const chainProbeReachability = vi.fn(async () => ({ rows: [] }));
const agentNetworkDiagnosticsSnapshot = vi.fn(async () => ({ workers: [] }));
const getLocalAgentNetworkWorkerCard = vi.fn(async () => undefined);
const getOpenClawStatus = vi.fn(async () => ({ running: false }));
const refreshAgentNetworkWorkers = vi.fn(async () => ({}));

const mockNodeService = {
  chainProbeReachability,
  agentNetworkDiagnosticsSnapshot,
  getLocalAgentNetworkWorkerCard,
  getOpenClawStatus,
  refreshAgentNetworkWorkers,
  isConnected: true,
  on: vi.fn(() => () => {}),
};

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useNodeService: () => mockNodeService,
  useTransportWsOpen: () => true,
  useAgentCards: () => [],
}));

vi.mock("../../src/context/NodeStateContext.js", () => ({
  useNodeState: () => ({
    bonds: [
      {
        peerOwnerId: "envoy:owner:bob",
        displayName: "Bob",
        level: "direct",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    nodeConfig: { capabilityProviderEnabled: false },
  }),
}));

vi.mock("../../src/components/ChainStartDialog.js", () => ({
  ChainStartDialog: () => <div data-testid="chain-start-dialog-stub" />,
}));

function renderEntry() {
  return render(
    <I18nTestProvider locale="en">
      <ToastProvider>
        <ChatTeamJobEntry scopedOwnerIds={["envoy:owner:bob"]} />
      </ToastProvider>
    </I18nTestProvider>,
  );
}

describe("ChatTeamJobEntry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    cleanup();
  });

  it("opens Advanced overflow and blocks when peers are not ready", async () => {
    renderEntry();
    fireEvent.click(screen.getByTestId("chat-team-job-overflow"));
    await waitFor(() => {
      expect(screen.getByTestId("chat-team-job-menu")).toBeDefined();
    });
    fireEvent.click(screen.getByTestId("chat-team-job-run"));
    await waitFor(() => {
      expect(screen.getByTestId("chat-team-job-blocked")).toBeDefined();
      expect(screen.getByText(/Team job isn’t available in this chat yet/i)).toBeDefined();
    });
  });
});
