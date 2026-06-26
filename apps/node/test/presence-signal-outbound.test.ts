import { describe, expect, it } from "vitest";
import { ownListenAddrsForPresenceSignal } from "../src/presence-signal-outbound.js";

describe("ownListenAddrsForPresenceSignal", () => {
  const peerId = "12D3KooWQsD3ougrAJjmKeevSiY2azE5CKqLjcijyYreS6fUFYCR";

  it("keeps same-LAN tcp/0 listen ports and drops loopback", () => {
    const addrs = ownListenAddrsForPresenceSignal(peerId, [
      `/ip4/127.0.0.1/tcp/63628/p2p/${peerId}`,
      `/ip4/192.168.3.85/tcp/63628/p2p/${peerId}`,
      `/ip4/47.93.11.212/tcp/4001/p2p/12D3KooWRelay/p2p-circuit/p2p/${peerId}`,
    ]);
    expect(addrs).toEqual([`/ip4/192.168.3.85/tcp/63628/p2p/${peerId}`]);
  });
});
