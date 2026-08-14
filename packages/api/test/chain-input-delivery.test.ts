import { describe, expect, it } from "vitest";
import {
  DEFAULT_CHAIN_INPUT_DELIVERY_POLICY,
  canRetryChainInputDelivery,
  chainInputComposerStagingDir,
  chainInputDeliveredRelativePath,
  chainInputJobWorkspaceDir,
  chainInputWorkspaceInDir,
  parseChainInputAttachmentsFromGoal,
  sanitizeChainInputFileName,
  selectChainInputsForSubtask,
} from "../src/chain-input-delivery.js";

describe("chain-input-delivery (Phase 59A)", () => {
  it("exposes locked default policy", () => {
    expect(DEFAULT_CHAIN_INPUT_DELIVERY_POLICY).toEqual({
      autoDeliverOnAward: true,
      scope: "referenced",
      gc: "on_terminal",
    });
  });

  it("builds staging and workspace paths", () => {
    expect(chainInputComposerStagingDir("tj_abc")).toBe("imports/team-jobs/tj_abc");
    expect(chainInputJobWorkspaceDir("chain_1")).toBe("imports/team-jobs/chain_1");
    expect(chainInputWorkspaceInDir("chain_1")).toBe("imports/team-jobs/chain_1/in");
    expect(chainInputDeliveredRelativePath("chain_1", "Brief.PDF")).toBe(
      "imports/team-jobs/chain_1/in/Brief.PDF",
    );
    expect(sanitizeChainInputFileName("../x/y")).toBe(".._x_y");
  });

  it("parses Attachments block with labels and bare paths", () => {
    const goal = [
      "Summarize the brief",
      "",
      "Attachments:",
      "- [brief] imports/team-jobs/tj_1/brief.pdf",
      "- imports/team-jobs/tj_1/raw.csv",
      "",
      "More notes after",
    ].join("\n");
    expect(parseChainInputAttachmentsFromGoal(goal)).toEqual([
      {
        sourceRelativePath: "imports/team-jobs/tj_1/brief.pdf",
        label: "brief",
        fileName: "brief.pdf",
      },
      {
        sourceRelativePath: "imports/team-jobs/tj_1/raw.csv",
        fileName: "raw.csv",
      },
    ]);
  });

  it("returns empty when there is no Attachments block", () => {
    expect(parseChainInputAttachmentsFromGoal("Just a goal")).toEqual([]);
  });

  it("selects referenced attachments with all-job fallback", () => {
    const attachments = [
      {
        sourceRelativePath: "imports/a/brief.pdf",
        label: "brief",
        fileName: "brief.pdf",
      },
      {
        sourceRelativePath: "imports/a/data.csv",
        label: "sales",
        fileName: "data.csv",
      },
    ];
    expect(
      selectChainInputsForSubtask({
        attachments,
        objective: "Read [brief] and draft an outline",
      }).map((a) => a.label),
    ).toEqual(["brief"]);

    expect(
      selectChainInputsForSubtask({
        attachments,
        objective: "Do something with no labels",
      }),
    ).toHaveLength(2);

    expect(
      selectChainInputsForSubtask({
        attachments,
        objective: "Use sales only",
        scope: "all",
      }),
    ).toHaveLength(2);
  });

  it("gates pending Retry by updatedAt age", () => {
    const now = Date.parse("2026-08-14T12:00:30.000Z");
    expect(canRetryChainInputDelivery("failed", undefined, now)).toBe(true);
    expect(canRetryChainInputDelivery("transferring", undefined, now)).toBe(true);
    expect(canRetryChainInputDelivery("verified", "2026-01-01T00:00:00.000Z", now)).toBe(
      false,
    );
    expect(canRetryChainInputDelivery("pending", undefined, now)).toBe(false);
    expect(
      canRetryChainInputDelivery("pending", "2026-08-14T12:00:20.000Z", now),
    ).toBe(false);
    expect(
      canRetryChainInputDelivery("pending", "2026-08-14T12:00:00.000Z", now),
    ).toBe(true);
  });
});
