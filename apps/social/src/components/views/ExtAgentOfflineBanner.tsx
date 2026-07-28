/**
 * Banner shown in Ext Agent chat when the selected non-built-in agent
 * (HomeClaw / Hermes / OpenHuman) is not reachable. Switching stays instant;
 * this is the soft guide after switch / when opening the thread.
 */
import { useCallback, useEffect, useState } from "react"
import type { ExtAgentReachability } from "@envoymesh/api"
import { useT } from "../../context/I18nContext.js"
import { useNodeState } from "../../context/NodeStateContext.js"
import { useNodeService } from "../../hooks/useNodeService.js"

const POLL_MS = 5_000

function hintForAgent(
  t: (key: string, fallback?: string) => string,
  agentId: string,
  fallback: string,
): string {
  switch (agentId) {
    case "homeclaw":
      return t(
        "chat.extAgentOfflineHintHomeClaw",
        "Start HomeClaw, then confirm http://127.0.0.1:8010/status responds.",
      )
    case "hermes":
      return t(
        "chat.extAgentOfflineHintHermes",
        "Run `hermes gateway run` with API_SERVER_ENABLED=true (API on :8642).",
      )
    case "openhuman":
      return t(
        "chat.extAgentOfflineHintOpenHuman",
        "Start OpenHuman.app or the OpenHuman CLI core (health on :7788).",
      )
    default:
      return fallback
  }
}

export function ExtAgentOfflineBanner() {
  const t = useT()
  const nodeService = useNodeService()
  const { bridgeStatus } = useNodeState()
  const [status, setStatus] = useState<ExtAgentReachability | null>(null)
  const [checking, setChecking] = useState(false)

  const activeId = bridgeStatus?.activeExtAgentId ?? "pi"
  const bridgeEnabled = bridgeStatus?.enabled === true

  const refresh = useCallback(async () => {
    if (!bridgeEnabled) {
      setStatus(null)
      return
    }
    setChecking(true)
    try {
      const next = await nodeService.probeExtAgent({ agentId: activeId })
      setStatus(next)
    } catch {
      // keep last-known
    } finally {
      setChecking(false)
    }
  }, [nodeService, bridgeEnabled, activeId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!status || status.builtIn || status.reachable) return
    const id = window.setInterval(() => {
      void refresh()
    }, POLL_MS)
    return () => window.clearInterval(id)
  }, [status, refresh])

  if (!bridgeEnabled || !status || status.builtIn || status.reachable) {
    return null
  }

  const title = t("chat.extAgentOfflineTitle", "{name} is not running").replace(
    "{name}",
    status.agentName || activeId,
  )
  const desc = hintForAgent(t, status.agentId, status.hint)

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
          <div className="ext-agent-offline-banner-desc">{desc}</div>
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
