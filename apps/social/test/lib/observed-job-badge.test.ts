import { describe, expect, it } from "vitest";
import { classifyObservedJobBadge } from "../../src/lib/observed-job-badge.js";

describe("classifyObservedJobBadge", () => {
  it("marks assigned when local worker is running", () => {
    expect(
      classifyObservedJobBadge({
        phase: "running",
        localAgentPeerId: "me",
        steps: [{ state: "running", workerPeerId: "me" }],
      }),
    ).toBe("assignedToYou");
  });

  it("marks waiting on assigner during bidding", () => {
    expect(
      classifyObservedJobBadge({
        phase: "bidding",
        localAgentPeerId: "me",
        steps: [{ state: "offered" }],
      }),
    ).toBe("waitingOnAssigner");
  });

  it("marks blocked when waitingOn is present", () => {
    expect(
      classifyObservedJobBadge({
        phase: "running",
        localAgentPeerId: "me",
        steps: [{ state: "pending", waitingOn: [{ key: "x" }] }],
      }),
    ).toBe("blockedOnPrior");
  });
});
