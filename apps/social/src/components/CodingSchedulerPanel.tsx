/**
 * One list for scheduled Coding work.
 * A row either continues a task that already exists, or starts a new one.
 */
import { useEffect, useState } from "react"
import {
  codingHarnessLabel,
  type CodingHeartbeat,
  type CodingScheduleHarness,
} from "@envoymesh/api"
import { useT } from "../context/I18nContext.js"
import { useNodeService } from "../hooks/useNodeService.js"
import { ModalPortal } from "./ModalPortal.js"

export type CodingSchedulerPanelProps = {
  onClose: () => void
  onNewTask?: () => void
}

type SchedulerRow = {
  key: string
  name: string
  enabled: boolean
  meta: string
  lastError?: string
  kind: "continue" | "fresh"
  toggle: () => Promise<unknown>
  runNow: () => Promise<unknown>
  remove: () => Promise<unknown>
}

function heartbeatTarget(hb: CodingHeartbeat): string {
  if (hb.target.kind === "eh") return `EH · ${hb.target.chatId.slice(0, 8)}`
  if (hb.target.kind === "pi") return `Pi · ${hb.target.sessionId.slice(0, 8)}`
  return `${hb.target.agentId} · ${hb.target.sessionId.slice(0, 8)}`
}

function folderName(cwd: string): string {
  return cwd.split(/[/\\]/).pop() || cwd
}

function harnessName(h: CodingScheduleHarness): string {
  try {
    return codingHarnessLabel(h)
  } catch {
    return h
  }
}

export function CodingSchedulerPanel({
  onClose,
  onNewTask,
}: CodingSchedulerPanelProps) {
  const t = useT()
  const nodeService = useNodeService()
  const [rows, setRows] = useState<SchedulerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const runs = (n: number) => t("codingView.schedulerRuns", "{n} runs", { n })

  const reload = async () => {
    setLoading(true)
    setError(null)
    try {
      const [heartbeats, schedules] = await Promise.all([
        nodeService.listCodingHeartbeats(),
        nodeService.listCodingSchedules(),
      ])
      const next: SchedulerRow[] = [
        ...heartbeats.map((hb): SchedulerRow => ({
          key: `continue:${hb.id}`,
          name: hb.name,
          enabled: hb.enabled,
          kind: "continue",
          meta: [
            hb.cron,
            heartbeatTarget(hb),
            typeof hb.runCount === "number" ? runs(hb.runCount) : "",
          ]
            .filter((part) => part.length > 0)
            .join(" · "),
          ...(hb.lastError ? { lastError: hb.lastError } : {}),
          toggle: () =>
            nodeService.updateCodingHeartbeat({
              id: hb.id,
              enabled: !hb.enabled,
            }),
          runNow: () => nodeService.runCodingHeartbeatNow(hb.id),
          remove: () => nodeService.deleteCodingHeartbeat(hb.id),
        })),
        ...schedules.map((row): SchedulerRow => ({
          key: `fresh:${row.id}`,
          name: row.name,
          enabled: row.enabled,
          kind: "fresh",
          meta: [
            row.cron,
            harnessName(row.harness),
            folderName(row.cwd),
            typeof row.runCount === "number" ? runs(row.runCount) : "",
          ]
            .filter((part) => part.length > 0)
            .join(" · "),
          ...(row.lastError ? { lastError: row.lastError } : {}),
          toggle: () =>
            nodeService.updateCodingSchedule({
              id: row.id,
              enabled: !row.enabled,
            }),
          runNow: () => nodeService.runCodingScheduleNow(row.id),
          remove: () => nodeService.deleteCodingSchedule(row.id),
        })),
      ]
      next.sort((a, b) => a.name.localeCompare(b.name))
      setRows(next)
    } catch {
      setError(
        t(
          "codingView.schedulerListFailed",
          "Couldn’t load the scheduler. Try again.",
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
    key: string,
    action: () => Promise<unknown>,
  ): Promise<void> => {
    setBusyKey(key)
    setError(null)
    try {
      await action()
      await reload()
    } catch {
      setError(
        t(
          "codingView.schedulerActionFailed",
          "That didn’t work. Try again.",
        ),
      )
    } finally {
      setBusyKey(null)
    }
  }

  return (
    <ModalPortal>
      <div
        className="modal-overlay"
        role="presentation"
        data-testid="coding-scheduler-panel"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget && !busyKey) onClose()
        }}
      >
        <section
          className="modal-panel coding-panel coding-heartbeats-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="coding-scheduler-title"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <header className="modal-header">
            <h2 id="coding-scheduler-title">
              {t("codingView.schedulerTitle", "Scheduler")}
            </h2>
            <button
              type="button"
              className="modal-close"
              aria-label={t("common.close", "Close")}
              disabled={Boolean(busyKey)}
              onClick={onClose}
            >
              ×
            </button>
          </header>
          <p className="section-desc">
            {t(
              "codingView.schedulerDesc",
              "Run a prompt on a schedule. Continue a task you already have, or start a new one. Not Team jobs.",
            )}
          </p>

          <div className="coding-panel__body">
            {loading ? (
              <p role="status">{t("codingView.schedulerLoading", "Loading…")}</p>
            ) : rows.length === 0 ? (
              <p
                className="coding-panel__empty"
                role="status"
                data-testid="coding-scheduler-empty"
              >
                {t(
                  "codingView.schedulerEmpty",
                  "Nothing scheduled yet. Schedule a task from its menu, or start a new one.",
                )}
              </p>
            ) : (
              <ul
                className="coding-job-list coding-heartbeats-list"
                data-testid="coding-scheduler-list"
              >
                {rows.map((row) => {
                  const busy = busyKey === row.key
                  return (
                    <li
                      key={row.key}
                      className="coding-job-card coding-heartbeat-row"
                    >
                      <div className="coding-job-card__main coding-heartbeat-row__main">
                        <div className="coding-job-card__title-row">
                          <strong>{row.name}</strong>
                          <span className="coding-status-pill">
                            {row.kind === "continue"
                              ? t(
                                  "codingView.schedulerKindContinue",
                                  "Continues this task",
                                )
                              : t(
                                  "codingView.schedulerKindNew",
                                  "Starts a new task",
                                )}
                          </span>
                          <span
                            className={`coding-status-pill${
                              row.enabled
                                ? " coding-status-pill--on"
                                : " coding-status-pill--off"
                            }`}
                          >
                            {row.enabled
                              ? t("codingView.schedulerOn", "On")
                              : t("codingView.schedulerOff", "Paused")}
                          </span>
                        </div>
                        <span className="coding-job-card__meta coding-heartbeat-row__meta">
                          {row.meta}
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
                          data-testid={`coding-scheduler-toggle-${row.key}`}
                          onClick={() => void runAction(row.key, row.toggle)}
                        >
                          {row.enabled
                            ? t("codingView.schedulerPause", "Pause")
                            : t("codingView.schedulerResume", "Resume")}
                        </button>
                        <button
                          type="button"
                          className="coding-btn coding-btn--primary"
                          disabled={busy}
                          data-testid={`coding-scheduler-run-${row.key}`}
                          onClick={() => void runAction(row.key, row.runNow)}
                        >
                          {t("codingView.schedulerRunNow", "Run now")}
                        </button>
                        <button
                          type="button"
                          className="coding-btn coding-btn--danger danger"
                          disabled={busy}
                          data-testid={`coding-scheduler-delete-${row.key}`}
                          onClick={() => void runAction(row.key, row.remove)}
                        >
                          {t("codingView.schedulerDelete", "Delete")}
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
            {onNewTask ? (
              <button
                type="button"
                className="coding-btn coding-btn--primary primary"
                disabled={Boolean(busyKey)}
                data-testid="coding-scheduler-new"
                onClick={onNewTask}
              >
                {t("codingView.schedulerNew", "Start a new task")}
              </button>
            ) : null}
            <button
              type="button"
              className="coding-btn"
              disabled={Boolean(busyKey)}
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
