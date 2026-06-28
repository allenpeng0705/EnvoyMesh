import { describe, expect, it } from "vitest";
import {
  resetOutboundPeerLockForTests,
  withOutboundPeerLock,
} from "../src/outbound-peer-lock.js";

describe("outbound-peer-lock", () => {
  it("serializes concurrent operations for the same transport peer", async () => {
    resetOutboundPeerLockForTests();
    const order: string[] = [];
    const peer = "12D3KooWLockTest";

    const first = withOutboundPeerLock(peer, async () => {
      order.push("first-start");
      await new Promise((resolve) => setTimeout(resolve, 30));
      order.push("first-end");
    });

    const second = withOutboundPeerLock(peer, async () => {
      order.push("second-start");
      order.push("second-end");
    });

    await Promise.all([first, second]);
    expect(order).toEqual(["first-start", "first-end", "second-start", "second-end"]);
  });
});
