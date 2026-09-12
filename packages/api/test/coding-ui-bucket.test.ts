import { describe, expect, it } from "vitest";
import type { EhAgentStateName } from "../src/eh-timeline.js";
import {
  codingUiBucketRank,
  deriveCodingUiBucket,
  type CodingUiBucket,
} from "../src/coding-ui-bucket.js";

const ALL_STATES: EhAgentStateName[] = [
  "ready",
  "submitting",
  "thinking",
  "running_tool",
  "waiting_for_approval",
  "waiting_for_answer",
  "verifying",
  "reconnecting",
  "completed",
  "failed",
  "cancelled",
];

describe("deriveCodingUiBucket", () => {
  it("maps every EhAgentStateName to a known bucket", () => {
    for (const state of ALL_STATES) {
      const bucket = deriveCodingUiBucket({ state });
      expect(["needs_input", "failed", "attention", "running", "done"]).toContain(
        bucket,
      );
    }
  });

  it("needs_input for waiting states and pending permission override", () => {
    expect(deriveCodingUiBucket({ state: "waiting_for_approval" })).toBe(
      "needs_input",
    );
    expect(deriveCodingUiBucket({ state: "waiting_for_answer" })).toBe(
      "needs_input",
    );
    expect(
      deriveCodingUiBucket({
        state: "thinking",
        hasPendingPermissionOrQuestion: true,
      }),
    ).toBe("needs_input");
  });

  it("failed for failed and cancelled", () => {
    expect(deriveCodingUiBucket({ state: "failed" })).toBe("failed");
    expect(deriveCodingUiBucket({ state: "cancelled" })).toBe("failed");
  });

  it("running for in-flight states", () => {
    for (const state of [
      "submitting",
      "thinking",
      "running_tool",
      "verifying",
      "reconnecting",
    ] as const) {
      expect(deriveCodingUiBucket({ state }), state).toBe("running");
    }
  });

  it("attention when completed with outstanding file changes", () => {
    expect(
      deriveCodingUiBucket({
        state: "completed",
        hasOutstandingFileChanges: true,
      }),
    ).toBe("attention");
  });

  it("done for ready and completed without review", () => {
    expect(deriveCodingUiBucket({ state: "ready" })).toBe("done");
    expect(deriveCodingUiBucket({ state: "completed" })).toBe("done");
  });

  it("sorts buckets needs_input → failed → attention → running → done", () => {
    const order: CodingUiBucket[] = [
      "needs_input",
      "failed",
      "attention",
      "running",
      "done",
    ];
    const ranks = order.map(codingUiBucketRank);
    expect(ranks).toEqual([0, 1, 2, 3, 4]);
  });
});
