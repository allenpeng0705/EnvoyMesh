import { describe, expect, it } from "vitest";
import {
  clampWanJoinInviteExpiresInHours,
  WAN_JOIN_INVITE_DEFAULT_EXPIRES_HOURS,
  WAN_JOIN_INVITE_MAX_EXPIRES_HOURS,
} from "../src/wan-join-invite-limits.js";

describe("wan-join-invite-limits", () => {
  it("defaults invalid input to 168 hours", () => {
    expect(clampWanJoinInviteExpiresInHours(undefined)).toBe(WAN_JOIN_INVITE_DEFAULT_EXPIRES_HOURS);
    expect(clampWanJoinInviteExpiresInHours(0)).toBe(WAN_JOIN_INVITE_DEFAULT_EXPIRES_HOURS);
    expect(clampWanJoinInviteExpiresInHours(Number.NaN)).toBe(WAN_JOIN_INVITE_DEFAULT_EXPIRES_HOURS);
  });

  it("clamps to one year maximum", () => {
    expect(clampWanJoinInviteExpiresInHours(8760)).toBe(8760);
    expect(clampWanJoinInviteExpiresInHours(99999)).toBe(WAN_JOIN_INVITE_MAX_EXPIRES_HOURS);
  });
});
