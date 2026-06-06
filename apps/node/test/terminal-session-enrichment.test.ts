import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const onDataHandlers: Array<(data: string) => void> = [];

const mockPty = {
  cols: 80,
  rows: 24,
  onData: vi.fn((cb: (data: string) => void) => {
    onDataHandlers.push(cb);
    return { dispose: vi.fn() };
  }),
  onExit: vi.fn(),
  write: vi.fn(),
  resize: vi.fn(),
  kill: vi.fn(),
};

vi.mock("node-pty", () => ({
  spawn: vi.fn(() => mockPty),
}));

import { enrichTerminalSessionSummaries } from "../src/terminal-activity.js";
import { TerminalManager } from "../src/terminal-manager.js";

function emitPtyOutput(text: string): void {
  for (const handler of onDataHandlers) {
    handler(text);
  }
}

describe("terminal session enrichment (E2E-ish integration)", () => {
  let profileDir: string;
  let manager: TerminalManager;
  let sessionId: string;

  beforeEach(async () => {
    onDataHandlers.length = 0;
    profileDir = await mkdtemp(join(tmpdir(), "envoy-term-enrich-"));
    manager = new TerminalManager({ profileDir });
    await manager.waitUntilReady();
    const created = await manager.createTerminalSession({ title: "Badge test" });
    sessionId = created.sessionId;
  });

  afterEach(async () => {
    if (sessionId) {
      await manager.closeTerminalSession({ sessionId });
    }
  });

  it("derives working badge from live scrollback after PTY output", () => {
    manager.writeStdin(sessionId, Buffer.from("npm test\n", "utf8"));
    emitPtyOutput("running npm test\n");

    const nowMs = Date.now();
    const enriched = enrichTerminalSessionSummaries(
      manager.listTerminalSessions(),
      (id) => manager.getScrollbackTail(id),
      { pendingApprovalCount: 0, openClawTurnInProgress: false, nowMs },
    );
    const row = enriched.find((s) => s.sessionId === sessionId);
    expect(row?.activityBadge).toBe("working");
    expect(row?.foregroundHint).toBe("npm");
  });

  it("derives blocked badge when approvals pending on recently active session", () => {
    emitPtyOutput("prompt$ ");

    const nowMs = Date.now();
    const enriched = enrichTerminalSessionSummaries(
      manager.listTerminalSessions(),
      (id) => manager.getScrollbackTail(id),
      { pendingApprovalCount: 1, openClawTurnInProgress: false, nowMs },
    );
    expect(enriched.find((s) => s.sessionId === sessionId)?.activityBadge).toBe("blocked");
  });
});
