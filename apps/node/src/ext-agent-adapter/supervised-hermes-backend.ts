/**
 * Hermes ext agent backend with autostart supervisor (Phase 55E).
 *
 * Wraps the existing `createHermesBackend()` HTTP backend with a
 * `DaemonSupervisor` (55A) that lazily spawns `hermes gateway run` on
 * the first `ask()` when the daemon is not already running. The HTTP
 * call shape is unchanged — same `/v1/chat/completions` endpoint, same
 * auth headers — so the sidecar HTTP contract is identical.
 *
 * Only active when `ENVOYMESH_EXT_AGENT_AUTOSTART=1` (default off —
 * Hermes users typically have their own `hermes gateway run` running
 * and don't want the node to spawn a second instance). See
 * `backends.ts` for the env-var dispatch.
 *
 * Pre-flight behavior: the supervisor's healthcheck is a cheap HTTP
 * GET to `${base}/v1/models` (the same probe the existing backend
 * already does). If the daemon is already running on the network,
 * the supervisor skips the spawn path — but the spawn would still
 * happen in a "no other daemon" world, hence the user-toggle.
 *
 * Install card surfacing: `start()` rejects with `InstallMissingError`
 * if the binary is missing or `preSpawnCheck` fails, which the
 * existing 55A.1 install-card path surfaces in Settings / chat
 * switcher / offline banner (55D.1).
 */

import { DaemonSupervisor, InstallMissingError } from "./daemon-supervisor.js";
import type { ExtAgentBackend } from "./types.js";
import { createHermesBackend, hermesApiBase, hermesApiKey } from "./backends.js";

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

/** Hermes daemon command. Override via `command` option. */
const DEFAULT_HERMES_COMMAND = "hermes";
/** Args to pass when spawning the daemon. */
const DEFAULT_HERMES_ARGS = ["gateway", "run"] as const;
/** Startup healthcheck budget. Hermes can take 5-10s to spin up. */
const DEFAULT_STARTUP_TIMEOUT_MS = 10_000;
/** Healthcheck cadence after the first pass. */
const DEFAULT_HEALTHCHECK_INTERVAL_MS = 5_000;
/** Per-call healthcheck timeout. */
const DEFAULT_HEALTHCHECK_TIMEOUT_MS = 2_000;
/** Per-ask timeout. Hermes can take 30-60s on long responses. */
const HERMES_ASK_TIMEOUT_MS = 280_000; // matches backends.ts HERMES_TIMEOUT_MS

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface HermesSupervisedBackendOptions {
  /** Override the daemon command. Default: "hermes". */
  command?: string;
  /** Override the daemon args. Default: ["gateway", "run"]. */
  args?: string[];
  /** Extra env vars; merged on top of `process.env`. */
  env?: NodeJS.ProcessEnv;
  /** Override the supervisor entirely (for tests). */
  supervisor?: DaemonSupervisor;
  /**
   * Override the inner HTTP backend. Tests pass a fake that doesn't
   * actually call out to Hermes.
   */
  inner?: ExtAgentBackend;
  /** Per-ask timeout. Default: 280_000ms (matches the HTTP backend). */
  requestTimeoutMs?: number;
  /**
   * Pre-spawn check (PATH probe for the binary). Set to `false` to
   * skip the check and let spawn ENOENT surface as `installMissing`.
   * Default: an async `command -v hermes` probe.
   */
  preSpawnCheck?: () => Promise<boolean>;
  /**
   * Pre-check timeout. Default: 2_000ms.
   */
  preSpawnCheckTimeoutMs?: number;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Probe the Hermes API health endpoint. Same shape as the
 * unwrapped backend's `probe()`; reused by the supervisor's
 * healthcheck so the "is the daemon up?" answer is consistent
 * across the supervisor, the probe, and the offline banner.
 */
async function healthcheckHermes(signal: AbortSignal): Promise<boolean> {
  try {
    const base = hermesApiBase();
    const res = await fetch(`${base}/v1/models`, {
      headers: hermesApiKey()
        ? { Authorization: `Bearer ${hermesApiKey()}` }
        : {},
      signal,
    });
    return res.ok || res.status < 500;
  } catch {
    return false;
  }
}

async function defaultPreSpawnCheck(): Promise<boolean> {
  // `command -v` is POSIX; on Windows the `where` builtin works.
  // We shell out via `spawnSync` (no dep on @envoymesh/* here) and
  // accept either.
  const { spawnSync } = await import("node:child_process");
  const isWin = process.platform === "win32";
  const res = spawnSync(isWin ? "where" : "command", [isWin ? "/Q" : "-v", "hermes"], {
    encoding: "utf8",
    timeout: 2_000,
  });
  return res.status === 0;
}

export class HermesSupervisedBackend implements ExtAgentBackend {
  readonly kind = "hermes" as const;
  readonly label = "Hermes";

  private readonly supervisor: DaemonSupervisor | undefined;
  private readonly inner: ExtAgentBackend;
  private readonly requestTimeoutMs: number;
  /** Cached `start()` failure so we don't spam the same ENOENT to
   *  the user. Cleared on a successful `start()`. */
  private lastStartError: Error | null = null;
  /** Whether we ever reached a healthy state (used by `probe()`). */
  private wasEverHealthy = false;

  constructor(opts: HermesSupervisedBackendOptions = {}) {
    this.inner = opts.inner ?? createHermesBackend();
    this.requestTimeoutMs =
      opts.requestTimeoutMs ?? HERMES_ASK_TIMEOUT_MS;

    if (!opts.supervisor) {
      this.supervisor = new DaemonSupervisor({
        name: "hermes",
        command: opts.command ?? DEFAULT_HERMES_COMMAND,
        args: [...(opts.args ?? DEFAULT_HERMES_ARGS)],
        env: opts.env,
        healthcheck: healthcheckHermes,
        healthcheckIntervalMs: DEFAULT_HEALTHCHECK_INTERVAL_MS,
        healthcheckTimeoutMs: DEFAULT_HEALTHCHECK_TIMEOUT_MS,
        startupTimeoutMs: DEFAULT_STARTUP_TIMEOUT_MS,
        preSpawnCheck: opts.preSpawnCheck ?? defaultPreSpawnCheck,
        installHint:
          "Install Hermes: `curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash` " +
          "(set API_SERVER_ENABLED=true and API_SERVER_KEY in ~/.hermes/.env).",
      });
    } else {
      this.supervisor = opts.supervisor;
    }

    this.supervisor.on("healthy", () => {
      this.wasEverHealthy = true;
      this.lastStartError = null;
    });
  }

  // -------------------------------------------------------------------------
  // ExtAgentBackend
  // -------------------------------------------------------------------------

  async ask(text: string, sessionKey: string): Promise<string> {
    if (!this.supervisor) {
      // No supervisor wired (shouldn't happen with the default ctor).
      return this.inner.ask(text, sessionKey);
    }
    // Replay the last install-missing error without spawning again
    // — saves a spawn round-trip + ENOENT log spam.
    if (this.lastStartError) throw this.lastStartError;

    // Short-circuit when the supervisor was already healthy — the
    // real `DaemonSupervisor.start()` is a fast no-op in that case
    // (early return when state.healthy && proc still running), but
    // skipping the call entirely saves a microtask hop + makes
    // test mocks deterministic.
    if (!this.wasEverHealthy) {
      try {
        await this.supervisor.start();
      } catch (err) {
        this.lastStartError = err instanceof Error ? err : new Error(String(err));
        throw this.lastStartError;
      }
    }
    return this.inner.ask(text, sessionKey);
  }

  /**
   * Cheap readiness probe. Returns `true` when the inner HTTP
   * backend's `probe()` succeeds. The supervisor's healthcheck
   * (driven by the healthcheck timer) is the source of truth for
   * "is the daemon up"; the inner probe hits the same endpoint.
   */
  async probe(): Promise<boolean> {
    try {
      const up = await this.inner.probe?.();
      if (up === false) return false;
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Eagerly start the daemon. Idempotent. The sidecar manager
   * doesn't currently call this directly (it lazily spawns via
   * `ask()`) but tests + future autostart-paths use it.
   */
  async start(): Promise<void> {
    if (!this.supervisor) return;
    try {
      await this.supervisor.start();
    } catch (err) {
      this.lastStartError = err instanceof Error ? err : new Error(String(err));
      throw this.lastStartError;
    }
  }

  /**
   * Stop the supervisor. Idempotent. Called when the sidecar is
   * torn down (manager.stopExtAgentSidecar).
   */
  async stop(): Promise<void> {
    if (!this.supervisor) return;
    await this.supervisor.stop();
  }

  /**
   * `true` if the supervisor was ever healthy during this process's
   * lifetime. Used by tests + future autostart-paths that need to
   * distinguish "first start failed" from "subsequent start
   * succeeded".
   */
  isEverHealthy(): boolean {
    return this.wasEverHealthy;
  }

  /**
   * `true` if the supervisor's last start failed. Used by tests +
   * the chat switcher retry path to short-circuit repeated ENOENT
   * spawns.
   */
  didLastStartFail(): boolean {
    return this.lastStartError != null;
  }

  /**
   * The supervisor's last start error (if any). `null` when the
   * daemon started cleanly.
   */
  lastStartErrorMessage(): string | null {
    if (!this.lastStartError) return null;
    if (this.lastStartError instanceof InstallMissingError) {
      return this.lastStartError.message;
    }
    return this.lastStartError.message;
  }
}

/** Factory matching the `ExtAgentBackend` shape used by the sidecar. */
export function createHermesSupervisedBackend(
  options: HermesSupervisedBackendOptions = {},
): ExtAgentBackend {
  return new HermesSupervisedBackend(options);
}

// ---------------------------------------------------------------------------
// Test-only exports
// ---------------------------------------------------------------------------

/** @internal tests */
export const _test = {
  healthcheckHermes,
  defaultPreSpawnCheck,
  DEFAULT_HERMES_COMMAND,
  DEFAULT_HERMES_ARGS,
  HERMES_ASK_TIMEOUT_MS,
};
