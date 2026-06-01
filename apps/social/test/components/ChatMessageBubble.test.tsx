/**
 * @vitest-environment jsdom
 */
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, fireEvent } from "@testing-library/react";
import { ChatMessageBubble } from "../../src/components/ChatMessageBubble.js";
import { renderWithI18n } from "../helpers/render-with-i18n.js";

afterEach(() => cleanup());

describe("ChatMessageBubble — Phase 13B actor badges", () => {
  it("shows verified peer agent badge from actorBadge prop", () => {
    renderWithI18n(
      <ChatMessageBubble variant="incoming-agent" position="single" actorBadge="Bob's agent">
        Hello from Bob&apos;s agent
      </ChatMessageBubble>,
    );

    expect(screen.getByText("Bob's agent")).toBeDefined();
    expect(screen.getByText("Hello from Bob's agent")).toBeDefined();
  });

  it("shows unverified agent badge when actorBadge says so", () => {
    renderWithI18n(
      <ChatMessageBubble
        variant="incoming-agent"
        position="single"
        actorBadge="Bob's agent (unverified)"
      >
        Unverified agent message
      </ChatMessageBubble>,
    );

    expect(screen.getByText("Bob's agent (unverified)")).toBeDefined();
  });

  it("shows Your agent for outgoing-agent variant", () => {
    renderWithI18n(
      <ChatMessageBubble variant="outgoing-agent" position="single">
        Auto-sent reply
      </ChatMessageBubble>,
    );

    expect(screen.getByText("Your agent")).toBeDefined();
  });

  it("shows human contact name for incoming-peer with senderLabel", () => {
    renderWithI18n(
      <ChatMessageBubble variant="incoming-peer" position="single" senderLabel="Bob">
        Human message
      </ChatMessageBubble>,
    );

    expect(screen.getByText("Bob")).toBeDefined();
  });

  it("copies message text when copy button is clicked", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    renderWithI18n(
      <ChatMessageBubble variant="outgoing" position="single" copyText="Copy me">
        Copy me
      </ChatMessageBubble>,
    );

    fireEvent.click(screen.getByRole("button", { name: /^Copy message$/i }));
    expect(writeText).toHaveBeenCalledWith("Copy me");
  });
});
