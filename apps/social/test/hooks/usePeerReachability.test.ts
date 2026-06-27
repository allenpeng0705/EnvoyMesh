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

  it("warms on chat open when cache reports disconnected", async () => {
    const { result } = renderHook(() => usePeerReachability("envoy:owner:cold", true));

    await waitFor(() => {
      expect(result.current.info?.connected).toBe(true);
    });
    expect(warmContactConnection).toHaveBeenCalled();
    expect(warmContactConnection.mock.calls.some((call) => call[0] === "envoy:owner:cold")).toBe(true);
  });

  it("uses keepAlive when cache reports connected direct", async () => {
    getPeerConnectionInfo.mockResolvedValue({ connected: true, direct: true });

    const { result } = renderHook(() => usePeerReachability("envoy:owner:cached", true));

    await waitFor(() => {
      expect(result.current.info).toEqual({ connected: true, direct: true });
    });
    expect(
      warmContactConnection.mock.calls.some(
        (call) => call[0] === "envoy:owner:cached" && call[1]?.keepAlive === true,
      ),
    ).toBe(true);
  });

  it("does not restart reachability polling on parent re-render", async () => {
    getPeerConnectionInfo.mockResolvedValue({ connected: true, direct: true });

    const { rerender } = renderHook(() => usePeerReachability("envoy:owner:stable", true));

    await waitFor(() => {
      expect(getPeerConnectionInfo.mock.calls.length).toBeGreaterThan(0);
    });
    const callsAfterSettle = getPeerConnectionInfo.mock.calls.length;

    rerender();
    rerender();
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(getPeerConnectionInfo.mock.calls.length).toBe(callsAfterSettle);
  });

  it("shows Checking during non-silent warm", async () => {
    getPeerConnectionInfo.mockResolvedValue({ connected: false, direct: false });
    warmContactConnection.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve({ connected: true, direct: true }), 50);
        }),
    );

    const { result } = renderHook(() => usePeerReachability("envoy:owner:dialing", true));

    await waitFor(() => {
      expect(result.current.checking).toBe(true);
    });
    expect(peerReachabilityLabel(result.current.info, result.current.checking)).toBe("Checking…");

    await waitFor(() => {
      expect(result.current.info?.connected).toBe(true);
    });
  });
});
