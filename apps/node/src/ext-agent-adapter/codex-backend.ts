/**
 * Codex ext agent backend (Phase 55B).
 *
 * Drives the OpenAI Codex CLI's `app-server` JSON-RPC protocol over stdio
 * (no extra TCP port from the CLI side). Supervised by `DaemonSupervisor`
 * (55A) so the CLI is auto-restarted on crash and the install-missing
 * path is unified with the other Ext Agent backends.
 *
 * Wire sequence per `ask(text, sessionKey)`:
 *   1. `initialize` once per process (handshake + client info).
 *   2. `thread/start` for a new `sessionKey`; reuse the cached
 *      `threadId` for subsequent `ask()`s in the same session.
 *   3. `turn/start` with the user text; the immediate response is
 *      an ack (`{ turn: { id, status, items: [] } }`).
 *   4. Wait for the `turn/completed` server notification (delivers
 *      the final `turn.items`); extract the assistant text and
 *      resolve the `ask()` promise.
 *
 * The `sessionKey → threadId` map is **in-memory only** — restart
 * drops the mapping (matches Hermes / OpenHuman session behavior).
 *
 * The JSON-RPC shape is vendored from
 * `packages/openclaw/extensions/codex/src/app-server/protocol.ts`
 * (the OpenClaw extension's app-server types). We don't take a runtime
 * dependency on `@openai/codex` — the binary itself is the daemon.
 */

import {
  DaemonSupervisor,
} from "./daemon-supervisor.js";
import type { ExtAgentBackend } from "./types.js";

// ---------------------------------------------------------------------------
// Wire types (vendored from openclaw extensions/codex)
// ---------------------------------------------------------------------------

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: { code?: number; message: string; data?: unknown };
}

interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
}

type JsonRpcMessage = JsonRpcResponse | JsonRpcNotification;

interface CodexThreadStartResponse {
  thread: { id: string; sessionId?: string };
  model?: string;
}

interface CodexTurnStartResponse {
  turn: { id: string; threadId: string; status?: string };
}

interface CodexThreadItem {
  id: string;
  type: string;
  text: string;
  [key: string]: unknown;
}

interface CodexTurnCompletedParams {
  threadId: string;
  turnId: string;
  turn: { id: string; status?: string; items?: CodexThreadItem[] };
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

const CODEX_DEFAULTS = {
  command: "codex",
  args: ["app-server"] as string[],
  startupTimeoutMs: 10_000,
  healthcheckIntervalMs: 5_000,
  healthcheckTimeoutMs: 2_000,
  /** Per-turn cap. Codex can take 30-60s on long responses. */
  requestTimeoutMs: 120_000,
  /** `clientInfo` sent in the `initialize` handshake. */
  clientName: "envoymesh",
  clientTitle: "EnvoyMesh Ext Agent",
  clientVersion: "0.2.2",
} as const;

export interface CodexBackendOptions {
  /** Command to spawn. Default: "codex" (PATH lookup). */
  command?: string;
  /** Args. Default: ["app-server"]. */
  args?: string[];
  /** Extra env (merged on top of process.env). */
  env?: NodeJS.ProcessEnv;
  /**
   * Explicit `OPENAI_API_KEY`. Falls back to `process.env.OPENAI_API_KEY`.
   * If neither is set, the supervisor's first `healthcheck` will fail
   * (codex refuses to start without the key) and the bridge surfaces
   * an `installState: "unknown"` reachability.
   */
  apiKey?: string;
  /** Model passed to `thread/start` and `turn/start`. */
  model?: string;
  /** Per-turn cap. Default: 120_000ms. */
  requestTimeoutMs?: number;
  /**
   * Override the supervisor entirely (for tests). The supervisor's
   * `start()`, `stop()`, `sendStdin()`, `getChildProcess()` and
   * `on("stdout"|"stderr"|"crash", …)` API are the only methods
   * used; the test can pass a fake.
   */
  supervisor?: DaemonSupervisor;
  /**
   * Override the JSON-RPC `clientInfo` sent in the `initialize`
   * handshake. Defaults to `{ name: "envoymesh", title: "EnvoyMesh
   * Ext Agent", version: "0.2.2" }`.
   */
  clientInfo?: {
    name: string;
    title?: string;
    version?: string;
  };
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

interface PendingRequest {
  resolve: (result: unknown) => void;
  reject: (err: Error) => void;
  method: string;
  /** Optional timer that rejects the request if it times out. */
  timer?: NodeJS.Timeout;
}

interface PendingCompletion {
  sessionKey: string;
  threadId: string;
  turnId: string;
  resolve: (text: string) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

export class CodexBackend implements ExtAgentBackend {
  readonly kind = "codex" as const;
  readonly label = "Codex";

  private readonly supervisor: DaemonSupervisor;
  private readonly requestTimeoutMs: number;
  private readonly clientInfo: NonNullable<CodexBackendOptions["clientInfo"]> & {
    name: string;
  };
  private readonly threadIds = new Map<string, string>();
  /** Reverse lookup for routing `turn/completed` notifications. */
  private readonly threadIdToSessionKey = new Map<string, string>();
  private readonly pending = new Map<number, PendingRequest>();
  private readonly pendingCompletions = new Map<string, PendingCompletion>();
  private nextRpcId = 1;
  private initialized = false;
  /** Re-entrancy guard so a misbehaving peer can't cause infinite loops. */
  private inHandleStdout = false;
  /** Detach listeners on stop. */
  private readonly detachedListeners: Array<() => void> = [];

  constructor(opts: CodexBackendOptions = {}) {
    this.requestTimeoutMs =
      opts.requestTimeoutMs ?? CODEX_DEFAULTS.requestTimeoutMs;
    this.clientInfo = {
      name: opts.clientInfo?.name ?? CODEX_DEFAULTS.clientName,
      title: opts.clientInfo?.title ?? CODEX_DEFAULTS.clientTitle,
      version: opts.clientInfo?.version ?? CODEX_DEFAULTS.clientVersion,
    };
    const env: NodeJS.ProcessEnv = { ...process.env, ...(opts.env ?? {}) };
    if (opts.apiKey) env.OPENAI_API_KEY = opts.apiKey;
    if (opts.model) env.CODEX_MODEL = opts.model;

    this.supervisor =
      opts.supervisor ??
      new DaemonSupervisor({
        name: "codex",
        command: opts.command ?? CODEX_DEFAULTS.command,
        args: opts.args ?? CODEX_DEFAULTS.args,
        env,
        startupTimeoutMs: CODEX_DEFAULTS.startupTimeoutMs,
        healthcheckIntervalMs: CODEX_DEFAULTS.healthcheckIntervalMs,
        healthcheckTimeoutMs: CODEX_DEFAULTS.healthcheckTimeoutMs,
        killGraceMs: 5_000,
        healthcheck: (signal) => this.pingThreadList(signal),
        installHint:
          "Install the Codex CLI: `npm install -g @openai/codex` — then set OPENAI_API_KEY in your shell.",
      });

    // Parallel JSON-RPC parser on stdout. The supervisor emits the
    // same `stdout` events for its own `[ext-agent:codex:stdout]`
    // log lines; we just attach a second listener.
    const onStdout = (chunk: string) => {
      this.handleStdout(chunk);
    };
    const onCrash = () => {
      this.onSupervisorCrash();
    };
    this.supervisor.on("stdout", onStdout);
    this.supervisor.on("crash", onCrash);
    this.supervisor.on("install-missing", () => {
      this.failAllPending(
        new Error("codex backend: binary missing (install-missing event)"),
      );
    });
    this.detachedListeners.push(() => {
      this.supervisor.off("stdout", onStdout);
      this.supervisor.off("crash", onCrash);
    });
  }

  // -------------------------------------------------------------------------
  // ExtAgentBackend
  // -------------------------------------------------------------------------

  async ask(text: string, sessionKey: string): Promise<string> {
    if (!text.trim()) return "";
    if (!sessionKey) {
      throw new Error("codex ask(): sessionKey is required");
    }

    // 1. Make sure the supervisor (and the underlying codex app-server)
    //    is up. If the binary is missing, the supervisor rejects with
    //    `InstallMissingError` — the bridge surfaces the install card.
    await this.supervisor.start();

    // 2. Run the `initialize` handshake once per process.
    if (!this.initialized) {
      await this.initializeOnce();
    }

    // 3. Get or create a thread for this session.
    const threadId = await this.getOrCreateThread(sessionKey);

    // 4. Register a completion promise BEFORE sending turn/start so we
    //    never miss a fast turn/completed notification.
    const completion = new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingCompletions.delete(sessionKey);
        reject(
          new Error(
            `codex ask(): turn/completed not received within ${
              this.requestTimeoutMs
            }ms for session "${sessionKey}"`,
          ),
        );
      }, this.requestTimeoutMs);
      timer.unref?.();
      this.pendingCompletions.set(sessionKey, {
        sessionKey,
        threadId,
        turnId: "",
        resolve,
        reject,
        timer,
      });
    });

    // 5. Send `turn/start` with the user text. The immediate response is
    //    an ack `{ turn: { id, ... } }`; the actual reply arrives via
    //    the `turn/completed` notification handled in `handleStdout`.
    const turnResp = await this.rpc<CodexTurnStartResponse>("turn/start", {
      threadId,
      input: [{ type: "text", text }],
    });
    const turnId = turnResp.turn?.id ?? "";
    if (turnId) {
      const pending = this.pendingCompletions.get(sessionKey);
      if (pending) pending.turnId = turnId;
    } else {
      // No turn id — abandon the completion and fail fast.
      this.cleanupCompletion(sessionKey);
      throw new Error("codex ask(): turn/start returned no turn.id");
    }

    return completion;
  }

  async probe(): Promise<boolean> {
    try {
      // The supervisor's own healthcheck uses this same logic; reuse
      // the signal-based path so AbortSignal flows correctly.
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 2_000);
      timer.unref?.();
      try {
        return await this.pingThreadList(ac.signal);
      } finally {
        clearTimeout(timer);
      }
    } catch {
      return false;
    }
  }

  /**
   * Bring the supervisor up eagerly. The sidecar manager's HTTP
   * server calls `backend.ask()` lazily on the first inbound
   * `/message`; this method exists for tests and for callers that
   * want to surface install-missing before the first user request.
   */
  async start(): Promise<void> {
    await this.supervisor.start();
    if (!this.initialized) {
      await this.initializeOnce();
    }
  }

  /** Stop the supervisor. Idempotent. The manager's
   * `syncExtAgentSidecar` doesn't currently call this directly —
   * it tears the whole HTTP server down instead — but having the
   * method makes test cleanup and future autostart paths easier. */
  async stop(): Promise<void> {
    for (const detach of this.detachedListeners) detach();
    this.detachedListeners.length = 0;
    this.failAllPending(new Error("codex backend: stop() called"));
    await this.supervisor.stop();
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private async initializeOnce(): Promise<void> {
    await this.rpc("initialize", {
      clientInfo: this.clientInfo,
      capabilities: {},
    });
    this.initialized = true;
  }

  private async getOrCreateThread(sessionKey: string): Promise<string> {
    const cached = this.threadIds.get(sessionKey);
    if (cached) return cached;
    const resp = await this.rpc<CodexThreadStartResponse>("thread/start", {});
    const threadId = resp.thread?.id;
    if (!threadId) {
      throw new Error("codex getOrCreateThread(): thread/start returned no thread.id");
    }
    this.threadIds.set(sessionKey, threadId);
    this.threadIdToSessionKey.set(threadId, sessionKey);
    return threadId;
  }

  private async pingThreadList(signal: AbortSignal): Promise<boolean> {
    try {
      await this.rpc(
        "thread/list",
        { limit: 1 },
        signal,
        // Healthcheck is fast — bound it to the supervisor's
        // healthcheckTimeoutMs (default 2s) to avoid hanging the
        // health timer.
        2_000,
      );
      return true;
    } catch {
      return false;
    }
  }

  private async rpc<T = unknown>(
    method: string,
    params?: unknown,
    signal?: AbortSignal,
    timeoutMs?: number,
  ): Promise<T> {
    const id = this.nextRpcId++;
    return new Promise<T>((resolve, reject) => {
      const pending: PendingRequest = {
        resolve: (v) => resolve(v as T),
        reject,
        method,
      };
      if (timeoutMs !== undefined) {
        pending.timer = setTimeout(() => {
          this.pending.delete(id);
          reject(
            new Error(
              `codex rpc "${method}" timed out after ${timeoutMs}ms`,
            ),
          );
        }, timeoutMs);
        pending.timer.unref?.();
      }
      if (signal) {
        if (signal.aborted) {
          if (pending.timer) clearTimeout(pending.timer);
          reject(new Error(`codex rpc "${method}" aborted before send`));
          return;
        }
        signal.addEventListener(
          "abort",
          () => {
            this.pending.delete(id);
            if (pending.timer) clearTimeout(pending.timer);
            reject(new Error(`codex rpc "${method}" aborted`));
          },
          { once: true },
        );
      }
      this.pending.set(id, pending);
      const req: JsonRpcRequest = { jsonrpc: "2.0", id, method, params };
      const sent = this.supervisor.sendStdin(JSON.stringify(req) + "\n");
      if (!sent) {
        this.pending.delete(id);
        if (pending.timer) clearTimeout(pending.timer);
        reject(
          new Error(
            `codex rpc "${method}" failed: supervisor stdin not writable`,
          ),
        );
      }
    });
  }

  private handleStdout(chunk: string): void {
    if (this.inHandleStdout) return;
    this.inHandleStdout = true;
    try {
      // codex app-server emits NDJSON over stdout. Each line is a
      // JSON-RPC message — response (has `id`) or notification (has
      // `method` but no `id`).
      for (const rawLine of chunk.split("\n")) {
        const line = rawLine.trim();
        if (!line) continue;
        // Cheap pre-check to skip log output that doesn't look like JSON.
        if (line[0] !== "{" && line[0] !== "[") continue;
        let msg: JsonRpcMessage;
        try {
          msg = JSON.parse(line);
        } catch {
          // Not JSON (e.g. a log line). Ignore — the supervisor's
          // own `stdout` event already forwarded it to logs.
          continue;
        }
        if (this.isResponse(msg)) {
          this.handleResponse(msg);
        } else if (this.isNotification(msg)) {
          this.handleNotification(msg);
        }
      }
    } finally {
      this.inHandleStdout = false;
    }
  }

  private isResponse(msg: JsonRpcMessage): msg is JsonRpcResponse {
    return (msg as JsonRpcResponse).id !== undefined && typeof (msg as JsonRpcResponse).id === "number";
  }

  private isNotification(msg: JsonRpcMessage): msg is JsonRpcNotification {
    return (
      (msg as JsonRpcNotification).method !== undefined &&
      (msg as JsonRpcResponse).id === undefined
    );
  }

  private handleResponse(msg: JsonRpcResponse): void {
    const pending = this.pending.get(msg.id);
    if (!pending) return; // stray / late response
    this.pending.delete(msg.id);
    if (pending.timer) clearTimeout(pending.timer);
    if (msg.error) {
      pending.reject(
        new Error(
          `codex rpc "${pending.method}" error: ${msg.error.message} (code ${msg.error.code ?? "?"})`,
        ),
      );
    } else {
      pending.resolve(msg.result);
    }
  }

  private handleNotification(msg: JsonRpcNotification): void {
    switch (msg.method) {
      case "turn/completed":
        this.handleTurnCompleted(msg.params as CodexTurnCompletedParams);
        break;
      // Other notifications (`item/agentMessage/delta`,
      // `thread/status/changed`, etc.) are intentionally ignored in
      // the first iteration. The final text comes via `turn/completed`.
      default:
        break;
    }
  }

  private handleTurnCompleted(params: CodexTurnCompletedParams | undefined): void {
    if (!params) return;
    const sessionKey = this.threadIdToSessionKey.get(params.threadId);
    if (!sessionKey) {
      // No matching session — drop. Could happen if a previous
      // session's turn completed after the session was cleared.
      return;
    }
    const pending = this.pendingCompletions.get(sessionKey);
    if (!pending) return;
    this.cleanupCompletion(sessionKey);
    const items = params.turn?.items ?? [];
    // Codex uses several item types for assistant text; concatenate
    // all items that carry a `text` field. The 55A.1 "result"
    // narrative (assistant final reply) typically lands in items of
    // type `agentMessage`. We also pick up `reasoning` for
    // completeness — the operator can grep logs to see reasoning if
    // they want.
    const parts: string[] = [];
    for (const item of items) {
      if (typeof item.text === "string" && item.text.length > 0) {
        // Skip pure tool-call items (they have empty `text` typically).
        if (item.type === "agentMessage" || item.type === "assistantMessage") {
          parts.push(item.text);
        }
      }
    }
    const text = parts.join("").trim();
    if (text.length === 0) {
      pending.reject(
        new Error(
          `codex ask(): turn/completed for "${sessionKey}" had no assistant text (status=${params.turn?.status ?? "?"})`,
        ),
      );
      return;
    }
    pending.resolve(text);
  }

  private onSupervisorCrash(): void {
    // On crash, drop all in-flight state — the new process won't
    // know about our pending requests or thread ids. The supervisor
    // will restart codex on its own; the next `ask()` will
    // re-initialize and re-create threads.
    this.failAllPending(new Error("codex backend: supervisor crashed; pending requests aborted"));
    this.threadIds.clear();
    this.threadIdToSessionKey.clear();
    this.initialized = false;
  }

  private failAllPending(err: Error): void {
    for (const [id, p] of this.pending) {
      if (p.timer) clearTimeout(p.timer);
      p.reject(err);
      this.pending.delete(id);
    }
    for (const [sessionKey, p] of this.pendingCompletions) {
      clearTimeout(p.timer);
      p.reject(err);
      this.pendingCompletions.delete(sessionKey);
    }
  }

  private cleanupCompletion(sessionKey: string): void {
    const pending = this.pendingCompletions.get(sessionKey);
    if (pending) {
      clearTimeout(pending.timer);
      this.pendingCompletions.delete(sessionKey);
    }
  }
}

/** Factory matching the `ExtAgentBackend` shape used by the sidecar. */
export function createCodexBackend(
  options: CodexBackendOptions = {},
): ExtAgentBackend {
  return new CodexBackend(options);
}
