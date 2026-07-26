/**
 * @vitest-environment jsdom
 *
 * Feed notifies badge Content (not Chat → Inbox). Inbox count must ignore feeds.
 */
import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useInboxActivityCount } from "../../src/hooks/useInboxActivityCount.js";

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
  // Even if feed notifies exist, Inbox badge must stay 0.
  useFeedNotifications: () => ({
    items: [
      { id: "a", messageId: "m1", title: "New post", url: "envoy://x", kind: "feed" },
    ],
    unread: [
      { id: "a", messageId: "m1", title: "New post", url: "envoy://x", kind: "feed" },
    ],
    dismiss: vi.fn(),
    dismissAll: vi.fn(),
  }),
}));

describe("useInboxActivityCount excludes feed notifies", () => {
  it("does not count feed notifications toward the Chat/Inbox badge", () => {
    const { result } = renderHook(() => useInboxActivityCount());
    expect(result.current).toBe(0);
  });
});
