/**
 * @vitest-environment jsdom
 * E2E (UI integration): Inbox surfaces share offers and accept passes save path.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ShareOffer } from "@envoymesh/api";
import { InboxView } from "../../src/components/views/InboxView.js";
import { ToastProvider } from "../../src/hooks/useToast.js";

const acceptShare = vi.fn();
const declineShare = vi.fn();
const shareFile = vi.fn();
const dismissAgentShare = vi.fn();

const sampleOffer: ShareOffer = {
  shareId: "share-e2e-1",
  senderNodeId: "12D3KooSender",
  senderDisplayName: "Alice",
  filename: "diagram.png",
  mimeType: "image/png",
  sizeBytes: 4096,
  sensitivity: "friends",
  timestamp: new Date().toISOString(),
  senderVaultRelativePath: "out/diagram.png",
};

let shareOffers: ShareOffer[] = [];
let agentProposals: Array<{
  proposalId: string;
  targetOwnerId: string;
  vaultRelativePath: string;
  sensitivity: "friends";
  summary?: string;
}> = [];

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
  useNodeService: () => ({
    shareFile,
  }),
  useShareOffers: () => ({
    offers: shareOffers,
    accept: acceptShare,
    decline: declineShare,
  }),
  useAgentShareProposals: () => ({
    proposals: agentProposals,
    dismiss: dismissAgentShare,
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
  shareOffers = [];
  agentProposals = [];
});

beforeEach(() => {
  acceptShare.mockResolvedValue(undefined);
  declineShare.mockResolvedValue(undefined);
  shareFile.mockResolvedValue(undefined);
  dismissAgentShare.mockResolvedValue(undefined);
});

describe("E2E Inbox file shares", () => {
  it("renders incoming share offer with accept and save-path field", async () => {
    shareOffers = [sampleOffer];
    renderInbox();

    expect(await screen.findByText(/File shares \(1\)/i)).toBeDefined();
    expect(screen.getByText(/Alice/i)).toBeDefined();
    expect(screen.getByDisplayValue("out/diagram.png")).toBeDefined();
    expect(screen.getByRole("button", { name: /^Accept$/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /^Decline$/i })).toBeDefined();
  });

  it("accept calls acceptShare with edited save path", async () => {
    shareOffers = [sampleOffer];
    renderInbox();

    const pathInput = await screen.findByDisplayValue("out/diagram.png");
    fireEvent.change(pathInput, { target: { value: "inbox/my-diagram.png" } });
    fireEvent.click(screen.getByRole("button", { name: /^Accept$/i }));

    await waitFor(() => {
      expect(acceptShare).toHaveBeenCalledWith("share-e2e-1", "inbox/my-diagram.png");
    });
  });

  it("decline calls declineShare", async () => {
    shareOffers = [sampleOffer];
    renderInbox();

    fireEvent.click(await screen.findByRole("button", { name: /^Decline$/i }));

    await waitFor(() => {
      expect(declineShare).toHaveBeenCalledWith("share-e2e-1");
    });
  });
});

describe("E2E Inbox agent share proposals", () => {
  it("renders agent share suggestion with send and dismiss actions", async () => {
    agentProposals = [
      {
        proposalId: "proposal-e2e-1",
        targetOwnerId: "envoy:owner:alex",
        vaultRelativePath: "docs/contract.pdf",
        sensitivity: "friends",
        summary: "Share contract with Alex",
      },
    ];
    renderInbox();

    expect(await screen.findByText(/Agent share suggestions \(1\)/i)).toBeDefined();
    expect(screen.getByText(/docs\/contract\.pdf/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /^Send share$/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /^Dismiss$/i })).toBeDefined();
  });

  it("send share calls shareFile and dismisses the proposal", async () => {
    agentProposals = [
      {
        proposalId: "proposal-e2e-2",
        targetOwnerId: "envoy:owner:alex",
        vaultRelativePath: "docs/report.pdf",
        sensitivity: "friends",
      },
    ];
    renderInbox();

    fireEvent.click(await screen.findByRole("button", { name: /^Send share$/i }));

    await waitFor(() => {
      expect(shareFile).toHaveBeenCalledWith("envoy:owner:alex", {
        path: "docs/report.pdf",
        sensitivity: "friends",
      });
      expect(dismissAgentShare).toHaveBeenCalledWith("proposal-e2e-2");
    });
  });
});
