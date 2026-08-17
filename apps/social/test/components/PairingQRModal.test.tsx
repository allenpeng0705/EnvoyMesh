/**
 * @vitest-environment jsdom
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { PairingQRModal } from "../../src/components/PairingQRModal.js";
import { renderWithI18n } from "../helpers/render-with-i18n.js";

const getPairingPayload = vi.fn();
const generateFamilyInviteToken = vi.fn();

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useNodeService: () => ({
    getPairingPayload,
    generateFamilyInviteToken,
  }),
}));

vi.mock("qrcode", () => ({
  default: {
    toDataURL: vi.fn().mockResolvedValue("data:image/png;base64,qr"),
  },
}));

vi.mock("@envoymesh/api", async () => {
  const actual = await vi.importActual<typeof import("@envoymesh/api")>("@envoymesh/api");
  return {
    ...actual,
    encodePairingToken: vi.fn().mockResolvedValue("tok"),
  };
});

describe("PairingQRModal family invite button", () => {
  beforeEach(() => {
    getPairingPayload.mockResolvedValue({
      ownerId: "envoy:owner:test",
      wsUrl: "ws://127.0.0.1:3030/ws",
    });
    generateFamilyInviteToken.mockResolvedValue({
      token: "fam",
      uri: "envoy://invite?token=fam",
      expiresAt: "2099-01-01T00:00:00.000Z",
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows a family invite button that opens the family QR modal", async () => {
    renderWithI18n(<PairingQRModal onClose={() => {}} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Show family invite QR/i })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: /Show family invite QR/i }));

    await waitFor(() => {
      expect(generateFamilyInviteToken).toHaveBeenCalled();
      expect(screen.getByText(/Invite a family member/i)).toBeTruthy();
      expect(
        screen.getByRole("button", { name: /Back to owner pairing QR/i }),
      ).toBeTruthy();
    });
  });

  it("still offers family invite when owner pairing QR fails", async () => {
    getPairingPayload.mockReset();
    getPairingPayload.mockRejectedValue(new Error("pairing unavailable"));
    renderWithI18n(<PairingQRModal onClose={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText(/pairing unavailable/i)).toBeTruthy();
      expect(screen.getByRole("button", { name: /Show family invite QR/i })).toBeTruthy();
    });
  });

  it("on a family-only review home renders the family invite QR directly and never the owner QR", async () => {
    getPairingPayload.mockResolvedValue({
      token: "family.review-secret",
      wsUrl: "ws://127.0.0.1:3030/ws",
    });
    renderWithI18n(<PairingQRModal onClose={() => {}} />);

    await waitFor(() => {
      expect(generateFamilyInviteToken).toHaveBeenCalled();
      expect(screen.getByText(/Invite a family member/i)).toBeTruthy();
    });

    // No owner pairing QR, no "show family invite" secondary button, no
    // "back to owner pairing" affordance, and no owner-grants-full-access hint.
    expect(screen.queryByRole("button", { name: /Show family invite QR/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Back to owner pairing QR/i })).toBeNull();
    expect(screen.queryByText(/full owner access/i)).toBeNull();
    expect(screen.queryByText(/envoy:\/\/pair/i)).toBeNull();
  });

  it("family-only review home closing the QR dismisses the whole dialog (no owner QR behind it)", async () => {
    getPairingPayload.mockResolvedValue({
      token: "family.review-secret",
      wsUrl: "ws://127.0.0.1:3030/ws",
    });
    const onClose = vi.fn();
    renderWithI18n(<PairingQRModal onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText(/Invite a family member/i)).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: /Close pairing/i }));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });
});
