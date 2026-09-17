import { describe, expect, it } from "vitest";
import { shouldAskPiProposal } from "../src/pi-autorun-policy.js";

describe("shouldAskPiProposal", () => {
  it("off never asks", () => {
    expect(shouldAskPiProposal("Write file", "overwrite a.ts", "off")).toBe(
      false,
    );
  });

  it("always-confirm always asks", () => {
    expect(shouldAskPiProposal("Read file", "read a.ts", "always-confirm")).toBe(
      true,
    );
  });

  it("safe-only filters by title/message hints", () => {
    expect(
      shouldAskPiProposal("Read file", "read package.json", "safe-only"),
    ).toBe(false);
    expect(
      shouldAskPiProposal("Write file", "create src/x.ts", "safe-only"),
    ).toBe(true);
  });
});
