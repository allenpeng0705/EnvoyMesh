/**
 * @vitest-environment jsdom
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { WorkerCapabilityPanel } from "../../src/components/views/WorkerCapabilityPanel.js";
import { I18nTestProvider } from "../../src/context/I18nContext.js";

const getBonds = vi.fn();
const getPeerReputationSummary = vi.fn();
const mockNodeService = { getBonds, getPeerReputationSummary };

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useNodeService: () => mockNodeService,
}));

const makeBond = (overrides: Partial<{
  peerOwnerId: string;
  displayName: string;
  level: "direct" | "referred" | "public";
  lastSeenAt: string;
}> = {}) => ({
  peerOwnerId: overrides.peerOwnerId ?? "envoy:owner:alice",
  displayName: overrides.displayName ?? "Alice",
  level: overrides.level ?? "direct",
  lastSeenAt: overrides.lastSeenAt ?? "2026-06-15T10:00:00.000Z",
});

function renderPanel() {
  return render(
    <I18nTestProvider locale="en">
      <WorkerCapabilityPanel />
    </I18nTestProvider>,
  );
}

describe("WorkerCapabilityPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getBonds.mockResolvedValue([]);
    getPeerReputationSummary.mockResolvedValue(null);
  });
  afterEach(() => {
    cleanup();
  });

  it("shows the empty placeholder when no bonds exist", async () => {
    getBonds.mockResolvedValueOnce([]);
    renderPanel();
    await waitFor(() => {
      expect(
        screen.getByText(
          "No bonded contacts with agent cards. Bond with peers who share their capabilities.",
        ),
      ).toBeDefined();
    });
  });

  it("renders only direct/referred bonds (skips public)", async () => {
    getBonds.mockResolvedValueOnce([
      makeBond({ peerOwnerId: "envoy:owner:alice", displayName: "Alice", level: "direct" }),
      makeBond({ peerOwnerId: "envoy:owner:bob", displayName: "Bob", level: "public" }),
      makeBond({ peerOwnerId: "envoy:owner:carol", displayName: "Carol", level: "referred" }),
    ]);
    getPeerReputationSummary.mockResolvedValue(null);
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText("Alice")).toBeDefined();
    });
    expect(screen.getByText("Carol")).toBeDefined();
    expect(screen.queryByText("Bob")).toBeNull();
  });

  it("shows reputation when peer reputation summary returns a successful/failed count", async () => {
    getBonds.mockResolvedValueOnce([makeBond({ displayName: "Alice" })]);
    getPeerReputationSummary.mockResolvedValueOnce({
      local: { successfulTasks: 8, failedTasks: 2 },
    });
    renderPanel();
    await waitFor(() => {
      // 8 of 10 successful → 80/100 reputation
      // Text is split across multiple nodes (stars + score) so use regex
      expect(screen.getByText(/80\/100/)).toBeDefined();
    });
  });

  it("shows the 'no reputation data' indicator when reputation is null", async () => {
    getBonds.mockResolvedValueOnce([makeBond({ displayName: "Alice" })]);
    getPeerReputationSummary.mockResolvedValueOnce(null);
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText("Alice")).toBeDefined();
    });
    expect(screen.getByText("No reputation data")).toBeDefined();
  });

  it("filters workers by search query", async () => {
    getBonds.mockResolvedValueOnce([
      makeBond({ peerOwnerId: "envoy:owner:alice", displayName: "Alice" }),
      makeBond({ peerOwnerId: "envoy:owner:bob", displayName: "Bob" }),
    ]);
    getPeerReputationSummary.mockResolvedValue(null);
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText("Alice")).toBeDefined();
    });
    const searchInput = screen.getByPlaceholderText("Search workers…");
    fireEvent.change(searchInput, { target: { value: "ali" } });
    await waitFor(() => {
      expect(screen.getByText("Alice")).toBeDefined();
    });
    expect(screen.queryByText("Bob")).toBeNull();
  });

  it("filters workers by bond level", async () => {
    getBonds.mockResolvedValueOnce([
      makeBond({ peerOwnerId: "envoy:owner:alice", displayName: "Alice", level: "direct" }),
      makeBond({ peerOwnerId: "envoy:owner:bob", displayName: "Bob", level: "referred" }),
    ]);
    getPeerReputationSummary.mockResolvedValue(null);
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText("Alice")).toBeDefined();
    });
    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "direct" } });
    await waitFor(() => {
      expect(screen.getByText("Alice")).toBeDefined();
    });
    expect(screen.queryByText("Bob")).toBeNull();
  });

  it("does not crash when getPeerReputationSummary rejects for a bond", async () => {
    getBonds.mockResolvedValueOnce([makeBond({ displayName: "Alice" })]);
    getPeerReputationSummary.mockRejectedValueOnce(new Error("rpc failed"));
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText("Alice")).toBeDefined();
    });
    expect(screen.getByText("No reputation data")).toBeDefined();
  });
});
