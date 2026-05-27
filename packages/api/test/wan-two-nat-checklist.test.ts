import { describe, expect, it } from "vitest";
import {
  WAN_TWO_NAT_CHECKLIST_STEPS,
  formatWanTwoNatOperatorChecklist,
} from "../src/wan-two-nat-checklist.js";

describe("wan-two-nat-checklist", () => {
  it("includes five operator steps", () => {
    expect(WAN_TWO_NAT_CHECKLIST_STEPS.length).toBe(5);
  });

  it("formats checklist with evidence fields", () => {
    const text = formatWanTwoNatOperatorChecklist({
      relayAddr: "/ip4/1.2.3.4/tcp/4001/p2p/abc",
      natAPeerId: "12D3A",
      natBPeerId: "12D3B",
      automatedBaselineOk: true,
      chatVerified: true,
      operator: "@you",
    });
    expect(text).toContain("12D3A");
    expect(text).toContain("Automated baseline: [x]");
    expect(text).toContain("Manual two-NAT chat: [x]");
  });
});
