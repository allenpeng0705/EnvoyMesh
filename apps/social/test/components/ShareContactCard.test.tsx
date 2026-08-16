/**
 * @vitest-environment jsdom
 *
 * Phase A.1 — soft-gate Create link until circuit reservation is live
 * (mirrors Settings WAN invite).
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { ShareContactCard } from "../../src/components/discover/ShareContactCard.js";
import { renderWithI18n } from "../helpers/render-with-i18n.js";

const getCircuitReservationStatus = vi.fn();
const createWanJoinInvite = vi.fn();

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useNodeService: () => ({
    getCircuitReservationStatus,
    createWanJoinInvite,
  }),
}));

vi.mock("../../src/context/NodeStateContext.js", () => ({
  useNodeState: () => ({
    peerId: "12D3KooWShareTestPeer",
    nodeStatus: "running",
    humanProfile: { displayName: "Alice", ownerId: "envoy:owner:alice" },
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  getCircuitReservationStatus.mockResolvedValue({
    state: "pending",
    live: false,
    everReserved: false,
    relayPeerIds: [],
    checkedAt: new Date().toISOString(),
  });
  createWanJoinInvite.mockResolvedValue({
    token: "tok",
    invite: { targetPeerId: "12D3KooWShareTestPeer" },
  });
});

afterEach(() => cleanup());

describe("ShareContactCard — reservation soft-gate (Phase A.1)", () => {
  it("disables Create link while reservation is not ready", async () => {
    renderWithI18n(<ShareContactCard />);
    await waitFor(() => {
      expect(screen.getByTestId("share-circuit-reservation-chip").textContent).toMatch(/PENDING/i);
    });
    expect(screen.getByTestId("share-wait-reservation")).toBeDefined();
    const btn = screen.getByTestId("share-create-contact-link") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("enables Create link after force-without-reservation checkbox", async () => {
    renderWithI18n(<ShareContactCard />);
    await waitFor(() => {
      expect(screen.getByTestId("share-create-contact-link")).toBeDefined();
    });
    const btn = screen.getByTestId("share-create-contact-link") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.click(screen.getByTestId("share-force-without-reservation"));
    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);
    await waitFor(() => {
      expect(createWanJoinInvite).toHaveBeenCalledWith(
        expect.objectContaining({ forceWithoutReservation: true, compact: true }),
      );
    });
  });

  it("enables Create link when reservation is reserved", async () => {
    getCircuitReservationStatus.mockResolvedValue({
      state: "reserved",
      live: true,
      everReserved: true,
      relayPeerIds: ["12D3KooWRelay"],
      checkedAt: new Date().toISOString(),
    });
    renderWithI18n(<ShareContactCard />);
    await waitFor(() => {
      const btn = screen.getByTestId("share-create-contact-link") as HTMLButtonElement;
      expect(btn.disabled).toBe(false);
    });
    expect(screen.queryByTestId("share-wait-reservation")).toBeNull();
  });
});
