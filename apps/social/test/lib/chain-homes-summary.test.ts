import { describe, expect, it } from "vitest";
import { summarizeChainHomes, shortChainPeerId } from "../../src/lib/chain-homes-summary.js";

describe("summarizeChainHomes", () => {
  it("marks creator watching remote Assigner and lists worker peers", () => {
    const out = summarizeChainHomes({
      remoteOwnership: {
        assignerPeerId: "assigner_peer",
        localRole: "creator",
      },
      steps: [
        { workerPeerId: "worker_a" },
        { workerPeerId: "worker_b" },
        { workerPeerId: "assigner_peer" },
      ],
    });
    expect(out.watchingRemoteAssigner).toBe(true);
    expect(out.assignerPeerId).toBe("assigner_peer");
    expect(out.workerPeerIds).toEqual(["worker_a", "worker_b"]);
  });

  it("shortens long peer ids", () => {
    expect(shortChainPeerId("abcdefghijklmnopq")).toBe("abcdefghijklmno…");
  });
});
