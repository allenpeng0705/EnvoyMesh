import { describe, expect, it } from "vitest";
import {
  buildChainGoalWithAttachments,
  sanitizeAttachmentLabel,
  sanitizeTeamJobFileName,
} from "../../src/lib/chain-goal-attachments.js";

describe("buildChainGoalWithAttachments", () => {
  it("returns trimmed goal when there are no attachments", () => {
    expect(buildChainGoalWithAttachments("  Hello world  ", [])).toBe("Hello world");
  });

  it("puts short labels first in the Attachments block", () => {
    const goal = buildChainGoalWithAttachments("Research the brief", [
      {
        relativePath: "imports/team-jobs/tj_abc/a.pdf",
        label: "brief",
      },
      {
        relativePath: "imports/team-jobs/tj_abc/b.csv",
      },
    ]);
    expect(goal).toBe(
      [
        "Research the brief",
        "",
        "Attachments:",
        "- [brief] imports/team-jobs/tj_abc/a.pdf",
        "- imports/team-jobs/tj_abc/b.csv",
      ].join("\n"),
    );
  });

  it("skips attachments without a path", () => {
    expect(
      buildChainGoalWithAttachments("Goal only", [
        { relativePath: "  ", label: "ignored" },
      ]),
    ).toBe("Goal only");
  });
});

describe("sanitizeAttachmentLabel", () => {
  it("trims, strips brackets/newlines, and caps length", () => {
    expect(sanitizeAttachmentLabel("  source brief  ")).toBe("source brief");
    expect(sanitizeAttachmentLabel("[brief]\ndata")).toBe("brief data");
    expect(sanitizeAttachmentLabel("x".repeat(50))?.length).toBe(40);
    expect(sanitizeAttachmentLabel("   ")).toBeUndefined();
  });
});

describe("sanitizeTeamJobFileName", () => {
  it("strips path separators", () => {
    expect(sanitizeTeamJobFileName("../../evil/name.pdf")).toBe(".._.._evil_name.pdf");
    expect(sanitizeTeamJobFileName("plain.txt")).toBe("plain.txt");
  });
});
