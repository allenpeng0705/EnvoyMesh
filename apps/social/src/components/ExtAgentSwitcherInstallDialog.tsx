/**
 * Ext Agent switcher install dialog (Phase 55D.1).
 *
 * Modal that opens automatically when the user picks an Ext Agent
 * whose binary is not installed (or whose install state is unknown).
 * Shows the shared `ExtAgentInstallGuideCard` plus a brief explanation
 * of why the dialog opened. The user can:
 *
 *   - Copy the install command to clipboard
 *   - Open the install docs in a new tab
 *   - Hit "Retry" to re-probe (the dialog stays open if the agent
 *     is still not installed; closes on success)
 *   - Hit "Dismiss" to close without retrying — the switch already
 *     went through, so the offline banner takes over
 *
 * Used by `ExtAgentSwitcher`. Not used directly by the offline banner
 * or Settings panel (those render the card without a modal).
 */

import { useEffect } from "react"
import type { ExtAgentInstallGuide, InstallState } from "@envoymesh/api"
import { useT } from "../context/I18nContext.js"
import { ModalPortal } from "./ModalPortal.js"
import { ExtAgentInstallGuideCard } from "./ExtAgentInstallGuideCard.js"

export interface ExtAgentSwitcherInstallDialogProps {
  /** Display name for the agent (e.g. "Codex", "Claude Code"). */
  agentName: string
  agentId: string
  installGuide: ExtAgentInstallGuide
  installState: InstallState
  /** Re-probe handler. Re-runs `probeExtAgent({ agentId })`. */
  onRetry: () => void
  /** Close handler. Called on Dismiss button + ESC + overlay click. */
  onClose: () => void
  /**
   * If true, the agent is now installed and the dialog should close
   * automatically (parent passes the new reachability here). The
   * parent owns the re-probe loop; we just listen for the transition.
   */
  resolved?: boolean
}

export function ExtAgentSwitcherInstallDialog({
  agentName,
  agentId,
  installGuide,
  installState,
  onRetry,
  onClose,
  resolved,
}: ExtAgentSwitcherInstallDialogProps) {
  const t = useT()

  // Auto-close when the parent reports the agent is now installed.
  useEffect(() => {
    if (resolved) onClose()
  }, [resolved, onClose])

  // ESC dismisses the dialog.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onClose])

  const title = t(
    "chat.extAgentInstallDialogTitle",
    "Install {name} to continue",
  ).replace("{name}", agentName)

  return (
    <ModalPortal>
      <div
        className="modal-overlay"
        role="presentation"
        data-testid="ext-agent-install-dialog"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose()
        }}
      >
        <div
          className="modal-panel ext-agent-install-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ext-agent-install-dialog-title"
          onClick={(e) => e.stopPropagation()}
        >
          <h2
            id="ext-agent-install-dialog-title"
            className="ext-agent-install-dialog-title"
          >
            {title}
          </h2>
          <ExtAgentInstallGuideCard
            agentId={agentId}
            installGuide={installGuide}
            installState={installState}
            onRetry={onRetry}
            onDismiss={onClose}
            testId="ext-agent-install-dialog-card"
          />
        </div>
      </div>
    </ModalPortal>
  )
}
