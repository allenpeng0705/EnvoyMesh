/**
 * F14.1 — `PersistedSession`: a `Session` implementation
 * backed by a JSONL file on disk.
 *
 * **File format** (one line per record, newline-
 * terminated):
 *
 * ```
 * {"_kind":"header","id":"<session-id>","metadata":{...}}
 * {"role":"user","content":[...]}
 * {"role":"assistant","content":[...]}
 * {"role":"tool","content":[{"type":"tool_result","toolCallId":"...","content":"...","isError":false}]}
 * {"role":"system","content":[...]}
 * ```
 *
 * **Why JSONL (one record per line):** append-friendly
 * (no rewrite of the whole file per `appendMessage`),
 * streaming-friendly (`fs.readFile` + `split('\n')`
 * loads the whole transcript in O(N) with no
 * parsing library), and human-readable (the user
 * can `cat` their session file and understand it).
 *
 * **Why a `header` line:** the session id and
 * metadata aren't part of the `Message` shape
 * (`{role, content}`). The header is the only
 * special line; the rest are `Message`s. The `_kind`
 * field is a sentinel that distinguishes the header
 * from a `Message` (which has `role`, not `_kind`).
 *
 * **Sync `appendMessage` + fire-and-forget disk
 * write:** the existing `Session` interface is
 * synchronous (13+ call sites in `agent.ts` use
 * it without `await`). PersistedSession matches:
 * the in-memory push is sync, the disk write is
 * fired in the background. Errors in the disk
 * write are swallowed (no logger to pass in).
 * The in-memory list is the source of truth for
 * the running session; the file is best-effort
 * durability. If the process crashes mid-write,
 * the user can re-run with `--resume` to recover
 * from the file (which is up-to-date as of the
 * last successful write).
 *
 * **No fsync:** durability beyond the OS's normal
 * flushing is the host's concern. F14 doesn't ship
 * an explicit `fsync` — it's a YAGNI. The user can
 * always `--resume` from a different session if the
 * OS crashes.
 *
 * **Stability:** additive. New fields on the
 * `header` line are forward-compatible (loaders
 * ignore unknown fields). New `Message` shapes
 * would need a migration (the `role` field is the
 * only discriminator; a future `kind` field would
 * let us add new event types).
 */
import type { ContentBlock, Message, Role } from "../tools/types.js";
import type { Session, SessionMetadata } from "../session.js";
/**
 * The current JSONL format version. Bump when the
 * on-disk schema changes in a way that requires
 * a migration (vs. an additive change that old
 * readers can ignore).
 *
 * **v1 (F14.1):** initial format. Header line
 * `{_kind: "header", id, metadata, formatVersion: 1}`
 * + one `Message` per line.
 *
 * **Adding formatVersion** is the F14.2 / T1.2
 * pre-release cleanup. The check is in
 * `PersistedSession.open()`: a header with a
 * different `formatVersion` throws a clear error
 * (rather than silently loading a wrong-shape
 * file). Old files without `formatVersion` are
 * treated as v1 (we wrote them all this week; no
 * production data exists yet).
 */
export declare const PERSISTED_SESSION_FORMAT_VERSION: 1;
/**
 * Options for `PersistedSession.create()` (a new
 * session) vs `PersistedSession.open()` (an existing
 * one). The constructors are named for intent; both
 * go through the same internal factory.
 */
export interface PersistedSessionCreateOptions {
    /** The session id. Must be unique within the store. */
    id: string;
    /** The session metadata. */
    metadata: SessionMetadata;
    /** The file path to persist to. */
    filePath: string;
}
/**
 * A `Session` that persists every `appendMessage()`,
 * `setTitle()`, and `clear()` to a JSONL file on
 * disk. The in-memory representation is the source
 * of truth for the agent loop; the file is the
 * durability layer.
 *
 * **Why both in-memory and on-disk:** the agent
 * loop needs O(1) `messages` access; reading the
 * file on every access is too slow for a long
 * session. We load the file once on construction
 * and append to both the in-memory list and the
 * file in lockstep (the file write is fire-and-
 * forget).
 */
export declare class PersistedSession implements Session {
    readonly id: string;
    readonly metadata: SessionMetadata;
    private _messages;
    private readonly filePath;
    private constructor();
    get messages(): ReadonlyArray<Message>;
    /**
     * Create a new `PersistedSession`. The file is
     * written with the header line; no messages.
     * Throws if the file already exists (the host
     * should use `open()` for that).
     */
    static create(options: PersistedSessionCreateOptions): Promise<PersistedSession>;
    /**
     * Open an existing `PersistedSession` from disk.
     * Reads the file, validates the header, and
     * populates the in-memory message list.
     *
     * Throws if the file doesn't exist or the header
     * is invalid.
     */
    static open(filePath: string): Promise<PersistedSession>;
    /**
     * Append a message to the transcript. Sync
     * (matches the `Session` interface contract):
     * the in-memory push is sync, the disk write is
     * fire-and-forget (errors swallowed).
     *
     * The return value matches `InMemorySession`
     * (the new length); the disk write is
     * best-effort.
     */
    appendMessage(role: Role, content: ReadonlyArray<ContentBlock>): number;
    /**
     * Fire-and-forget disk write. The promise is
     * caught and swallowed (we have no logger to
     * pass in; the in-memory state is the source of
     * truth during the run).
     *
     * **Write ordering:** writes are chained via
     * `this.writeChain` so the file ends up with
     * lines in the order `appendMessage` was called.
     * Without the chain, libuv's threadpool could
     * schedule the writes in parallel, and the
     * relative order of two `flag: "a"` writes is
     * not guaranteed (the OS serializes each write
     * but doesn't promise an order between
     * concurrent calls). The chain is in-process;
     * a different `PersistedSession` instance has
     * its own chain.
     */
    private writeChain;
    private appendLineFireAndForget;
    lastMessage(): Message | null;
    /**
     * Clear the transcript. Sync (in-memory reset);
     * the disk truncation is fire-and-forget (chained
     * via `writeChain` so it doesn't interleave with
     * in-flight `appendMessage` writes).
     */
    clear(): void;
    /**
     * F14.1: update the display title. Mutates
     * `metadata.title` (in memory) AND rewrites the
     * file (fire-and-forget) so the title survives
     * a `--resume`.
     *
     * **Why rewrite the whole file:** the header is
     * the first line of the file. Appending the
     * new header would corrupt the format. The file
     * is small (one header + N messages); rewriting
     * the whole file is O(N) for big sessions, but
     * title changes are rare (user-initiated via
     * `/rename`), so the cost is acceptable.
     *
     * **Future optimization:** rewrite just the
     * first line via `fs.read` + `fs.write` at
     * offset 0. For v0 we accept the O(N) cost.
     */
    setTitle(title: string): void;
    /**
     * Phase A / Item 6: set the session's plan state.
     * Same shape as `setTitle` — the metadata is
     * rewritten to disk so the plan survives
     * `--resume`.
     */
    setPlan(plan: import("../plan/state.js").PlanState | undefined): void;
    /** Phase A / Item 6: read the current plan state. */
    getPlan(): import("../plan/state.js").PlanState | undefined;
    /**
     * Rewrite the JSONL header (first line) without
     * touching the messages. Used by `setTitle` +
     * `setPlan`. Same error-swallowing pattern.
     */
    private rewriteHeader;
    /**
     * F-fix: await the write chain so the transcript is durable
     * before the CLI returns. Without this, fire-and-forget
     * appends can be lost if the process exits immediately after
     * `run()` (e.g. a host calling `process.exit()`).
     *
     * Errors are already swallowed by each chain link (the
     * in-memory state is the source of truth); `flush()` resolves
     * when the queued writes have been attempted.
     */
    flush(): Promise<void>;
    /**
     * Phase D / Item 14b: flush pending writes and stamp
     * `metadata.provenance.checkpointAt`. Optionally merge
     * extra provenance fields (e.g. `resumedFrom`).
     */
    checkpoint(extra?: Partial<import("../session.js").SessionProvenance>): Promise<void>;
}
//# sourceMappingURL=persisted-session.d.ts.map