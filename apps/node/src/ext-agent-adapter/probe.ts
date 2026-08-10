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
 * Per-agent binary lookup table for install detection. The key is the
 * Ext Agent id (`codex` / `claudecode` / `hermes` / `openhuman`); the
 * value is the binary name the user would type on the command line.
 * `claudecode`'s binary is `claude` (the package is
 * `@anthropic-ai/claude-code`). HomeClaw and Pi are not in this table
 * because they don't have a CLI we can PATH-check.
 */
const BINARY_FOR_AGENT: Record<string, string> = {
  codex: "codex",
  claudecode: "claude",
  hermes: "hermes",
  openhuman: "openhuman",
};

/**
 * Default implementation: check `$PATH` for `command` via
 * `command -v <bin>` (POSIX) or `where <bin>` (Windows).
 * Returns `null` if the check failed for an unrelated reason
 * (timeout / spawn error / unknown platform) so the caller can
 * surface `installState: "unknown"`.
 */
export function defaultBinaryOnPath(
  command: string,
  timeoutMs = 2_000,
): Promise<boolean | null> {
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
      done(code === 0);
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
    // Phase 55B / 55C: codex and claudecode sidecar backends are not
    // implemented yet (their `createBackend` throws "not yet
    // implemented"). When that happens, fall back to a "not running"
    // reachability — the installState is still authoritative, and
    // the Settings UI will show the right Install Required card.
    let reachable = false;
    try {
      reachable = Boolean(await createBackend(agentId).probe?.());
    } catch {
      // Backend not implemented yet — reachable stays false.
      // The `installState` and `installGuide` fields above still
      // reflect whether the binary is on PATH.
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
