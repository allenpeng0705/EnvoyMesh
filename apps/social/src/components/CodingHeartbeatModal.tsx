/**
 * Create a Coding heartbeat for an existing workspace (Phase 68-C6).
 */
import { useMemo, useState } from "react"
import {
  CODING_HEARTBEAT_CRON_PRESETS,
  type CodingHeartbeatCronPreset,
  type CodingHeartbeatTarget,
  type CreateCodingHeartbeatInput,
} from "@envoymesh/api"
import { useT } from "../context/I18nContext.js"
import { ModalPortal } from "./ModalPortal.js"

export type CodingHeartbeatModalProps = {
  workspaceTitle: string
  target: CodingHeartbeatTarget
  busy?: boolean
  error?: string | null
  onCancel: () => void
  onSave: (input: CreateCodingHeartbeatInput) => void
}

const PRESET_KEYS: CodingHeartbeatCronPreset[] = ["5m", "15m", "1h", "daily"]

function presetLabel(
  t: (key: string, fallback: string) => string,
  key: CodingHeartbeatCronPreset | "custom",
): string {
  switch (key) {
    case "5m":
      return t("codingView.heartbeatPreset.5m", "5 min")
    case "15m":
      return t("codingView.heartbeatPreset.15m", "15 min")
    case "1h":
      return t("codingView.heartbeatPreset.1h", "Hourly")
    case "daily":
      return t("codingView.heartbeatPreset.daily", "Daily")
    case "custom":
      return t("codingView.heartbeatPreset.custom", "Custom")
  }
}

export function CodingHeartbeatModal({
  workspaceTitle,
  target,
  busy = false,
  error = null,
  onCancel,
  onSave,
}: CodingHeartbeatModalProps) {
  const t = useT()
  const [name, setName] = useState(
    () =>
      t("codingView.heartbeatDefaultName", "Heartbeat · {title}", {
        title: workspaceTitle,
      }),
  )
  const [preset, setPreset] = useState<CodingHeartbeatCronPreset | "custom">(
    "15m",
  )
  const [customCron, setCustomCron] = useState("*/15 * * * *")
  const [prompt, setPrompt] = useState(
    () =>
      t(
        "codingView.heartbeatDefaultPrompt",
        "Check progress on this workspace and continue useful next steps.",
      ),
  )
  const [enabled, setEnabled] = useState(true)

  const cron = useMemo(() => {
    if (preset === "custom") return customCron.trim()
    return CODING_HEARTBEAT_CRON_PRESETS[preset]
  }, [preset, customCron])

  const canSave =
    !busy && name.trim().length > 0 && prompt.trim().length > 0 && cron.length > 0

  return (
    <ModalPortal>
      <div
        className="modal-overlay coding-job-modal-overlay"
        role="presentation"
        data-testid="coding-heartbeat-modal"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget && !busy) onCancel()
        }}
      >
        <section
          className="modal-panel coding-job-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="coding-heartbeat-modal-title"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <header className="modal-header">
            <h2 id="coding-heartbeat-modal-title">
              {t("codingView.heartbeatAddTitle", "Add heartbeat")}
            </h2>
            <button
              type="button"
              className="modal-close"
              aria-label={t("common.close", "Close")}
              disabled={busy}
              onClick={onCancel}
            >
              ×
            </button>
          </header>

          <p className="modal-desc coding-job-modal__desc">
            {t(
              "codingView.heartbeatAddDesc",
              "On a schedule, send a prompt to “{title}”. This wakes the existing workspace — it does not create a new one.",
              { title: workspaceTitle },
            )}
          </p>

          <div className="coding-job-modal__body">
            <label className="modal-field">
              <span>{t("codingView.heartbeatName", "Name")}</span>
              <input
                type="text"
                value={name}
                disabled={busy}
                data-testid="coding-heartbeat-name"
                onChange={(e) => setName(e.target.value)}
              />
            </label>

            <fieldset className="modal-field coding-job-modal__schedule" disabled={busy}>
              <legend>{t("codingView.heartbeatSchedule", "How often")}</legend>
              <div
                className="coding-job-modal__presets"
                role="group"
                aria-label={t("codingView.heartbeatSchedule", "How often")}
              >
                {PRESET_KEYS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    className={`coding-job-modal__preset${
                      preset === key ? " coding-job-modal__preset--active" : ""
                    }`}
                    data-testid={`coding-heartbeat-preset-${key}`}
                    onClick={() => setPreset(key)}
                  >
                    {presetLabel(t, key)}
                  </button>
                ))}
                <button
                  type="button"
                  className={`coding-job-modal__preset${
                    preset === "custom"
                      ? " coding-job-modal__preset--active"
                      : ""
                  }`}
                  data-testid="coding-heartbeat-preset-custom"
                  onClick={() => setPreset("custom")}
                >
                  {presetLabel(t, "custom")}
                </button>
              </div>
              {preset === "custom" ? (
                <input
                  type="text"
                  className="coding-job-modal__cron-input"
                  value={customCron}
                  data-testid="coding-heartbeat-cron"
                  placeholder="*/15 * * * *"
                  spellCheck={false}
                  onChange={(e) => setCustomCron(e.target.value)}
                />
              ) : (
                <p
                  className="coding-job-modal__cron-preview"
                  data-testid="coding-heartbeat-cron-preview"
                >
                  {cron} · UTC
                </p>
              )}
            </fieldset>

            <label className="modal-field">
              <span>{t("codingView.heartbeatPrompt", "Prompt")}</span>
              <textarea
                rows={4}
                value={prompt}
                disabled={busy}
                data-testid="coding-heartbeat-prompt"
                onChange={(e) => setPrompt(e.target.value)}
              />
            </label>

            <label className="coding-job-modal__toggle">
              <input
                type="checkbox"
                checked={enabled}
                disabled={busy}
                data-testid="coding-heartbeat-enabled"
                onChange={(e) => setEnabled(e.target.checked)}
              />
              <span>{t("codingView.heartbeatEnabled", "Enable now")}</span>
            </label>

            {error ? (
              <p className="modal-error" role="alert">
                {error}
              </p>
            ) : null}
          </div>

          <footer className="modal-actions coding-job-modal__actions">
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={onCancel}
            >
              {t("common.cancel", "Cancel")}
            </button>
            <button
              type="button"
              className="primary"
              disabled={!canSave}
              data-testid="coding-heartbeat-save"
              onClick={() => {
                if (!canSave) return
                onSave({
                  name: name.trim(),
                  cron,
                  prompt: prompt.trim(),
                  target,
                  enabled,
                })
              }}
            >
              {busy
                ? t("codingView.heartbeatSaving", "Saving…")
                : t("codingView.heartbeatSave", "Save heartbeat")}
            </button>
          </footer>
        </section>
      </div>
    </ModalPortal>
  )
}
