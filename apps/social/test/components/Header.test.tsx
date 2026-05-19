/**
 * @vitest-environment jsdom
 */
import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { Header } from "../../src/components/Header.js";
import { ThemeProvider } from "../../src/context/ThemeContext.js";
import type { ViewName } from "../../src/App.js";

afterEach(() => cleanup());

function renderHeader(props: React.ComponentProps<typeof Header>) {
  return render(
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
    inboxCount: 0,
    bondsCount: 0,
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

  it("renders navigation buttons", () => {
    renderHeader(baseProps);
    expect(screen.getByText("Chat")).toBeDefined();
    expect(screen.getByText("Search")).toBeDefined();
    expect(screen.getByText("Profile")).toBeDefined();
    expect(screen.getByText("Settings")).toBeDefined();
  });

  it("calls onNavigate when nav button is clicked", () => {
    const onNavigate = vi.fn();
    renderHeader({ ...baseProps, onNavigate });
    fireEvent.click(screen.getByText("Profile"));
    expect(onNavigate).toHaveBeenCalledWith("profile");
  });

  it("shows inbox badge count", () => {
    renderHeader({ ...baseProps, inboxCount: 3 });
    expect(screen.getByText("3")).toBeDefined();
  });

  it("shows bonds count", () => {
    renderHeader({ ...baseProps, bondsCount: 5 });
    expect(screen.getByText("Contacts (5)")).toBeDefined();
  });

  it("shows peer display name", () => {
    renderHeader({
      ...baseProps,
      humanProfile: {
        displayName: "Alice", username: "alice", updatedAt: "", signature: "",
        ownerId: "", version: "0.1", profileVisibility: "public",
      },
    });
    expect(screen.getByText("Alice")).toBeDefined();
  });

  it("shows truncated peerId", () => {
    renderHeader({ ...baseProps, humanProfile: null, peerId: "12D3KooWAbCdEfGhIj" });
    expect(screen.getByText("12D3KooW\u2026")).toBeDefined();
  });

  it("shows node status", () => {
    renderHeader({ ...baseProps, nodeStatus: "running" });
    const statuses = screen.getAllByText("running");
    expect(statuses.length).toBeGreaterThan(0);
    expect(statuses[0]).toBeDefined();
  });
});