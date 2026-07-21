/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useInboxActivityCount } from "../../src/hooks/useInboxActivityCount.js";

vi.mock("../../src/context/NodeStateContext.js", () => ({
  useNodeState: () => ({
    pendingHellOs: [{ messageId: "h1" }],
    pendingIntroProposals: [{ messageId: "i1" }, { messageId: "i2" }],
    pendingMessages: [],
  }),
}));

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useShareOffers: () => ({ offers: [{ shareId: "s1" }] }),
  useAgentShareProposals: () => ({ proposals: [{ proposalId: "p1" }, { proposalId: "p2" }] }),
  useFeedNotifications: () => ({ items: [], dismiss: vi.fn() }),
}));

describe("useInboxActivityCount", () => {
  it("sums hellos, intros, strangers, share offers, and agent proposals", () => {
    const { result } = renderHook(() => useInboxActivityCount());
    expect(result.current).toBe(6);
  });
});
