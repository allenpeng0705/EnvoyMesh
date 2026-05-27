/**
 * @vitest-environment jsdom
 * E2E (UI integration): Inbox surfaces AI approval queue items.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { PendingApprovalSummary } from "@envoymesh/api";
import { InboxView } from "../../src/components/views/InboxView.js";
import { ToastProvider } from "../../src/hooks/useToast.js";

const approvePending = vi.fn();
const rejectPending = vi.fn();

let pendingApprovals: PendingApprovalSummary[] = [];

vi.mock("../../src/context/NodeStateContext.js", () => ({
  useNodeState: () => ({
    pendingHellOs: [],
    pendingIntroProposals: [],
    pendingMessages: [],
    humanProfile: null,
    acceptHello: vi.fn(),
    declineHello: vi.fn(),
    approveIntroCommitment: vi.fn(),
    declineIntroProposal: vi.fn(),
    sendHello: vi.fn(),
    clearPendingMessages: vi.fn(),
  }),
}));

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useNodeService: () => ({}),
  useShareOffers: () => ({ offers: [], accept: vi.fn(), decline: vi.fn() }),
  useAgentShareProposals: () => ({ proposals: [], dismiss: vi.fn() }),
  usePendingApprovals: () => ({
    items: pendingApprovals,
    approve: approvePending,
    reject: rejectPending,
  }),
}));

function renderInbox() {
  return render(
    <ToastProvider>
      <InboxView embedded />
    </ToastProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  pendingApprovals = [];
});

beforeEach(() => {
  approvePending.mockResolvedValue({ ok: true, messageId: "msg-approved" });
  rejectPending.mockResolvedValue(undefined);
});

describe("E2E Inbox AI approvals", () => {
  it("renders pending approval with draft preview and actions", async () => {
    pendingApprovals = [
      {
        id: "approval-e2e-1",
        actionType: "send_chat",
        title: "Reply to Bob",
        description: "Your agent drafted a reply",
        draftContent: "Thanks for reaching out — I'll follow up shortly.",
        contactOwnerId: "envoy:owner:bob",
        contactDisplayName: "Bob",
        priority: "normal",
        requestedAt: new Date().toISOString(),
      },
    ];
    renderInbox();

    expect(await screen.findByText(/AI approvals \(1\)/i)).toBeDefined();
    expect(screen.getByText(/Reply to Bob/i)).toBeDefined();
    expect(screen.getByText(/Thanks for reaching out/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /Approve & send/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /^Reject$/i })).toBeDefined();
  });

  it("approve calls approvePending with item id", async () => {
    pendingApprovals = [
      {
        id: "approval-e2e-2",
        actionType: "send_chat",
        title: "Reply to Alice",
        description: "Draft ready",
        draftContent: "Hello Alice",
        contactOwnerId: "envoy:owner:alice",
        priority: "normal",
        requestedAt: new Date().toISOString(),
      },
    ];
    renderInbox();

    fireEvent.click(await screen.findByRole("button", { name: /Approve & send/i }));

    await waitFor(() => {
      expect(approvePending).toHaveBeenCalledWith("approval-e2e-2");
    });
  });

  it("reject calls rejectPending with item id", async () => {
    pendingApprovals = [
      {
        id: "approval-e2e-3",
        actionType: "send_chat",
        title: "Reply to Carol",
        description: "Draft ready",
        draftContent: "No thanks",
        contactOwnerId: "envoy:owner:carol",
        priority: "normal",
        requestedAt: new Date().toISOString(),
      },
    ];
    renderInbox();

    fireEvent.click(await screen.findByRole("button", { name: /^Reject$/i }));

    await waitFor(() => {
      expect(rejectPending).toHaveBeenCalledWith("approval-e2e-3");
    });
  });
});
