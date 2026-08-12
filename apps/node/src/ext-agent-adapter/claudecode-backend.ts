/**
 * Claude Code ext agent backend (Phase 55C).
 *
 * Drives Anthropic's `@anthropic-ai/claude-agent-sdk` **in-process** — no
 * subprocess lifecycle to manage, no separate TCP port from the agent
 * side. The library wraps the same `claude` CLI the user installs with
 * `npm i -g @anthropic-ai/claude-code`, but as a library call.
 *
 * Wire per `ask(text, sessionKey)`:
 *   1. Resolve a `sessionId` (cached per `sessionKey` from a prior
 *      `system/init` message) → pass to `Options.resume` so the SDK
 *      loads the conversation history. First call: no `resume` →
 *      fresh session.
 *   2. Call `query({ prompt, options })`, get back an `AsyncIterable<SDKMessage>`.
 *   3. Iterate the stream:
 *      - `system/init` carries the `session_id` we cache for next time,
 *        and optional `slash_commands` (cached for Ext Agent catalog).
 *      - `assistant` messages carry streamed `text` blocks (we discard
 *        these for chat-bridge use — only the final result matters).
 *      - `result` (subtype `success` / `error_*`) is the terminal message;
 *        `SDKResultSuccess.result` is the assistant's final text reply.
 *   4. On `abort()` / timeout, the SDK throws `AbortError`; we rethrow
 *      with a friendlier message.
 *
 * Permission model: the Ext Agent chat-bridge use case is conversational,
 * not tool-calling. We disable Claude Code's built-in tool suite
 * (`allowedTools: []`) so the model can only answer in text. Users who
 * want tool-calling should use the `claude` CLI directly, not Ext Agent.
 *
 * The `sessionKey → sessionId` map is **in-memory only** — restart
 * drops the mapping (matches Hermes / OpenHuman / codex session
 * behavior).
 *
 * The SDK has no separate process to supervise, so this backend
 * intentionally does NOT use `DaemonSupervisor` (55A). Probe is
 * "SDK loadable + (ANTHROPIC_API_KEY **or** `claude auth` OAuth login)" —
 * cheap; OAuth check shells out to `claude auth status` with a short TTL cache.
 */

import { spawn } from "node:child_process";
import type { ExtAgentBackend } from "./types.js";
// `query` is the only export we use at runtime; types come from
// `sdk.d.ts` via the package's exports map. Top-level type-only import
// keeps the dependency tree-shake friendly.
import type {
  Options,
  PermissionMode,
  Query,
  SDKMessage,
} from "@anthropic-ai/claude-agent-sdk";
import {
  augmentPathForExtAgentBins,
  resolveExtAgentBinary,
} from "./resolve-ext-agent-binary.js";
import { getExtAgentSessionModel } from "./session-model-store.js";
import { getExtAgentProjectPathCwd } from "./project-path-store.js";

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

/** Permission modes accepted by the SDK (subset — `'plan'` / `'auto'`
 * are also valid but not useful for the chat-bridge). */
export type ClaudeCodePermissionMode = Extract<
  PermissionMode,
  "default" | "acceptEdits" | "bypassPermissions" | "plan" | "dontAsk"
>;

const CLAUDE_DEFAULTS = {
  /** Per-ask cap. Claude Code turns can take 30-60s. */
  requestTimeoutMs: 120_000,
  /** Default model. The SDK accepts model aliases (`sonnet`, `opus`,
   * `haiku`) and full model ids (`claude-sonnet-4-5-20250929`). */
  model: "claude-sonnet-4-5",
  /** Working directory for the SDK subprocess. */
  cwd: process.cwd(),
  /** Chat-bridge use case: disable all built-in tools. */
  disableTools: true,
  /** Permission mode. We always set `bypassPermissions` (or
   * `dontAsk`) and pass `allowDangerouslySkipPermissions: true` so the
   * model doesn't hang on permission prompts. Tools are disabled
   * separately via `allowedTools: []` — even with bypass, the model
   * has no tool to call. */
  permissionMode: "bypassPermissions" as ClaudeCodePermissionMode,
  /** Required when `permissionMode === "bypassPermissions"`. */
  allowDangerouslySkipPermissions: true,
} as const;

export interface ClaudeCodeBackendOptions {
  /** `ANTHROPIC_API_KEY` override. Falls back to
   * `process.env.ANTHROPIC_API_KEY`. If neither is set, `probe()`
   * returns false and `ask()` throws a clear error. */
  apiKey?: string;
  /** Model id or alias. Default: `"claude-sonnet-4-5"`. */
  model?: string;
  /** Per-ask cap. Default: 120_000ms. */
  requestTimeoutMs?: number;
  /** Working directory. Default: `process.cwd()`. */
  cwd?: string;
  /** Permission mode. Default: `"bypassPermissions"`. */
  permissionMode?: ClaudeCodePermissionMode;
  /**
   * Disable all built-in tools (Read / Edit / Bash / …). Default: `true`.
   * The Ext Agent chat-bridge is conversational; tool calls would route
   * to the local FS without the sidecar manager's policy gate.
   */
  disableTools?: boolean;
  /**
   * Override the SDK's `query` function. Tests pass a fake that
   * returns an `AsyncIterable<SDKMessage>` matching the types the
   * backend consumes (system/init → assistant → result).
   */
  queryFn?: (params: { prompt: string; options?: Options }) => Query;
  /**
   * Override auth readiness (API key **or** `claude auth` OAuth).
   * Tests stub this to avoid spawning the real CLI.
   */
  authReady?: () => Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Lazy SDK loader
// ---------------------------------------------------------------------------

/**
 * Lazy-load the SDK so a missing install surfaces a useful error at
 * `ask()` / `probe()` time, not at module import time. The package is
 * declared as a regular dep in `apps/node/package.json`, so this only
 * fires in dev (e.g. stripped CI build) or if a future refactor moves
 * the dep to `optionalDependencies`.
 */
async function loadSdk(): Promise<typeof import("@anthropic-ai/claude-agent-sdk")> {
  try {
    return await import("@anthropic-ai/claude-agent-sdk");
  } catch {
    throw new Error(
      "claudecode backend: @anthropic-ai/claude-agent-sdk is not installed. " +
        "Run `npm install -g @anthropic-ai/claude-code` (the CLI install pulls the SDK) and restart EnvoyMesh.",
    );
  }
}

function isAbortError(err: unknown): boolean {
  // The SDK exports `AbortError` as a class extending `Error`. We duck-type
  // on name + Error to avoid importing the class (which would force the
  // type-only import above into a runtime dep on the SDK's main export).
  return (
    err instanceof Error &&
    (err.name === "AbortError" || err.constructor?.name === "AbortError")
  );
}

const AUTH_CACHE_TTL_MS = 30_000;
let authCache: { at: number; ok: boolean } | null = null;

/**
 * True when Claude Code can authenticate: either `ANTHROPIC_API_KEY` is
 * set, or `claude auth status` reports `loggedIn` (browser OAuth — the
 * common path for interactive installs).
 */
export async function isClaudeCodeAuthReady(opts?: {
  apiKey?: string;
  command?: string;
  timeoutMs?: number;
  /** Bypass the process-wide TTL cache (tests). */
  skipCache?: boolean;
}): Promise<boolean> {
  const key = (opts?.apiKey ?? process.env.ANTHROPIC_API_KEY)?.trim();
  if (key) return true;

  if (!opts?.skipCache && authCache && Date.now() - authCache.at < AUTH_CACHE_TTL_MS) {
    return authCache.ok;
  }

  const requested = opts?.command ?? "claude";
  const command = resolveExtAgentBinary(requested) ?? requested;
  const timeoutMs = opts?.timeoutMs ?? 3_000;
  const ok = await new Promise<boolean>((resolve) => {
    let settled = false;
    const done = (v: boolean) => {
      if (settled) return;
      settled = true;
      resolve(v);
    };
    let proc;
    try {
      proc = spawn(command, ["auth", "status"], {
        env: augmentPathForExtAgentBins(process.env),
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch {
      done(false);
      return;
    }
    let stdout = "";
    proc.stdout?.setEncoding("utf8");
    proc.stdout?.on("data", (chunk: string) => {
      stdout += chunk;
    });
    const timer = setTimeout(() => {
      try {
        proc.kill("SIGKILL");
      } catch {
        // already gone
      }
      done(false);
    }, timeoutMs);
    timer.unref?.();
    proc.on("error", () => {
      clearTimeout(timer);
      done(false);
    });
    proc.on("close", () => {
      clearTimeout(timer);
      try {
        const parsed = JSON.parse(stdout.trim()) as { loggedIn?: unknown };
        done(parsed.loggedIn === true);
      } catch {
        done(false);
      }
    });
  });

  if (!opts?.skipCache) {
    authCache = { at: Date.now(), ok };
  }
  return ok;
}

/** @internal tests — clear the OAuth status cache. */
export function _resetClaudeCodeAuthCacheForTests(): void {
  authCache = null;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/** Last `system/init.slash_commands` seen across Claude Code backends. */
let cachedClaudeCodeSlashCommands: string[] = [];

/** Slash commands captured from the most recent Claude Code `system/init`. */
export function getCachedClaudeCodeSlashCommands(): string[] {
  return [...cachedClaudeCodeSlashCommands];
}

function rememberClaudeCodeSlashCommands(raw: unknown): void {
  if (!Array.isArray(raw)) return;
  const next = raw
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim());
  if (next.length === 0) return;
  cachedClaudeCodeSlashCommands = next;
}

export class ClaudeCodeBackend implements ExtAgentBackend {
  readonly kind = "claudecode" as const;
  readonly label = "Claude Code";

  private readonly apiKey: string | undefined;
  private readonly model: string;
  private readonly requestTimeoutMs: number;
  private readonly cwd: string;
  private readonly permissionMode: ClaudeCodePermissionMode;
  private readonly allowDangerouslySkipPermissions: boolean;
  private readonly disableTools: boolean;
  private readonly queryFnOverride:
    | ((params: { prompt: string; options?: Options }) => Query)
    | undefined;
  private readonly authReadyFn: () => Promise<boolean>;
  /** `sessionKey → claude session_id` cache. Lost on restart. */
  private readonly sessionIds = new Map<string, string>();
  /**
   * Cached SDK import. Resolved only when actually needed (i.e. on
   * `ask()` when no `queryFn` override is supplied). When a test
   * injects a `queryFn` override, the SDK is never imported — the
   * test can run without installing `@anthropic-ai/claude-agent-sdk`.
   * `undefined` means "no loader needed, a queryFn is in use".
   */
  private readonly sdkLoader:
    | Promise<typeof import("@anthropic-ai/claude-agent-sdk") | undefined>
    | undefined;

  constructor(opts: ClaudeCodeBackendOptions = {}) {
    this.apiKey = opts.apiKey ?? process.env.ANTHROPIC_API_KEY ?? undefined;
    this.model = opts.model ?? CLAUDE_DEFAULTS.model;
    this.requestTimeoutMs =
      opts.requestTimeoutMs ?? CLAUDE_DEFAULTS.requestTimeoutMs;
    this.cwd = opts.cwd ?? CLAUDE_DEFAULTS.cwd;
    this.permissionMode = opts.permissionMode ?? CLAUDE_DEFAULTS.permissionMode;
    this.allowDangerouslySkipPermissions =
      this.permissionMode === "bypassPermissions"
        ? (CLAUDE_DEFAULTS.allowDangerouslySkipPermissions as boolean)
        : false;
    this.disableTools = opts.disableTools ?? CLAUDE_DEFAULTS.disableTools;
    this.queryFnOverride = opts.queryFn;
    // Test queryFn mode: only the API key counts unless authReady is stubbed.
    // Production: API key **or** `claude auth` OAuth login.
    this.authReadyFn =
      opts.authReady ??
      (opts.queryFn
        ? async () => Boolean(this.apiKey?.trim())
        : () => isClaudeCodeAuthReady({ apiKey: this.apiKey }));
    // Only kick off the SDK loader when there's no queryFn override.
    // Tests that supply a queryFn can run without the SDK installed.
    this.sdkLoader = opts.queryFn ? undefined : loadSdk();
  }

  // -------------------------------------------------------------------------
  // ExtAgentBackend
  // -------------------------------------------------------------------------

  async ask(text: string, sessionKey: string): Promise<string> {
    if (!text.trim()) return "";
    if (!sessionKey) {
      throw new Error("claudecode ask(): sessionKey is required");
    }

    if (!(await this.authReadyFn())) {
      throw new Error(
        "claudecode ask(): not authenticated. Run `claude auth login` once, or set ANTHROPIC_API_KEY in the home-node environment.",
      );
    }

    // Resolve the query function. With a test-supplied `queryFn`
    // override, the SDK is never loaded; without one, we wait for
    // the lazy SDK loader (cached after first call).
    let queryFn: (params: { prompt: string; options?: Options }) => Query;
    if (this.queryFnOverride) {
      queryFn = this.queryFnOverride;
    } else {
      const sdk = await this.sdkLoader;
      // sdkLoader is `undefined` only if queryFn is set (caught
      // above); this assertion narrows the type for TS.
      if (!sdk) {
        throw new Error(
          "claudecode ask(): SDK loader is missing — this is a bug, please report",
        );
      }
      queryFn = sdk.query;
    }

    const cachedSessionId = this.sessionIds.get(sessionKey);
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), this.requestTimeoutMs);
    timer.unref?.();

    try {
      const options: Options = {
        model: getExtAgentSessionModel("claudecode", sessionKey) ?? this.model,
        cwd: getExtAgentProjectPathCwd("claudecode") ?? this.cwd,
        abortController: ac,
        permissionMode: this.permissionMode,
        allowDangerouslySkipPermissions: this.allowDangerouslySkipPermissions,
        ...(this.disableTools ? { allowedTools: [] as string[] } : {}),
        ...(cachedSessionId ? { resume: cachedSessionId } : {}),
      };

      const query = queryFn({ prompt: text, options });

      let sessionId: string | undefined;
      let finalText: string | undefined;
      let errorText: string | undefined;

      for await (const msg of query) {
        // SDK messages are a tagged union. Narrow with a runtime guard
        // so a future message kind from the SDK doesn't break parsing.
        if (!msg || typeof msg !== "object") continue;
        const m = msg as SDKMessage;
        if (m.type === "system" && m.subtype === "init") {
          // `SDKSystemMessage.session_id` is the canonical session id
          // for the resumed conversation. We cache it for next time.
          sessionId = m.session_id;
          // Live slash menu from Claude Code (overlay for Ext Agent catalog).
          if ("slash_commands" in m) {
            rememberClaudeCodeSlashCommands(
              (m as { slash_commands?: unknown }).slash_commands,
            );
          }
        } else if (m.type === "result") {
          // `SDKResultMessage` is `SDKResultSuccess | SDKResultError`.
          // Success carries `result: string`; errors carry `errors: string[]`.
          if (m.subtype === "success") {
            finalText = m.result;
          } else {
            const errs = "errors" in m && Array.isArray(m.errors) ? m.errors : [];
            errorText = errs.length > 0 ? errs.join("; ") : `error: ${m.subtype}`;
          }
          // `result` is the terminal message — stop iterating.
          break;
        }
        // `assistant`, `user`, `tool_progress`, etc. are intentionally
        // ignored in the first iteration. We surface only the final
        // reply text; streamed deltas are dropped.
      }

      // Persist the session id for next time (even on errors, so a
      // user-visible failure doesn't reset the conversation).
      if (sessionId) {
        this.sessionIds.set(sessionKey, sessionId);
      }

      if (errorText) {
        throw new Error(`claudecode ask(): ${errorText}`);
      }
      if (typeof finalText !== "string") {
        throw new Error(
          `claudecode ask(): query ended without a result message for session "${sessionKey}"`,
        );
      }
      return finalText;
    } catch (err) {
      if (isAbortError(err)) {
        throw new Error(
          `claudecode ask(): timed out after ${this.requestTimeoutMs}ms for session "${sessionKey}"`,
        );
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Cheap readiness probe. Returns `true` iff the SDK is loadable AND
   * auth is ready (`ANTHROPIC_API_KEY` **or** `claude auth` OAuth).
   * With a `queryFn` override (tests), only the apiKey / authReady
   * stub is checked. The actual model roundtrip is left to `ask()`.
   */
  async probe(): Promise<boolean> {
    try {
      if (!(await this.authReadyFn())) return false;
      if (this.queryFnOverride) return true;
      const sdk = await this.sdkLoader;
      return !!sdk;
    } catch {
      return false;
    }
  }

  /**
   * No-op. The SDK runs in-process — there is no supervisor to start.
   * Exists for parity with the codex backend's `start()` so callers
   * can treat all Ext Agent backends uniformly.
   */
  async start(): Promise<void> {
    // Eagerly resolve the SDK module so a missing install fails here
    // rather than on the first user message. (Cheap — module is cached
    // after the first call.) Skipped when a `queryFn` override is
    // supplied (test mode — no SDK needed).
    if (!this.queryFnOverride && this.sdkLoader) {
      await this.sdkLoader;
    }
  }

  /**
   * No-op. In-flight `ask()` calls hold their own `AbortController`;
   * SIGTERM at the process level will tear them down via the SDK's
   * own signal handling.
   */
  async stop(): Promise<void> {
    // intentionally empty
  }
}

/** Factory matching the `ExtAgentBackend` shape used by the sidecar. */
export function createClaudeCodeBackend(
  options: ClaudeCodeBackendOptions = {},
): ExtAgentBackend {
  return new ClaudeCodeBackend(options);
}

// ---------------------------------------------------------------------------
// Test-only exports (not part of the public API).
// ---------------------------------------------------------------------------

/** @internal tests */
export const _test = {
  isAbortError,
  loadSdk,
  isClaudeCodeAuthReady,
  _resetClaudeCodeAuthCacheForTests,
  getCachedClaudeCodeSlashCommands,
  _setCachedClaudeCodeSlashCommandsForTests(commands: string[]): void {
    cachedClaudeCodeSlashCommands = [...commands];
  },
  _resetCachedClaudeCodeSlashCommandsForTests(): void {
    cachedClaudeCodeSlashCommands = [];
  },
};
