/**
 * @vitest-environment jsdom
 */
import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { Header } from "../../src/components/Header.js";
import { ThemeProvider } from "../../src/context/ThemeContext.js";
import { renderWithI18n } from "../helpers/render-with-i18n.js";
import type { ViewName } from "../../src/App.js";

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useNodeService: () => ({
    readLibraryItemContent: vi.fn().mockRejectedValue(new Error("no photo")),
  }),
}));

afterEach(() => cleanup());

function renderHeader(props: React.ComponentProps<typeof Header>) {
  return renderWithI18n(
    <ThemeProvider>
      <Header {...props} />
    </ThemeProvider>,
  );
}

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

describe("Header", () => {
  const baseProps = {
    currentView: "chat" as ViewName,
    onNavigate: vi.fn(),
    inboxActivityCount: 0,
    isPublicNetwork: false,
    connectionStatus: null,
    nodeStatus: "running" as const,
    humanProfile: null,
    peerId: "12D3KooWTest",
  };

  it("renders logo", () => {
    renderHeader(baseProps);
    expect(screen.getByText("Envoy")).toBeDefined();
  });

  it("renders primary navigation", () => {
    renderHeader(baseProps);
    const nav = screen.getByRole("navigation", { name: /primary/i });
    expect(within(nav).queryByRole("button", { name: /^assistant$/i })).toBeNull();
    expect(within(nav).getByRole("button", { name: /^chat$/i })).toBeDefined();
    expect(within(nav).getByRole("button", { name: /^discover$/i })).toBeDefined();
    expect(within(nav).getByRole("button", { name: /^library$/i })).toBeDefined();
    expect(within(nav).queryByRole("button", { name: /^activity$/i })).toBeNull();
    expect(within(nav).getByRole("button", { name: /^settings$/i })).toBeDefined();
    expect(within(nav).queryByRole("button", { name: /^profile$/i })).toBeNull();
    expect(screen.getByRole("button", { name: /^profile$/i })).toBeDefined();
  });

  it("navigates to Profile when Profile control is clicked", () => {
    const onNavigate = vi.fn();
    renderHeader({ ...baseProps, onNavigate });
    fireEvent.click(screen.getByRole("button", { name: /^profile$/i }));
    expect(onNavigate).toHaveBeenCalledWith("profile");
  });

  it("navigates to Settings when Settings is clicked", () => {
    const onNavigate = vi.fn();
    renderHeader({ ...baseProps, onNavigate });
    fireEvent.click(screen.getByRole("button", { name: /^settings$/i }));
    expect(onNavigate).toHaveBeenCalledWith("settings");
  });

  it("calls onNavigate when Chat is clicked", () => {
    const onNavigate = vi.fn();
    renderHeader({ ...baseProps, onNavigate });
    fireEvent.click(screen.getByRole("button", { name: /^chat$/i }));
    expect(onNavigate).toHaveBeenCalledWith("chat");
  });

  it("shows inbox activity on Chat control", () => {
    const onNavigate = vi.fn();
    renderHeader({ ...baseProps, onNavigate, inboxActivityCount: 3 });
    expect(screen.getByRole("button", { name: /3 items in inbox/i })).toBeDefined();
    expect(screen.getByText("3")).toBeDefined();
  });

  it("navigates to Discover when Discover is clicked", () => {
    const onNavigate = vi.fn();
    renderHeader({ ...baseProps, onNavigate });
    fireEvent.click(screen.getByRole("button", { name: /^discover$/i }));
    expect(onNavigate).toHaveBeenCalledWith("discover");
  });

  it("shows display name on Profile nav when profile has displayName", () => {
    renderHeader({
      ...baseProps,
      humanProfile: {
        displayName: "Alice", username: "alice", updatedAt: "", signature: "",
        ownerId: "envoy:owner:alice", version: "0.1", profileVisibility: "public",
      },
    });
    expect(screen.getByRole("button", { name: /^alice$/i })).toBeDefined();
  });

  it("Profile control shows truncated peer id in title when no display name", () => {
    renderHeader({ ...baseProps, humanProfile: null, peerId: "12D3KooWAbCdEfGhIj" });
    const profileBtn = screen.getByRole("button", { name: /^profile$/i });
    expect(profileBtn.getAttribute("title")).toContain("12D3KooWAbCdEfGhIj");
  });

  it("hides the status strip when the node is healthy", () => {
    renderHeader({ ...baseProps, nodeStatus: "running" });
    expect(screen.queryByRole("group", { name: /node connectivity/i })).toBeNull();
  });

  it("shows a Node offline chip when the node is offline", () => {
    renderHeader({ ...baseProps, nodeStatus: "offline" });
    expect(screen.getByRole("group", { name: /node connectivity/i })).toBeDefined();
    expect(screen.getByText("Node offline")).toBeDefined();
  });

  it("shows a Starting chip when the node is transitional", () => {
    renderHeader({ ...baseProps, nodeStatus: "starting" });
    expect(screen.getByText("Starting…")).toBeDefined();
  });

  it("shows a Relay down chip on public networks when the relay is unreachable", () => {
    renderHeader({ ...baseProps, nodeStatus: "running", isPublicNetwork: true, relayUnreachable: true });
    expect(screen.getByText("Relay down")).toBeDefined();
  });

  it("opens language menu and lists locale options", () => {
    renderHeader(baseProps);
    fireEvent.click(screen.getByRole("button", { name: /language:/i }));
    expect(screen.getByRole("listbox", { name: /choose language/i })).toBeDefined();
    expect(screen.getByRole("option", { name: "English" })).toBeDefined();
    expect(screen.getByRole("option", { name: "中文" })).toBeDefined();
  });
});