/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { Header } from "../../src/components/Header.js";
import type { ViewName } from "../../src/App.js";

afterEach(() => cleanup());

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
    render(<Header {...baseProps} />);
    expect(screen.getByText("Envoy")).toBeDefined();
  });

  it("renders navigation buttons", () => {
    render(<Header {...baseProps} />);
    expect(screen.getByText("Chat")).toBeDefined();
    expect(screen.getByText("Search")).toBeDefined();
    expect(screen.getByText("Profile")).toBeDefined();
    expect(screen.getByText("Settings")).toBeDefined();
  });

  it("calls onNavigate when nav button is clicked", () => {
    const onNavigate = vi.fn();
    render(<Header {...baseProps} onNavigate={onNavigate} />);

    fireEvent.click(screen.getByText("Profile"));
    expect(onNavigate).toHaveBeenCalledWith("profile");
  });

  it("shows inbox badge count", () => {
    render(<Header {...baseProps} inboxCount={3} />);
    expect(screen.getByText("3")).toBeDefined();
  });

  it("shows bonds count", () => {
    render(<Header {...baseProps} bondsCount={5} />);
    expect(screen.getByText("Contacts (5)")).toBeDefined();
  });

  it("shows peer display name", () => {
    render(
      <Header
        {...baseProps}
        humanProfile={{
          displayName: "Alice", username: "alice", updatedAt: "", signature: "",
          ownerId: "", version: "0.1", profileVisibility: "public",
        }}
      />,
    );
    expect(screen.getByText("Alice")).toBeDefined();
  });

  it("shows truncated peerId", () => {
    render(<Header {...baseProps} humanProfile={null} peerId="12D3KooWAbCdEfGhIj" />);
    expect(screen.getByText("12D3KooW\u2026")).toBeDefined();
  });

  it("shows node status", () => {
    render(<Header {...baseProps} nodeStatus="running" />);
    const statuses = screen.getAllByText("running");
    expect(statuses.length).toBeGreaterThan(0);
    expect(statuses[0]).toBeDefined();
  });
});
