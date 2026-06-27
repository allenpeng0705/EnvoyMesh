/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { usePeerReachability, peerReachabilityLabel } from "../../src/hooks/usePeerReachability.js";

const getPeerConnectionInfo = vi.fn(async () => ({ connected: false, direct: false }));
const warmContactConnection = vi.fn(async () => ({ connected: true, direct: true }));

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useNodeService: () => ({
    isConnected: true,
    isReady: true,
    getPeerConnectionInfo,
    warmContactConnection,
  }),
}));

describe("usePeerReachability", () => {
  beforeEach(() => {
    getPeerConnectionInfo.mockClear();
    warmContactConnection.mockClear();
    getPeerConnectionInfo.mockResolvedValue({ connected: false, direct: false });
    warmContactConnection.mockResolvedValue({ connected: true, direct: true });
  });

  it("settles reachability without re-render loop aborting the first read", async () => {
    const { result } = renderHook(() => usePeerReachability("envoy:owner:abc", true));

    await waitFor(
      () => {
        expect(result.current.info).toEqual({ connected: true, direct: true });
      },
      { timeout: 15_000 },
    );

    expect(warmContactConnection).toHaveBeenCalled();
    expect(getPeerConnectionInfo.mock.calls.length).toBeLessThan(20);
    expect(result.current.checking).toBe(false);
  });

  it("shows online from cache before warm completes", async () => {
    getPeerConnectionInfo.mockResolvedValue({ connected: true, direct: true });
    warmContactConnection.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve({ connected: true, direct: true }), 200);
        }),
    );

    const { result } = renderHook(() => usePeerReachability("envoy:owner:cached", true));

    await waitFor(() => {
      expect(result.current.info).toEqual({ connected: true, direct: true });
    });
    expect(result.current.checking).toBe(false);
    expect(warmContactConnection).toHaveBeenCalledWith("envoy:owner:cached", {
      source: "chat",
      fastDial: true,
      keepAlive: true,
    });
  });

  it("shows online immediately when libp2p is already connected", async () => {
    getPeerConnectionInfo.mockResolvedValue({ connected: true, direct: true });
    warmContactConnection.mockResolvedValue({ connected: true, direct: true });

    const { result } = renderHook(() => usePeerReachability("envoy:owner:live", true));

    await waitFor(() => {
      expect(result.current.info).toEqual({ connected: true, direct: true });
    });
    expect(warmContactConnection).toHaveBeenCalledWith("envoy:owner:live", {
      source: "chat",
      fastDial: true,
      keepAlive: true,
    });
  });

  it("does not tear down relay on chat open", async () => {
    getPeerConnectionInfo.mockResolvedValue({ connected: false, direct: false });
    warmContactConnection.mockResolvedValue({ connected: true, direct: false });

    const { result } = renderHook(() => usePeerReachability("envoy:owner:relay", true));

    await waitFor(() => {
      expect(result.current.info?.connected).toBe(true);
    });
    expect(warmContactConnection).toHaveBeenCalledWith("envoy:owner:relay", {
      source: "chat",
      fastDial: true,
    });
    expect(
      warmContactConnection.mock.calls.some((call) => call[1]?.upgradeRelayToDirect === true),
    ).toBe(false);
  });

  it("does not restart reachability polling on parent re-render", async () => {
    getPeerConnectionInfo.mockResolvedValue({ connected: true, direct: true });

    const { result, rerender } = renderHook(() => usePeerReachability("envoy:owner:stable", true));

    await waitFor(() => {
      expect(result.current.info?.connected).toBe(true);
    });
    const callsAfterSettle = getPeerConnectionInfo.mock.calls.length;

    rerender();
    rerender();
    rerender();
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(getPeerConnectionInfo.mock.calls.length).toBe(callsAfterSettle);
    expect(result.current.checking).toBe(false);
  });

  it("shows Connecting while warm is in progress then Offline when dial fails", async () => {
    getPeerConnectionInfo.mockResolvedValue({ connected: false, direct: false });
    warmContactConnection.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve({ connected: false, direct: false }), 50);
        }),
    );

    const { result } = renderHook(() => usePeerReachability("envoy:owner:dialing", true));

    expect(result.current.checking).toBe(true);
    expect(peerReachabilityLabel(null, true)).toBe("Connecting…");

    await waitFor(() => {
      expect(result.current.info).toEqual({ connected: false, direct: false });
    });
    expect(result.current.checking).toBe(false);
    expect(peerReachabilityLabel(result.current.info, false)).toBe("Offline");
  });

  it("reports offline when warm cannot connect and keeps retrying in the background", async () => {
    getPeerConnectionInfo.mockResolvedValue({ connected: false, direct: false });
    warmContactConnection.mockResolvedValue({ connected: false, direct: false });

    const { result } = renderHook(() => usePeerReachability("envoy:owner:xyz", true));

    await waitFor(() => {
      expect(result.current.info).toEqual({ connected: false, direct: false });
    });
    expect(result.current.checking).toBe(false);
    expect(warmContactConnection).toHaveBeenCalled();
  });
});
