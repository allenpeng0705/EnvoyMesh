/**
 * List / pause / delete / run-now Coding schedules (Phase 68-C7).
 */
import { useEffect, useState } from "react"
import {
  codingHarnessLabel,
  type CodingSchedule,
  type CodingScheduleHarness,
} from "@envoymesh/api"
import { useT } from "../context/I18nContext.js"
import { useNodeService } from "../hooks/useNodeService.js"
import { ModalPortal } from "./ModalPortal.js"

export type CodingSchedulesPanelProps = {
  onClose: () => void
  onNewSchedule?: () => void
}

function harnessLabel(h: CodingScheduleHarness): string {
  try {
    return codingHarnessLabel(h)
  } catch {
    return h
  }
}

export function CodingSchedulesPanel({
  onClose,
  onNewSchedule,
}: CodingSchedulesPanelProps) {
  const t = useT()
  const nodeService = useNodeService()
  const [rows, setRows] = useState<CodingSchedule[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reload = async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await nodeService.listCodingSchedules()
      setRows(list)
    } catch {
      setError(
        t(
          "codingView.scheduleListFailed",
          "Couldn’t load schedules. Try again.",
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
          "codingView.scheduleActionFailed",
          "That schedule action didn’t work. Try again.",
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
        data-testid="coding-schedules-panel"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget && !busyId) onClose()
        }}
      >
        <section
          className="modal-panel coding-panel coding-heartbeats-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="coding-schedules-title"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <header className="modal-header">
            <h2 id="coding-schedules-title">
              {t("codingView.scheduleListTitle", "Schedules")}
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
              "codingView.scheduleListDesc",
              "Cron creates a new Coding workspace and runs the prompt once. Not heartbeats or Team jobs.",
            )}
          </p>

          <div className="coding-panel__body">
            {loading ? (
              <p role="status">{t("codingView.scheduleLoading", "Loading…")}</p>
            ) : rows.length === 0 ? (
              <p
                className="coding-panel__empty"
                role="status"
                data-testid="coding-schedules-empty"
              >
                {t(
                  "codingView.scheduleEmpty",
                  "No schedules yet. Create one from Schedules or the command palette.",
                )}
              </p>
            ) : (
              <ul
                className="coding-job-list coding-heartbeats-list"
                data-testid="coding-schedules-list"
              >
                {rows.map((row) => {
                  const busy = busyId === row.id
                  return (
                    <li
                      key={row.id}
                      className="coding-job-card coding-heartbeat-row"
                    >
                      <div className="coding-job-card__main coding-heartbeat-row__main">
                        <div className="coding-job-card__title-row">
                          <strong>{row.name}</strong>
                          <span
                            className={`coding-status-pill${
                              row.enabled
                                ? " coding-status-pill--on"
                                : " coding-status-pill--off"
                            }`}
                          >
                            {row.enabled
                              ? t("codingView.scheduleOn", "On")
                              : t("codingView.scheduleOff", "Paused")}
                          </span>
                        </div>
                        <span className="coding-job-card__meta coding-heartbeat-row__meta">
                          {row.cron} · {harnessLabel(row.harness)} ·{" "}
                          {row.cwd.split(/[/\\]/).pop() || row.cwd}
                          {typeof row.runCount === "number"
                            ? ` · ${t("codingView.scheduleRuns", "{n} runs", {
                                n: row.runCount,
                              })}`
                            : null}
                        </span>
                        {row.lastError ? (
                          <span className="coding-sidebar-error" role="status">
                            {row.lastError}
                          </span>
                        ) : null}
                      </div>
                      <div className="coding-job-card__actions coding-heartbeat-row__actions">
                        <button
                          type="button"
                          className="coding-btn"
                          disabled={busy}
                          data-testid={`coding-schedule-toggle-${row.id}`}
                          onClick={() =>
                            void runAction(row.id, () =>
                              nodeService.updateCodingSchedule({
                                id: row.id,
                                enabled: !row.enabled,
                              }),
                            )
                          }
                        >
                          {row.enabled
                            ? t("codingView.schedulePause", "Pause")
                            : t("codingView.scheduleResume", "Resume")}
                        </button>
                        <button
                          type="button"
                          className="coding-btn coding-btn--primary"
                          disabled={busy}
                          data-testid={`coding-schedule-run-${row.id}`}
                          onClick={() =>
                            void runAction(row.id, () =>
                              nodeService.runCodingScheduleNow(row.id),
                            )
                          }
                        >
                          {t("codingView.scheduleRunNow", "Run now")}
                        </button>
                        <button
                          type="button"
                          className="coding-btn coding-btn--danger danger"
                          disabled={busy}
                          data-testid={`coding-schedule-delete-${row.id}`}
                          onClick={() =>
                            void runAction(row.id, () =>
                              nodeService.deleteCodingSchedule(row.id),
                            )
                          }
                        >
                          {t("codingView.scheduleDelete", "Delete")}
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
            {onNewSchedule ? (
              <button
                type="button"
                className="coding-btn coding-btn--primary primary"
                disabled={Boolean(busyId)}
                data-testid="coding-schedule-new"
                onClick={onNewSchedule}
              >
                {t("codingView.scheduleNew", "New schedule")}
              </button>
            ) : null}
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
