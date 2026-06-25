/**
 * @vitest-environment jsdom
 */
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { renderWithI18n } from "../helpers/render-with-i18n.js";
import { ActiveCallPanel } from "../../src/components/ActiveCallPanel.js";

const baseProps = {
  peerDisplayName: "Alice",
  peerOwnerId: "envoy:owner:alice",
  callType: "audio" as const,
  isMuted: false,
  isRemoteMuted: false,
  micAvailable: true,
  cameraAvailable: true,
  connectionState: "connected",
  onToggleMute: () => {},
  onEndCall: () => {},
};

afterEach(() => cleanup());

describe("ActiveCallPanel — Phase 38", () => {
  it("renders the peer display name", () => {
    renderWithI18n(<ActiveCallPanel {...baseProps} />);
    expect(screen.getByText("Alice")).toBeDefined();
  });

  it("shows mute button labeled 'Mute' when not muted", () => {
    renderWithI18n(<ActiveCallPanel {...baseProps} peerDisplayName="Carol" />);
    expect(screen.getByLabelText(/mute/i)).toBeDefined();
  });

  it("shows mute button labeled 'Unmute' when muted", () => {
    renderWithI18n(
      <ActiveCallPanel {...baseProps} peerDisplayName="Bob" isMuted={true} />,
    );
    expect(screen.getByLabelText(/unmute/i)).toBeDefined();
  });

  it("disables mute when microphone is unavailable", () => {
    renderWithI18n(
      <ActiveCallPanel {...baseProps} micAvailable={false} />,
    );
    const muteBtn = screen.getByLabelText(/listen only/i) as HTMLButtonElement;
    expect(muteBtn.disabled).toBe(true);
    expect(screen.getByText(/listen only/i)).toBeDefined();
  });

  it("shows remote muted hint", () => {
    renderWithI18n(
      <ActiveCallPanel {...baseProps} isRemoteMuted={true} />,
    );
    expect(screen.getByText(/they are muted/i)).toBeDefined();
  });

  it("calls onToggleMute when mute button is clicked", () => {
    const onToggleMute = vi.fn();
    renderWithI18n(
      <ActiveCallPanel {...baseProps} peerDisplayName="Dave" onToggleMute={onToggleMute} />,
    );
    fireEvent.click(screen.getByLabelText(/mute/i));
    expect(onToggleMute).toHaveBeenCalledOnce();
  });

  it("calls onEndCall when end button is clicked", () => {
    const onEndCall = vi.fn();
    renderWithI18n(
      <ActiveCallPanel {...baseProps} peerDisplayName="Eve" onEndCall={onEndCall} />,
    );
    fireEvent.click(screen.getByLabelText(/end call/i));
    expect(onEndCall).toHaveBeenCalledOnce();
  });

  it("shows connecting status before connected", () => {
    renderWithI18n(
      <ActiveCallPanel {...baseProps} connectionState="connecting" />,
    );
    expect(screen.getByText(/connecting/i)).toBeDefined();
  });

  it("renders video stage and elements for video calls", () => {
    const { container } = renderWithI18n(
      <ActiveCallPanel {...baseProps} callType="video" connectionState="connected" />,
    );
    expect(container.querySelector(".active-call-panel--video")).toBeTruthy();
    expect(container.querySelector(".active-call-video-stage")).toBeTruthy();
    expect(container.querySelector(".active-call-remote-video")).toBeTruthy();
  });

  it("shows camera unavailable hint for video calls without camera", () => {
    renderWithI18n(
      <ActiveCallPanel
        {...baseProps}
        callType="video"
        cameraAvailable={false}
        connectionState="connected"
      />,
    );
    expect(screen.getByText(/no camera|audio only/i)).toBeDefined();
  });
});
