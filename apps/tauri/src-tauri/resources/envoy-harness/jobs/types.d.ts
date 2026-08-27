/**
 * Phase C / Item 7 — background jobs types (L3 port of
 * deepseek `dsh-jobs`, Cordis-free).
 *
 * Producer returns {@link JobHooks}; the registry owns
 * identity, snapshots, waiters, and owner fencing.
 * Owner is an opaque string (typically `session.id`).
 */
/** Lifecycle: running → optional stopping → one terminal. */
export type JobStatus = "running" | "stopping" | "completed" | "killed" | "failed";
/** Terminal result from the producer via {@link JobHooks.done}. */
export interface JobOutcome {
    status: "completed" | "killed" | "failed";
    detail?: string;
    /** Final output for jobs without streaming `readOutput`. */
    output?: string;
}
/**
 * Producer hooks. `cancel` is sync + idempotent.
 * `done` must not reject (registry maps rejection → failed).
 */
export interface JobHooks {
    cancel(reason?: string): void;
    done: Promise<JobOutcome>;
    /** Streaming jobs expose a consuming cursor; omit for final-only. */
    readOutput?(): string;
}
/** Spec passed to {@link JobRegistry.start}. */
export interface JobStart {
    /** Kind prefix for ids (`bash-1`, `subagent-2`, …). */
    kind: string;
    /** One-line model-facing label. */
    label: string;
    /** Optional UTF-8 byte cap for output reads. */
    outputLimitBytes?: number;
    /** Owning session/agent id; omit for unowned (open) jobs. */
    owner?: string;
    /** Start work after preflight; throw → nothing registered. */
    run(): JobHooks;
}
/** Read-only projection — never live registry state. */
export interface JobSnapshot {
    id: string;
    kind: string;
    label: string;
    outputLimitBytes?: number;
    owner?: string;
    status: JobStatus;
    detail?: string;
    startedAt: number;
    finishedAt?: number;
}
export interface JobRead {
    text: string;
    snapshot: JobSnapshot;
}
export type JobDoneListener = (snapshot: JobSnapshot) => void;
export declare class JobError extends Error {
    readonly code: "NOT_FOUND" | "FOREIGN_OWNER" | "LIMIT" | "INVALID" | "WAIT_TIMEOUT";
    readonly name = "JobError";
    constructor(message: string, code: "NOT_FOUND" | "FOREIGN_OWNER" | "LIMIT" | "INVALID" | "WAIT_TIMEOUT");
}
export interface JobRegistry {
    start(spec: JobStart): string;
    list(caller?: string): JobSnapshot[];
    get(id: string, caller?: string): JobSnapshot;
    read(id: string, caller?: string): JobRead;
    kill(id: string, caller?: string, reason?: string): "requested" | "already-finished";
    wait(id: string, timeoutMs: number, caller?: string, signal?: AbortSignal): Promise<JobSnapshot>;
    onJobDone(listener: JobDoneListener): () => void;
    /** Cancel every job owned by `owner` and await settlement. */
    disposeOwner(owner: string): Promise<void>;
    /** Tear down the registry (cancel all, drop listeners). */
    dispose(): Promise<void>;
}
//# sourceMappingURL=types.d.ts.map