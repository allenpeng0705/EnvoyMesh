import { describe, expect, it } from "vitest";

import type { TerminalSessionSummary } from "@envoymesh/api";

import {
  deriveTerminalActivityBadge,
  deriveTerminalForegroundHint,
  enrichTerminalSessionSummaries,
} from "../src/terminal-activity.js";

function summary(overrides: Partial<TerminalSessionSummary> = {}): TerminalSessionSummary {
  return {
    sessionId: "s1",
    title: "Test",
    cwd: "/tmp",
    shell: "/bin/bash",
    state: "running",
    createdAt: "2026-06-05T00:00:00.000Z",
    lastActivityAt: "2026-06-05T12:00:00.000Z",
    ...overrides,
  };
}

describe("terminal-activity", () => {
  const nowMs = new Date("2026-06-05T12:00:10.000Z").getTime();

  it("marks exited sessions as done", () => {
    expect(
      deriveTerminalActivityBadge(
        summary({ state: "exited" }),
        "",
        { pendingApprovalCount: 0, openClawTurnInProgress: false, nowMs },
      ),
    ).toBe("done");
  });

  it("marks blocked when approvals pending and recent activity", () => {
    expect(
      deriveTerminalActivityBadge(
        summary({ lastActivityAt: "2026-06-05T11:59:30.000Z" }),
        "",
        { pendingApprovalCount: 2, openClawTurnInProgress: false, nowMs },
      ),
    ).toBe("blocked");
  });

  it("does not mark blocked when approvals pending but session is stale", () => {
    expect(
      deriveTerminalActivityBadge(
        summary({ lastActivityAt: "2026-06-05T11:00:00.000Z" }),
        "",
        { pendingApprovalCount: 2, openClawTurnInProgress: false, nowMs },
      ),
    ).toBe("idle");
  });

  it("handles invalid lastActivityAt safely", () => {
    expect(
      deriveTerminalActivityBadge(
        summary({ lastActivityAt: "not-a-date" }),
        "",
        { pendingApprovalCount: 0, openClawTurnInProgress: false, nowMs },
      ),
    ).toBe("idle");
  });

  it("prefers blocked over working when approvals pending on active session", () => {
    expect(
      deriveTerminalActivityBadge(
        summary({ lastActivityAt: "2026-06-05T12:00:08.000Z" }),
        "npm install\n",
        { pendingApprovalCount: 1, openClawTurnInProgress: true, nowMs },
      ),
    ).toBe("blocked");
  });

  it("marks working for recent output or openclaw turn", () => {
    expect(
      deriveTerminalActivityBadge(
        summary({ lastActivityAt: "2026-06-05T12:00:08.000Z" }),
        "",
        { pendingApprovalCount: 0, openClawTurnInProgress: false, nowMs },
      ),
    ).toBe("working");

    expect(
      deriveTerminalActivityBadge(
        summary({ lastActivityAt: "2026-06-05T11:58:00.000Z" }),
        "running npm install\n",
        { pendingApprovalCount: 0, openClawTurnInProgress: true, nowMs },
      ),
    ).toBe("working");
  });

  it("derives foreground hint from scrollback tail", () => {
    expect(deriveTerminalForegroundHint("foo\n$ openclaw gateway\n")).toBe("openclaw");
  });

  it("enriches session summaries with badges", () => {
    const enriched = enrichTerminalSessionSummaries(
      [summary()],
      () => "npm test running",
      { pendingApprovalCount: 0, openClawTurnInProgress: false, nowMs },
    );
    expect(enriched[0]?.activityBadge).toBe("working");
    expect(enriched[0]?.foregroundHint).toBe("npm");
  });
});
