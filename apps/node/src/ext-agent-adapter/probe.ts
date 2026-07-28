/**
 * Soft reachability probe for Ext Agents (HomeClaw / Hermes / OpenHuman / Pi).
 * Used after switch and when opening Ext Agent chat — never blocks switching.
 */

import {
  defaultExtAgentStartHint,
  type ExtAgentReachability,
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

export async function probeExtAgentReachability(params: {
  agentId: string
  agentName: string
  agentUrl: string
}): Promise<ExtAgentReachability> {
  const agentId = params.agentId.trim() || "pi"
  const agentName = params.agentName.trim() || agentId
  const checkedAt = new Date().toISOString()
  const hint = defaultExtAgentStartHint(agentId)

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
    }
  }

  if (agentId === "homeclaw") {
    const statusUrl =
      extAgentStatusUrlFromMessageUrl(params.agentUrl) ??
      "http://127.0.0.1:8010/status"
    const reachable = await probeHttpOk(statusUrl)
    return { agentId, agentName, builtIn: false, reachable, hint, checkedAt }
  }

  if (isExtAgentSidecarKind(agentId)) {
    const reachable = Boolean(await createBackend(agentId).probe?.())
    return { agentId, agentName, builtIn: false, reachable, hint, checkedAt }
  }

  // Custom / unknown agent — try /status derived from agentUrl.
  const statusUrl = extAgentStatusUrlFromMessageUrl(params.agentUrl)
  const reachable = statusUrl ? await probeHttpOk(statusUrl) : false
  return { agentId, agentName, builtIn: false, reachable, hint, checkedAt }
}
