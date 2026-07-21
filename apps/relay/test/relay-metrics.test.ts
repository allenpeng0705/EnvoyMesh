import { describe, expect, it } from "vitest";
import { createRelayMetrics } from "../src/relay-metrics.js";

describe("createRelayMetrics", () => {
  it("counts checkins and lookup hit/miss by query shape", () => {
    const m = createRelayMetrics();
    m.recordCheckin();
    m.recordCheckin();
    m.recordLookup({ topicHash: "bafy…", peersReturned: 2 });
    m.recordLookup({ targetPeerId: "12D3KooW", peersReturned: 0 });
    m.recordLookup({ capability: "mesh.discovery", peersReturned: 1 });

    const snap = m.snapshot();
    expect(snap.checkins).toBe(2);
    expect(snap.lookups).toBe(3);
    expect(snap.lookupByTopicHash).toBe(1);
    expect(snap.lookupByPeerId).toBe(1);
    expect(snap.lookupByCapability).toBe(1);
    expect(snap.lookupHits).toBe(2);
    expect(snap.lookupMisses).toBe(1);
    expect(snap.lookupPeersReturned).toBe(3);
  });
});
