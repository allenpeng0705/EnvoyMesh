/**
 * Ext Agent switcher — switch-icon + agent-name button that opens a modal
 * to pick among all presets (Pi, HomeClaw, Hermes, OpenHuman, codex, …).
 * Switches via `activeExtAgentId` only (existing URLs; no Settings form).
 *
 * Phase 55D.1 — tri-state UX after a switch:
 *   1. `installState === "not-installed"` | `"unsupported"` | `"unknown"`
 *      → install modal opens (shared `ExtAgentInstallGuideCard` wrapped
 *      in a `ModalPortal`). User can copy the install command, open
 *      docs, or hit Retry to re-probe.
 *   2. `reachable === false` & `installState === "installed"`
 *      → small 3-second toast near the button with start hint + Retry.
 *      Catches "CLI is installed but the daemon is down" cases.
 *   3. `reachable === true` → silent (the existing button label is the
 *      only signal).
 *
 * The toast is dismissable; the modal is dismissable but stays open
 * across retries (it auto-closes once the agent is reachable).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  getExtAgentInstallGuide,
  mergeExtAgentPresets,
  type ExtAgentReachability,
  type InstallState,
} from "@envoymesh/api"
import { useT } from "../context/I18nContext.js"
import { useNodeState } from "../context/NodeStateContext.js"
import { useNodeService } from "../hooks/useNodeService.js"
import { SwapIcon } from "../icons.js"
import { ModalPortal } from "./ModalPortal.js"
import { ExtAgentSwitcherInstallDialog } from "./ExtAgentSwitcherInstallDialog.js"

/** Auto-dismiss the "installed but not running" toast after this many ms. */
const TOAST_TTL_MS = 3_000

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

type DialogState =
  | { kind: "closed" }
  | {
      kind: "install"
      agentId: string
      agentName: string
      installState: InstallState
    }
  | { kind: "offline-toast"; agentId: string; agentName: string; hint: string }

export function ExtAgentSwitcher({
  className,
  stopRowClick = false,
  iconOnly = false,
}: ExtAgentSwitcherProps) {
  const t = useT()
  const nodeService = useNodeService()
  const { bridgeStatus } = useNodeState()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Optimistic id until bridge:status catches up. */
  const [pendingId, setPendingId] = useState<string | null>(null)
  /** Tri-state UX surface. */
  const [dialog, setDialog] = useState<DialogState>({ kind: "closed" })
  const toastTimer = useRef<number | null>(null)

  const activeId = bridgeStatus?.activeExtAgentId ?? "pi"
  const displayId = pendingId ?? activeId

  useEffect(() => {
    if (pendingId && bridgeStatus?.activeExtAgentId === pendingId) {
      setPendingId(null)
    }
  }, [bridgeStatus?.activeExtAgentId, pendingId])

  // ESC closes the picker.
  useEffect(() => {
    if (!pickerOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPickerOpen(false)
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [pickerOpen])

  // Cleanup the toast timer on unmount.
  useEffect(() => {
    return () => {
      if (toastTimer.current != null) {
        window.clearTimeout(toastTimer.current)
        toastTimer.current = null
      }
    }
  }, [])

  const agents = useMemo(
    () => mergeExtAgentPresets(bridgeStatus?.extAgents),
    [bridgeStatus?.extAgents],
  )

  const current = agents.find((a) => a.id === displayId) ?? agents[0]
  const currentName = current?.name ?? displayId

  /**
   * After a switch, surface the right UX based on the probe result.
   * Built-in Pi is always "installed" and usually reachable, so it
   * lands in the silent branch.
   */
  const showReachability = useCallback((reach: ExtAgentReachability) => {
    if (
      reach.installState === "not-installed" ||
      reach.installState === "unsupported" ||
      reach.installState === "unknown"
    ) {
      setDialog({
        kind: "install",
        agentId: reach.agentId,
        agentName: reach.agentName,
        installState: reach.installState,
      })
      return
    }
    if (!reach.reachable) {
      const hint = reach.hint || t(
        "chat.extAgentOfflineSwitcherHint",
        "{name} is not running — start it before chatting.",
      ).replace("{name}", reach.agentName)
      // Toast — auto-dismiss after TOAST_TTL_MS.
      if (toastTimer.current != null) {
        window.clearTimeout(toastTimer.current)
      }
      setDialog({
        kind: "offline-toast",
        agentId: reach.agentId,
        agentName: reach.agentName,
        hint,
      })
      toastTimer.current = window.setTimeout(() => {
        setDialog((cur) => (cur.kind === "offline-toast" ? { kind: "closed" } : cur))
        toastTimer.current = null
      }, TOAST_TTL_MS)
      return
    }
    // Healthy — clear any prior toast.
    if (toastTimer.current != null) {
      window.clearTimeout(toastTimer.current)
      toastTimer.current = null
    }
    setDialog({ kind: "closed" })
  }, [t])

  /**
   * Re-probe helper. Used by the install dialog's "Retry" button and
   * the offline toast's "Retry" button. If the agent is now reachable,
   * the dialog auto-closes; if still not installed, the install
   * dialog stays open with the new probe result.
   */
  const reProbe = useCallback(
    async (agentId: string) => {
      try {
        const reach = await nodeService.probeExtAgent({ agentId })
        showReachability(reach)
        return reach
      } catch {
        // Probe failed entirely — keep the dialog open. User can
        // hit Retry again, or Dismiss.
        return null
      }
    },
    [nodeService, showReachability],
  )

  const onSelect = useCallback(
    async (nextId: string) => {
      if (!nextId || nextId === displayId || busy) return
      setBusy(true)
      setError(null)
      // Clear any prior toast immediately so the new probe result
      // can drive the new dialog state cleanly.
      if (toastTimer.current != null) {
        window.clearTimeout(toastTimer.current)
        toastTimer.current = null
      }
      setDialog({ kind: "closed" })
      setPendingId(nextId)
      setPickerOpen(false)
      try {
        await nodeService.updateNodeConfig({ activeExtAgentId: nextId })
        const status = await nodeService.getBridgeStatus()
        if (status?.activeExtAgentId === nextId) {
          setPendingId(null)
        }
        // Soft-check — never blocks the switch. Drives the
        // install-dialog / offline-toast UX.
        try {
          const reach = await nodeService.probeExtAgent({ agentId: nextId })
          showReachability(reach)
        } catch {
          // Probe failure is non-fatal — leave dialog closed; the
          // offline banner will surface the hint.
        }
      } catch (e) {
        setPendingId(null)
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setBusy(false)
      }
    },
    [displayId, busy, nodeService, showReachability],
  )

  if (!bridgeStatus?.enabled || agents.length < 2) return null

  const stop = stopRowClick
    ? (e: React.SyntheticEvent) => {
        e.stopPropagation()
      }
    : undefined

  // Compose the install dialog content lazily (only when needed).
  const installDialog = (() => {
    if (dialog.kind !== "install") return null
    const guide = getExtAgentInstallGuide(dialog.agentId, dialog.installState)
    if (!guide) return null
    return (
      <ExtAgentSwitcherInstallDialog
        agentId={dialog.agentId}
        agentName={dialog.agentName}
        installGuide={guide}
        installState={dialog.installState}
        onRetry={() => void reProbe(dialog.agentId)}
        onClose={() => setDialog({ kind: "closed" })}
      />
    )
  })()

  return (
    <div
      className={`ext-agent-switcher${iconOnly ? " ext-agent-switcher--icon-only" : ""}${className ? ` ${className}` : ""}${dialog.kind === "offline-toast" ? " ext-agent-switcher--toast" : ""}`}
      data-testid="ext-agent-switcher"
      onClick={stop}
      onMouseDown={stop}
    >
      <button
        type="button"
        className={`ext-agent-switcher-btn${iconOnly ? " ext-agent-switcher-btn--icon-only" : ""}${pickerOpen ? " ext-agent-switcher-btn--open" : ""}${dialog.kind === "install" ? " ext-agent-switcher-btn--install" : ""}`}
        disabled={busy}
        aria-haspopup="dialog"
        aria-expanded={pickerOpen || dialog.kind === "install"}
        aria-label={t("chat.extAgentSwitchTitle", "Switch Ext Agent")}
        title={t("chat.extAgentSwitchTitle", "Switch Ext Agent")}
        data-testid="ext-agent-switcher-btn"
        onClick={() => setPickerOpen(true)}
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

      {dialog.kind === "offline-toast" ? (
        <div
          className="ext-agent-switcher-toast"
          role="status"
          aria-live="polite"
          data-testid="ext-agent-switcher-toast"
        >
          <span className="ext-agent-switcher-toast-text">{dialog.hint}</span>
          <button
            type="button"
            className="ext-agent-switcher-toast-retry"
            data-testid="ext-agent-switcher-toast-retry"
            onClick={() => void reProbe(dialog.agentId)}
          >
            {t("chat.extAgentOfflineToastRetry", "Retry")}
          </button>
        </div>
      ) : null}

      {installDialog}

      {pickerOpen ? (
        <ModalPortal>
          <div
            className="modal-overlay"
            role="presentation"
            data-testid="ext-agent-switcher-menu"
            onClick={(e) => {
              if (e.target === e.currentTarget) setPickerOpen(false)
            }}
          >
            <div
              className="modal-panel ext-agent-switcher-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="ext-agent-switcher-title"
              onClick={(e) => e.stopPropagation()}
            >
              <h2
                id="ext-agent-switcher-title"
                className="ext-agent-switcher-modal-title"
              >
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
                <button type="button" className="secondary" onClick={() => setPickerOpen(false)}>
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
