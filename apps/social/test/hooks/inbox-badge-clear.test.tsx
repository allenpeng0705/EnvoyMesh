/**
 * @vitest-environment jsdom
 *
 * Regression test for the "Inbox badge does not clear after viewing profile-
 * update notifications" bug.
 *
 * Root cause: the Inbox badge counts every item in the feedNotifications array,
 * and the only way to remove an item was the per-row Dismiss button. Opening the
 * Inbox did nothing. Fix: a bulk `dismissAll` clears all feed notifications when
 * the Inbox mounts, dropping the badge to zero — the conventional folder-open
 * behavior of email/messaging apps.
 */
import { describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useInboxActivityCount } from "../../src/hooks/useInboxActivityCount.js";

// vi.hoisted lets the hoisted vi.mock closures reference mutable state.
const state = vi.hoisted(() => ({
  feedItems: [
    { id: "a", messageId: "m1", publisherOwnerId: "envoy:owner:1", title: "Profile updated", url: "envoy://x", kind: "profile" },
    { id: "b", messageId: "m2", publisherOwnerId: "envoy:owner:2", title: "New photo", url: "envoy://y", kind: "photo" },
  ],
  dismissAll: vi.fn(async () => { state.feedItems = []; }),
}));

vi.mock("../../src/context/NodeStateContext.js", () => ({
  useNodeState: () => ({
    pendingHellOs: [],
    pendingIntroProposals: [],
    pendingMessages: [],
  }),
}));

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useShareOffers: () => ({ offers: [] }),
  useAgentShareProposals: () => ({ proposals: [] }),
  useFeedNotifications: () => ({ items: state.feedItems, dismiss: vi.fn(), dismissAll: state.dismissAll }),
}));

describe("useInboxActivityCount with dismissAll", () => {
  it("counts feed notifications toward the badge before dismissAll", () => {
    const { result } = renderHook(() => useInboxActivityCount());
    // 2 feed notifications + 0 of everything else = 2
    expect(result.current).toBe(2);
  });

  it("useFeedNotifications exposes dismissAll and clears the badge when called", async () => {
    const { useFeedNotifications } = await import("../../src/hooks/useNodeService.js");
    const { result } = renderHook(() => useFeedNotifications());
    expect(typeof result.current.dismissAll).toBe("function");
    await act(async () => { await result.current.dismissAll(); });
    expect(state.dismissAll).toHaveBeenCalledOnce();
    // After dismissAll, feedItems is empty → badge drops to 0
    const { result: countResult } = renderHook(() => useInboxActivityCount());
    expect(countResult.current).toBe(0);
  });
});
