/**
 * OpenHuman ext agent backend with autostart supervisor (Phase 55E).
 *
 * Wraps the existing `createOpenHumanBackend()` HTTP backend with a
 * `DaemonSupervisor` (55A) that lazily spawns the OpenHuman core
 * process on the first `ask()` when the daemon is not already
 * running. The HTTP call shape is unchanged — same `/v1/chat/completions`
 * or `/rpc` endpoints, same auth headers — so the sidecar HTTP
 * contract is identical.
 *
 * Default on via `createBackend("openhuman")` (force off with
 * `ENVOYMESH_EXT_AGENT_AUTOSTART=0`). Probe-first: if the HTTP core is
 * already healthy (e.g. OpenHuman.app), we reuse it and do not spawn.
 *
 * Project folder: optional spawn `cwd` from {@link getExtAgentProjectPathCwd}
 * (only applies when EnvoyMesh spawns the daemon).
 *
 * Note: the actual CLI subcommand is implementation-defined; the
 * default is `openhuman serve` which the OpenHuman CLI accepts as
 * a long-running core. Users can override `command` / `args` /
 * `env` via the constructor options.
 *
 * Install card surfacing: `start()` rejects with `InstallMissingError`
 * if the binary is missing, which the 55A.1 / 55D.1 install card paths surface.
 */

import { DaemonSupervisor, InstallMissingError } from "./daemon-supervisor.js";
import type { ExtAgentBackend } from "./types.js";
import { createOpenHumanBackend, openHumanHttpBase } from "./backends.js";
import { getExtAgentProjectPathCwd } from "./project-path-store.js";

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

/** OpenHuman CLI command. Override via `command` option. */
const DEFAULT_OPENHUMAN_COMMAND = "openhuman";
/** Args to pass when spawning the daemon. */
const DEFAULT_OPENHUMAN_ARGS = ["serve"] as const;
/** Startup healthcheck budget. OpenHuman core takes 5-10s to bind :7788. */
const DEFAULT_STARTUP_TIMEOUT_MS = 10_000;
/** Healthcheck cadence after the first pass. */
const DEFAULT_HEALTHCHECK_INTERVAL_MS = 5_000;
/** Per-call healthcheck timeout. */
const DEFAULT_HEALTHCHECK_TIMEOUT_MS = 2_000;
/** Per-ask timeout. OpenHuman requests can take 30-60s. */
const OPENHUMAN_ASK_TIMEOUT_MS = 280_000; // matches backends.ts OPENHUMAN_TIMEOUT_MS

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface OpenHumanSupervisedBackendOptions {
  /** Override the daemon command. Default: "openhuman". */
  command?: string;
  /** Override the daemon args. Default: ["serve"]. */
  args?: string[];
  /** Extra env vars; merged on top of `process.env`. */
  env?: NodeJS.ProcessEnv;
  /** Working directory for a spawned core. Default: Ext Agent projectPath. */
  cwd?: string;
  /** Override the supervisor entirely (for tests). */
  supervisor?: DaemonSupervisor;
  /**
   * Override the inner HTTP backend. Tests pass a fake that doesn't
   * actually call out to OpenHuman.
   */
  inner?: ExtAgentBackend;
  /** Per-ask timeout. Default: 280_000ms (matches the HTTP backend). */
  requestTimeoutMs?: number;
  /**
   * Pre-spawn check (PATH probe for the binary). Set to `false` to
   * skip the check and let spawn ENOENT surface as `installMissing`.
   * Default: an async `command -v openhuman` probe.
   */
  preSpawnCheck?: () => Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Probe the OpenHuman core health endpoint. Same shape as the
 * unwrapped backend's `probe()`; reused by the supervisor's
 * healthcheck so the "is the daemon up?" answer is consistent
 * across the supervisor, the probe, and the offline banner.
 */
async function healthcheckOpenHuman(signal: AbortSignal): Promise<boolean> {
  try {
    const base = openHumanHttpBase();
    const res = await fetch(`${base}/health`, { signal });
    return res.ok;
  } catch {
    return false;
  }
}

async function defaultPreSpawnCheck(): Promise<boolean> {
  const { spawnSync } = await import("node:child_process");
  const isWin = process.platform === "win32";
  const res = spawnSync(
    isWin ? "where" : "command",
    [isWin ? "/Q" : "-v", "openhuman"],
    { encoding: "utf8", timeout: 2_000 },
  );
  return res.status === 0;
}

export class OpenHumanSupervisedBackend implements ExtAgentBackend {
  readonly kind = "openhuman" as const;
  readonly label = "OpenHuman";

  private readonly supervisor: DaemonSupervisor | undefined;
  private readonly inner: ExtAgentBackend;
  private readonly requestTimeoutMs: number;
  /** Cached `start()` failure so we don't spam the same ENOENT to
   *  the user. Cleared on a successful `start()`. */
  private lastStartError: Error | null = null;
  /** Whether we ever reached a healthy state (used by `probe()`). */
  private wasEverHealthy = false;

  constructor(opts: OpenHumanSupervisedBackendOptions = {}) {
    this.inner = opts.inner ?? createOpenHumanBackend();
    this.requestTimeoutMs =
      opts.requestTimeoutMs ?? OPENHUMAN_ASK_TIMEOUT_MS;

    if (!opts.supervisor) {
      this.supervisor = new DaemonSupervisor({
        name: "openhuman",
        command: opts.command ?? DEFAULT_OPENHUMAN_COMMAND,
        args: [...(opts.args ?? DEFAULT_OPENHUMAN_ARGS)],
        env: opts.env,
        cwd: opts.cwd ?? getExtAgentProjectPathCwd("openhuman"),
        healthcheck: healthcheckOpenHuman,
        healthcheckIntervalMs: DEFAULT_HEALTHCHECK_INTERVAL_MS,
        healthcheckTimeoutMs: DEFAULT_HEALTHCHECK_TIMEOUT_MS,
        startupTimeoutMs: DEFAULT_STARTUP_TIMEOUT_MS,
        preSpawnCheck: opts.preSpawnCheck ?? defaultPreSpawnCheck,
        installHint:
          "Install OpenHuman: `curl -fsSL https://raw.githubusercontent.com/tinyhumansai/openhuman/main/scripts/install.sh | bash` " +
          "(set OPENHUMAN_TOKEN or place core.token in your workspace).",
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
      return this.inner.ask(text, sessionKey);
    }
    if (this.lastStartError) throw this.lastStartError;

    // Probe-first: reuse OpenHuman.app / already-running core — no second spawn.
    if (!this.wasEverHealthy) {
      try {
        const up = await this.inner.probe?.();
        if (up) {
          this.wasEverHealthy = true;
          this.lastStartError = null;
        }
      } catch {
        /* fall through to spawn */
      }
    }

    if (!this.wasEverHealthy) {
      try {
        await this.supervisor.start();
        this.wasEverHealthy = true;
        this.lastStartError = null;
      } catch (err) {
        this.lastStartError = err instanceof Error ? err : new Error(String(err));
        throw this.lastStartError;
      }
    }
    return this.inner.ask(text, sessionKey);
  }

  async probe(): Promise<boolean> {
    try {
      const up = await this.inner.probe?.();
      if (up === false) return false;
      if (up) this.wasEverHealthy = true;
      return true;
    } catch {
      return false;
    }
  }

  async start(): Promise<void> {
    if (!this.supervisor) return;
    try {
      const up = await this.inner.probe?.();
      if (up) {
        this.wasEverHealthy = true;
        this.lastStartError = null;
        return;
      }
    } catch {
      /* fall through to spawn */
    }
    if (this.wasEverHealthy) return;
    try {
      await this.supervisor.start();
      this.wasEverHealthy = true;
      this.lastStartError = null;
    } catch (err) {
      this.lastStartError = err instanceof Error ? err : new Error(String(err));
      throw this.lastStartError;
    }
  }

  async stop(): Promise<void> {
    if (!this.supervisor) return;
    await this.supervisor.stop();
  }

  /** `true` if the supervisor was ever healthy during this process's lifetime. */
  isEverHealthy(): boolean {
    return this.wasEverHealthy;
  }

  /** `true` if the supervisor's last start failed. */
  didLastStartFail(): boolean {
    return this.lastStartError != null;
  }

  /** The supervisor's last start error message (or `null`). */
  lastStartErrorMessage(): string | null {
    if (!this.lastStartError) return null;
    if (this.lastStartError instanceof InstallMissingError) {
      return this.lastStartError.message;
    }
    return this.lastStartError.message;
  }
}

/** Factory matching the `ExtAgentBackend` shape used by the sidecar. */
export function createOpenHumanSupervisedBackend(
  options: OpenHumanSupervisedBackendOptions = {},
): ExtAgentBackend {
  return new OpenHumanSupervisedBackend(options);
}

// ---------------------------------------------------------------------------
// Test-only exports
// ---------------------------------------------------------------------------

/** @internal tests */
export const _test = {
  healthcheckOpenHuman,
  defaultPreSpawnCheck,
  DEFAULT_OPENHUMAN_COMMAND,
  DEFAULT_OPENHUMAN_ARGS,
  OPENHUMAN_ASK_TIMEOUT_MS,
};
