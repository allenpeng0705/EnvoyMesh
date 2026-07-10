/**
 * @vitest-environment jsdom
 *
 * Tests for `OpenClawOfflineBanner.tsx`. The banner must NOT show during the
 * legitimate OpenClaw startup window (when `running: false` but `startedAt`
 * is within the last 90s — the runtime's own startup-probe budget). It
 * should also stay hidden when the runtime is `enabled: false` (user
 * intentionally turned it off). Only surface when something is actually
 * wrong: a regression (was up, now down) or a stuck install (still down
 * after the grace period).
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { OpenClawOfflineBanner } from "../../src/components/views/OpenClawOfflineBanner.js";
import { I18nTestProvider } from "../../src/context/I18nContext.js";

const mockGetOpenClawStatus = vi.fn();
const mockRestartOpenClaw = vi.fn();
const mockOn = vi.fn(() => () => {});

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useNodeService: () => ({
    getOpenClawStatus: mockGetOpenClawStatus,
    restartOpenClaw: mockRestartOpenClaw,
    on: mockOn,
  }),
}));

vi.mock("../../src/context/NodeStateContext.js", () => ({
  useNodeState: () => ({
    nodeConfig: { openclawEnabled: true },
  }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  mockRestartOpenClaw.mockResolvedValue({ running: true, startedAt: new Date().toISOString() });
});

describe("OpenClawOfflineBanner — startup-window gating", () => {
  it("does NOT show during the legitimate startup window (running:false but startedAt is recent)", async () => {
    mockGetOpenClawStatus.mockResolvedValue({
      enabled: true,
      running: false,
      url: "",
      startedAt: new Date().toISOString(),
    });

    render(
      <I18nTestProvider>
        <OpenClawOfflineBanner />
      </I18nTestProvider>,
    );

    // First poll completes asynchronously. Wait for it, then assert banner is hidden.
    await waitFor(() => expect(mockGetOpenClawStatus).toHaveBeenCalled());
    expect(screen.queryByText(/Built-in OpenClaw is stopped/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /restart/i })).toBeNull();
  });

  it("does NOT show when the runtime is intentionally disabled (enabled: false)", async () => {
    mockGetOpenClawStatus.mockResolvedValue({
      enabled: false,
      running: false,
      url: "",
      startedAt: undefined,
    });

    render(
      <I18nTestProvider>
        <OpenClawOfflineBanner />
      </I18nTestProvider>,
    );

    await waitFor(() => expect(mockGetOpenClawStatus).toHaveBeenCalled());
    expect(screen.queryByText(/Built-in OpenClaw is stopped/i)).toBeNull();
  });

  it("does NOT show when the user has not yet triggered a start (startedAt is null)", async () => {
    // OpenClaw starts lazily on first use (e.g. clicking "Ask AI"). When
    // the user just opens the app and lands on the chat view without
    // triggering a start, startedAt is null. The absence of a start is
    // not a failure — the user simply hasn't asked yet.
    mockGetOpenClawStatus.mockResolvedValue({
      enabled: true,
      running: false,
      url: "",
      startedAt: undefined,
    });

    render(
      <I18nTestProvider>
        <OpenClawOfflineBanner />
      </I18nTestProvider>,
    );

    await waitFor(() => expect(mockGetOpenClawStatus).toHaveBeenCalled());
    expect(screen.queryByText(/Built-in OpenClaw is stopped/i)).toBeNull();
  });

  it("does NOT show during the first poll when status hasn't been fetched yet", () => {
    mockGetOpenClawStatus.mockImplementation(
      () => new Promise(() => {}), // never resolves
    );

    render(
      <I18nTestProvider>
        <OpenClawOfflineBanner />
      </I18nTestProvider>,
    );

    // Synchronously, before the first poll lands, the banner must be hidden
    // because `running === null`.
    expect(screen.queryByText(/Built-in OpenClaw is stopped/i)).toBeNull();
  });
});

describe("OpenClawOfflineBanner — restart action", () => {
  it("calls nodeService.restartOpenClaw when the Restart button is clicked", async () => {
    // Regression scenario: startedAt is set (user previously triggered a
    // start), running dropped to false — so the banner is visible.
    const oldStart = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    mockGetOpenClawStatus.mockResolvedValue({
      enabled: true,
      running: false,
      url: "",
      startedAt: oldStart,
    });

    render(
      <I18nTestProvider>
        <OpenClawOfflineBanner />
      </I18nTestProvider>,
    );

    const restartBtn = await screen.findByRole("button", { name: /restart/i });
    fireEvent.click(restartBtn);

    await waitFor(() => expect(mockRestartOpenClaw).toHaveBeenCalledTimes(1));
  });

  it("surfaces an error message when restartOpenClaw throws", async () => {
    const oldStart = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    mockGetOpenClawStatus.mockResolvedValue({
      enabled: true,
      running: false,
      url: "",
      startedAt: oldStart,
    });
    mockRestartOpenClaw.mockRejectedValueOnce(new Error("port 18789 already in use"));

    render(
      <I18nTestProvider>
        <OpenClawOfflineBanner />
      </I18nTestProvider>,
    );

    const restartBtn = await screen.findByRole("button", { name: /restart/i });
    fireEvent.click(restartBtn);

    await waitFor(() =>
      expect(screen.getByText(/port 18789 already in use/i)).toBeDefined(),
    );
  });
});