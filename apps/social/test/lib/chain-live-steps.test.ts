import { describe, expect, it } from "vitest";
import {
  orderLiveSteps,
  parseGoalInputRefs,
} from "../../src/lib/chain-live-steps.js";

describe("orderLiveSteps", () => {
  it("parents before children with depth indent", () => {
    const ordered = orderLiveSteps([
      {
        subtaskId: "b",
        objective: "child",
        state: "pending",
        dependsOn: ["a"],
      },
      {
        subtaskId: "a",
        objective: "parent",
        state: "done",
      },
    ]);
    expect(ordered.map((s) => s.subtaskId)).toEqual(["a", "b"]);
    expect(ordered[0]!.depth).toBe(0);
    expect(ordered[1]!.depth).toBe(1);
    expect(ordered[0]!.index).toBe(1);
    expect(ordered[1]!.index).toBe(2);
  });
});

describe("parseGoalInputRefs", () => {
  it("extracts [label] path tokens", () => {
    expect(
      parseGoalInputRefs(
        "Write a brief.\n[brief] imports/team-jobs/c1/in/doc.pdf\n[notes] vault/x.txt",
      ),
    ).toEqual([
      { label: "brief", path: "imports/team-jobs/c1/in/doc.pdf" },
      { label: "notes", path: "vault/x.txt" },
    ]);
  });

  it("returns empty for plain goals", () => {
    expect(parseGoalInputRefs("Just a goal")).toEqual([]);
  });
});
