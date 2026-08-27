/**
 * Phase C / Item 9 — persistent terminal types (L3 port of
 * deepseek `dsh-terminal`, Cordis-free).
 *
 * Owner is an opaque string (typically `session.id`).
 * Real PTY (`node-pty`) is deferred; v0 ships a fake
 * backend for tests + a pipe-backed process backend.
 */
export type TerminalSessionStatus = {
    kind: "running";
} | {
    kind: "exited";
    exitCode: number | null;
    signal: NodeJS.Signals | null;
};
export type TerminalWaitReason = "stdin_read" | "inferred_idle" | "timeout" | "session_exit";
export type TerminalSignal = "SIGINT" | "SIGTERM" | "SIGKILL" | "SIGTSTP" | "SIGHUP";
export interface TerminalSpawnRequest {
    type: string;
    name?: string;
    cwd?: string;
}
export interface TerminalBackendSpawnSpec extends TerminalSpawnRequest {
    sessionId: string;
    owner: string;
    signal?: AbortSignal;
}
export interface TerminalSendRequest {
    text: string;
    submit: boolean;
    signal?: AbortSignal;
}
export interface TerminalSendResult {
    viewport: string;
    waitReason: TerminalWaitReason;
    sessionStatus: TerminalSessionStatus;
    truncated: boolean;
}
export interface TerminalSendOperation {
    done: Promise<TerminalSendResult>;
    readOutput(): {
        delta: string;
        truncated: boolean;
    };
    cancel(): boolean;
}
export interface TerminalReadRequest {
    offset?: number;
    count?: number;
}
export interface TerminalReadResult {
    text: string;
    totalLines: number;
    lineBegin: number;
    lineEnd: number;
    truncated: boolean;
}
export interface TerminalSessionSnapshot {
    sessionId: string;
    name?: string;
    type: string;
    pid?: number;
    status: TerminalSessionStatus;
}
export interface TerminalBackendSession {
    readonly motd: string;
    readonly pid?: number;
    startSend(request: TerminalSendRequest): TerminalSendOperation;
    read(request: TerminalReadRequest): TerminalReadResult;
    signal(signal: TerminalSignal): Promise<{
        delivered: true;
        targetPgid: number;
    }>;
    status(): TerminalSessionStatus;
    close(reason: string): Promise<void>;
}
export interface TerminalBackend {
    readonly type: string;
    spawn(spec: TerminalBackendSpawnSpec): Promise<TerminalBackendSession>;
}
export type TerminalErrorCode = "DUPLICATE_BACKEND" | "DUPLICATE_NAME" | "FOREIGN_SESSION" | "NO_BACKEND" | "NO_SESSION" | "SEND_ACTIVE" | "SERVICE_DISPOSING";
export declare class TerminalError extends Error {
    readonly code: TerminalErrorCode;
    readonly name = "TerminalError";
    constructor(message: string, code: TerminalErrorCode);
}
export interface TerminalSessionService {
    registerBackend(backend: TerminalBackend): () => void;
    listBackends(): string[];
    spawn(owner: string, request: TerminalSpawnRequest, signal?: AbortSignal): Promise<TerminalSessionSnapshot & {
        motd: string;
    }>;
    startSend(owner: string, sessionId: string, request: TerminalSendRequest): TerminalSendOperation;
    read(owner: string, sessionId: string, request?: TerminalReadRequest): TerminalReadResult;
    signal(owner: string, sessionId: string, signal: TerminalSignal): Promise<{
        delivered: true;
        targetPgid: number;
    }>;
    kill(owner: string, sessionId: string, reason?: string): Promise<boolean>;
    list(owner: string): TerminalSessionSnapshot[];
    dispose(): Promise<void>;
}
//# sourceMappingURL=types.d.ts.map