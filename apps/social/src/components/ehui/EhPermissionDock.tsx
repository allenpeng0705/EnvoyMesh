/**
 * Tool permission card above the EH composer (Cursor / Codex pattern).
 */

import { useCallback, useEffect, useState } from "react"

import type { EhPermissionEvent } from "@envoymesh/api"
import { useT } from "../../context/I18nContext.js"
import { useNodeService } from "../../hooks/useNodeService.js"

export interface EhPermissionDockProps {
  permission: EhPermissionEvent
  onDismiss?: () => void
  onResponded?: (allowed: boolean) => void
}

export function EhPermissionDock({
  permission,
  onDismiss,
  onResponded,
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
        await nodeService.ehRespondToPermission({
          requestId: permission.requestId,
          allowed,
        })
        onResponded?.(allowed)
      } finally {
        setBusy(false)
      }
    },
    [busy, nodeService, onDismiss, onResponded, permission.requestId],
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
