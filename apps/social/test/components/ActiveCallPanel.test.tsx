/**
 * @vitest-environment jsdom
 */
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { renderWithI18n } from "../helpers/render-with-i18n.js";
import { ActiveCallPanel } from "../../src/components/ActiveCallPanel.js";

afterEach(() => cleanup());

describe("ActiveCallPanel — Phase 38", () => {
  it("renders the peer display name", () => {
    renderWithI18n(
      <ActiveCallPanel
        peerDisplayName="Alice"
        isMuted={false}
        connectionState="connected"
        onToggleMute={() => {}}
        onEndCall={() => {}}
      />,
    );
    expect(screen.getByText("Alice")).toBeDefined();
  });

  it("shows mute button labeled 'Mute' when not muted", () => {
    renderWithI18n(
      <ActiveCallPanel
        peerDisplayName="Carol"
        isMuted={false}
        connectionState="connected"
        onToggleMute={() => {}}
        onEndCall={() => {}}
      />,
    );
    expect(screen.getByLabelText(/mute/i)).toBeDefined();
  });

  it("shows mute button labeled 'Unmute' when muted", () => {
    renderWithI18n(
      <ActiveCallPanel
        peerDisplayName="Bob"
        isMuted={true}
        connectionState="connected"
        onToggleMute={() => {}}
        onEndCall={() => {}}
      />,
    );
    expect(screen.getByLabelText(/unmute/i)).toBeDefined();
  });

  it("calls onToggleMute when mute button is clicked", () => {
    const onToggleMute = vi.fn();
    renderWithI18n(
      <ActiveCallPanel
        peerDisplayName="Dave"
        isMuted={false}
        connectionState="connected"
        onToggleMute={onToggleMute}
        onEndCall={() => {}}
      />,
    );
    fireEvent.click(screen.getByLabelText(/mute/i));
    expect(onToggleMute).toHaveBeenCalledOnce();
  });

  it("calls onEndCall when end button is clicked", () => {
    const onEndCall = vi.fn();
    renderWithI18n(
      <ActiveCallPanel
        peerDisplayName="Eve"
        isMuted={false}
        connectionState="connected"
        onToggleMute={() => {}}
        onEndCall={onEndCall}
      />,
    );
    fireEvent.click(screen.getByLabelText(/end call/i));
    expect(onEndCall).toHaveBeenCalledOnce();
  });

  it("renders end call button", () => {
    renderWithI18n(
      <ActiveCallPanel
        peerDisplayName="Frank"
        isMuted={false}
        connectionState="connected"
        onToggleMute={() => {}}
        onEndCall={() => {}}
      />,
    );
    expect(screen.getByLabelText(/end call/i)).toBeDefined();
  });
});
