import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
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
import { spawn } from "node-pty";

describe("TerminalManager", () => {
  let profileDir: string;
  let manager: TerminalManager;

  beforeEach(async () => {
    profileDir = await mkdtemp(join(tmpdir(), "envoy-term-"));
    manager = new TerminalManager({ profileDir });
    await manager.waitUntilReady();
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

  it("respawns running sessions from sessions.json on startup", async () => {
    const sessionId = "respawn-session-id";
    const now = new Date().toISOString();
    await mkdir(join(profileDir, "terminals"), { recursive: true });
    await writeFile(
      join(profileDir, "terminals", "sessions.json"),
      JSON.stringify({
        version: 1,
        sessions: [
          {
            sessionId,
            title: "Respawn me",
            cwd: profileDir,
            shell: "/bin/bash",
            createdAt: now,
            state: "running",
            lastActivityAt: now,
          },
        ],
      }),
      { mode: 0o600 },
    );

    const restarted = new TerminalManager({ profileDir });
    await restarted.waitUntilReady();
    const list = restarted.listTerminalSessions();
    expect(list.some((s) => s.sessionId === sessionId && s.state === "running")).toBe(true);
    await restarted.closeTerminalSession({ sessionId });
  });

  it("drops sessions that fail respawn instead of leaving exited rows", async () => {
    const sessionId = "bad-respawn-id";
    const now = new Date().toISOString();
    await mkdir(join(profileDir, "terminals"), { recursive: true });
    await writeFile(
      join(profileDir, "terminals", "sessions.json"),
      JSON.stringify({
        version: 1,
        sessions: [
          {
            sessionId,
            title: "Spawn fail",
            cwd: profileDir,
            shell: "/bin/bash",
            createdAt: now,
            state: "running",
            lastActivityAt: now,
          },
        ],
      }),
      { mode: 0o600 },
    );

    vi.mocked(spawn).mockImplementationOnce(() => {
      throw new Error("spawn failed");
    });

    const restarted = new TerminalManager({ profileDir });
    await restarted.waitUntilReady();
    const row = restarted.listTerminalSessions().find((s) => s.sessionId === sessionId);
    expect(row).toBeUndefined();
  });

  it("debounces session change notifications on PTY output", async () => {
    vi.useFakeTimers();
    const onSessionsChanged = vi.fn();
    const debouncedManager = new TerminalManager({ profileDir, onSessionsChanged });
    await debouncedManager.waitUntilReady();
    onSessionsChanged.mockClear();

    const created = await debouncedManager.createTerminalSession({});
    onSessionsChanged.mockClear();

    const onDataCb = mockPty.onData.mock.calls.at(-1)?.[0] as ((data: string) => void) | undefined;
    expect(onDataCb).toBeTypeOf("function");
    onDataCb!("output chunk");
    expect(onSessionsChanged).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(3_000);
    expect(onSessionsChanged).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
    await debouncedManager.closeTerminalSession({ sessionId: created.sessionId });
  });

  it("waits for persisted load before creating sessions", async () => {
    const sessionId = "race-session-id";
    const now = new Date().toISOString();
    await mkdir(join(profileDir, "terminals"), { recursive: true });
    await writeFile(
      join(profileDir, "terminals", "sessions.json"),
      JSON.stringify({
        version: 1,
        sessions: [
          {
            sessionId,
            title: "Race",
            cwd: profileDir,
            shell: "/bin/bash",
            createdAt: now,
            state: "running",
            lastActivityAt: now,
          },
        ],
      }),
      { mode: 0o600 },
    );

    const racing = new TerminalManager({ profileDir });
    const created = await racing.createTerminalSession({ title: "After load" });
    await racing.waitUntilReady();
    const list = racing.listTerminalSessions();
    expect(list.some((s) => s.sessionId === sessionId && s.state === "running")).toBe(true);
    expect(list.some((s) => s.sessionId === created.sessionId)).toBe(true);
    await racing.closeTerminalSession({ sessionId });
    await racing.closeTerminalSession({ sessionId: created.sessionId });
  });

  it("creates exec pane linked to parent and routes agent inject", async () => {
    const parent = await manager.createTerminalSession({ title: "main" });
    const execId = await manager.enableExecPane(parent.sessionId);
    expect(execId).toBeTruthy();
    expect(manager.getExecSessionId(parent.sessionId)).toBe(execId);
    expect(manager.resolveAgentInjectSessionId(parent.sessionId)).toBe(execId);

    const summaries = manager.listSessionSummaries();
    expect(summaries.some((s) => s.sessionId === parent.sessionId)).toBe(true);
    expect(summaries.some((s) => s.sessionId === execId)).toBe(false);

    manager.writeStdin(parent.sessionId, Buffer.from("echo hi\n"));
    expect(mockPty.write).toHaveBeenCalled();
    await manager.disableExecPane(parent.sessionId);
    expect(manager.isExecPaneEnabled(parent.sessionId)).toBe(false);
  });

  it("spawns custom command/args for role=pi and persists recipe without env", async () => {
    const created = await manager.createTerminalSession({
      title: "Pi",
      role: "pi",
      command: "/usr/bin/env",
      args: ["node", "--version"],
      env: { SECRET_KEY: "should-not-persist" },
    });
    expect(created.role).toBe("pi");
    expect(created.command).toBe("/usr/bin/env");
    expect(created.args).toEqual(["node", "--version"]);
    expect(manager.findPiSession()?.sessionId).toBe(created.sessionId);

    expect(spawn).toHaveBeenCalledWith(
      "/usr/bin/env",
      ["node", "--version"],
      expect.objectContaining({
        env: expect.objectContaining({ SECRET_KEY: "should-not-persist" }),
      }),
    );

    await new Promise((r) => setTimeout(r, 20));
    const raw = await readFile(join(profileDir, "terminals", "sessions.json"), "utf8");
    expect(raw).not.toContain("SECRET_KEY");
    const parsed = JSON.parse(raw) as {
      sessions: Array<{ role?: string; command?: string; args?: string[] }>;
    };
    const row = parsed.sessions.find((s) => s.role === "pi");
    expect(row?.command).toBe("/usr/bin/env");
    expect(row?.args).toEqual(["node", "--version"]);
  });

  it("does not auto-respawn role=pi sessions (ensurePi supplies fresh env)", async () => {
    const sessionId = "pi-session-id";
    const now = new Date().toISOString();
    await mkdir(join(profileDir, "terminals"), { recursive: true });
    await writeFile(
      join(profileDir, "terminals", "sessions.json"),
      JSON.stringify({
        version: 1,
        sessions: [
          {
            sessionId,
            title: "Pi",
            cwd: profileDir,
            shell: "/usr/bin/env",
            command: "/usr/bin/env",
            args: ["node", "--version"],
            createdAt: now,
            state: "running",
            lastActivityAt: now,
            role: "pi",
          },
        ],
      }),
      { mode: 0o600 },
    );

    const restarted = new TerminalManager({ profileDir });
    await restarted.waitUntilReady();
    expect(restarted.findPiSession()).toBeUndefined();
    expect(restarted.listTerminalSessions().some((s) => s.sessionId === sessionId)).toBe(false);
  });
});
