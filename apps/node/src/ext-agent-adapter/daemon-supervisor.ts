/**
 * Generic daemon supervisor for external processes that the Ext Agent
 * bridge drives. Used by codex (55B), and (optionally) Hermes/OpenHuman
 * (55E, backlog). Pi and ClaudeCode do not need it (in-process / library).
 *
 * Responsibilities:
 *   1. Spawn the child process with the given command + args + env.
 *   2. Capture stdout / stderr as `stdout` / `stderr` events so consumers
 *      can log with the `[ext-agent:<name>:<stream>]` prefix.
 *   3. Run a caller-supplied healthcheck periodically; emit `healthy` /
 *      `unhealthy` transitions.
 *   4. On unexpected crash, restart with exponential backoff
 *      (`1s → 2s → 4s → 8s → 16s → 30s` capped). If
 *      `maxRestartsInWindow` trips, stop trying and emit `crash.stuck`
 *      so the manager can surface the failure.
 *   5. On `preSpawnCheck === false` OR spawn `ENOENT`, emit
 *      `install-missing` and reject the in-flight `start()` with
 *      `InstallMissingError` so the Settings UI can show an Install
 *      Required card. After install-missing, the supervisor is in a
 *      failed state; the user must install the binary and call
 *      `start()` again.
 *   6. Graceful `stop()`: SIGTERM, wait `killGraceMs` (default 5s), then
 *      SIGKILL. Idempotent. After `stop()`, `start()` is a fresh start.
 *
 * `start()` semantics:
 *   - Resolves when the first healthcheck passes, or after
 *     `startupTimeoutMs` elapses (caller can check `isHealthy()`).
 *   - Rejects with `InstallMissingError` if the binary is missing.
 *   - Rejects with the underlying error on other spawn failures.
 *   - Concurrent `start()` calls share the same promise.
 *
 * The supervisor is decoupled from the sidecar HTTP server. The
 * `healthcheck` function is the bridge between them — e.g. an HTTP GET
 * to the local `/status` endpoint.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface DaemonSupervisorRestartPolicy {
  /** Initial backoff before first restart. Default 1_000ms. */
  initialDelayMs?: number;
  /** Hard cap on backoff between restarts. Default 30_000ms. */
  maxDelayMs?: number;
  /** Multiplier per failed restart. Default 2. */
  backoffMultiplier?: number;
  /**
   * Max restarts within `windowMs` before the supervisor trips its
   * `crash.stuck` state. Default 5.
   */
  maxRestartsInWindow?: number;
  /** Sliding window for the restart counter. Default 300_000ms (5 min). */
  windowMs?: number;
}

export interface DaemonSupervisorOptions {
  /** Short label used in log prefixes + install-missing info. e.g. "codex". */
  name: string;
  /** Executable to spawn. */
  command: string;
  /** Arguments passed to the executable. */
  args: string[];
  /** Extra env vars; merged on top of `process.env`. */
  env?: NodeJS.ProcessEnv;
  /** Working directory for the child. Default `process.cwd()`. */
  cwd?: string;
  /**
   * Async probe returning true when the daemon is healthy. Called
   * repeatedly during `start()` (every 500ms) until the first success
   * or `startupTimeoutMs` elapses, then on `healthcheckIntervalMs`.
   * Receives an `AbortSignal` that fires after `healthcheckTimeoutMs`.
   */
  healthcheck: (signal: AbortSignal) => Promise<boolean>;
  /** Healthcheck cadence after first success. Default 5_000ms. */
  healthcheckIntervalMs?: number;
  /** Per-call healthcheck timeout. Default 2_000ms. */
  healthcheckTimeoutMs?: number;
  /**
   * `start()` resolves when the first healthcheck succeeds, or after this
   * timeout. Default 10_000ms.
   */
  startupTimeoutMs?: number;
  /**
   * Time to wait between SIGTERM and SIGKILL during `stop()`. Default
   * 5_000ms.
   */
  killGraceMs?: number;
  restartPolicy?: DaemonSupervisorRestartPolicy;
  /**
   * Optional pre-spawn check. Return false to short-circuit spawn and
   * emit `install-missing` with reason `pre-check`. Default: no check.
   *
   * Use this when the supervisor can detect "binary not installed"
   * without attempting spawn (e.g. a `command -v` probe). Async
   * exceptions are treated as "not installed".
   */
  preSpawnCheck?: () => Promise<boolean>;
  /**
   * Install hint string for the `install-missing` event. Caller-supplied
   * because the install command is per-agent (npm vs brew vs curl).
   * The Settings UI uses this verbatim in the Install Required card.
   */
  installHint?: string;
}

export type SupervisorInstallMissingReason = "pre-check" | "spawn-enoent";

export interface SupervisorInstallMissingInfo {
  command: string;
  reason: SupervisorInstallMissingReason;
  installHint?: string;
}

export interface SupervisorStopInfo {
  code: number | null;
  signal: NodeJS.Signals | null;
}

export interface SupervisorCrashInfo {
  code: number | null;
  signal: NodeJS.Signals | null;
  error?: Error;
}

export interface SupervisorStuckInfo {
  restarts: number;
  windowMs: number;
}

export interface SupervisorEventMap {
  /** Process spawned successfully (before first healthcheck). */
  start: [];
  /** Process exited cleanly via `stop()` (after SIGKILL if needed). */
  stop: [SupervisorStopInfo];
  /**
   * Process exited unexpectedly (not via `stop()`). Triggers a restart
   * (subject to backoff + stuck state). NOT emitted when the exit
   * follows an `install-missing` signal.
   */
  crash: [SupervisorCrashInfo];
  /** Healthcheck transitioned to passing. */
  healthy: [];
  /** Healthcheck transitioned to failing (after at least one passing). */
  unhealthy: [];
  /**
   * Binary is missing. Emitted BEFORE any spawn attempt when
   * `preSpawnCheck === false`, or AFTER a failed `spawn()` with
   * `err.code === "ENOENT"`. Caller is responsible for surfacing
   * an Install Required card. After this event, the supervisor
   * stops trying to restart; user must call `start()` again after
   * installing.
   */
  "install-missing": [SupervisorInstallMissingInfo];
  /**
   * Supervisor tripped its stuck state: too many restarts inside the
   * sliding window. Further restarts are abandoned until the process
   * succeeds (clears the counter) or `stop()` is called.
   */
  "crash.stuck": [SupervisorStuckInfo];
  /** Decoded stdout chunk. */
  stdout: [string];
  /** Decoded stderr chunk. */
  stderr: [string];
}

export type SupervisorEventName = keyof SupervisorEventMap;

export declare interface DaemonSupervisor {
  on<E extends SupervisorEventName>(event: E, listener: (...args: SupervisorEventMap[E]) => void): this;
  off<E extends SupervisorEventName>(event: E, listener: (...args: SupervisorEventMap[E]) => void): this;
  emit<E extends SupervisorEventName>(event: E, ...args: SupervisorEventMap[E]): boolean;
  removeAllListeners<E extends SupervisorEventName>(event?: E): this;
}

/**
 * Thrown by `start()` when the binary is missing (pre-spawn check
 * returned false, or `spawn()` raised `ENOENT` synchronously or
 * asynchronously via the `error` event). The `info` field carries the
 * same payload as the `install-missing` event so callers don't need
 * to subscribe to the event to handle install failures.
 */
export class InstallMissingError extends Error {
  readonly info: SupervisorInstallMissingInfo;
  constructor(info: SupervisorInstallMissingInfo) {
    super(`[ext-agent] install missing: ${info.command} (${info.reason})`);
    this.name = "InstallMissingError";
    this.info = info;
  }
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

const DEFAULTS = {
  healthcheckIntervalMs: 5_000,
  healthcheckTimeoutMs: 2_000,
  startupTimeoutMs: 10_000,
  killGraceMs: 5_000,
  restart: {
    initialDelayMs: 1_000,
    maxDelayMs: 30_000,
    backoffMultiplier: 2,
    maxRestartsInWindow: 5,
    windowMs: 300_000,
  },
} as const;

interface ResolvedOptions {
  name: string;
  command: string;
  args: string[];
  healthcheck: (signal: AbortSignal) => Promise<boolean>;
  healthcheckIntervalMs: number;
  healthcheckTimeoutMs: number;
  startupTimeoutMs: number;
  killGraceMs: number;
  restart: Required<DaemonSupervisorRestartPolicy>;
  env: NodeJS.ProcessEnv | undefined;
  cwd: string | undefined;
  preSpawnCheck: (() => Promise<boolean>) | undefined;
  installHint: string | undefined;
}

interface SupervisorState {
  proc: ChildProcess | null;
  started: boolean;
  stopping: boolean;
  stopped: boolean;
  healthy: boolean;
  /** Set by pre-check fail or ENOENT; cleared on successful spawn. */
  installMissing: boolean;
  /** Scheduled restart timer (NodeJS.Timeout) or null. */
  restartTimer: NodeJS.Timeout | null;
  /** Scheduled periodic-healthcheck timer. */
  healthTimer: NodeJS.Timeout | null;
  /** In-flight healthcheck AbortController (single in-flight at a time). */
  healthInFlight: AbortController | null;
  /** Sliding-window restart timestamps. */
  restartTimestamps: number[];
  /** Current backoff delay (reset on healthy). */
  nextBackoffMs: number;
  /** In-flight start() promise (shared by concurrent callers). */
  startInProgress: Promise<void> | null;
}

export class DaemonSupervisor extends EventEmitter {
  private readonly opts: ResolvedOptions;
  private readonly state: SupervisorState;

  constructor(options: DaemonSupervisorOptions) {
    super();
    if (!options.name?.trim()) {
      throw new Error("DaemonSupervisor: `name` is required");
    }
    if (!options.command?.trim()) {
      throw new Error("DaemonSupervisor: `command` is required");
    }
    if (typeof options.healthcheck !== "function") {
      throw new Error("DaemonSupervisor: `healthcheck` is required");
    }
    this.opts = {
      name: options.name,
      command: options.command,
      args: [...options.args],
      healthcheck: options.healthcheck,
      healthcheckIntervalMs:
        options.healthcheckIntervalMs ?? DEFAULTS.healthcheckIntervalMs,
      healthcheckTimeoutMs:
        options.healthcheckTimeoutMs ?? DEFAULTS.healthcheckTimeoutMs,
      startupTimeoutMs: options.startupTimeoutMs ?? DEFAULTS.startupTimeoutMs,
      killGraceMs: options.killGraceMs ?? DEFAULTS.killGraceMs,
      restart: {
        initialDelayMs:
          options.restartPolicy?.initialDelayMs ?? DEFAULTS.restart.initialDelayMs,
        maxDelayMs:
          options.restartPolicy?.maxDelayMs ?? DEFAULTS.restart.maxDelayMs,
        backoffMultiplier:
          options.restartPolicy?.backoffMultiplier ?? DEFAULTS.restart.backoffMultiplier,
        maxRestartsInWindow:
          options.restartPolicy?.maxRestartsInWindow ??
          DEFAULTS.restart.maxRestartsInWindow,
        windowMs: options.restartPolicy?.windowMs ?? DEFAULTS.restart.windowMs,
      },
      env: options.env,
      cwd: options.cwd,
      preSpawnCheck: options.preSpawnCheck,
      installHint: options.installHint,
    };
    this.state = {
      proc: null,
      started: false,
      stopping: false,
      stopped: false,
      healthy: false,
      installMissing: false,
      restartTimer: null,
      healthTimer: null,
      healthInFlight: null,
      restartTimestamps: [],
      nextBackoffMs: this.opts.restart.initialDelayMs,
      startInProgress: null,
    };
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Spawn the daemon and resolve when the first healthcheck passes, or
   * when `startupTimeoutMs` elapses (in which case `isHealthy()` returns
   * false; caller can react via `unhealthy` / `crash` events).
   *
   * Rejects with `InstallMissingError` if the binary is missing
   * (pre-spawn check fail or spawn ENOENT) — caller surfaces an
   * Install Required card. Rejects with the underlying error on
   * other spawn failures.
   *
   * Idempotent in steady state: concurrent `start()` calls share the
   * same promise. After `stop()`, `start()` is a fresh start.
   */
  start(): Promise<void> {
    if (this.state.startInProgress) {
      return this.state.startInProgress;
    }
    // Already running and healthy — no-op.
    if (
      this.state.proc &&
      this.state.proc.exitCode === null &&
      this.state.proc.signalCode === null &&
      this.state.healthy
    ) {
      return Promise.resolve();
    }
    // After stop(), allow a fresh start cycle.
    if (this.state.stopped) {
      this.state.stopped = false;
      this.state.stopping = false;
    }
    // Reset for a fresh attempt — a prior install-missing must not
    // poison subsequent successful starts.
    this.state.installMissing = false;
    const p = (async () => {
      try {
        await this.spawnAndWaitForFirstHealthy();
      } finally {
        this.state.startInProgress = null;
      }
    })();
    this.state.startInProgress = p;
    return p;
  }

  /**
   * Stop the daemon. SIGTERM, wait `killGraceMs`, then SIGKILL. Waits
   * for the process to fully exit. Idempotent. After `stop()`,
   * calling `start()` begins a fresh supervisor cycle (process
   * lifecycle state is fully reset).
   */
  async stop(): Promise<void> {
    if (this.state.stopped || this.state.stopping) {
      return;
    }
    this.state.stopped = true;
    this.state.stopping = true;
    this.clearTimers();
    const proc = this.state.proc;
    if (proc && proc.exitCode === null && proc.signalCode === null) {
      try {
        proc.kill("SIGTERM");
      } catch {
        // already dead
      }
      const exited = await this.waitForExit(proc, this.opts.killGraceMs);
      if (!exited) {
        try {
          proc.kill("SIGKILL");
        } catch {
          // already dead
        }
        await this.waitForExit(proc, 2_000).catch(() => undefined);
      }
    }
    this.state.proc = null;
    this.state.started = false;
    this.state.healthy = false;
    this.state.stopping = false;
  }

  /** True while the child process is alive. */
  isRunning(): boolean {
    return (
      this.state.proc !== null &&
      this.state.proc.exitCode === null &&
      this.state.proc.signalCode === null
    );
  }

  /** Last known healthcheck result. `false` until the first healthcheck succeeds. */
  isHealthy(): boolean {
    return this.state.healthy;
  }

  /** Number of restarts within the configured sliding window. */
  restartsInWindow(): number {
    const now = Date.now();
    this.state.restartTimestamps = this.state.restartTimestamps.filter(
      (t) => now - t < this.opts.restart.windowMs,
    );
    return this.state.restartTimestamps.length;
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private async spawnAndWaitForFirstHealthy(): Promise<void> {
    if (this.state.stopped) return;

    // 1. Pre-spawn install check
    if (this.opts.preSpawnCheck) {
      let preOk = false;
      try {
        preOk = await this.opts.preSpawnCheck();
      } catch {
        preOk = false;
      }
      if (!preOk) {
        const info: SupervisorInstallMissingInfo = {
          command: this.opts.command,
          reason: "pre-check",
          ...(this.opts.installHint ? { installHint: this.opts.installHint } : {}),
        };
        this.state.installMissing = true;
        this.emit("install-missing", info);
        throw new InstallMissingError(info);
      }
    }

    // 2. Spawn
    let proc: ChildProcess;
    try {
      proc = this.spawnChild();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      if (this.isEnoent(error)) {
        const info: SupervisorInstallMissingInfo = {
          command: this.opts.command,
          reason: "spawn-enoent",
          ...(this.opts.installHint ? { installHint: this.opts.installHint } : {}),
        };
        this.state.installMissing = true;
        this.emit("install-missing", info);
        throw new InstallMissingError(info);
      }
      throw error;
    }

    this.state.proc = proc;
    this.state.started = true;
    this.state.healthy = false;

    // Async ENOENT (some platforms fire this after spawn() returns).
    // Flag install-missing; the first-healthcheck loop and handleExit
    // will see the flag and not restart.
    proc.once("error", (err) => {
      if (this.state.stopped || this.state.stopping) return;
      if (this.isEnoent(err)) {
        const info: SupervisorInstallMissingInfo = {
          command: this.opts.command,
          reason: "spawn-enoent",
          ...(this.opts.installHint ? { installHint: this.opts.installHint } : {}),
        };
        this.state.installMissing = true;
        this.emit("install-missing", info);
        return;
      }
      this.emit("crash", { code: null, signal: null, error: err });
      this.cleanupProc();
      this.scheduleRestart();
    });

    proc.stdout?.on("data", (chunk: Buffer) => {
      this.emit("stdout", chunk.toString("utf8"));
    });
    proc.stderr?.on("data", (chunk: Buffer) => {
      this.emit("stderr", chunk.toString("utf8"));
    });

    proc.once("exit", (code, signal) => {
      this.handleExit({ code, signal });
    });

    this.emit("start");

    // 3. Wait for first healthcheck (with startup timeout)
    await this.runFirstHealthcheck();
    if (!this.state.stopped && this.state.healthy) {
      this.startHealthTimer();
    }
  }

  private isEnoent(err: Error): boolean {
    const code = (err as Error & { code?: string }).code;
    if (code === "ENOENT") return true;
    return /ENOENT/.test(err.message);
  }

  private spawnChild(): ChildProcess {
    const env = this.opts.env
      ? { ...process.env, ...this.opts.env }
      : process.env;
    return spawn(this.opts.command, this.opts.args, {
      cwd: this.opts.cwd ?? process.cwd(),
      env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
  }

  /**
   * Poll the healthcheck every 500ms until success or `startupTimeoutMs`
   * elapses. Throws `InstallMissingError` if the binary is missing
   * (set asynchronously via the `error` event).
   *
   * After the first passing healthcheck, waits a 100ms stability grace
   * window: on some platforms (notably macOS) `spawn()` returns a
   * child object for a non-existent binary that immediately fires the
   * `error` event with ENOENT — the spawn itself doesn't throw. The
   * healthcheck can pass before the `error` event fires, so we hold
   * off on resolving `start()` until the process has been "stable"
   * for a brief moment.
   */
  private async runFirstHealthcheck(): Promise<void> {
    if (this.state.stopped || !this.state.proc) return;
    const deadline = Date.now() + this.opts.startupTimeoutMs;
    while (Date.now() < deadline) {
      if (this.state.stopped) return;
      if (this.state.installMissing) {
        // Async ENOENT fired after spawn returned.
        throw new InstallMissingError({
          command: this.opts.command,
          reason: "spawn-enoent",
          ...(this.opts.installHint
            ? { installHint: this.opts.installHint }
            : {}),
        });
      }
      if (!this.state.proc) return;
      const ok = await this.runOneHealthcheck();
      if (ok) {
        if (!this.state.healthy) {
          this.state.healthy = true;
          this.emit("healthy");
        }
        this.state.nextBackoffMs = this.opts.restart.initialDelayMs;
        // Stability grace — see JSDoc above.
        await this.sleep(100);
        if (this.state.installMissing) {
          throw new InstallMissingError({
            command: this.opts.command,
            reason: "spawn-enoent",
            ...(this.opts.installHint
              ? { installHint: this.opts.installHint }
              : {}),
          });
        }
        return;
      }
      await this.sleep(500);
    }
    // Timed out. Caller checks isHealthy() to distinguish.
  }

  private startHealthTimer(): void {
    if (this.state.stopped || this.state.healthTimer) return;
    this.state.healthTimer = setInterval(() => {
      void this.tickHealthcheck();
    }, this.opts.healthcheckIntervalMs);
    // unref so the interval doesn't keep the Node process alive on its own
    this.state.healthTimer.unref?.();
  }

  private async tickHealthcheck(): Promise<void> {
    if (this.state.stopped || this.state.stopping) return;
    if (this.state.healthInFlight) return; // skip overlapping ticks
    const ok = await this.runOneHealthcheck();
    if (ok && !this.state.healthy) {
      this.state.healthy = true;
      this.state.nextBackoffMs = this.opts.restart.initialDelayMs;
      this.emit("healthy");
    } else if (!ok && this.state.healthy) {
      this.state.healthy = false;
      this.emit("unhealthy");
    }
  }

  private async runOneHealthcheck(): Promise<boolean> {
    // Cancel any previous in-flight healthcheck — there should be at
    // most one in flight at a time. Aborting prevents the previous
    // healthcheck from blocking the next one.
    if (this.state.healthInFlight) {
      this.state.healthInFlight.abort();
    }
    const ac = new AbortController();
    this.state.healthInFlight = ac;
    const timeout = setTimeout(() => ac.abort(), this.opts.healthcheckTimeoutMs);
    timeout.unref?.();
    try {
      return await this.opts.healthcheck(ac.signal);
    } catch {
      return false;
    } finally {
      clearTimeout(timeout);
      if (this.state.healthInFlight === ac) {
        this.state.healthInFlight = null;
      }
    }
  }

  private handleExit(info: {
    code: number | null;
    signal: NodeJS.Signals | null;
  }): void {
    if (this.state.stopping) {
      this.state.proc = null;
      this.state.started = false;
      this.emit("stop", info);
      return;
    }
    this.cleanupProc();
    this.emit("crash", info);
    if (this.state.installMissing) {
      // Don't restart — let the start() promise reject and the user
      // reinstall. The first-healthcheck loop will see the flag and
      // throw InstallMissingError; this exit is just a formality.
      return;
    }
    this.scheduleRestart();
  }

  private cleanupProc(): void {
    const proc = this.state.proc;
    this.state.proc = null;
    this.state.started = false;
    this.state.healthy = false;
    if (proc) {
      try {
        proc.stdout?.removeAllListeners();
        proc.stderr?.removeAllListeners();
        // Destroy piped stdio so the event loop doesn't wait on a
        // half-closed stream after the child has errored out (e.g.
        // ENOENT on macOS where spawn() returns a child object that
        // immediately emits 'error' but leaves stdio open).
        proc.stdout?.destroy();
        proc.stderr?.destroy();
        try {
          proc.removeAllListeners("exit");
          proc.removeAllListeners("error");
        } catch {
          // best-effort
        }
      } catch {
        // best-effort
      }
    }
  }

  private scheduleRestart(): void {
    if (this.state.stopped || this.state.stopping) return;
    const now = Date.now();
    const window = this.opts.restart.windowMs;
    this.state.restartTimestamps = this.state.restartTimestamps.filter(
      (t) => now - t < window,
    );
    if (
      this.state.restartTimestamps.length >= this.opts.restart.maxRestartsInWindow
    ) {
      this.emit("crash.stuck", {
        restarts: this.state.restartTimestamps.length,
        windowMs: window,
      });
      return; // give up; caller must call stop() + start() to recover
    }
    this.state.restartTimestamps.push(now);
    const delay = Math.min(
      this.state.nextBackoffMs,
      this.opts.restart.maxDelayMs,
    );
    this.state.nextBackoffMs = Math.min(
      delay * this.opts.restart.backoffMultiplier,
      this.opts.restart.maxDelayMs,
    );
    if (this.state.restartTimer) clearTimeout(this.state.restartTimer);
    this.state.restartTimer = setTimeout(() => {
      this.state.restartTimer = null;
      void this.respawn();
    }, delay);
    this.state.restartTimer.unref?.();
  }

  private async respawn(): Promise<void> {
    if (this.state.stopped || this.state.stopping) return;
    try {
      await this.spawnAndWaitForFirstHealthy();
    } catch {
      // install-missing or other spawn error already handled; nothing more
    }
  }

  private clearTimers(): void {
    if (this.state.restartTimer) {
      clearTimeout(this.state.restartTimer);
      this.state.restartTimer = null;
    }
    if (this.state.healthTimer) {
      clearInterval(this.state.healthTimer);
      this.state.healthTimer = null;
    }
    if (this.state.healthInFlight) {
      this.state.healthInFlight.abort();
      this.state.healthInFlight = null;
    }
  }

  private waitForExit(proc: ChildProcess, timeoutMs: number): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      if (proc.exitCode !== null || proc.signalCode !== null) {
        resolve(true);
        return;
      }
      const t = setTimeout(() => {
        proc.removeListener("exit", onExit);
        resolve(false);
      }, timeoutMs);
      t.unref?.();
      const onExit = () => {
        clearTimeout(t);
        resolve(true);
      };
      proc.once("exit", onExit);
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      const t = setTimeout(resolve, ms);
      t.unref?.();
    });
  }
}

// ---------------------------------------------------------------------------
// Module exports — test helpers
// ---------------------------------------------------------------------------

/** Test-only exports. Not for production use. */
export const _test = {
  DEFAULTS,
  /**
   * Run a single healthcheck with a fresh AbortSignal and the given
   * timeout. Returns `false` on throw or abort. Used by tests to
   * exercise the healthcheck wrapper in isolation.
   */
  async runHealthcheckOnce(
    healthcheck: (signal: AbortSignal) => Promise<boolean>,
    timeoutMs: number,
  ): Promise<boolean> {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeoutMs);
    t.unref?.();
    try {
      return await healthcheck(ac.signal);
    } catch {
      return false;
    } finally {
      clearTimeout(t);
    }
  },
};
