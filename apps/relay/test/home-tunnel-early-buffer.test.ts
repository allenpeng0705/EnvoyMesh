import { describe, expect, it } from "vitest";
import {
  MAX_EARLY_BUFFER_BYTES,
  pushProxyEarlyBuffer,
  type ProxyChannelState,
} from "../src/home-tunnel-proxy.js";
import type WebSocket from "ws";

function emptyState(): ProxyChannelState {
  return {
    mobile: {} as WebSocket,
    token: "tok",
    peerId: "12D3KooWHome",
    channelId: "ch-1",
    active: false,
    orphaned: false,
    earlyBuffer: [],
    earlyBufferBytes: 0,
  };
}

describe("pushProxyEarlyBuffer", () => {
  it("drops oldest frames when total bytes exceed MAX_EARLY_BUFFER_BYTES", () => {
    const state = emptyState();
    const chunk = "x".repeat(600 * 1024);
    for (let i = 0; i < 5; i++) {
      pushProxyEarlyBuffer(state, chunk);
    }
    expect(state.earlyBufferBytes).toBeLessThanOrEqual(MAX_EARLY_BUFFER_BYTES);
    expect(state.earlyBuffer.length).toBeGreaterThan(0);
    expect(state.earlyBuffer.length).toBeLessThan(5);
  });
});
