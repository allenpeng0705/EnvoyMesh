/**
 * @vitest-environment jsdom
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { BackgroundServiceSection } from "../../src/components/views/BackgroundServiceSection.js";
import { renderWithI18n } from "../helpers/render-with-i18n.js";
import { partialNodeService } from "../helpers/node-service-mock.js";

const getBackgroundService = vi.fn();
const setBackgroundService = vi.fn();
const connection = { isConnected: true };

const mockNodeService = partialNodeService({
  get isConnected() {
    return connection.isConnected;
  },
  getBackgroundService: (...args: unknown[]) => getBackgroundService(...args),
  setBackgroundService: (...args: unknown[]) => setBackgroundService(...args),
});

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useNodeService: () => mockNodeService,
}));

function ReconnectHarness() {
  const [connected, setConnected] = React.useState(false);
  connection.isConnected = connected;
  return (
    <>
      <button type="button" onClick={() => setConnected(true)}>
        simulate-reconnect
      </button>
      <BackgroundServiceSection />
    </>
  );
}

describe("BackgroundServiceSection", () => {
  beforeEach(() => {
    vi.useRealTimers();
    connection.isConnected = true;
    getBackgroundService.mockReset();
    setBackgroundService.mockReset();
    getBackgroundService.mockResolvedValue({ state: "not-installed", enabled: false });
    setBackgroundService.mockResolvedValue({ state: "running", enabled: true });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("loads status when connected", async () => {
    renderWithI18n(<BackgroundServiceSection />);
    await waitFor(() => {
      expect(getBackgroundService).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByText("Off")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Turn on" })).toBeTruthy();
  });

  it("skips load while disconnected, then refreshes on reconnect", async () => {
    renderWithI18n(<ReconnectHarness />);
    expect(getBackgroundService).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "simulate-reconnect" }));
    await waitFor(() => {
      expect(getBackgroundService).toHaveBeenCalledTimes(1);
    });
  });

  it("refreshes when the document becomes visible again", async () => {
    renderWithI18n(<BackgroundServiceSection />);
    await waitFor(() => expect(getBackgroundService).toHaveBeenCalledTimes(1));

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));
    await waitFor(() => expect(getBackgroundService).toHaveBeenCalledTimes(2));
  });

  it("re-reads status ~2.5s after toggle (handoff)", async () => {
    vi.useFakeTimers();
    renderWithI18n(<BackgroundServiceSection />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(getBackgroundService).toHaveBeenCalledTimes(1);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Turn on" }));
      await Promise.resolve();
    });
    expect(setBackgroundService).toHaveBeenCalledWith({ enabled: true });
    expect(getBackgroundService).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2499);
    });
    expect(getBackgroundService).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
      await Promise.resolve();
    });
    expect(getBackgroundService).toHaveBeenCalledTimes(2);
  });
});
