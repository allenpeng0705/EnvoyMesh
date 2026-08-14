/** @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { I18nTestProvider } from "../../src/context/I18nContext.js";

const getSetupSponsorFriendStatus = vi.fn();
const runSetupSponsorFriend = vi.fn();

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useNodeService: () => ({
    getSetupSponsorFriendStatus,
    runSetupSponsorFriend,
    applyWanJoinInvite: vi.fn(),
    redeemCompanyInvite: vi.fn(),
  }),
}));

const bondsState = {
  bonds: [] as Array<{ peerOwnerId: string; level: string }>,
};

vi.mock("../../src/context/NodeStateContext.js", () => ({
  useNodeState: () => bondsState,
}));

describe("SponsorSetupTile", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    bondsState.bonds = [];
    getSetupSponsorFriendStatus.mockReset();
    runSetupSponsorFriend.mockReset();
    runSetupSponsorFriend.mockResolvedValue({
      ok: true,
      skipped: true,
      reason: "already-bonded",
    });
    getSetupSponsorFriendStatus.mockResolvedValue({
      config: {
        enabled: true,
        ownerId: "envoy:owner:allen",
        displayName: "Allen Peng",
      },
      state: {
        lastError: "libp2p mesh not ready yet — deferring bond.request",
        lastErrorKind: "mesh-not-ready",
        attempts: 3,
      },
      sponsorProofTokenRequired: false,
    });
  });

  it("hides when the user already has a bonded contact", async () => {
    bondsState.bonds = [{ peerOwnerId: "envoy:owner:allen", level: "direct" }];
    const { SponsorSetupTile } = await import(
      "../../src/components/discover/SponsorSetupTile.js"
    );
    const { container } = render(
      <I18nTestProvider locale="en">
        <SponsorSetupTile />
      </I18nTestProvider>,
    );
    await waitFor(() => {
      expect(getSetupSponsorFriendStatus).toHaveBeenCalled();
    });
    expect(screen.queryByText(/Add your first contact/i)).toBeNull();
    expect(container.querySelector(".sponsor-setup-tile")).toBeNull();
  });

  it("shows failed sponsor setup when there are no bonds yet", async () => {
    const { SponsorSetupTile } = await import(
      "../../src/components/discover/SponsorSetupTile.js"
    );
    render(
      <I18nTestProvider locale="en">
        <SponsorSetupTile />
      </I18nTestProvider>,
    );
    await waitFor(() => {
      expect(screen.getByText(/Add your first contact/i)).toBeTruthy();
    });
    expect(screen.getAllByText(/Allen Peng/i).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /Retry now/i })).toBeTruthy();
  });
});
