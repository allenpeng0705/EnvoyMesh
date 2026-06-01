import { describe, expect, it } from "vitest";
import { bondLevelLabel, nearbyPeerLabel } from "../../src/lib/display.js";

describe("discover display helpers", () => {
  it("maps bond levels to plain language", () => {
    expect(bondLevelLabel("direct")).toBe("Friend");
    expect(bondLevelLabel("public")).toBe("New contact");
  });

  it("hides cryptic mDNS peer names", () => {
    expect(nearbyPeerLabel("Peer 12D3KooW", "12D3KooWabc")).toBe("Someone nearby");
    expect(nearbyPeerLabel("Alice", "12D3KooWabc")).toBe("Alice");
  });
});
