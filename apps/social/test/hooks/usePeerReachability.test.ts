/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { usePeerReachability } from "../../src/hooks/usePeerReachability.js";

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
    const { result, rerender } = renderHook(
      ({ peerId }) => usePeerReachability(peerId, true),
      { initialProps: { peerId: "envoy:owner:abc" } },
    );

    for (let i = 0; i < 8; i++) {
      rerender({ peerId: "envoy:owner:abc" });
    }

    await waitFor(() => {
      expect(result.current.info).toEqual({ connected: true, direct: true });
    });

    expect(warmContactConnection).toHaveBeenCalled();
    expect(getPeerConnectionInfo.mock.calls.length).toBeLessThan(20);
    expect(result.current.checking).toBe(false);
  });

  it("shows online immediately when libp2p is already connected", async () => {
    getPeerConnectionInfo.mockResolvedValue({ connected: true, direct: true });

    const { result } = renderHook(() => usePeerReachability("envoy:owner:live", true));

    await waitFor(() => {
      expect(result.current.info).toEqual({ connected: true, direct: true });
    });
    expect(warmContactConnection).not.toHaveBeenCalled();
  });

  it("shows relay online without tearing down the path on chat open", async () => {
    getPeerConnectionInfo.mockResolvedValue({ connected: true, direct: false });

    const { result } = renderHook(() => usePeerReachability("envoy:owner:relay", true));

    await waitFor(() => {
      expect(result.current.info).toEqual({ connected: true, direct: false });
    });
    expect(warmContactConnection).not.toHaveBeenCalled();
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

  it("uses keepAlive on poll when already connected", async () => {
    getPeerConnectionInfo.mockResolvedValue({ connected: true, direct: true });
    warmContactConnection.mockResolvedValue({ connected: true, direct: true });

    const { result } = renderHook(() => usePeerReachability("envoy:owner:keepalive", true));

    await waitFor(() => {
      expect(result.current.info?.connected).toBe(true);
    });

    await waitFor(
      () => {
        expect(
          warmContactConnection.mock.calls.some((call) => call[1]?.keepAlive === true),
        ).toBe(true);
      },
      { timeout: 15_000 },
    );
  });
});
