import { describe, expect, it, vi } from "vitest";
import {
  closeClientProxyStreamsForDevice,
  registerClientProxyStream,
} from "../src/client-proxy-handler.js";

describe("client-proxy stream registry (EM-R review fix)", () => {
  it("registers and closes streams per device, counting closed", () => {
    const closeA = vi.fn();
    const closeB = vi.fn();
    const unA = registerClientProxyStream("dev-1", closeA);
    registerClientProxyStream("dev-1", closeB);
    registerClientProxyStream("dev-2", closeB);

    expect(closeClientProxyStreamsForDevice("dev-1")).toBe(2);
    expect(closeA).toHaveBeenCalledTimes(1);
    expect(closeB).toHaveBeenCalledTimes(1);

    // Registry entry is gone after close; a second close returns 0.
    expect(closeClientProxyStreamsForDevice("dev-1")).toBe(0);
    // Unused device untouched.
    expect(closeClientProxyStreamsForDevice("dev-2")).toBe(1);
    void unA;
  });

  it("unregister removes a single stream and cleans up empty entries", () => {
    const closeA = vi.fn();
    const closeB = vi.fn();
    const unA = registerClientProxyStream("dev-x", closeA);
    registerClientProxyStream("dev-x", closeB);
    unA();
    expect(closeClientProxyStreamsForDevice("dev-x")).toBe(1);
    expect(closeB).toHaveBeenCalledTimes(1);
  });

  it("ignores undefined device ids", () => {
    const un = registerClientProxyStream(undefined, vi.fn());
    un();
    expect(closeClientProxyStreamsForDevice("anything")).toBe(0);
  });
});
