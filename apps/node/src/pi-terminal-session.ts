/**
 * Phase 49E — Pi interactive TUI terminal session.
 *
 * Spawns upstream Pi (default interactive mode — not `--mode rpc`) inside a
 * reserved TerminalManager session (`role: "pi"`) pointed at a project folder.
 * Model/env come from {@link buildPiSpawnConfig} (Settings → AI + optional
 * `piSettings.modelOverride`), same mapping as Ext Agent RPC.
 *
 * Distinct from {@link PiRuntime}: RPC is for Ext Agent chat; this PTY is the
 * primary coding surface (native Pi confirms, filesystem/shell).
 */

import { existsSync, statSync } from "node:fs"
import { createHash } from "node:crypto"
import { tmpdir } from "node:os"
import { basename, join, resolve } from "node:path"
import type {
  EnsurePiTerminalParams,
  EnsurePiTerminalResult,
  ModelProviderConfig,
  PiModelOverride,
  PiSettings,
} from "@envoymesh/api"
import { MAX_PI_TERMINAL_SESSIONS } from "@envoymesh/api"
import type { TerminalManager } from "./terminal-manager.js"
import {
  buildPiSpawnConfig,
  discoverPiCli,
  materializePiSpawnEnv,
  resolvePiNodeRuntime,
} from "./pi-runtime.js"

/** Deps supplied by NodeServiceImpl. */
export interface PiTerminalSessionDeps {
  loadConfig: () => Promise<{
    piEnabled?: boolean
    piSettings?: PiSettings
    modelProviders?: ModelProviderConfig
  } | null>
  /** Persist project path into piSettings.allowedPaths (MRU). */
  saveProjectPath: (absolutePath: string) => Promise<void>
}

/**
 * Resolve and validate a project directory for Pi TUI.
 * Returns an absolute path, or null if missing / not a directory.
 */
export function resolvePiProjectDir(projectPath: string | undefined): string | null {
  const raw = projectPath?.trim()
  if (!raw) return null
  let abs: string
  try {
    abs = resolve(raw)
  } catch {
    return null
  }
  if (!existsSync(abs)) return null
  try {
    if (!statSync(abs).isDirectory()) return null
  } catch {
    return null
  }
  return abs
}

/** Sidebar / session title: `Pi · <folder>`. */
export function piSessionTitle(projectPath: string): string {
  const name = basename(projectPath.replace(/[/\\]+$/, "")) || "project"
  return `Pi · ${name}`
}

/**
 * Ensure a Pi interactive TUI is running for the given project folder.
 *
 * Does not auto-start without `projectPath` — callers (ChatView “Open Pi”)
 * must pick a folder first.
 */
export async function ensurePiTerminalSession(
  manager: TerminalManager,
  deps: PiTerminalSessionDeps,
  params: EnsurePiTerminalParams = {},
): Promise<EnsurePiTerminalResult> {
  const cfg = await deps.loadConfig()
  if (!cfg) {
    return { ok: false, code: "no_config", reason: "Node config is not available." }
  }
  if (cfg.piEnabled === false) {
    return {
      ok: false,
      code: "disabled",
      reason: "Pi is disabled in Settings → AI. Enable it to open the coding TUI.",
    }
  }

  const projectDir = resolvePiProjectDir(params.projectPath)
  if (!params.projectPath?.trim()) {
    return {
      ok: false,
      code: "needs_project",
      reason: "Choose a project folder to open Pi.",
    }
  }
  if (!projectDir) {
    return {
      ok: false,
      code: "invalid_project",
      reason: "Project path is missing or is not a directory.",
    }
  }

  // Reuse a running Pi for this folder unless forceRestart.
  if (!params.forceRestart) {
    const existing = manager.findPiSessionByCwd(projectDir)
    if (existing) {
      return { ok: true, session: existing }
    }
  }

  const discovered = discoverPiCli()
  if (!discovered) {
    return {
      ok: false,
      code: "no_sidecar",
      reason: "Pi sidecar not found — slim build or fetch-pi-sidecar.sh not run.",
    }
  }

  if (!cfg.modelProviders) {
    return {
      ok: false,
      code: "no_model",
      reason: "Configure a model in Settings → AI before opening Pi.",
    }
  }

  const override: PiModelOverride | undefined = cfg.piSettings?.modelOverride
  const spawnConfig = buildPiSpawnConfig(cfg.modelProviders, override)
  if (!spawnConfig) {
    return {
      ok: false,
      code: "no_model",
      reason: override
        ? "Pi custom model is incomplete — fix Settings → AI → Pi, or clear the override."
        : `Model mode "${cfg.modelProviders.mode}" is not usable by Pi — configure a real provider.`,
    }
  }

  // Close first when restarting so the concurrent-session cap accounts for the free slot.
  if (params.forceRestart) {
    const runningBefore = manager.listPiSessions()
    const toClose =
      (params.sessionId
        ? runningBefore.find((s) => s.sessionId === params.sessionId)
        : undefined) ?? manager.findPiSessionByCwd(projectDir)
    if (toClose) {
      await manager.closeTerminalSession({ sessionId: toClose.sessionId })
    }
  }

  const running = manager.listPiSessions()
  const alreadyOnProject = running.some((s) => resolve(s.cwd) === projectDir)
  if (!alreadyOnProject && running.length >= MAX_PI_TERMINAL_SESSIONS) {
    return {
      ok: false,
      code: "pi_limit_reached",
      reason: `At most ${MAX_PI_TERMINAL_SESSIONS} Pi project sessions can run at once. Close one, then retry.`,
    }
  }

  const nodeExe = resolvePiNodeRuntime()
  // Stable per-project agent dir so openaiBaseUrlOverride does not leak mkdtemp dirs.
  const agentDir = join(
    tmpdir(),
    "envoymesh-pi-tui",
    createHash("sha1").update(projectDir).digest("hex").slice(0, 16),
  )
  const spawnEnv = materializePiSpawnEnv(spawnConfig, { agentDir })
  // Interactive TUI: no `--mode rpc` (that path is Ext Agent only).
  const args = [discovered.cliPath, "--provider", spawnConfig.provider, "--model", spawnConfig.model]

  try {
    const session = await manager.createTerminalSession({
      title: piSessionTitle(projectDir),
      cwd: projectDir,
      role: "pi",
      command: nodeExe,
      args,
      env: spawnEnv,
    })
    try {
      await deps.saveProjectPath(projectDir)
    } catch {
      /* best-effort MRU — session already running */
    }
    return { ok: true, session }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return {
      ok: false,
      code: "spawn_failed",
      reason: `Failed to start Pi TUI: ${msg}`,
    }
  }
}
