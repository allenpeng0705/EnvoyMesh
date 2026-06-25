/**
 * @vitest-environment jsdom
 */
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { renderWithI18n } from "../helpers/render-with-i18n.js";
import { IncomingCallModal } from "../../src/components/IncomingCallModal.js";

vi.mock("../../src/hooks/useIncomingCallRingtone.js", () => ({
  useIncomingCallRingtone: vi.fn(),
}));

afterEach(() => cleanup());

describe("IncomingCallModal — Phase 38", () => {
  it("renders the caller name and subtitle", () => {
    renderWithI18n(
      <IncomingCallModal
        callerName="Alice"
        callerOwnerId="envoy:owner:abc123"
        callType="audio"
        onAccept={() => {}}
        onDecline={() => {}}
      />,
    );
    expect(screen.getByText("Alice")).toBeDefined();
    expect(screen.getByText(/is calling you/i)).toBeDefined();
  });

  it("calls onAccept when accept button is clicked", () => {
    const onAccept = vi.fn();
    renderWithI18n(
      <IncomingCallModal
        callerName="Bob"
        callerOwnerId="envoy:owner:xyz"
        callType="audio"
        onAccept={onAccept}
        onDecline={() => {}}
      />,
    );
    fireEvent.click(screen.getByText(/accept/i));
    expect(onAccept).toHaveBeenCalledOnce();
  });

  it("calls onDecline when decline button is clicked", () => {
    const onDecline = vi.fn();
    renderWithI18n(
      <IncomingCallModal
        callerName="Carol"
        callerOwnerId="envoy:owner:def"
        callType="audio"
        onAccept={() => {}}
        onDecline={onDecline}
      />,
    );
    fireEvent.click(screen.getByText(/decline/i));
    expect(onDecline).toHaveBeenCalledOnce();
  });

  it("renders accept and decline buttons", () => {
    renderWithI18n(
      <IncomingCallModal
        callerName="Dave"
        callerOwnerId="envoy:owner:ghi"
        callType="audio"
        onAccept={() => {}}
        onDecline={() => {}}
      />,
    );
    expect(screen.getByText(/accept/i)).toBeDefined();
    expect(screen.getByText(/decline/i)).toBeDefined();
  });

  it("shows video call copy for incoming video calls", () => {
    renderWithI18n(
      <IncomingCallModal
        callerName="Alice"
        callerOwnerId="envoy:owner:abc"
        callType="video"
        onAccept={() => {}}
        onDecline={() => {}}
      />,
    );
    expect(screen.getByText(/incoming video call/i)).toBeDefined();
    expect(screen.getByText(/video calling you/i)).toBeDefined();
  });
});
