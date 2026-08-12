/**
 * Soft reachability probe for Ext Agents (HomeClaw / Hermes / OpenHuman / Pi).
 * Used after switch and when opening Ext Agent chat — never blocks switching.
 *
 * Phase 55A.1: also classifies the install state of external agents
 * (codex / claudecode / hermes / openhuman) by checking whether the
 * binary is on `$PATH`. The result is exposed as `installState` and
 * (when not installed) `installGuide` on `ExtAgentReachability` so
 * the Settings UI can show an Install Required card.
 */

import { spawn } from "node:child_process"
import {
  defaultExtAgentStartHint,
  getExtAgentInstallGuide,
  type ExtAgentReachability,
  type InstallState,
} from "@envoymesh/api"
import { createBackend } from "./backends.js"
import { isExtAgentBinaryAvailable, resolveExtAgentBinary } from "./resolve-ext-agent-binary.js"
import { isExtAgentSidecarKind } from "./types.js"

/** Derive `/status` (or `/health`) URL from a `/message` agentUrl. */
export function extAgentStatusUrlFromMessageUrl(agentUrl: string): string | null {
  const raw = agentUrl.trim()
  if (!raw) return null
  try {
    const u = new URL(raw)
    if (u.pathname.endsWith("/message")) {
      u.pathname = `${u.pathname.slice(0, -"/message".length)}/status`
    } else if (u.pathname.endsWith("/")) {
      u.pathname = `${u.pathname}status`
    } else {
      u.pathname = `${u.pathname}/status`
    }
    u.search = ""
    u.hash = ""
    return u.toString()
  } catch {
    return null
  }
}

async function probeHttpOk(url: string, timeoutMs = 2_000): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
    return res.ok || (res.status > 0 && res.status < 500)
  } catch {
    return false
  }
}

/**
 * Probe a running Ext Agent sidecar `/status` and honour
 * `backend_reachable` when present (codex / claudecode / …).
 * Falls back to HTTP 2xx when the field is absent.
 * Returns `null` when the sidecar isn't listening yet.
 * Non-2xx responses (including 4xx) are treated as unreachable.
 */
async function probeSidecarBackendReachable(
  statusUrl: string,
  timeoutMs = 15_000,
): Promise<boolean | null> {
  try {
    const res = await fetch(statusUrl, { signal: AbortSignal.timeout(timeoutMs) })
    if (!res.ok) return false
    try {
      const body = (await res.json()) as { backend_reachable?: unknown }
      if (typeof body.backend_reachable === "boolean") {
        return body.backend_reachable
      }
    } catch {
      // Non-JSON 2xx status — treat as reachable.
    }
    return true
  } catch {
    return null
  }
}

/**
 * Per-agent binary lookup table for install detection. The key is the
 * Ext Agent id (`codex` / `claudecode` / `hermes` / `openhuman` /
 * `cursor` / `aider` / `mmx`); the value is the binary name the user
 * would type on the command line.
 *
 * - `claudecode`'s binary is `claude` (the package is
 *   `@anthropic-ai/claude-code`).
 * - `cursor`'s binary is `cursor-agent` (the official Anysphere CLI
 *   name; `cursor` is a different binary if installed at all).
 *
 * HomeClaw and Pi are not in this table because they don't have a
 * CLI we can PATH-check (Pi is in-process; HomeClaw runs in its own
 * .app and is reached over HTTP).
 */
const BINARY_FOR_AGENT: Record<string, string> = {
  codex: "codex",
  claudecode: "claude",
  hermes: "hermes",
  openhuman: "openhuman",
  // Phase 56A / 56B / 56C — one-shot CLI backends.
  cursor: "cursor-agent",
  aider: "aider",
  mmx: "mmx",
};

/**
 * Default implementation: check `$PATH` for `command` via
 * `command -v <bin>` (POSIX) or `where <bin>` (Windows), then fall
 * back to well-known user bin dirs (`~/.npm-global/bin`, Homebrew, …)
 * so Tauri / GUI-stripped PATH still finds `npm i -g` installs.
 * Returns `null` if the check failed for an unrelated reason
 * (timeout / spawn error / unknown platform) so the caller can
 * surface `installState: "unknown"`.
 */
export function defaultBinaryOnPath(
  command: string,
  timeoutMs = 2_000,
): Promise<boolean | null> {
  // Fast path: absolute / well-known dirs (sync) — covers the common
  // "codex installed but GUI PATH missing ~/.npm-global/bin" case.
  if (isExtAgentBinaryAvailable(command)) {
    return Promise.resolve(true);
  }
  return new Promise<boolean | null>((resolve) => {
    const isWin = process.platform === "win32";
    const checkCmd = isWin ? "where" : "command";
    const checkArgs = isWin ? [command] : ["-v", command];
    let resolved = false;
    const done = (v: boolean | null) => {
      if (resolved) return;
      resolved = true;
      resolve(v);
    };
    const t = setTimeout(() => done(null), timeoutMs);
    t.unref?.();
    let proc;
    try {
      proc = spawn(checkCmd, checkArgs, { stdio: "ignore" });
    } catch {
      clearTimeout(t);
      done(null);
      return;
    }
    proc.on("error", () => {
      clearTimeout(t);
      done(null);
    });
    proc.on("exit", (code) => {
      clearTimeout(t);
      if (code === 0) {
        done(true);
        return;
      }
      // Double-check well-known dirs in case PATH race / shell differences.
      done(resolveExtAgentBinary(command) != null);
    });
  });
}

/**
 * Classify the install state of an Ext Agent. Built-in agents (pi)
 * are always `"installed"`. External agents (codex / claudecode /
 * hermes / openhuman) are checked against `$PATH`. HomeClaw is its
 * own channel — we don't PATH-check it, so we report `"unknown"`
 * (the homeclaw-core-ws status probe still drives `reachable`).
 */
export async function classifyExtAgentInstallState(
  agentId: string,
  binaryOnPath: (command: string) => Promise<boolean | null> = defaultBinaryOnPath,
): Promise<{ installState: InstallState; installGuide?: ExtAgentReachability["installGuide"] }> {
  const id = agentId.trim();
  if (id === "pi") {
    return { installState: "installed" };
  }
  if (id === "homeclaw") {
    // HomeClaw is a separate channel; not a CLI we can PATH-check.
    return { installState: "unknown" };
  }
  const bin = BINARY_FOR_AGENT[id];
  if (!bin) {
    return {
      installState: "unknown",
      installGuide: getExtAgentInstallGuide(id, "unknown"),
    };
  }
  const onPath = await binaryOnPath(bin);
  if (onPath === true) {
    return { installState: "installed" };
  }
  if (onPath === false) {
    return {
      installState: "not-installed",
      installGuide: getExtAgentInstallGuide(id, "not-installed"),
    };
  }
  return {
    installState: "unknown",
    installGuide: getExtAgentInstallGuide(id, "unknown"),
  };
}

export async function probeExtAgentReachability(params: {
  agentId: string
  agentName: string
  agentUrl: string
  /**
   * Override the binary-on-PATH check. Defaults to `defaultBinaryOnPath`.
   * Tests pass a stub to avoid spawning child processes.
   */
  binaryOnPath?: (command: string) => Promise<boolean | null>
}): Promise<ExtAgentReachability> {
  const agentId = params.agentId.trim() || "pi"
  const agentName = params.agentName.trim() || agentId
  const checkedAt = new Date().toISOString()
  const hint = defaultExtAgentStartHint(agentId)
  const binaryOnPath = params.binaryOnPath ?? defaultBinaryOnPath

  const { installState, installGuide } = await classifyExtAgentInstallState(
    agentId,
    binaryOnPath,
  )

  if (agentId === "pi") {
    const up = isExtAgentSidecarKind("pi")
      ? await createBackend("pi").probe?.() ?? true
      : true
    return {
      agentId,
      agentName,
      builtIn: true,
      reachable: Boolean(up),
      hint,
      checkedAt,
      installState,
    }
  }

  if (agentId === "homeclaw") {
    const statusUrl =
      extAgentStatusUrlFromMessageUrl(params.agentUrl) ??
      "http://127.0.0.1:8010/status"
    const reachable = await probeHttpOk(statusUrl)
    return {
      agentId,
      agentName,
      builtIn: false,
      reachable,
      hint,
      checkedAt,
      installState,
      ...(installGuide ? { installGuide } : {}),
    }
  }

  if (isExtAgentSidecarKind(agentId)) {
    // Prefer the already-running sidecar's `/status` so we don't spawn a
    // second `codex app-server` (createBackend() would). Fall back to a
    // throwaway backend probe when the sidecar isn't up yet.
    let reachable = false;
    const statusUrl = extAgentStatusUrlFromMessageUrl(params.agentUrl);
    if (statusUrl) {
      const fromSidecar = await probeSidecarBackendReachable(statusUrl);
      if (fromSidecar !== null) {
        reachable = fromSidecar;
      } else {
        try {
          reachable = Boolean(await createBackend(agentId).probe?.());
        } catch {
          reachable = false;
        }
      }
    } else {
      try {
        reachable = Boolean(await createBackend(agentId).probe?.());
      } catch {
        // Backend probe threw (e.g. misconfigured) — treat as down.
      }
    }
    return {
      agentId,
      agentName,
      builtIn: false,
      reachable,
      hint,
      checkedAt,
      installState,
      ...(installGuide ? { installGuide } : {}),
    }
  }

  // Custom / unknown agent — try /status derived from agentUrl.
  const statusUrl = extAgentStatusUrlFromMessageUrl(params.agentUrl)
  const reachable = statusUrl ? await probeHttpOk(statusUrl) : false
  return {
    agentId,
    agentName,
    builtIn: false,
    reachable,
    hint,
    checkedAt,
    installState,
    ...(installGuide ? { installGuide } : {}),
  }
}
