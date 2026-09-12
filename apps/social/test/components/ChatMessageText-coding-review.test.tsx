/**
 * @vitest-environment jsdom
 */
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import {
  CODING_REVIEW_REF_KIND,
  formatCodingReviewInviteMessage,
} from "@envoymesh/api";
import { ChatMessageText } from "../../src/components/ChatMessageText.js";
import { OPEN_CODING_EVENT } from "../../src/lib/open-coding-nav.js";
import { renderWithI18n } from "../helpers/render-with-i18n.js";

vi.mock("../../src/context/NodeStateContext.js", () => ({
  useNodeState: () => ({
    humanProfile: { ownerId: "envoy:owner:me", displayName: "Me" },
  }),
}));

describe("ChatMessageText — coding review CTA", () => {
  it("shows Open review and opens Coding read-only", () => {
    const events: CustomEvent[] = [];
    const onCoding = (ev: Event) => events.push(ev as CustomEvent);
    window.addEventListener(OPEN_CODING_EVENT, onCoding);
    const text = formatCodingReviewInviteMessage({
      kind: CODING_REVIEW_REF_KIND,
      v: 1,
      ownerId: "envoy:owner:me",
      chatId: "chat-review-1",
      title: "Fix login",
    });
    try {
      renderWithI18n(<ChatMessageText text={text} />);
      expect(screen.getByTestId("chat-coding-review-cta")).toBeDefined();
      expect(screen.queryByText(/envoymesh-coding-review/)).toBeNull();
      fireEvent.click(screen.getByTestId("chat-coding-review-open"));
      expect(events[0]?.detail).toEqual({
        chatId: "chat-review-1",
        reviewOnly: true,
        harness: "envoy-harness",
      });
    } finally {
      window.removeEventListener(OPEN_CODING_EVENT, onCoding);
    }
  });
});
