import { describe, expect, it } from "vitest";
import {
  shouldLeanBootstrapForDhtOffMode,
  shouldLeanBootstrapForPendingSponsorBond,
} from "../src/node-service-start.js";

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

describe("shouldLeanBootstrapForDhtOffMode", () => {
  it("is true for quietWan (the new relay-only mode)", () => {
    expect(shouldLeanBootstrapForDhtOffMode("quietWan")).toBe(true);
  });

  it("is true for aggressive (DHT off, legacy)", () => {
    expect(shouldLeanBootstrapForDhtOffMode("aggressive")).toBe(true);
  });

  it("is false for modes that keep the public DHT", () => {
    expect(shouldLeanBootstrapForDhtOffMode("normal")).toBe(false);
    expect(shouldLeanBootstrapForDhtOffMode("optimized")).toBe(false);
    expect(shouldLeanBootstrapForDhtOffMode("smart")).toBe(false);
  });

  it("is false when mode is unset (defaults to optimized, which keeps DHT)", () => {
    expect(shouldLeanBootstrapForDhtOffMode(undefined)).toBe(false);
    expect(shouldLeanBootstrapForDhtOffMode("")).toBe(false);
  });

  it("is case-sensitive (quietwan / quiet-wan are not valid modes)", () => {
    expect(shouldLeanBootstrapForDhtOffMode("quietwan")).toBe(false);
    expect(shouldLeanBootstrapForDhtOffMode("quiet-wan")).toBe(false);
  });
});
