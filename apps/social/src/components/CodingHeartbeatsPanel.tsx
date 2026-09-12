/**
 * List / pause / delete / run-now Coding heartbeats (Phase 68-C6).
 */
import { useEffect, useState } from "react"
import type { CodingHeartbeat } from "@envoymesh/api"
import { useT } from "../context/I18nContext.js"
import { useNodeService } from "../hooks/useNodeService.js"
import { ModalPortal } from "./ModalPortal.js"

export type CodingHeartbeatsPanelProps = {
  onClose: () => void
}

function targetLabel(hb: CodingHeartbeat): string {
  if (hb.target.kind === "eh") return `EH · ${hb.target.chatId.slice(0, 8)}`
  if (hb.target.kind === "pi") return `Pi · ${hb.target.sessionId.slice(0, 8)}`
  return `${hb.target.agentId} · ${hb.target.sessionId.slice(0, 8)}`
}

export function CodingHeartbeatsPanel({ onClose }: CodingHeartbeatsPanelProps) {
  const t = useT()
  const nodeService = useNodeService()
  const [rows, setRows] = useState<CodingHeartbeat[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reload = async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await nodeService.listCodingHeartbeats()
      setRows(list)
    } catch {
      setError(
        t(
          "codingView.heartbeatListFailed",
          "Couldn’t load heartbeats. Try again.",
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

  const runAction = async (
    id: string,
    action: () => Promise<unknown>,
  ): Promise<void> => {
    setBusyId(id)
    setError(null)
    try {
      await action()
      await reload()
    } catch {
      setError(
        t(
          "codingView.heartbeatActionFailed",
          "That heartbeat action didn’t work. Try again.",
        ),
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
        data-testid="coding-heartbeats-panel"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget && !busyId) onClose()
        }}
      >
        <section
          className="modal-panel coding-panel coding-heartbeats-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="coding-heartbeats-title"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <header className="modal-header">
            <h2 id="coding-heartbeats-title">
              {t("codingView.heartbeatListTitle", "Heartbeats")}
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
              "codingView.heartbeatListDesc",
              "Scheduled prompts for existing Coding workspaces. Not Team jobs.",
            )}
          </p>

          <div className="coding-panel__body">
            {loading ? (
              <p role="status">{t("codingView.heartbeatLoading", "Loading…")}</p>
            ) : rows.length === 0 ? (
              <p
                className="coding-panel__empty"
                role="status"
                data-testid="coding-heartbeats-empty"
              >
                {t(
                  "codingView.heartbeatEmpty",
                  "No heartbeats yet. Add one from a workspace menu.",
                )}
              </p>
            ) : (
              <ul
                className="coding-job-list coding-heartbeats-list"
                data-testid="coding-heartbeats-list"
              >
                {rows.map((hb) => {
                  const busy = busyId === hb.id
                  return (
                    <li
                      key={hb.id}
                      className="coding-job-card coding-heartbeat-row"
                    >
                      <div className="coding-job-card__main coding-heartbeat-row__main">
                        <div className="coding-job-card__title-row">
                          <strong>{hb.name}</strong>
                          <span
                            className={`coding-status-pill${
                              hb.enabled
                                ? " coding-status-pill--on"
                                : " coding-status-pill--off"
                            }`}
                          >
                            {hb.enabled
                              ? t("codingView.heartbeatOn", "On")
                              : t("codingView.heartbeatOff", "Paused")}
                          </span>
                        </div>
                        <span className="coding-job-card__meta coding-heartbeat-row__meta">
                          {hb.cron} · {targetLabel(hb)}
                          {typeof hb.runCount === "number"
                            ? ` · ${t("codingView.heartbeatRuns", "{n} runs", {
                                n: hb.runCount,
                              })}`
                            : null}
                        </span>
                        {hb.lastError ? (
                          <span className="coding-sidebar-error" role="status">
                            {hb.lastError}
                          </span>
                        ) : null}
                      </div>
                      <div className="coding-job-card__actions coding-heartbeat-row__actions">
                        <button
                          type="button"
                          className="coding-btn"
                          disabled={busy}
                          data-testid={`coding-heartbeat-toggle-${hb.id}`}
                          onClick={() =>
                            void runAction(hb.id, () =>
                              nodeService.updateCodingHeartbeat({
                                id: hb.id,
                                enabled: !hb.enabled,
                              }),
                            )
                          }
                        >
                          {hb.enabled
                            ? t("codingView.heartbeatPause", "Pause")
                            : t("codingView.heartbeatResume", "Resume")}
                        </button>
                        <button
                          type="button"
                          className="coding-btn coding-btn--primary"
                          disabled={busy}
                          data-testid={`coding-heartbeat-run-${hb.id}`}
                          onClick={() =>
                            void runAction(hb.id, () =>
                              nodeService.runCodingHeartbeatNow(hb.id),
                            )
                          }
                        >
                          {t("codingView.heartbeatRunNow", "Run now")}
                        </button>
                        <button
                          type="button"
                          className="coding-btn coding-btn--danger danger"
                          disabled={busy}
                          data-testid={`coding-heartbeat-delete-${hb.id}`}
                          onClick={() =>
                            void runAction(hb.id, () =>
                              nodeService.deleteCodingHeartbeat(hb.id),
                            )
                          }
                        >
                          {t("codingView.heartbeatDelete", "Delete")}
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}

            {error ? (
              <p className="coding-sidebar-error" role="alert">
                {error}
              </p>
            ) : null}
          </div>

          <footer className="modal-actions">
            <button
              type="button"
              className="coding-btn"
              disabled={Boolean(busyId)}
              onClick={onClose}
            >
              {t("common.close", "Close")}
            </button>
          </footer>
        </section>
      </div>
    </ModalPortal>
  )
}
