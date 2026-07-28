/**
 * Phase 49 — Pi runtime lifecycle wrappers (mirrors node-service-openclaw-runtime.ts).
 *
 * This module owns the PiRuntime lifecycle on behalf of NodeServiceImpl:
 *   - state container (createPiRuntimeState)
 *   - deps snapshot (buildPiRuntimeDeps)
 *   - start/stop/restart/ensureReady gated on piEnabled + sidecar presence
 *   - status reporting (getPiStatusViaRuntime)
 *   - one-shot ask (askPiViaRuntime) — used by the JSON-RPC sendToPi method
 *
 * The actual JSONL protocol + child-process management lives in pi-runtime.ts;
 * this file is the EnvoyMesh-shaped wrapper that decides WHEN to spawn.
 */

import { PiRuntime, discoverPiCli, buildPiSpawnConfig } from "./pi-runtime.js"
import type {
  PiPromptResult,
  PiRuntimeState,
  PiStatus,
} from "@envoymesh/api"
import type { ModelProviderConfig } from "@envoymesh/api"

// ---------------------------------------------------------------------------
// State + deps (mirror OpenClawRuntimeState / buildOpenClawRuntimeDeps)
// ---------------------------------------------------------------------------

export interface PiRuntimeStateMutable {
  /** The PiRuntime instance once spawned; null until start succeeds. */
  runtime: PiRuntime | null
  /** Discovered Pi CLI path (cached after first lookup). */
  cliPath: string | null
  /** Pi version string (informational). */
  version: string | null
  /** In-flight start() promise — dedupes concurrent callers. */
  startPromise: Promise<boolean> | null
  /** Last spawn failure reason; surfaced in getPiStatus(). */
  lastError: string | null
  /** ISO timestamp of lastError. */
  lastErrorAt: string | null
  /** Consecutive restart failures since last success (watchdog health). */
  consecutiveRestartFailures: number
  /** Watchdog timer for auto-restart on child crash. */
  watchdogTimer: ReturnType<typeof setTimeout> | null
  /** Whether the watchdog is currently armed. */
  watchdogRunning: boolean
}

export function createPiRuntimeState(): PiRuntimeStateMutable {
  return {
    runtime: null,
    cliPath: null,
    version: null,
    startPromise: null,
    lastError: null,
    lastErrorAt: null,
    consecutiveRestartFailures: 0,
    watchdogTimer: null,
    watchdogRunning: false,
  }
}

export interface PiRuntimeDeps {
  /** Reads PersistedNodeConfig — used to check piEnabled + modelProviders. */
  loadConfig: () => Promise<{ piEnabled?: boolean; piSettings?: unknown; modelProviders: ModelProviderConfig } | null>
  /** Repo root — used by discoverPiCli to find the bundled sidecar. */
  getRepoRoot?: () => string
  /** Logger sink. */
  log?: (level: "info" | "warn" | "error", msg: string) => void
}

export function buildPiRuntimeDeps(host: any): PiRuntimeDeps {
  return {
    loadConfig: () => host._configStore.load(),
  }
}

// ---------------------------------------------------------------------------
// Lifecycle: start / stop / restart / ensureReady
// ---------------------------------------------------------------------------

/** True when Pi is enabled in config. Default: true (full builds). */
export async function isPiEnabledViaRuntime(deps: PiRuntimeDeps): Promise<boolean> {
  const cfg = await deps.loadConfig()
  return cfg?.piEnabled ?? true
}

/** True when the runtime is spawned and ready. */
export function isPiReadyViaRuntime(state: PiRuntimeStateMutable): boolean {
  return state.runtime?.isReady ?? false
}

/**
 * Start the Pi runtime. Returns true if Pi is ready (or became ready); false
 * if disabled, not installed, or spawn failed (lastError set).
 *
 * Idempotent: concurrent callers share one startPromise. A no-op if already
 * ready. The inner spawn is in startPiInner.
 */
export async function startPiViaRuntime(
  state: PiRuntimeStateMutable,
  deps: PiRuntimeDeps,
): Promise<boolean> {
  if ((await isPiEnabledViaRuntime(deps)) === false) return false
  if (isPiReadyViaRuntime(state)) return true
  if (state.startPromise) return state.startPromise

  state.startPromise = startPiInner(state, deps).finally(() => {
    state.startPromise = null
  })
  return state.startPromise
}

async function startPiInner(state: PiRuntimeStateMutable, deps: PiRuntimeDeps): Promise<boolean> {
  const log = deps.log ?? ((level, msg) => console[level](`[pi] ${msg}`))

  // 1. Discover the bundled Pi CLI.
  if (!state.cliPath) {
    const discovered = discoverPiCli(deps.getRepoRoot?.())
    if (!discovered) {
      recordError(state, "Pi sidecar not found — slim build or fetch-pi-sidecar.sh not run")
      log("warn", "sidecar not found (slim build or staging skipped)")
      return false
    }
    state.cliPath = discovered.cliPath
    state.version = discovered.version
    log("info", `discovered Pi ${discovered.version} at ${discovered.cliPath}`)
  }

  // 2. Resolve model config from EnvoyMesh settings.
  const cfg = await deps.loadConfig()
  if (!cfg?.modelProviders) {
    recordError(state, "model provider config missing — configure a model in Settings → AI")
    return false
  }
  const spawnConfig = buildPiSpawnConfig(cfg.modelProviders)
  if (!spawnConfig) {
    recordError(state, `model mode "${cfg.modelProviders.mode}" is not usable by Pi — configure a real provider`)
    return false
  }

  // 3. Spawn.
  try {
    const runtime = new PiRuntime({
      cliPath: state.cliPath,
      version: state.version ?? "unknown",
      spawnConfig,
      log,
    })
    // Auto-restart on unexpected exit (watchdog).
    runtime.on("__exit", ({ code, wasReady }) => {
      log("warn", `child exited (code=${code}, wasReady=${wasReady})`)
      state.runtime = null
      if (wasReady) armWatchdog(state, deps)
    })
    runtime.on("__error", (err: Error) => {
      recordError(state, `runtime error: ${err.message}`)
    })
    await runtime.start()
    state.runtime = runtime
    state.consecutiveRestartFailures = 0
    state.lastError = null
    state.lastErrorAt = null
    log("info", `ready (pid=${runtime.pid}, model=${spawnConfig.modelSpec})`)
    return true
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    recordError(state, `spawn failed: ${msg}`)
    state.consecutiveRestartFailures += 1
    return false
  }
}

function recordError(state: PiRuntimeStateMutable, msg: string): void {
  state.lastError = msg
  state.lastErrorAt = new Date().toISOString()
}

/**
 * Arm a watchdog to restart Pi after an unexpected exit. Exponential backoff:
 * 1s, 2s, 4s, 8s… capped at 60s. Reset on successful restart. Gives up after
 * 5 consecutive failures (matches OpenClaw's policy of not infinite-looping).
 */
function armWatchdog(state: PiRuntimeStateMutable, deps: PiRuntimeDeps): void {
  if (state.watchdogRunning) return
  state.watchdogRunning = true
  const attempt = state.consecutiveRestartFailures
  if (attempt >= 5) {
    ;(deps.log ?? console.error).call(
      null,
      "error",
      `[pi] giving up after ${attempt} consecutive restart failures`,
    )
    state.watchdogRunning = false
    return
  }
  const delayMs = Math.min(1_000 * 2 ** attempt, 60_000)
  state.watchdogTimer = setTimeout(() => {
    state.watchdogRunning = false
    state.watchdogTimer = null
    void startPiViaRuntime(state, deps).catch(() => {
      /* error already recorded in startPiInner */
    })
  }, delayMs)
}

export async function stopPiViaRuntime(state: PiRuntimeStateMutable): Promise<void> {
  if (state.watchdogTimer) {
    clearTimeout(state.watchdogTimer)
    state.watchdogTimer = null
    state.watchdogRunning = false
  }
  if (state.startPromise) {
    // Let the in-flight start finish before stopping.
    await state.startPromise.catch(() => {})
  }
  const runtime = state.runtime
  if (runtime) {
    state.runtime = null
    await runtime.stop()
  }
}

export async function restartPiViaRuntime(
  state: PiRuntimeStateMutable,
  deps: PiRuntimeDeps,
): Promise<boolean> {
  await stopPiViaRuntime(state)
  state.consecutiveRestartFailures = 0 // user-initiated; clear the backoff state
  return startPiViaRuntime(state, deps)
}

/**
 * Ensure Pi is ready before sending a request. Starts it if not yet started.
 * Returns the runtime, or throws if it cannot be made ready.
 */
export async function ensurePiReadyViaRuntime(
  state: PiRuntimeStateMutable,
  deps: PiRuntimeDeps,
): Promise<PiRuntime> {
  const started = await startPiViaRuntime(state, deps)
  if (!started || !state.runtime) {
    throw new Error(state.lastError ?? "Pi runtime not ready")
  }
  return state.runtime
}

// ---------------------------------------------------------------------------
// ask: one-shot prompt (used by sendToPi JSON-RPC method)
// ---------------------------------------------------------------------------

export async function askPiViaRuntime(
  state: PiRuntimeStateMutable,
  deps: PiRuntimeDeps,
  prompt: string,
): Promise<PiPromptResult> {
  const runtime = await ensurePiReadyViaRuntime(state, deps)
  return runtime.prompt(prompt)
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export async function getPiStatusViaRuntime(
  state: PiRuntimeStateMutable,
  deps: PiRuntimeDeps,
): Promise<PiStatus> {
  const enabled = await isPiEnabledViaRuntime(deps)
  const runtime = state.runtime
  const stateValue: PiRuntimeState = !runtime
    ? state.lastError
      ? "error"
      : "stopped"
    : runtime.isReady
      ? "ready"
      : "starting"

  const snapshot = runtime?.spawnConfigSnapshot

  // If disabled, surface that explicitly even if a stale runtime is held.
  if (!enabled) {
    return {
      enabled: false,
      state: "disabled",
      piCliPath: state.cliPath ?? undefined,
      piVersion: state.version ?? undefined,
      modelInherited: true,
    }
  }

  return {
    enabled: true,
    state: stateValue,
    piCliPath: state.cliPath ?? undefined,
    piVersion: state.version ?? undefined,
    modelSpec: snapshot ? `${snapshot.provider}/${snapshot.model}` : undefined,
    modelInherited: snapshot?.inherited ?? true,
    error: state.lastError ?? undefined,
    pid: runtime?.pid,
  }
}
