import { describe, expect, it, beforeEach } from "vitest";
import {
  prioritizeHintsWithPathMemory,
  recordSuccessfulOutboundPath,
  resetOutboundPathMemoryForTests,
} from "../src/outbound-path-memory.js";

describe("outbound-path-memory", () => {
  beforeEach(() => {
    resetOutboundPathMemoryForTests();
  });

  it("prefers stored direct hint first", () => {
    const peer = "12D3KooWPathMem";
    const direct = `/ip4/10.0.0.8/tcp/4011/p2p/${peer}`;
    const relay = `/ip4/relay.example/tcp/4001/p2p/12Relay/p2p-circuit/p2p/${peer}`;
    recordSuccessfulOutboundPath(peer, "direct", direct);

    const ordered = prioritizeHintsWithPathMemory(peer, [relay, direct]);
    expect(ordered[0]).toBe(direct);
  });
});
