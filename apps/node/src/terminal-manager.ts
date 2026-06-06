import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import type {
  CloseTerminalSessionParams,
  CreateTerminalSessionParams,
  RenameTerminalSessionParams,
  TerminalAttachParams,
  TerminalAttachResult,
  TerminalSessionSummary,
} from "@envoymesh/api";
import { createAuditEvent, type LocalTaskStore } from "@envoymesh/local-store";
import type { IPty } from "node-pty";

const MAX_SESSIONS = 8;
const MAX_SCROLLBACK_BYTES = 256 * 1024;
const ATTACH_TOKEN_TTL_MS = 10 * 60 * 1000;
const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 24;

interface PersistedTerminalRecord {
  sessionId: string;
  title: string;
  cwd: string;
  shell: string;
  createdAt: string;
  state: "running" | "exited";
  exitCode?: number;
  lastActivityAt: string;
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
}

export class TerminalManager {
  private readonly sessions = new Map<string, LiveSession>();
  private readonly exitedSessions = new Map<string, TerminalSessionSummary>();
  private readonly sessionsFilePath: string;
  private readonly taskStore?: LocalTaskStore;
  private readonly onSessionsChanged?: () => void;
  private persistQueue: Promise<void> = Promise.resolve();
  private terminalWsPort = 3031;
  private terminalWsPathPrefix = "/ws/terminal";

  constructor(options: TerminalManagerOptions) {
    this.sessionsFilePath = join(options.profileDir, "terminals", "sessions.json");
    this.taskStore = options.taskStore;
    this.onSessionsChanged = options.onSessionsChanged;
    void this.loadPersistedSessions();
  }

  setTerminalWsListenAddress(port: number, pathPrefix: string): void {
    this.terminalWsPort = port;
    this.terminalWsPathPrefix = pathPrefix;
  }

  listSessionSummaries(): TerminalSessionSummary[] {
    const live = [...this.sessions.values()].map((s) => ({ ...s.summary }));
    const exited = [...this.exitedSessions.values()];
    return [...live, ...exited].sort(
      (a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime(),
    );
  }

  listTerminalSessions(): TerminalSessionSummary[] {
    return this.listSessionSummaries();
  }

  async createTerminalSession(params: CreateTerminalSessionParams = {}): Promise<TerminalSessionSummary> {
    const runningCount = this.sessions.size;
    if (runningCount >= MAX_SESSIONS) {
      throw new Error(`terminal.maxSessions (${MAX_SESSIONS})`);
    }

    const ptyModule = await import("node-pty");
    const shell = process.env.SHELL || (process.platform === "win32" ? "powershell.exe" : "/bin/bash");
    const cwd = params.cwd?.trim() || process.cwd() || homedir();
    const cols = params.cols ?? DEFAULT_COLS;
    const rows = params.rows ?? DEFAULT_ROWS;
    const sessionId = randomUUID();
    const now = new Date().toISOString();
    const title = params.title?.trim() || `Terminal ${runningCount + 1}`;

    const ptyProcess = ptyModule.spawn(shell, [], {
      name: "xterm-color",
      cols,
      rows,
      cwd,
      env: process.env as Record<string, string>,
    });

    const summary: TerminalSessionSummary = {
      sessionId,
      title,
      cwd,
      shell,
      state: "running",
      createdAt: now,
      lastActivityAt: now,
    };

    const live: LiveSession = {
      summary,
      pty: ptyProcess,
      scrollback: new ScrollbackBuffer(MAX_SCROLLBACK_BYTES),
      attachTokens: new Map(),
    };

    ptyProcess.onData((data) => {
      live.scrollback.append(data);
      live.summary.lastActivityAt = new Date().toISOString();
    });

    ptyProcess.onExit(({ exitCode }) => {
      live.summary.state = "exited";
      live.summary.exitCode = exitCode;
      live.summary.lastActivityAt = new Date().toISOString();
      this.sessions.delete(sessionId);
      this.exitedSessions.set(sessionId, { ...live.summary });
      void this.persistSessions();
      void this.audit("terminal.session.exited", `session ${sessionId} exited code=${exitCode}`, sessionId);
      this.notifyChanged();
    });

    this.sessions.set(sessionId, live);
    await this.persistSessions();
    void this.audit("terminal.session.created", `session ${sessionId} title=${title}`, sessionId);
    this.notifyChanged();
    return { ...summary };
  }

  async closeTerminalSession(params: CloseTerminalSessionParams): Promise<void> {
    const sessionId = params.sessionId.trim();
    const live = this.sessions.get(sessionId);
    if (live) {
      try {
        live.pty.kill();
      } catch {
        //
      }
      this.sessions.delete(sessionId);
      live.summary.state = "exited";
      live.summary.lastActivityAt = new Date().toISOString();
      this.exitedSessions.set(sessionId, { ...live.summary });
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
    const live = this.sessions.get(sessionId);
    if (!live || live.summary.state !== "running") {
      throw new Error("terminal.sessionNotRunning");
    }
    live.pty.write(data.toString("latin1"));
    live.summary.lastActivityAt = new Date().toISOString();
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
      for (const row of parsed.sessions) {
        if (row.state === "exited") {
          this.exitedSessions.set(row.sessionId, {
            sessionId: row.sessionId,
            title: row.title,
            cwd: row.cwd,
            shell: row.shell,
            state: "exited",
            createdAt: row.createdAt,
            lastActivityAt: row.lastActivityAt,
            exitCode: row.exitCode,
          });
        }
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
      }));
      const payload: PersistedTerminalSessionsFile = { version: 1, sessions: records };
      await mkdir(join(this.sessionsFilePath, ".."), { recursive: true });
      const tmp = `${this.sessionsFilePath}.tmp`;
      await writeFile(tmp, JSON.stringify(payload, null, 2), { mode: 0o600 });
      await rename(tmp, this.sessionsFilePath);
    });
    return this.persistQueue;
  }
}
