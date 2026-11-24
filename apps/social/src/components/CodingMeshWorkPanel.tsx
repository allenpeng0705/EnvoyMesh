/**
 * FH-P2-C — pending mesh-lite Coding work tickets (bond chat + local queue).
 */
import { useEffect, useState } from "react"
import type { EhMeshWorkItem } from "@envoymesh/api"
import { useT } from "../context/I18nContext.js"
import { useNodeService } from "../hooks/useNodeService.js"
import { openCoding } from "../lib/open-coding-nav.js"
import { ModalPortal } from "./ModalPortal.js"

export type CodingMeshWorkPanelProps = {
  onClose: () => void
}

function folderName(cwd: string): string {
  return cwd.split(/[/\\]/).pop() || cwd
}

export function CodingMeshWorkPanel({ onClose }: CodingMeshWorkPanelProps) {
  const t = useT()
  const nodeService = useNodeService()
  const [items, setItems] = useState<EhMeshWorkItem[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reload = async () => {
    setLoading(true)
    setError(null)
    try {
      const rows = await nodeService.listEhMeshWorkItems()
      setItems(rows.filter((i) => i.status === "pending" || i.status === "running"))
    } catch {
      setError(
        t(
          "codingView.meshWorkListFailed",
          "Couldn’t load work items. Try again.",
        ),
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once
  }, [])

  const runAction = async (id: string, action: () => Promise<unknown>) => {
    setBusyId(id)
    setError(null)
    try {
      await action()
      await reload()
    } catch {
      setError(
        t("codingView.meshWorkActionFailed", "That didn’t work. Try again."),
      )
    } finally {
      setBusyId(null)
    }
  }

  return (
    <ModalPortal>
      <div
        className="modal-overlay"
        role="presentation"
        data-testid="coding-mesh-work-panel"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget && !busyId) onClose()
        }}
      >
        <section
          className="modal-panel coding-panel coding-heartbeats-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="coding-mesh-work-title"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <header className="modal-header">
            <h2 id="coding-mesh-work-title">
              {t("codingView.meshWorkTitle", "Mesh work")}
            </h2>
            <button
              type="button"
              className="modal-close"
              aria-label={t("common.close", "Close")}
              disabled={Boolean(busyId)}
              onClick={onClose}
            >
              ×
            </button>
          </header>
          <p className="section-desc">
            {t(
              "codingView.meshWorkDesc",
              "Coding requests from bonded chats. Run one to start an Envoy Harness turn on this home node.",
            )}
          </p>
          <div className="coding-panel__body">
            {loading ? (
              <p role="status">{t("codingView.meshWorkLoading", "Loading…")}</p>
            ) : items.length === 0 ? (
              <p className="coding-panel__empty" role="status">
                {t(
                  "codingView.meshWorkEmpty",
                  "No pending work. Send an invite from a task menu or accept one in chat.",
                )}
              </p>
            ) : (
              <ul className="coding-heartbeats-list">
                {items.map((item) => (
                  <li
                    key={item.id}
                    className="coding-heartbeat-row"
                    data-testid={`mesh-work-${item.id}`}
                  >
                    <div className="coding-heartbeat-row__main">
                      <strong>
                        {item.title?.trim() ||
                          t("codingView.meshWorkUntitled", "Coding work")}
                      </strong>
                      <span className="coding-heartbeat-row__meta">
                        {folderName(item.cwd)}
                        {item.fromOwnerId
                          ? ` · ${item.fromOwnerId.slice(0, 20)}…`
                          : ""}
                        {item.source === "bond"
                          ? ` · ${t("codingView.meshWorkSourceBond", "bond")}`
                          : ""}
                      </span>
                      <span className="coding-heartbeat-row__meta">
                        {item.prompt.slice(0, 120)}
                        {item.prompt.length > 120 ? "…" : ""}
                      </span>
                      {item.lastError ? (
                        <span className="coding-sidebar-error" role="alert">
                          {item.lastError}
                        </span>
                      ) : null}
                    </div>
                    <div className="coding-heartbeat-row__actions">
                      <button
                        type="button"
                        className="secondary"
                        disabled={Boolean(busyId)}
                        onClick={() =>
                          void runAction(item.id, () =>
                            nodeService.dismissEhMeshWorkItem(item.id),
                          )
                        }
                      >
                        {t("codingView.meshWorkDismiss", "Dismiss")}
                      </button>
                      <button
                        type="button"
                        className="primary"
                        disabled={Boolean(busyId)}
                        onClick={() =>
                          void runAction(item.id, async () => {
                            const next = await nodeService.runEhMeshWorkItemNow(
                              item.id,
                            )
                            if (next.chatId) {
                              openCoding({
                                chatId: next.chatId,
                                harness: "envoy-harness",
                              })
                            }
                          })
                        }
                      >
                        {t("codingView.runMeshWork", "Run in Coding")}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {error ? (
              <p className="coding-sidebar-error" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        </section>
      </div>
    </ModalPortal>
  )
}