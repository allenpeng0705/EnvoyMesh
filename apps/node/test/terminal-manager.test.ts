import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockPty = {
  cols: 80,
  rows: 24,
  onData: vi.fn(() => ({ dispose: vi.fn() })),
  onExit: vi.fn(),
  write: vi.fn(),
  resize: vi.fn(),
  kill: vi.fn(),
};

vi.mock("node-pty", () => ({
  spawn: vi.fn(() => mockPty),
}));

import { TerminalManager } from "../src/terminal-manager.js";

describe("TerminalManager", () => {
  let profileDir: string;
  let manager: TerminalManager;

  beforeEach(async () => {
    profileDir = await mkdtemp(join(tmpdir(), "envoy-term-"));
    manager = new TerminalManager({ profileDir });
    mockPty.onData.mockClear();
    mockPty.onExit.mockClear();
    mockPty.write.mockClear();
    mockPty.resize.mockClear();
    mockPty.kill.mockClear();
  });

  afterEach(async () => {
    const sessions = manager.listTerminalSessions();
    for (const s of sessions) {
      if (s.state === "running") {
        await manager.closeTerminalSession({ sessionId: s.sessionId });
      }
    }
  });

  it("creates and lists a running session", async () => {
    const created = await manager.createTerminalSession({ title: "Test shell" });
    expect(created.state).toBe("running");
    expect(created.title).toBe("Test shell");
    const list = manager.listTerminalSessions();
    expect(list.some((s) => s.sessionId === created.sessionId)).toBe(true);
  });

  it("issues attach tokens for running sessions", async () => {
    const created = await manager.createTerminalSession({});
    const attach = manager.terminalAttach({ sessionId: created.sessionId, cols: 100, rows: 30 });
    expect(attach.wsUrl).toContain(created.sessionId);
    expect(manager.validateAttachToken(created.sessionId, attach.token)).toBe(true);
    expect(manager.validateAttachToken(created.sessionId, "bad-token")).toBe(false);
  });

  it("persists session metadata to sessions.json", async () => {
    const created = await manager.createTerminalSession({ title: "Persist me" });
    await new Promise((r) => setTimeout(r, 20));
    const raw = await readFile(join(profileDir, "terminals", "sessions.json"), "utf8");
    const parsed = JSON.parse(raw) as { sessions: Array<{ sessionId: string; title: string }> };
    expect(parsed.sessions.some((s) => s.sessionId === created.sessionId && s.title === "Persist me")).toBe(true);
  });

  it("enforces max session limit", async () => {
    for (let i = 0; i < 8; i++) {
      await manager.createTerminalSession({ title: `s${i}` });
    }
    await expect(manager.createTerminalSession({})).rejects.toThrow("terminal.maxSessions");
  });
});
