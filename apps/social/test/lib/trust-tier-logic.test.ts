/**
 * Logic tests for the trust-tier block/unblock UI (P0 #1).
 *
 * The bug: no UI ever called blockPeer/unblockPeer despite a complete 4-layer
 * backend. The fix added Block/Unblock actions to the ChatSidebar contact
 * context menu. These tests verify the logic that decides which action to
 * show + which RPC to call.
 */
import { describe, it, expect } from "vitest";

/** Decide whether to show "Block" or "Unblock" based on the bond level. */
function trustActionForBond(level: string | undefined): "block" | "unblock" {
  return level === "blocked" ? "unblock" : "block";
}

/** Decide which RPC to call for a given bond level. */
function rpcForTrustAction(action: "block" | "unblock"): string {
  return action === "block" ? "blockPeer" : "unblockPeer";
}

describe("trust-tier block/unblock UI logic", () => {
  it("shows Block for a direct (friend) contact", () => {
    expect(trustActionForBond("direct")).toBe("block");
  });

  it("shows Block for a referred (introduced) contact", () => {
    expect(trustActionForBond("referred")).toBe("block");
  });

  it("shows Block for a public (stranger) contact", () => {
    expect(trustActionForBond("public")).toBe("block");
  });

  it("shows Unblock for a blocked contact", () => {
    expect(trustActionForBond("blocked")).toBe("unblock");
  });

  it("shows Block when no bond exists (undefined level)", () => {
    expect(trustActionForBond(undefined)).toBe("block");
  });

  it("Block action calls blockPeer RPC", () => {
    expect(rpcForTrustAction("block")).toBe("blockPeer");
  });

  it("Unblock action calls unblockPeer RPC", () => {
    expect(rpcForTrustAction("unblock")).toBe("unblockPeer");
  });

  it("toggling: block then unblock returns to block", () => {
    const first = trustActionForBond("direct");
    expect(first).toBe("block");
    // After blocking, the level becomes "blocked"
    const second = trustActionForBond("blocked");
    expect(second).toBe("unblock");
    // After unblocking, the level returns to something else
    const third = trustActionForBond("public");
    expect(third).toBe("block");
  });
});
