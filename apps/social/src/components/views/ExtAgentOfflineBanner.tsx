/**
 * Banner shown in Ext Agent chat when the selected agent is not reachable.
 *
 * Phase 55D.1 — when the probe surfaces an install state of
 * `not-installed` / `unsupported` / `unknown`, the banner renders the
 * shared `ExtAgentInstallGuideCard` (same component the chat switcher
 * and the Settings panel use). Built-in Pi / HomeClaw / Hermes /
 * OpenHuman that are installed but offline get the existing simple
 * one-line hint + Recheck button.
 */
import { useCallback, useEffect, useRef, useState } from "react"
import {
  getExtAgentInstallGuide,
  type ExtAgentReachability,
  type InstallState,
} from "@envoymesh/api"
import { useT } from "../../context/I18nContext.js"
import { useNodeState } from "../../context/NodeStateContext.js"
import { useNodeService } from "../../hooks/useNodeService.js"
import { ExtAgentInstallGuideCard } from "../ExtAgentInstallGuideCard.js"

const POLL_MS = 5_000

/**
 * Install states that should pull up the full install card instead
 * of the simple "is not running" hint. "installed" is omitted — the
 * agent is on disk; we fall through to the offline hint.
 */
function isInstallMissing(state: InstallState | undefined): boolean {
  return state === "not-installed" || state === "unsupported" || state === "unknown"
}

export function ExtAgentOfflineBanner() {
  const t = useT()
  const nodeService = useNodeService()
  const { bridgeStatus } = useNodeState()
  const [status, setStatus] = useState<ExtAgentReachability | null>(null)
  const [checking, setChecking] = useState(false)

  const activeId = bridgeStatus?.activeExtAgentId ?? "pi"
  const bridgeEnabled = bridgeStatus?.enabled === true

  /**
   * Keep a stable ref to the current `nodeService` + inputs so the
   * refresh callback's identity doesn't change on every render (the
   * mock layer returns a fresh `nodeService` object each call). If
   * we let `refresh` change every render, the useEffect that runs
   * it on mount fires repeatedly, hammering the probe.
   */
  const probeRef = useRef(nodeService.probeExtAgent)
  probeRef.current = nodeService.probeExtAgent
  const activeIdRef = useRef(activeId)
  activeIdRef.current = activeId
  const bridgeEnabledRef = useRef(bridgeEnabled)
  bridgeEnabledRef.current = bridgeEnabled

  const refresh = useCallback(async () => {
    if (!bridgeEnabledRef.current) {
      setStatus(null)
      return
    }
    setChecking(true)
    try {
      const next = await probeRef.current({ agentId: activeIdRef.current })
      setStatus(next)
    } catch {
      // keep last-known
    } finally {
      setChecking(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    // refresh is stable (empty deps) — it reads current inputs via refs.
    // We re-run when the active agent changes (mount + agent switch).
  }, [refresh, activeId])

  useEffect(() => {
    if (!status || status.reachable) return
    const id = window.setInterval(() => {
      void refresh()
    }, POLL_MS)
    return () => window.clearInterval(id)
  }, [status, refresh])

  if (!bridgeEnabled || !status || status.reachable) {
    return null
  }

  // Install-missing path: render the shared install card. The
  // banner keeps polling (5s) so the card disappears once the
  // agent is installed and reachable.
  if (isInstallMissing(status.installState)) {
    const guide = getExtAgentInstallGuide(status.agentId, status.installState)
    if (guide) {
      return (
        <div
          className="ext-agent-offline-banner ext-agent-offline-banner--install"
          data-testid="ext-agent-offline-banner"
        >
          <ExtAgentInstallGuideCard
            agentId={status.agentId}
            installGuide={guide}
            installState={status.installState}
            onRetry={() => void refresh()}
            testId="ext-agent-offline-banner-card"
          />
        </div>
      )
    }
    // No guide available (e.g. unknown agent id) — fall through to
    // the simple hint.
  }

  // Installed-but-offline path: simple banner with the operator hint
  // and a Recheck button.
  const title = t("chat.extAgentOfflineTitle", "{name} is not running").replace(
    "{name}",
    status.agentName || activeId,
  )

  return (
    <div
      className="ext-agent-offline-banner"
      role="status"
      aria-live="polite"
      data-testid="ext-agent-offline-banner"
    >
      <div className="ext-agent-offline-banner-body">
        <div className="ext-agent-offline-banner-text">
          <div className="ext-agent-offline-banner-title">{title}</div>
          <div className="ext-agent-offline-banner-desc">{status.hint}</div>
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          data-testid="ext-agent-offline-recheck"
          disabled={checking}
          onClick={() => void refresh()}
        >
          {checking
            ? t("chat.extAgentOfflineChecking", "Checking…")
            : t("chat.extAgentOfflineRecheck", "Check again")}
        </button>
      </div>
    </div>
  )
}
