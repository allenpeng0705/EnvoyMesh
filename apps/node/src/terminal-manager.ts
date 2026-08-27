import { randomUUID } from "node:crypto";
import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import type {
  CloseTerminalSessionParams,
  CreateTerminalSessionParams,
  RenameTerminalSessionParams,
  TerminalAttachParams,
  TerminalAttachResult,
  TerminalSessionSummary,
} from "@envoymesh/api";
import { createAuditEvent, type LocalTaskStore } from "@envoymesh/local-store";
import { TERMINAL_WS_PORT } from "./service-ports.js";
import type { IPty } from "node-pty";

const MAX_SESSIONS = 8;
const MAX_SCROLLBACK_BYTES = 256 * 1024;
const ATTACH_TOKEN_TTL_MS = 10 * 60 * 1000;
const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 24;
const ACTIVITY_NOTIFY_DEBOUNCE_MS = 3_000;

interface PersistedTerminalRecord {
  sessionId: string;
  title: string;
  cwd: string;
  shell: string;
  createdAt: string;
  state: "running" | "exited";
  exitCode?: number;
  lastActivityAt: string;
  role?: "interactive" | "exec" | "pi" | "envoy-harness";
  parentSessionId?: string;
  execSessionId?: string;
  /** Custom spawn binary (Pi TUI = node). */
  command?: string;
  /** Custom spawn argv (no secrets). */
  args?: string[];
}

interface PersistedTerminalSessionsFile {
  version: 1;
  sessions: PersistedTerminalRecord[];
}

interface AttachTokenRecord {
  sessionId: string;
  token: string;
  expiresAt: number;
}

interface LiveSession {
  summary: TerminalSessionSummary;
  pty: IPty;
  scrollback: ScrollbackBuffer;
  attachTokens: Map<string, AttachTokenRecord>;
}

class ScrollbackBuffer {
  private readonly chunks: Buffer[] = [];
  private totalBytes = 0;

  constructor(private readonly maxBytes: number) {}

  append(data: string | Buffer): void {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
    if (buf.length === 0) return;
    this.chunks.push(buf);
    this.totalBytes += buf.length;
    while (this.totalBytes > this.maxBytes && this.chunks.length > 0) {
      const removed = this.chunks.shift()!;
      this.totalBytes -= removed.length;
    }
  }

  snapshot(): Buffer {
    return Buffer.concat(this.chunks);
  }
}

export interface TerminalManagerOptions {
  profileDir: string;
  taskStore?: LocalTaskStore;
  onSessionsChanged?: () => void;
  /** Fired after PTY output debounce — used for background watch (Phase 31D). */
  onSessionActivity?: (sessionId: string) => void;
}

export class TerminalManager {
  private readonly sessions = new Map<string, LiveSession>();
  private readonly exitedSessions = new Map<string, TerminalSessionSummary>();
  private readonly sessionsFilePath: string;
  private readonly taskStore?: LocalTaskStore;
  /**
   * The session-change callback fired after create/close/rename/etc.
   * Mutable (not readonly) so `setOnSessionsChanged` can wire a
   * TTL-cache invalidator after construction. Default no-op when the
   * caller doesn't supply one via options.
   */
  private onSessionsChanged: () => void = () => {};
  private readonly onSessionActivity?: (sessionId: string) => void;

  /**
   * Replace (or wrap) the session-change callback at runtime. Used by
   * NodeService to wire a TTL-cache invalidator after construction. If
   * a previous callback was installed (e.g. by the constructor options
   * or an earlier `setOnSessionsChanged` call), the new callback wraps
   * the old one so both fire — preventing accidental loss of any
   * subscriber. The returned function un-installs this installation.
   */
  setOnSessionsChanged(cb: () => void): () => void {
    const prev = this.onSessionsChanged;
    this.onSessionsChanged = () => {
      try { prev(); } finally { cb(); }
    };
    return () => {
      this.onSessionsChanged = prev;
    };
  }
  private readonly execPaneByParent = new Map<string, string>();
  private persistQueue: Promise<void> = Promise.resolve();
  private terminalWsPort = TERMINAL_WS_PORT;
  private terminalWsPathPrefix = "/ws/terminal";
  private loaded = false;
  private readyResolve!: () => void;
  private readonly ready: Promise<void>;

  constructor(options: TerminalManagerOptions) {
    this.sessionsFilePath = join(options.profileDir, "terminals", "sessions.json");
    this.taskStore = options.taskStore;
    this.onSessionsChanged = options.onSessionsChanged ?? (() => {});
    this.onSessionActivity = options.onSessionActivity;
    this.ready = new Promise<void>((resolve) => {
      this.readyResolve = resolve;
    });
    void this.loadPersistedSessions().finally(() => {
      this.loaded = true;
      this.readyResolve();
    });
  }

  /** Await persisted-session restore before creating or attaching. */
  waitUntilReady(): Promise<void> {
    return this.ready;
  }

  private async ensureReady(): Promise<void> {
    await this.ready;
  }

  setTerminalWsListenAddress(port: number, pathPrefix: string): void {
    this.terminalWsPort = port;
    this.terminalWsPathPrefix = pathPrefix;
  }

  listSessionSummaries(): TerminalSessionSummary[] {
    const live = [...this.sessions.values()]
      .map((s) => ({ ...s.summary }))
      .filter((s) => s.role !== "exec");
    const exited = [...this.exitedSessions.values()].filter((s) => s.role !== "exec");
    return [...live, ...exited].sort(
      (a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime(),
    );
  }

  listTerminalSessions(): TerminalSessionSummary[] {
    return this.listSessionSummaries();
  }

  getScrollbackTail(sessionId: string, maxBytes = 4096): string {
    const live = this.sessions.get(sessionId);
    if (!live) return "";
    const buf = live.scrollback.snapshot();
    if (buf.length <= maxBytes) return buf.toString("utf8");
    return buf.subarray(buf.length - maxBytes).toString("utf8");
  }

  async createTerminalSession(params: CreateTerminalSessionParams = {}): Promise<TerminalSessionSummary> {
    await this.ensureReady();
    const runningCount = this.sessions.size;
    if (runningCount >= MAX_SESSIONS) {
      throw new Error(`terminal.maxSessions (${MAX_SESSIONS})`);
    }

    const defaultShell = process.env.SHELL || (process.platform === "win32" ? "powershell.exe" : "/bin/bash");
    const command = params.command?.trim() || defaultShell;
    const args = params.args ?? [];
    const cwd = params.cwd?.trim() || process.cwd() || homedir();
    const cols = params.cols ?? DEFAULT_COLS;
    const rows = params.rows ?? DEFAULT_ROWS;
    const sessionId = randomUUID();
    const now = new Date().toISOString();
    const role = params.role ?? "interactive";
    const title =
      params.title?.trim() ||
      (role === "pi" ? "Pi" : `Terminal ${runningCount + 1}`);

    const summary = await this.spawnLiveSession({
      sessionId,
      title,
      cwd,
      shell: command,
      command,
      args,
      env: params.env,
      cols,
      rows,
      createdAt: now,
      role,
    });
    await this.persistSessions();
    void this.audit("terminal.session.created", `session ${sessionId} title=${title}`, sessionId);
    this.notifyChanged();
    return { ...summary };
  }

  /** Running reserved Pi TUI sessions (newest activity first). */
  listPiSessions(): TerminalSessionSummary[] {
    return this.listSessionsByRole("pi");
  }

  /** Running reserved sessions for a role (newest activity first). */
  listSessionsByRole(role: string): TerminalSessionSummary[] {
    return [...this.sessions.values()]
      .map((s) => s.summary)
      .filter((s) => s.role === role && s.state === "running")
      .map((s) => ({ ...s }))
      .sort(
        (a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime(),
      );
  }

  /** First running Pi TUI session, if any (legacy helper). */
  findPiSession(): TerminalSessionSummary | undefined {
    return this.listPiSessions()[0];
  }

  /** Running Pi TUI for this project folder (path-normalized), if any. */
  findPiSessionByCwd(cwd: string): TerminalSessionSummary | undefined {
    return this.findSessionByCwd("pi", cwd);
  }

  /** Running reserved session for a role + project folder (path-normalized). */
  findSessionByCwd(role: string, cwd: string): TerminalSessionSummary | undefined {
    const target = resolve(cwd.trim());
    for (const live of this.sessions.values()) {
      if (live.summary.role !== role || live.summary.state !== "running") continue;
      if (resolve(live.summary.cwd) === target) return { ...live.summary };
    }
    return undefined;
  }

  private async spawnLiveSession(params: {
    sessionId: string;
    title: string;
    cwd: string;
    shell: string;
    cols: number;
    rows: number;
    createdAt: string;
    role?: "interactive" | "exec" | "pi" | "envoy-harness";
    parentSessionId?: string;
    command?: string;
    args?: string[];
    env?: Record<string, string>;
  }): Promise<TerminalSessionSummary> {
    const ptyModule = await import("node-pty");
    const command = params.command?.trim() || params.shell;
    const args = params.args ?? [];
    // Merge env carefully on Windows: process.env uses `Path` while callers
    // often set `PATH`. Keep a single path key so node-pty/CreateProcess
    // does not ignore the prepended fd/rg dir.
    const childEnv: Record<string, string> = {
      ...(process.env as Record<string, string>),
    };
    if (params.env) {
      for (const [k, v] of Object.entries(params.env)) {
        if (v === undefined || v === null) continue;
        if (k.toLowerCase() === "path") {
          const existingKey =
            Object.keys(childEnv).find((ek) => ek.toLowerCase() === "path") ?? k;
          for (const ek of Object.keys(childEnv)) {
            if (ek.toLowerCase() === "path" && ek !== existingKey) delete childEnv[ek];
          }
          childEnv[existingKey] = v;
          continue;
        }
        childEnv[k] = v;
      }
    }
    childEnv.TERM = process.env.TERM || "xterm-256color";
    let ptyProcess;
    try {
      ptyProcess = ptyModule.spawn(command, args, {
        name: "xterm-256color",
        cols: params.cols,
        rows: params.rows,
        cwd: params.cwd,
        env: childEnv,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("posix_spawnp")) {
        throw new Error(
          "terminal.spawnFailed: node-pty spawn-helper is not executable — run `npm install` again or `chmod +x node_modules/node-pty/prebuilds/*/spawn-helper`",
        );
      }
      throw err;
    }

    const summary: TerminalSessionSummary = {
      sessionId: params.sessionId,
      title: params.title,
      cwd: params.cwd,
      shell: command,
      state: "running",
      createdAt: params.createdAt,
      lastActivityAt: params.createdAt,
      role: params.role ?? "interactive",
      ...(params.parentSessionId ? { parentSessionId: params.parentSessionId } : {}),
      ...(params.command ? { command: params.command } : {}),
      ...(args.length > 0 ? { args } : {}),
    };

    const live: LiveSession = {
      summary,
      pty: ptyProcess,
      scrollback: new ScrollbackBuffer(MAX_SCROLLBACK_BYTES),
      attachTokens: new Map(),
    };
    let activityNotifyTimer: ReturnType<typeof setTimeout> | null = null;

    ptyProcess.onData((data) => {
      live.scrollback.append(data);
      live.summary.lastActivityAt = new Date().toISOString();
      if (activityNotifyTimer) clearTimeout(activityNotifyTimer);
      activityNotifyTimer = setTimeout(() => {
        activityNotifyTimer = null;
        this.onSessionActivity?.(params.sessionId);
        this.notifyChanged();
      }, ACTIVITY_NOTIFY_DEBOUNCE_MS);
    });

    ptyProcess.onExit(({ exitCode }) => {
      this.sessions.delete(params.sessionId);
      void this.persistSessions();
      void this.audit(
        "terminal.session.exited",
        `session ${params.sessionId} exited code=${exitCode}`,
        params.sessionId,
      );
      this.notifyChanged();
    });

    this.sessions.set(params.sessionId, live);
    return summary;
  }

  async closeTerminalSession(params: CloseTerminalSessionParams): Promise<void> {
    await this.ensureReady();
    const sessionId = params.sessionId.trim();
    const execId = this.execPaneByParent.get(sessionId);
    if (execId) {
      await this.closeTerminalSession({ sessionId: execId });
      this.execPaneByParent.delete(sessionId);
    }
    const live = this.sessions.get(sessionId);
    if (live?.summary.parentSessionId) {
      const parentId = live.summary.parentSessionId;
      const parent = this.sessions.get(parentId);
      if (parent?.summary.execSessionId === sessionId) {
        parent.summary.execSessionId = undefined;
      }
      this.execPaneByParent.delete(parentId);
    }
    if (live) {
      try {
        live.pty.kill();
      } catch {
        //
      }
      this.sessions.delete(sessionId);
      this.exitedSessions.delete(sessionId);
    } else {
      const exited = this.exitedSessions.get(sessionId);
      if (!exited) {
        throw new Error("terminal.sessionNotFound");
      }
      this.exitedSessions.delete(sessionId);
    }
    await this.persistSessions();
    void this.audit("terminal.session.closed", `session ${sessionId} closed`, sessionId);
    this.notifyChanged();
  }

  async renameTerminalSession(params: RenameTerminalSessionParams): Promise<TerminalSessionSummary> {
    await this.ensureReady();
    const sessionId = params.sessionId.trim();
    const title = params.title.trim();
    if (!title) {
      throw new Error("terminal.titleRequired");
    }
    const live = this.sessions.get(sessionId);
    const exited = this.exitedSessions.get(sessionId);
    const target = live?.summary ?? exited;
    if (!target) {
      throw new Error("terminal.sessionNotFound");
    }
    target.title = title;
    target.lastActivityAt = new Date().toISOString();
    await this.persistSessions();
    void this.audit("terminal.session.renamed", `session ${sessionId} renamed`, sessionId);
    this.notifyChanged();
    return { ...target };
  }

  terminalAttach(params: TerminalAttachParams): TerminalAttachResult {
    if (!this.loaded) {
      throw new Error("terminal.notReady");
    }
    const sessionId = params.sessionId.trim();
    const live = this.sessions.get(sessionId);
    if (!live) {
      throw new Error("terminal.sessionNotFound");
    }
    if (live.summary.state !== "running") {
      throw new Error("terminal.sessionNotRunning");
    }

    const cols = params.cols ?? live.pty.cols ?? DEFAULT_COLS;
    const rows = params.rows ?? live.pty.rows ?? DEFAULT_ROWS;
    if (cols !== live.pty.cols || rows !== live.pty.rows) {
      live.pty.resize(cols, rows);
    }

    const token = randomUUID();
    live.attachTokens.set(token, {
      sessionId,
      token,
      expiresAt: Date.now() + ATTACH_TOKEN_TTL_MS,
    });

    const wsUrl = `ws://127.0.0.1:${this.terminalWsPort}${this.terminalWsPathPrefix}/${sessionId}?token=${encodeURIComponent(token)}`;
    return { sessionId, token, wsUrl, cols, rows };
  }

  validateAttachToken(sessionId: string, token: string): boolean {
    const live = this.sessions.get(sessionId);
    if (!live) return false;
    const record = live.attachTokens.get(token);
    if (!record) return false;
    if (Date.now() > record.expiresAt) {
      live.attachTokens.delete(token);
      return false;
    }
    return record.sessionId === sessionId;
  }

  getLiveSession(sessionId: string): LiveSession | undefined {
    return this.sessions.get(sessionId);
  }

  getScrollback(sessionId: string): Buffer {
    const live = this.sessions.get(sessionId);
    return live ? live.scrollback.snapshot() : Buffer.alloc(0);
  }

  writeStdin(sessionId: string, data: Buffer): void {
    const targetId = this.resolveAgentInjectSessionId(sessionId);
    const live = this.sessions.get(targetId);
    if (!live || live.summary.state !== "running") {
      throw new Error("terminal.sessionNotRunning");
    }
    live.pty.write(data.toString("latin1"));
    live.summary.lastActivityAt = new Date().toISOString();
  }

  resolveAgentInjectSessionId(sessionId: string): string {
    const execId = this.execPaneByParent.get(sessionId);
    if (execId && this.sessions.has(execId)) {
      return execId;
    }
    return sessionId;
  }

  getExecSessionId(parentSessionId: string): string | undefined {
    const id = this.execPaneByParent.get(parentSessionId);
    if (id && this.sessions.has(id)) return id;
    return undefined;
  }

  isExecPaneEnabled(parentSessionId: string): boolean {
    return Boolean(this.getExecSessionId(parentSessionId));
  }

  async enableExecPane(parentSessionId: string): Promise<string> {
    await this.ensureReady();
    const parent = this.sessions.get(parentSessionId);
    if (!parent || parent.summary.state !== "running") {
      throw new Error("terminal.sessionNotRunning");
    }
    if (parent.summary.role === "exec") {
      throw new Error("terminal.execPane.invalidParent");
    }
    const existing = this.getExecSessionId(parentSessionId);
    if (existing) return existing;

    const execSessionId = randomUUID();
    const now = new Date().toISOString();
    await this.spawnLiveSession({
      sessionId: execSessionId,
      title: `Agent exec · ${parent.summary.title}`,
      cwd: parent.summary.cwd,
      shell: parent.summary.shell,
      cols: DEFAULT_COLS,
      rows: Math.max(8, Math.floor(DEFAULT_ROWS / 2)),
      createdAt: now,
      role: "exec",
      parentSessionId,
    });
    parent.summary.execSessionId = execSessionId;
    this.execPaneByParent.set(parentSessionId, execSessionId);
    await this.persistSessions();
    void this.audit("terminal.session.created", `exec pane ${execSessionId} for ${parentSessionId}`, parentSessionId);
    this.notifyChanged();
    return execSessionId;
  }

  async disableExecPane(parentSessionId: string): Promise<void> {
    const execId = this.getExecSessionId(parentSessionId);
    if (!execId) return;
    await this.closeTerminalSession({ sessionId: execId });
  }

  resize(sessionId: string, cols: number, rows: number): void {
    const live = this.sessions.get(sessionId);
    if (!live || live.summary.state !== "running") return;
    if (cols > 0 && rows > 0) {
      live.pty.resize(cols, rows);
    }
  }

  subscribeOutput(sessionId: string, handler: (data: Buffer) => void): () => void {
    const live = this.sessions.get(sessionId);
    if (!live) return () => {};
    const listener = live.pty.onData((data) => handler(Buffer.from(data, "binary")));
    return () => {
      listener.dispose();
    };
  }

  private notifyChanged(): void {
    this.onSessionsChanged?.();
  }

  private async audit(type: "terminal.session.created" | "terminal.session.closed" | "terminal.session.renamed" | "terminal.session.exited", summary: string, sessionId: string): Promise<void> {
    if (!this.taskStore) return;
    try {
      await this.taskStore.appendAuditEvent(
        createAuditEvent({
          type,
          intent: "chat.message",
          messageId: randomUUID(),
          remotePeerId: "local",
          direction: "local",
          verificationStatus: "verified",
          latencyMs: 0,
          outcome: "record",
          summary: `${summary}`,
          correlationId: sessionId,
        }),
      );
    } catch {
      //
    }
  }

  private async loadPersistedSessions(): Promise<void> {
    try {
      const raw = await readFile(this.sessionsFilePath, "utf8");
      const parsed = JSON.parse(raw) as PersistedTerminalSessionsFile;
      if (parsed.version !== 1 || !Array.isArray(parsed.sessions)) return;
      const toRespawn: PersistedTerminalRecord[] = [];
      for (const row of parsed.sessions) {
        if (row.state === "exited") {
          continue;
        } else if (row.state === "running") {
          toRespawn.push(row);
        }
      }
      for (const row of toRespawn) {
        if (this.sessions.size >= MAX_SESSIONS) break;
        if (this.sessions.has(row.sessionId) || this.exitedSessions.has(row.sessionId)) continue;
        // Pi TUI sessions are started on demand after the user picks a project
        // folder (API keys must not be stored in sessions.json).
        if (row.role === "pi") continue;
        const cwd = await this.resolveRespawnCwd(row.cwd);
        try {
          await this.spawnLiveSession({
            sessionId: row.sessionId,
            title: row.title,
            cwd,
            shell: row.shell,
            command: row.command,
            args: row.args,
            cols: DEFAULT_COLS,
            rows: DEFAULT_ROWS,
            createdAt: row.createdAt,
            role: row.role,
            parentSessionId: row.parentSessionId,
          });
        } catch (err) {
          console.warn(`[terminal-manager] failed to respawn session ${row.sessionId}:`, err);
        }
      }
      if (toRespawn.length > 0) {
        await this.persistSessions();
        this.notifyChanged();
      }
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code !== "ENOENT") {
        console.warn("[terminal-manager] failed to load sessions.json:", err);
      }
    }
  }

  private persistSessions(): Promise<void> {
    this.persistQueue = this.persistQueue.then(async () => {
      const records: PersistedTerminalRecord[] = this.listSessionSummaries().map((s) => ({
        sessionId: s.sessionId,
        title: s.title,
        cwd: s.cwd,
        shell: s.shell,
        createdAt: s.createdAt,
        state: s.state,
        exitCode: s.exitCode,
        lastActivityAt: s.lastActivityAt,
        role: s.role,
        parentSessionId: s.parentSessionId,
        execSessionId: s.execSessionId,
        command: s.command,
        args: s.args,
      }));
      for (const live of this.sessions.values()) {
        if (live.summary.role !== "exec") continue;
        records.push({
          sessionId: live.summary.sessionId,
          title: live.summary.title,
          cwd: live.summary.cwd,
          shell: live.summary.shell,
          createdAt: live.summary.createdAt,
          state: live.summary.state,
          exitCode: live.summary.exitCode,
          lastActivityAt: live.summary.lastActivityAt,
          role: live.summary.role,
          parentSessionId: live.summary.parentSessionId,
          command: live.summary.command,
          args: live.summary.args,
        });
      }
      const payload: PersistedTerminalSessionsFile = { version: 1, sessions: records };
      await mkdir(join(this.sessionsFilePath, ".."), { recursive: true });
      const tmp = `${this.sessionsFilePath}.tmp`;
      await writeFile(tmp, JSON.stringify(payload, null, 2), { mode: 0o600 });
      await rename(tmp, this.sessionsFilePath);
    });
    return this.persistQueue;
  }

  private async resolveRespawnCwd(cwd: string): Promise<string> {
    const trimmed = cwd.trim();
    if (!trimmed) return homedir();
    try {
      await access(trimmed);
      return trimmed;
    } catch {
      console.warn(`[terminal-manager] respawn cwd missing, falling back to home: ${trimmed}`);
      return homedir();
    }
  }
}
