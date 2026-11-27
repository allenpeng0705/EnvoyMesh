import { describe, expect, it } from "vitest";
import {
  DEFAULT_BONDED_RESOURCE_SHORTLIST_INTERVAL_HOURS,
  shouldRunBondedResourceShortlistPass,
} from "../src/bonded-resource-shortlist-schedule.js";

describe("shouldRunBondedResourceShortlistPass", () => {
  it("defaults to documentAcquisitionEnabled when enabled omitted", () => {
    expect(
      shouldRunBondedResourceShortlistPass({
        documentAcquisitionEnabled: true,
      }),
    ).toBe(true);
    expect(
      shouldRunBondedResourceShortlistPass({
        documentAcquisitionEnabled: false,
      }),
    ).toBe(false);
  });

  it("respects explicit enabled and kill switch", () => {
    expect(
      shouldRunBondedResourceShortlistPass({
        enabled: true,
        documentAcquisitionEnabled: false,
      }),
    ).toBe(true);
    expect(
      shouldRunBondedResourceShortlistPass({
        enabled: true,
        autonomousKillSwitch: true,
      }),
    ).toBe(false);
  });

  it("throttles by interval (default 24h)", () => {
    expect(DEFAULT_BONDED_RESOURCE_SHORTLIST_INTERVAL_HOURS).toBe(24);
    const now = new Date("2026-11-27T12:00:00.000Z");
    expect(
      shouldRunBondedResourceShortlistPass({
        enabled: true,
        lastPassAt: "2026-11-27T00:00:00.000Z",
        now,
      }),
    ).toBe(false);
    expect(
      shouldRunBondedResourceShortlistPass({
        enabled: true,
        lastPassAt: "2026-11-26T11:00:00.000Z",
        now,
      }),
    ).toBe(true);
  });
});
