export type TerminalSessionState = "running" | "exited";

export interface TerminalSessionSummary {
  sessionId: string;
  title: string;
  cwd: string;
  shell: string;
  state: TerminalSessionState;
  createdAt: string;
  lastActivityAt: string;
  exitCode?: number;
}

export interface CreateTerminalSessionParams {
  title?: string;
  cwd?: string;
  cols?: number;
  rows?: number;
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
