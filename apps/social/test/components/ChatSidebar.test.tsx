/**
 * @vitest-environment jsdom
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import {
  envoyHarnessThreadKey,
  type BondRecord,
  type ChatMessage,
  type FamilyProfile,
  type NodeConfig,
} from "@envoymesh/api";
import { ChatSidebar } from "../../src/components/views/ChatSidebar.js";
import { renderWithI18n } from "../helpers/render-with-i18n.js";

const revokeBond = vi.fn();
const updateNodeConfig = vi.fn();
const listChatRooms = vi.fn();
const listFamilyRooms = vi.fn();
const listEnvoyHarnessChats = vi.fn();
const removeEnvoyHarnessChat = vi.fn();

const bonds: BondRecord[] = [
  {
    peerOwnerId: "envoy:owner:alice",
    displayName: "Alice",
    level: "direct",
    createdAt: "2026-05-20T00:00:00.000Z",
  },
];

let mockNodeConfig: Partial<NodeConfig> = { contactAiPreferences: [] };
let mockPendingMessages: ChatMessage[] = [];

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useNodeService: () => ({
    revokeBond,
    updateNodeConfig,
    listChatRooms,
    listFamilyRooms,
    listEnvoyHarnessChats,
    removeEnvoyHarnessChat,
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
    pendingMessages: mockPendingMessages,
    humanProfile: { displayName: "Me", hobbies: [], knowledge: [] },
    nodeConfig: mockNodeConfig,
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
  listFamilyRooms.mockResolvedValue({ rooms: [] });
  listEnvoyHarnessChats.mockResolvedValue([]);
  removeEnvoyHarnessChat.mockResolvedValue({ removed: true });
  mockNodeConfig = { contactAiPreferences: [] };
  mockPendingMessages = [];
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

  it("opens a portaled context menu with compact web-content links", async () => {
    renderWithI18n(<ChatSidebar selectedContact={null} onSelectContact={vi.fn()} />);
    // The contact row and the "Remove Alice" × button both contain "Alice" —
    // target only the contact row (excludes the remove button's aria-label).
    const row = screen.getByRole("button", {
      name: (accessibleName: string) =>
        /Alice/i.test(accessibleName) && !/Remove/i.test(accessibleName),
    });
    fireEvent.contextMenu(row);
    const menu = await screen.findByTestId("contact-context-menu");
    expect(menu.parentElement).toBe(document.body);
    expect(screen.getByTestId("context-web-content-profile").tagName).toBe("BUTTON");
    expect(screen.getByTestId("context-web-content-feeds").textContent).toContain("Feed");
    const labels = [
      "context-web-content-profile",
      "context-web-content-feeds",
      "context-web-content-blog",
      "context-web-content-photowall",
    ].map((id) => screen.getByTestId(id).textContent);
    expect(labels).toEqual(["Profile", "Feed", "Blog", "Photo"]);
    const headerRow = menu.querySelector(".context-menu-header--row");
    expect(headerRow).not.toBeNull();
    expect(headerRow?.querySelector(".context-menu-links")).not.toBeNull();
  });

  it("routes context Feed/Blog to Content tabs via open-social-content", async () => {
    const onSocial = vi.fn();
    window.addEventListener("envoymesh:open-social-content", onSocial as EventListener);

    renderWithI18n(<ChatSidebar selectedContact={null} onSelectContact={vi.fn()} />);
    const row = screen.getByRole("button", {
      name: (accessibleName: string) =>
        /Alice/i.test(accessibleName) && !/Remove/i.test(accessibleName),
    });
    fireEvent.contextMenu(row);
    await screen.findByTestId("contact-context-menu");

    fireEvent.click(screen.getByTestId("context-web-content-feeds"));
    expect(onSocial).toHaveBeenCalledTimes(1);
    expect((onSocial.mock.calls[0]![0] as CustomEvent).detail).toEqual({
      surface: "feed",
      ownerId: "envoy:owner:alice",
    });

    fireEvent.contextMenu(row);
    await screen.findByTestId("contact-context-menu");
    fireEvent.click(screen.getByTestId("context-web-content-blog"));
    expect(onSocial).toHaveBeenCalledTimes(2);
    expect((onSocial.mock.calls[1]![0] as CustomEvent).detail).toEqual({
      surface: "blog",
      ownerId: "envoy:owner:alice",
    });

    window.removeEventListener("envoymesh:open-social-content", onSocial as EventListener);
  });
});

describe("ChatSidebar — Envoy entry", () => {
  beforeEach(() => {
    // The Coding section is gated on the caller being allowed to use
    // coding assistants (owner profile, or a family profile with
    // codingEnabled). Default the mock to the owner so the section
    // renders; individual tests can override.
    mockNodeConfig = { contactAiPreferences: [], callerIsOwnerProfile: true };
  });

  it("shows Coding section with project picker when empty", async () => {
    const onOpenEnvoyHarness = vi.fn();
    renderWithI18n(
      <ChatSidebar
        selectedContact={null}
        onSelectContact={vi.fn()}
        onOpenEnvoyHarness={onOpenEnvoyHarness}
      />,
    );
    expect(await screen.findByText("Coding")).toBeDefined();
    fireEvent.click(screen.getByText(/Choose a project to start/));
    expect(
      await screen.findByRole("heading", { name: "New coding chat" }),
    ).toBeDefined();
    expect(
      await screen.findByText(/Each coding chat is tied to one project folder/),
    ).toBeDefined();
    expect(onOpenEnvoyHarness).not.toHaveBeenCalled();
  });

  it("selects the chat thread when an Envoy workspace row is clicked", async () => {
    const onSelectContact = vi.fn();
    listEnvoyHarnessChats.mockResolvedValue([
      {
        id: "chat-1",
        cwd: "/projects/app",
        title: "app",
        lastUsedAt: new Date().toISOString(),
        messageCount: 2,
      },
    ]);
    renderWithI18n(
      <ChatSidebar
        selectedContact={null}
        onSelectContact={onSelectContact}
        onOpenEnvoyHarness={() => {}}
      />,
    );
    fireEvent.click(await screen.findByText("app"));
    expect(onSelectContact).toHaveBeenCalledWith(
      envoyHarnessThreadKey("chat-1"),
    );
  });

  it("removes a coding chat from the sidebar after confirm", async () => {
    const onSelectContact = vi.fn();
    listEnvoyHarnessChats.mockResolvedValue([
      {
        id: "chat-1",
        cwd: "/projects/app",
        title: "app",
        lastUsedAt: new Date().toISOString(),
        messageCount: 2,
      },
    ]);
    renderWithI18n(
      <ChatSidebar
        selectedContact={envoyHarnessThreadKey("chat-1")}
        onSelectContact={onSelectContact}
        onOpenEnvoyHarness={() => {}}
      />,
    );
    await screen.findByText("app");
    fireEvent.click(screen.getByTestId("eh-chat-row-menu-btn-chat-1"));
    fireEvent.click(screen.getByTestId("eh-chat-row-menu-remove-chat-1"));
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() => {
      expect(removeEnvoyHarnessChat).toHaveBeenCalledWith("chat-1");
    });
    expect(onSelectContact).toHaveBeenCalledWith(null);
  });
});

describe("ChatSidebar — Family section", () => {
  it("lists Mom and Dad under Family when familyProfiles are present", () => {
    const familyProfiles: FamilyProfile[] = [
      {
        id: "owner",
        name: "Allen",
        isOwner: true,
        active: true,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "mom",
        name: "Mom",
        isOwner: false,
        active: true,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "dad",
        name: "Dad",
        isOwner: false,
        active: true,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    mockNodeConfig = {
      contactAiPreferences: [],
      familyProfiles,
      callerFamilyProfileId: "owner",
    };

    const onSelectContact = vi.fn();
    renderWithI18n(
      <ChatSidebar selectedContact={null} onSelectContact={onSelectContact} />,
    );

    expect(screen.getAllByText("Family").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: /Mom/i }));
    expect(onSelectContact).toHaveBeenCalledWith("family:mom:owner");
    fireEvent.click(screen.getByRole("button", { name: /Dad/i }));
    expect(onSelectContact).toHaveBeenCalledWith("family:dad:owner");
  });

  it("hides Family section when only the owner profile exists", () => {
    mockNodeConfig = {
      contactAiPreferences: [],
      familyProfiles: [
        {
          id: "owner",
          name: "Allen",
          isOwner: true,
          active: true,
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      callerFamilyProfileId: "owner",
    };
    renderWithI18n(<ChatSidebar selectedContact={null} onSelectContact={vi.fn()} />);
    expect(screen.queryByText("Family")).toBeNull();
  });
});
