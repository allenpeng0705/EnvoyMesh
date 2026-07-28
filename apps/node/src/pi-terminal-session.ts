/**
 * Phase 49 (in-flight) — Pi interactive TUI terminal session.
 *
 * STUB IMPLEMENTATION — the full feature (spawn `pi` inside a terminal PTY
 * pointed at a project folder) is half-designed. This file exists to unblock
 * the build: the in-flight Pi-as-Ext-Agent work references `ensurePiTerminalSession`
 * from node-service-impl.ts, but the implementation was never completed.
 *
 * Returns a "not yet implemented" failure code so callers (the
 * `ensurePiTerminalSession` JSON-RPC method + the TerminalSidebar "Open Pi"
 * button) get a clean, translatable error instead of a crash.
 *
 * To complete: spawn `pi` (from discoverPiCli) inside a TerminalManager
 * session with `cwd = projectPath`, surface the TUI over the existing
 * terminal WS protocol, and persist the project to piSettings.allowedPaths.
 */

import type {
  EnsurePiTerminalParams,
  EnsurePiTerminalResult,
} from "@envoymesh/api"

/** Minimal deps shape — matches what node-service-impl.ts passes today. */
export interface PiTerminalSessionDeps {
  loadConfig: () => Promise<{
    piEnabled?: boolean
    piSettings?: { allowedPaths?: string[] }
    modelProviders?: { mode?: string }
  } | null>
  saveProjectPath: (absolutePath: string) => Promise<void>
}

/**
 * Ensure a Pi interactive TUI is running for the given project folder.
 *
 * Currently returns `ok: false, code: "spawn_failed"` for every call — the
 * implementation is a stub. Replace the body with the real spawn logic when
 * the Pi-terminal feature is prioritized.
 */
export async function ensurePiTerminalSession(
  _manager: unknown,
  _deps: PiTerminalSessionDeps,
  _params: EnsurePiTerminalParams,
): Promise<EnsurePiTerminalResult> {
  return {
    ok: false,
    code: "spawn_failed",
    reason:
      "Pi interactive terminal is not yet implemented. Use the Pi chat panel for coding tasks (Phase 49C).",
  }
}
