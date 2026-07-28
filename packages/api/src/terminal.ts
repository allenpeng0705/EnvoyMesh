export type TerminalSessionState = "running" | "exited";

export type TerminalActivityBadge = "idle" | "working" | "blocked" | "done";

export interface TerminalSessionSummary {
  sessionId: string;
  title: string;
  cwd: string;
  shell: string;
  state: TerminalSessionState;
  createdAt: string;
  lastActivityAt: string;
  exitCode?: number;
  /**
   * interactive (default), hidden exec pane for agent inject, or reserved
   * Pi interactive TUI session (coding surface).
   */
  role?: "interactive" | "exec" | "pi";
  /** Exec pane session id (interactive sessions only). */
  execSessionId?: string;
  /** Parent interactive session (exec sessions only). */
  parentSessionId?: string;
  /** herdr-inspired session row badge (derived on list). */
  activityBadge?: TerminalActivityBadge;
  /** Last-seen foreground process hint from scrollback tail. */
  foregroundHint?: string;
  /** Binary for custom spawns (e.g. Node for Pi TUI). Defaults to shell. */
  command?: string;
  /** Argv for custom spawns (empty = login shell). */
  args?: string[];
}

export interface OpenInHerdrParams {
  cwd?: string;
}

export type OpenInHerdrResult =
  | { ok: true; cwd: string }
  | { ok: false; reason: string };

export interface TerminalHerdrExportHintParams {
  sessionId: string;
}

export interface TerminalHerdrExportHintResult {
  exportPath: string;
  preview: string;
  socketNote: string;
}

export interface CreateTerminalSessionParams {
  title?: string;
  cwd?: string;
  cols?: number;
  rows?: number;
  /** Reserved session role (e.g. `"pi"` for the coding TUI). */
  role?: "interactive" | "pi";
  /** Override spawn binary (default: user shell). */
  command?: string;
  /** Argv for `command` (default: empty = interactive shell). */
  args?: string[];
  /**
   * Extra env merged into the child (API keys for Pi, etc.).
   * Not persisted to sessions.json — re-supplied on ensure/respawn.
   */
  env?: Record<string, string>;
}

export interface RenameTerminalSessionParams {
  sessionId: string;
  title: string;
}

export interface CloseTerminalSessionParams {
  sessionId: string;
}

export interface TerminalAttachParams {
  sessionId: string;
  cols?: number;
  rows?: number;
}

export interface TerminalAttachResult {
  sessionId: string;
  token: string;
  wsUrl: string;
  cols: number;
  rows: number;
}
