import { describe, expect, it } from "vitest";
import { shouldLeanBootstrapForPendingSponsorBond } from "../src/node-service-start.js";

describe("shouldLeanBootstrapForPendingSponsorBond", () => {
  it("is true when sponsor auto-bond is enabled and not completed", () => {
    expect(
      shouldLeanBootstrapForPendingSponsorBond({
        setupSponsorFriendEnabled: true,
      }),
    ).toBe(true);
  });

  it("is false after sponsor bond completed", () => {
    expect(
      shouldLeanBootstrapForPendingSponsorBond({
        setupSponsorFriendEnabled: true,
        setupSponsorFriendCompletedAt: "2026-08-04T00:00:00.000Z",
      }),
    ).toBe(false);
  });

  it("is false when sponsor auto-bond is disabled", () => {
    expect(
      shouldLeanBootstrapForPendingSponsorBond({
        setupSponsorFriendEnabled: false,
      }),
    ).toBe(false);
  });
});
