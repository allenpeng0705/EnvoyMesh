import { describe, expect, it } from "vitest";
import { withOutboundSendLock } from "../src/outbound-send-lock.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("withOutboundSendLock", () => {
  it("serializes concurrent work for the same transport peer", async () => {
    let active = 0;
    let maxActive = 0;

    const work = async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await sleep(25);
      active -= 1;
    };

    await Promise.all([
      withOutboundSendLock("12D3KooWLockPeer", work),
      withOutboundSendLock("12D3KooWLockPeer", work),
      withOutboundSendLock("12D3KooWLockPeer", work),
    ]);

    expect(maxActive).toBe(1);
  });

  it("allows parallel work for different transport peers", async () => {
    let active = 0;
    let maxActive = 0;

    const work = async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await sleep(25);
      active -= 1;
    };

    await Promise.all([
      withOutboundSendLock("12D3KooWLockPeerA", work),
      withOutboundSendLock("12D3KooWLockPeerB", work),
    ]);

    expect(maxActive).toBe(2);
  });
});
