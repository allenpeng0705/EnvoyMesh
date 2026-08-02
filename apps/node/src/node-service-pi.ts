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
import { piRequestToProposal, auditPiTool } from "./pi-tool-bridge.js"
import { resolve } from "node:path"
import type { LocalTaskStore } from "@envoymesh/local-store"
import type {
  ModelProviderConfig,
  PiExtensionUiRequest,
  PiPromptResult,
  PiProposalEvent,
  PiRuntimeState,
  PiSettings,
  PiStatus,
  PiToolProposal,
} from "@envoymesh/api"

// ---------------------------------------------------------------------------
// State + deps (mirror OpenClawRuntimeState / buildOpenClawRuntimeDeps)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Phase 49D — tool-call approval (confirm-dialog flow)
// ---------------------------------------------------------------------------

/**
 * Tracks an in-flight tool proposal so the audit event on response can be
 * correlated with the original title/message (which the respond RPC doesn't
 * re-send). Stored per-PiRuntimeState, keyed by uiRequestId.
 */
interface InFlightProposal {
  title: string
  message: string
  receivedAt: number
}

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
  /**
   * Phase 49D — in-flight tool-approval proposals, keyed by uiRequestId.
   * Per-state (NOT module-level) so multiple NodeService instances don't
   * cross-pollinate. Each entry is removed when the user responds OR when
   * the per-request timeout fires (auto-deny).
   */
  inFlightProposals: Map<string, InFlightProposal>
  /**
   * Per-request timeout timers (one per uiRequestId). When `req.timeout`
   * elapses with no user response, we emit pi.tool.denied and auto-respond
   * to Pi with confirmed:false (mirrors Pi's own auto-skip behavior, but
   * makes the audit trail complete).
   */
  proposalTimeouts: Map<string, ReturnType<typeof setTimeout>>
  /**
   * Depth of in-flight Ext Agent asks. When > 0, tool-approval UI requests
   * are auto-denied so Ext Agent chat does not block waiting for Pi Chat.
   */
  extAgentAskDepth: number
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
    inFlightProposals: new Map(),
    proposalTimeouts: new Map(),
    extAgentAskDepth: 0,
  }
}

export interface PiRuntimeDeps {
  /** Reads PersistedNodeConfig — used to check piEnabled + modelProviders. */
  loadConfig: () => Promise<{
    piEnabled?: boolean
    piSettings?: PiSettings
    modelProviders: ModelProviderConfig
  } | null>
  /** Repo root — used by discoverPiCli to find the bundled sidecar. */
  getRepoRoot?: () => string
  /** Logger sink. */
  log?: (level: "info" | "warn" | "error", msg: string) => void
  /**
   * Phase 49D — called when Pi emits an extension_ui_request (tool-approval
   * sub-protocol). The host surfaces it as a confirm dialog in the UI and
   * eventually calls respondToUiRequestViaRuntime() with the user's decision.
   * Optional: when omitted, requests auto-deny (Pi's safe default on timeout).
   */
  onProposal?: (proposal: PiToolProposal, raw: PiExtensionUiRequest) => void
  /** Audit store — when present, pi.tool.* events are appended. */
  taskStore?: LocalTaskStore | null
}

export function buildPiRuntimeDeps(host: any): PiRuntimeDeps {
  return {
    loadConfig: () => host._configStore.load(),
    onProposal: (proposal, raw) => host.emit("pi:proposal", { proposal } satisfies PiProposalEvent),
    taskStore: host._taskStore ?? null,
    // Hint for monorepo / bundle layouts only. Do NOT return TAURI_RESOURCE_DIR
    // here — discoverPiCli already reads that env (and ENVOYMESH_PI_CLI) and
    // treating Resources/ as a repo root adds dead paths like Resources/resources/pi.
    getRepoRoot: () => {
      const bundle = process.env.ENVOYMESH_NODE_BUNDLE_DIR?.trim()
      if (bundle) return resolve(bundle, "..")
      return process.cwd()
    },
  }
}

// ---------------------------------------------------------------------------
// Lifecycle: start / stop / restart / ensureReady
// ---------------------------------------------------------------------------

/**
 * True when Pi is enabled in config AND the bundled sidecar is discoverable
 * on disk. Default: true when the sidecar exists (full builds); false
 * otherwise (slim builds, missing staging, dev with no Pi on disk).
 *
 * Slim-build defence (Phase 49): on Windows slim builds the staged tree
 * has no resources/pi/ (tauri.conf.slim.json omits it to stay under the
 * NSIS 2 GB cap). The runtime now treats that as "Pi disabled" rather
 * than letting the Social UI render the Pi panel while the underlying
 * runtime silently no-ops with "sidecar not found".
 *
 * Order matters: explicit `piEnabled: false` short-circuits BEFORE the
 * filesystem probe so users who turned Pi off in Settings → AI aren't
 * surprised by a long discovery walk on every ensureReady() call.
 */
export async function isPiEnabledViaRuntime(deps: PiRuntimeDeps): Promise<boolean> {
  const cfg = await deps.loadConfig()
  if (cfg?.piEnabled === false) return false
  const discovered = discoverPiCli(deps.getRepoRoot?.())
  if (!discovered) return false
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

  // 2. Resolve model config: Pi override wins; else EnvoyMesh Settings → AI.
  //    Override is Pi-only — OpenClaw / Hermes / OpenHuman are unaffected.
  const cfg = await deps.loadConfig()
  if (!cfg?.modelProviders) {
    recordError(state, "model provider config missing — configure a model in Settings → AI")
    return false
  }
  const spawnConfig = buildPiSpawnConfig(cfg.modelProviders, cfg.piSettings?.modelOverride)
  if (!spawnConfig) {
    const viaOverride = Boolean(cfg.piSettings?.modelOverride)
    recordError(
      state,
      viaOverride
        ? "Pi custom model is incomplete or unusable — fix Settings → AI → Pi, or clear the override"
        : `model mode "${cfg.modelProviders.mode}" is not usable by Pi — configure a real provider`,
    )
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
    // Phase 49D — surface tool-approval requests to the host (NodeServiceImpl
    // emits "pi:proposal", which ws-server bridges to the Social UI).
    runtime.on("ui_request", (req: PiExtensionUiRequest) => {
      const proposal = piRequestToProposal(req)
      if (!proposal) {
        log("warn", `ignoring malformed extension_ui_request (id=${req.id})`)
        // Auto-deny so Pi doesn't block forever on a malformed request.
        void runtime.respondToUiRequest(req.id, false).catch(() => {})
        return
      }
      // Ext Agent chat path: keep conversational — deny tools (coding stays in Pi Chat).
      if (state.extAgentAskDepth > 0) {
        log(
          "info",
          `auto-deny tool during Ext Agent ask: "${proposal.title}" (id=${proposal.uiRequestId})`,
        )
        void runtime.respondToUiRequest(req.id, false).catch(() => {})
        return
      }
      log("info", `tool approval requested: "${proposal.title}" (id=${proposal.uiRequestId})`)
      trackInFlightProposal(state, deps, proposal.uiRequestId, proposal.title, proposal.message, proposal.timeoutMs)
      void auditPiTool(deps.taskStore, "pi.tool.proposed", {
        uiRequestId: proposal.uiRequestId,
        title: proposal.title,
        message: proposal.message,
      })
      if (deps.onProposal) {
        deps.onProposal(proposal, req)
      } else {
        // No host sink — auto-deny so Pi unblocks (matches timeout behavior).
        void runtime.respondToUiRequest(req.id, false).catch(() => {})
      }
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
  // Cancel any pending tool-approval timeouts so they don't fire after stop.
  for (const timer of state.proposalTimeouts.values()) {
    clearTimeout(timer)
  }
  state.proposalTimeouts.clear()
  state.inFlightProposals.clear()
  if (state.startPromise) {
    // Let the in-flight start finish before stopping.
    await state.startPromise.catch(() => {})
  }
  const runtime = state.runtime
  if (runtime) {
    state.runtime = null
    // Remove all host-side listeners so a failed/restarting runtime doesn't
    // leak handlers across spawn cycles (EventEmitter doesn't auto-clean).
    runtime.removeAllListeners()
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

/**
 * Ext Agent bridge path: same Pi runtime as Pi Chat, but tool approvals are
 * auto-denied for the duration of the ask (see extAgentAskDepth).
 */
export async function askPiForExtAgentViaRuntime(
  state: PiRuntimeStateMutable,
  deps: PiRuntimeDeps,
  prompt: string,
): Promise<string> {
  state.extAgentAskDepth += 1
  try {
    const result = await askPiViaRuntime(state, deps, prompt)
    return result.text
  } finally {
    state.extAgentAskDepth = Math.max(0, state.extAgentAskDepth - 1)
  }
}

// ---------------------------------------------------------------------------
// Phase 49D — tool-call approval (confirm-dialog flow)
// ---------------------------------------------------------------------------
// (InFlightProposal type + per-state Maps declared alongside PiRuntimeStateMutable above.)

/**
 * Record a proposal as in-flight + arm its timeout. Called from the
 * ui_request subscription in startPiInner.
 *
 * The timeout fires pi.tool.denied (reason: user did not respond) and sends
 * confirmed:false to Pi — this mirrors Pi's own auto-skip behavior, but
 * makes the audit trail complete (Issue #9 from Slice 49D review).
 */
export function trackInFlightProposal(
  state: PiRuntimeStateMutable,
  deps: PiRuntimeDeps,
  uiRequestId: string,
  title: string,
  message: string,
  timeoutMs: number,
): void {
  state.inFlightProposals.set(uiRequestId, { title, message, receivedAt: Date.now() })
  // Cap memory: drop entries older than 5 minutes (well past any sane timeout).
  if (state.inFlightProposals.size > 50) {
    const cutoff = Date.now() - 5 * 60 * 1000
    for (const [id, p] of state.inFlightProposals) {
      if (p.receivedAt < cutoff) {
        clearProposalTimeout(state, id)
        state.inFlightProposals.delete(id)
      }
    }
  }
  // Arm the timeout. Add a small grace (500ms) so a last-millisecond user
  // click has time to land before we auto-deny.
  const timer = setTimeout(() => {
    if (!state.inFlightProposals.has(uiRequestId)) return // already responded
    const entry = state.inFlightProposals.get(uiRequestId)
    state.inFlightProposals.delete(uiRequestId)
    state.proposalTimeouts.delete(uiRequestId)
    if (entry) {
      void auditPiTool(deps.taskStore, "pi.tool.denied", {
        uiRequestId,
        title: entry.title,
        message: entry.message,
      })
      deps.log?.("warn", `tool request ${uiRequestId} auto-denied (user did not respond in ${timeoutMs}ms)`)
    }
    // Pi auto-resolves on its own timeout; sending confirmed:false is a
    // belt-and-suspenders no-op if Pi already moved on.
    const runtime = state.runtime
    if (runtime?.isReady) {
      void runtime.respondToUiRequest(uiRequestId, false).catch(() => {})
    }
  }, timeoutMs + 500)
  state.proposalTimeouts.set(uiRequestId, timer)
}

/** Clear a proposal's timeout timer (helper). */
function clearProposalTimeout(state: PiRuntimeStateMutable, uiRequestId: string): void {
  const timer = state.proposalTimeouts.get(uiRequestId)
  if (timer) {
    clearTimeout(timer)
    state.proposalTimeouts.delete(uiRequestId)
  }
}

/**
 * Forget a proposal + cancel its timeout. Returns the entry for audit use.
 */
export function untrackInFlightProposal(
  state: PiRuntimeStateMutable,
  uiRequestId: string,
): InFlightProposal | undefined {
  clearProposalTimeout(state, uiRequestId)
  const entry = state.inFlightProposals.get(uiRequestId)
  if (entry) state.inFlightProposals.delete(uiRequestId)
  return entry
}

/**
 * Deliver the user's confirm/deny decision to Pi. Emits the matching
 * pi.tool.executed / pi.tool.denied / pi.tool.failed audit event.
 *
 * Returns { delivered: true } on success; { delivered: false } if the
 * runtime isn't running (Pi already auto-resolved on timeout).
 */
export async function respondToUiRequestViaRuntime(
  state: PiRuntimeStateMutable,
  deps: PiRuntimeDeps,
  uiRequestId: string,
  confirmed: boolean,
): Promise<{ delivered: boolean }> {
  const runtime = state.runtime
  const entry = untrackInFlightProposal(state, uiRequestId)
  if (!runtime || !runtime.isReady) {
    // Pi already moved on (timeout). Record the late decision for audit.
    if (entry) {
      void auditPiTool(deps.taskStore, "pi.tool.failed", {
        uiRequestId,
        title: entry.title,
        message: entry.message,
        error: "runtime not ready (Pi timed out before user responded)",
      })
    }
    return { delivered: false }
  }
  try {
    await runtime.respondToUiRequest(uiRequestId, confirmed)
    if (entry) {
      void auditPiTool(
        deps.taskStore,
        confirmed ? "pi.tool.executed" : "pi.tool.denied",
        { uiRequestId, title: entry.title, message: entry.message },
      )
    }
    return { delivered: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (entry) {
      void auditPiTool(deps.taskStore, "pi.tool.failed", {
        uiRequestId,
        title: entry.title,
        message: entry.message,
        error: msg,
      })
    }
    return { delivered: false }
  }
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
