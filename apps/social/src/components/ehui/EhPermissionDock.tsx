/**
 * Tool permission card above the composer (Cursor / Codex pattern).
 *
 * One card, two producers: an Envoy Harness turn (`eh:permission`) and a Coding
 * session on a catalog ACP agent (`coding:permission`). The *question* and the two
 * buttons are the same in both, so the only difference is which RPC carries the
 * answer — which is why the answer is a prop rather than a second component.
 */

import { useCallback, useEffect, useState } from "react"

import type { EhPermissionEvent } from "@envoymesh/api"
import { useT } from "../../context/I18nContext.js"
import { useNodeService } from "../../hooks/useNodeService.js"

export interface EhPermissionDockProps {
  permission: EhPermissionEvent
  onDismiss?: () => void
  onResponded?: (allowed: boolean) => void
  /**
   * How this prompt's answer reaches the node.
   *
   * Defaults to the Envoy Harness RPC, so every existing caller is unchanged; the Coding
   * composer passes `codingRespondToPermission` because a Coding prompt's `requestId` lives
   * in the coding bridge, where the EH RPC would report `delivered: false` and the agent
   * would wait out its timeout.
   */
  answer?: (requestId: string, allowed: boolean) => Promise<unknown>
}

export function EhPermissionDock({
  permission,
  onDismiss,
  onResponded,
  answer,
}: EhPermissionDockProps) {
  const t = useT()
  const nodeService = useNodeService()
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const id = window.setTimeout(() => {
      onDismiss?.()
    }, permission.timeoutMs + 500)
    return () => window.clearTimeout(id)
  }, [onDismiss, permission.timeoutMs])

  const respond = useCallback(
    async (allowed: boolean) => {
      if (busy) return
      setBusy(true)
      onDismiss?.()
      try {
        if (answer) {
          await answer(permission.requestId, allowed)
        } else {
          await nodeService.ehRespondToPermission({
            requestId: permission.requestId,
            allowed,
          })
        }
        onResponded?.(allowed)
      } finally {
        setBusy(false)
      }
    },
    [busy, nodeService, answer, onDismiss, onResponded, permission.requestId],
  )

  return (
    <div
      className="eh-permission-dock pi-proposal-dock"
      role="region"
      aria-label={t("eh.permissionTitle", "Tool permission")}
    >
      <div className="eh-permission-header">
        <span className="eh-permission-tool">{permission.toolName}</span>
        <span className="eh-permission-desc">{permission.description}</span>
      </div>
      {permission.preview ? (
        <pre className="eh-permission-preview">{permission.preview}</pre>
      ) : null}
      <div className="eh-permission-actions pi-proposal-actions">
        <button
          type="button"
          className="secondary"
          disabled={busy}
          onClick={() => void respond(false)}
        >
          {t("eh.permissionDeny", "Deny")}
        </button>
        <button type="button" className="primary" disabled={busy} onClick={() => void respond(true)}>
          {t("eh.permissionAllow", "Allow")}
        </button>
      </div>
    </div>
  )
}
