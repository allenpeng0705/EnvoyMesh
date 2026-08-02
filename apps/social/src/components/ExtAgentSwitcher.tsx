/**
 * Ext Agent switcher — switch-icon + agent-name button that opens a modal
 * to pick among all presets (Pi, HomeClaw, Hermes, OpenHuman, …).
 * Switches via `activeExtAgentId` only (existing URLs; no Settings form).
 * Soft-probes after switch; does not block. Chat banner shows start guides.
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import { mergeExtAgentPresets } from "@envoymesh/api"
import { useT } from "../context/I18nContext.js"
import { useNodeState } from "../context/NodeStateContext.js"
import { useNodeService } from "../hooks/useNodeService.js"
import { SwapIcon } from "../icons.js"
import { ModalPortal } from "./ModalPortal.js"

export interface ExtAgentSwitcherProps {
  /** Optional className on the wrapper. */
  className?: string
  /**
   * When true, stop click/mousedown so a parent thread-row does not
   * also fire onSelectContact.
   */
  stopRowClick?: boolean
  /**
   * Icon-only trigger (sidebar). Agent name lives in the row subtitle so
   * layout matches AI / Pi rows.
   */
  iconOnly?: boolean
}

export function ExtAgentSwitcher({
  className,
  stopRowClick = false,
  iconOnly = false,
}: ExtAgentSwitcherProps) {
  const t = useT()
  const nodeService = useNodeService()
  const { bridgeStatus } = useNodeState()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Soft post-switch hint when the selected agent is not reachable. */
  const [offlineHint, setOfflineHint] = useState<string | null>(null)
  /** Optimistic id until bridge:status catches up. */
  const [pendingId, setPendingId] = useState<string | null>(null)

  const activeId = bridgeStatus?.activeExtAgentId ?? "pi"
  const displayId = pendingId ?? activeId

  useEffect(() => {
    if (pendingId && bridgeStatus?.activeExtAgentId === pendingId) {
      setPendingId(null)
    }
  }, [bridgeStatus?.activeExtAgentId, pendingId])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [open])

  const agents = useMemo(
    () => mergeExtAgentPresets(bridgeStatus?.extAgents),
    [bridgeStatus?.extAgents],
  )

  const current = agents.find((a) => a.id === displayId) ?? agents[0]
  const currentName = current?.name ?? displayId

  const onSelect = useCallback(
    async (nextId: string) => {
      if (!nextId || nextId === displayId || busy) return
      setBusy(true)
      setError(null)
      setOfflineHint(null)
      setPendingId(nextId)
      setOpen(false)
      try {
        await nodeService.updateNodeConfig({ activeExtAgentId: nextId })
        const status = await nodeService.getBridgeStatus()
        if (status?.activeExtAgentId === nextId) {
          setPendingId(null)
        }
        // Soft-check — never blocks the switch.
        try {
          const reach = await nodeService.probeExtAgent({ agentId: nextId })
          if (!reach.reachable) {
            setOfflineHint(
              t(
                "chat.extAgentOfflineSwitcherHint",
                "{name} is not running — start it before chatting.",
              ).replace("{name}", reach.agentName || nextId),
            )
          } else {
            setOfflineHint(null)
          }
        } catch {
          // ignore probe failures; chat banner will retry
        }
      } catch (e) {
        setPendingId(null)
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setBusy(false)
      }
    },
    [displayId, busy, nodeService, t],
  )

  if (!bridgeStatus?.enabled || agents.length < 2) return null

  const stop = stopRowClick
    ? (e: React.SyntheticEvent) => {
        e.stopPropagation()
      }
    : undefined

  const btnTitle =
    offlineHint ??
    (iconOnly
      ? `${t("chat.extAgentSwitchTitle", "Switch Ext Agent")}: ${currentName}`
      : t("chat.extAgentSwitchTitle", "Switch Ext Agent"))

  return (
    <div
      className={`ext-agent-switcher${iconOnly ? " ext-agent-switcher--icon-only" : ""}${className ? ` ${className}` : ""}`}
      data-testid="ext-agent-switcher"
      onClick={stop}
      onMouseDown={stop}
    >
      <button
        type="button"
        className={`ext-agent-switcher-btn${iconOnly ? " ext-agent-switcher-btn--icon-only" : ""}${open ? " ext-agent-switcher-btn--open" : ""}${offlineHint ? " ext-agent-switcher-btn--offline" : ""}`}
        disabled={busy}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={t("chat.extAgentSwitchTitle", "Switch Ext Agent")}
        title={btnTitle}
        data-testid="ext-agent-switcher-btn"
        onClick={() => setOpen(true)}
      >
        <SwapIcon size={iconOnly ? 16 : 14} className="ext-agent-switcher-btn-icon" />
        {iconOnly ? null : (
          <span className="ext-agent-switcher-btn-name">{currentName}</span>
        )}
      </button>

      {error ? (
        <span className="ext-agent-switcher-error" role="status">
          {error}
        </span>
      ) : null}

      {open ? (
        <ModalPortal>
          <div
            className="modal-overlay"
            role="presentation"
            data-testid="ext-agent-switcher-menu"
            onClick={(e) => {
              if (e.target === e.currentTarget) setOpen(false)
            }}
          >
            <div
              className="modal-panel ext-agent-switcher-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="ext-agent-switcher-title"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 id="ext-agent-switcher-title" className="ext-agent-switcher-modal-title">
                {t("chat.extAgentSwitchTitle", "Switch Ext Agent")}
              </h2>
              <div
                className="ext-agent-switcher-modal-list"
                role="listbox"
                aria-labelledby="ext-agent-switcher-title"
              >
                {agents.map((a) => {
                  const selected = a.id === displayId
                  return (
                    <button
                      key={a.id}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      className={`ext-agent-switcher-option${selected ? " ext-agent-switcher-option--active" : ""}`}
                      disabled={busy}
                      data-testid={`ext-agent-option-${a.id}`}
                      onClick={() => void onSelect(a.id)}
                    >
                      <span className="ext-agent-switcher-option-name">{a.name}</span>
                      {selected ? (
                        <span className="ext-agent-switcher-option-check" aria-hidden>
                          ✓
                        </span>
                      ) : null}
                    </button>
                  )
                })}
              </div>
              <div className="modal-actions">
                <button type="button" className="secondary" onClick={() => setOpen(false)}>
                  {t("common.cancel", "Cancel")}
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      ) : null}
    </div>
  )
}
