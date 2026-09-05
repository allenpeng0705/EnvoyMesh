/**
 * @vitest-environment jsdom
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ChatTeamJobEntry } from "../../src/components/ChatTeamJobEntry.js";
import { ToastProvider } from "../../src/hooks/useToast.js";
import { I18nTestProvider } from "../../src/context/I18nContext.js";
import type { CachedAgentCardSummary } from "@envoymesh/api";

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

const readyCard = {
  ownerId: "envoy:owner:bob",
  displayName: "Bob",
  sourceAgentPeerId: "envoy_agent_bob",
  membership: ["task.execute", "agent-network-worker"],
  cachedAt: new Date().toISOString(),
} as CachedAgentCardSummary;

const readyCardCarol = {
  ownerId: "envoy:owner:carol",
  displayName: "Carol",
  sourceAgentPeerId: "envoy_agent_carol",
  membership: ["task.execute", "agent-network-worker"],
  cachedAt: new Date().toISOString(),
} as CachedAgentCardSummary;

let mockBonds: Array<{
  peerOwnerId: string;
  displayName: string;
  level: string;
  createdAt: string;
}> = [];
let mockCards: CachedAgentCardSummary[] = [];
let mockJoin = false;

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useNodeService: () => mockNodeService,
  useTransportWsOpen: () => true,
  useAgentCards: () => mockCards,
}));

vi.mock("../../src/context/NodeStateContext.js", () => ({
  useNodeState: () => ({
    bonds: mockBonds,
    nodeConfig: { capabilityProviderEnabled: mockJoin },
  }),
}));

vi.mock("../../src/components/ChainStartDialog.js", () => ({
  ChainStartDialog: (props: { goal: string }) => (
    <div data-testid="chain-start-dialog-stub">{props.goal}</div>
  ),
}));

function renderEntry(scopedOwnerIds: string[]) {
  return render(
    <I18nTestProvider locale="en">
      <ToastProvider>
        <ChatTeamJobEntry scopedOwnerIds={scopedOwnerIds} />
      </ToastProvider>
    </I18nTestProvider>,
  );
}

async function openRunMenu() {
  fireEvent.click(screen.getByTestId("chat-team-job-overflow"));
  await waitFor(() => {
    expect(screen.getByTestId("chat-team-job-menu")).toBeDefined();
  });
  fireEvent.click(screen.getByTestId("chat-team-job-run"));
}

describe("ChatTeamJobEntry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBonds = [
      {
        peerOwnerId: "envoy:owner:bob",
        displayName: "Bob",
        level: "direct",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    mockCards = [];
    mockJoin = false;
    getOpenClawStatus.mockResolvedValue({ running: false });
    agentNetworkDiagnosticsSnapshot.mockResolvedValue({ workers: [] });
    chainProbeReachability.mockResolvedValue({ rows: [] });
  });

  afterEach(() => {
    cleanup();
  });

  it("opens Advanced overflow and blocks when peers are not ready", async () => {
    renderEntry(["envoy:owner:bob"]);
    await openRunMenu();
    await waitFor(() => {
      expect(screen.getByTestId("chat-team-job-blocked")).toBeDefined();
      expect(screen.getByText(/Team job isn’t available in this chat yet/i)).toBeDefined();
    });
  });

  it("blocks when local Join is off even if peers look ready", async () => {
    mockJoin = false;
    mockCards = [readyCard];
    getOpenClawStatus.mockResolvedValue({ running: true });
    chainProbeReachability.mockResolvedValue({
      rows: [{ ownerId: "envoy:owner:bob", online: true, sameLan: true, viaRelay: false }],
    });
    agentNetworkDiagnosticsSnapshot.mockResolvedValue({
      workers: [
        {
          peerId: "envoy_agent_bob",
          ownerId: "envoy:owner:bob",
          leaseReady: true,
          exclusionReasons: [],
        },
      ],
    });
    renderEntry(["envoy:owner:bob"]);
    await openRunMenu();
    await waitFor(() => {
      expect(screen.getByTestId("chat-team-job-blocked")).toBeDefined();
    });
  });

  it("opens goal prompt when single scoped peer is eligible", async () => {
    mockJoin = true;
    mockCards = [readyCard];
    getOpenClawStatus.mockResolvedValue({ running: true });
    chainProbeReachability.mockResolvedValue({
      rows: [{ ownerId: "envoy:owner:bob", online: true, sameLan: true, viaRelay: false }],
    });
    agentNetworkDiagnosticsSnapshot.mockResolvedValue({
      workers: [
        {
          peerId: "envoy_agent_bob",
          ownerId: "envoy:owner:bob",
          leaseReady: true,
          exclusionReasons: [],
        },
      ],
    });
    renderEntry(["envoy:owner:bob"]);
    await openRunMenu();
    await waitFor(() => {
      expect(screen.getByTestId("chat-team-job-goal")).toBeDefined();
      expect(screen.queryByTestId("chat-team-job-blocked")).toBeNull();
    });
    fireEvent.change(screen.getByTestId("chat-team-job-goal-input"), {
      target: { value: "Write a team brief with sources." },
    });
    fireEvent.click(screen.getByTestId("chat-team-job-goal-continue"));
    await waitFor(() => {
      expect(screen.getByTestId("chain-start-dialog-stub").textContent).toContain(
        "Write a team brief with sources.",
      );
    });
  });

  it("opens goal prompt when multiple scoped peers are all eligible", async () => {
    mockJoin = true;
    mockBonds = [
      {
        peerOwnerId: "envoy:owner:bob",
        displayName: "Bob",
        level: "direct",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      {
        peerOwnerId: "envoy:owner:carol",
        displayName: "Carol",
        level: "direct",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    mockCards = [readyCard, readyCardCarol];
    getOpenClawStatus.mockResolvedValue({ running: true });
    chainProbeReachability.mockResolvedValue({
      rows: [
        { ownerId: "envoy:owner:bob", online: true, sameLan: true, viaRelay: false },
        { ownerId: "envoy:owner:carol", online: true, sameLan: true, viaRelay: false },
      ],
    });
    agentNetworkDiagnosticsSnapshot.mockResolvedValue({
      workers: [
        {
          peerId: "envoy_agent_bob",
          ownerId: "envoy:owner:bob",
          leaseReady: true,
          exclusionReasons: [],
        },
        {
          peerId: "envoy_agent_carol",
          ownerId: "envoy:owner:carol",
          leaseReady: true,
          exclusionReasons: [],
        },
      ],
    });
    renderEntry(["envoy:owner:bob", "envoy:owner:carol"]);
    await openRunMenu();
    await waitFor(() => {
      expect(screen.getByTestId("chat-team-job-goal")).toBeDefined();
    });
  });
});
