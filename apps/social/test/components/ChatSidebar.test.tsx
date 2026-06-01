/**
 * @vitest-environment jsdom
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type { BondRecord } from "@envoymesh/api";
import { ChatSidebar } from "../../src/components/views/ChatSidebar.js";
import { renderWithI18n } from "../helpers/render-with-i18n.js";

const revokeBond = vi.fn();
const updateNodeConfig = vi.fn();
const listChatRooms = vi.fn();

const bonds: BondRecord[] = [
  {
    peerOwnerId: "envoy:owner:alice",
    displayName: "Alice",
    level: "direct",
    createdAt: "2026-05-20T00:00:00.000Z",
  },
];

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useNodeService: () => ({
    revokeBond,
    updateNodeConfig,
    listChatRooms,
    isConnected: true,
    on: vi.fn(() => () => {}),
  }),
}));

vi.mock("../../src/hooks/useChatThreadPreviews.js", () => ({
  useChatThreadPreviews: () => ({}),
}));

vi.mock("../../src/context/NodeStateContext.js", () => ({
  useNodeState: () => ({
    bonds,
    bridgeStatus: null,
    pendingHellOs: [],
    pendingIntroProposals: [],
    pendingMessages: [],
    humanProfile: { displayName: "Me", hobbies: [], knowledge: [] },
    nodeConfig: { contactAiPreferences: [] },
    sendHello: vi.fn(),
    acceptHello: vi.fn(),
    declineHello: vi.fn(),
    clearPendingMessages: vi.fn(),
    refreshNodeConfig: vi.fn(),
  }),
}));

vi.mock("../../src/components/PeerProfileAvatar.js", () => ({
  PeerProfileAvatar: ({ fallbackLabel }: { fallbackLabel: string }) => (
    <span data-testid="avatar">{fallbackLabel[0]}</span>
  ),
}));

beforeEach(() => {
  revokeBond.mockReset();
  revokeBond.mockResolvedValue(undefined);
  updateNodeConfig.mockResolvedValue(undefined);
  listChatRooms.mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ChatSidebar — remove bonded contact", () => {
  it("opens confirm dialog from × and revokes bond on confirm", async () => {
    const onSelectContact = vi.fn();
    renderWithI18n(
      <ChatSidebar selectedContact="envoy:owner:alice" onSelectContact={onSelectContact} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Remove Alice/i }));

    expect(await screen.findByRole("dialog")).toBeDefined();
    expect(screen.getByText(/Are you sure you want to remove this contact/i)).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Remove contact" }));

    await waitFor(() => {
      expect(revokeBond).toHaveBeenCalledWith("envoy:owner:alice");
    });
    expect(onSelectContact).toHaveBeenCalledWith(null);
  });

  it("does not revoke bond when user cancels the dialog", async () => {
    renderWithI18n(<ChatSidebar selectedContact={null} onSelectContact={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /Remove Alice/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));

    expect(revokeBond).not.toHaveBeenCalled();
  });
});
