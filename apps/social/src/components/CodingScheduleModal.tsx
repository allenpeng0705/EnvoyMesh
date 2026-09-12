/**
 * Create a Coding schedule — new workspace each fire (Phase 68-C7).
 */
import { useState } from "react";
import {
  CODING_ALL_HARNESSES,
  CODING_CRON_PRESETS,
  codingHarnessLabel,
  type CodingScheduleHarness,
  type CreateCodingScheduleInput,
} from "@envoymesh/api";
import { useT } from "../context/I18nContext.js";
import type { CodingProject } from "../lib/coding-projects.js";
import { CodingCronFields } from "./CodingCronFields.js";
import { ModalPortal } from "./ModalPortal.js";

export type CodingScheduleModalProps = {
  projects: CodingProject[];
  busy?: boolean;
  error?: string | null;
  onCancel: () => void;
  onSave: (input: CreateCodingScheduleInput) => void;
};

export function CodingScheduleModal({
  projects,
  busy = false,
  error = null,
  onCancel,
  onSave,
}: CodingScheduleModalProps) {
  const t = useT();
  const [name, setName] = useState(
    () => t("codingView.scheduleDefaultName", "Scheduled run"),
  );
  const [cwd, setCwd] = useState(() => projects[0]?.path ?? "");
  const [harness, setHarness] = useState<CodingScheduleHarness>("envoy-harness");
  const [cron, setCron] = useState(CODING_CRON_PRESETS["15m"]);
  const [prompt, setPrompt] = useState(
    () =>
      t(
        "codingView.scheduleDefaultPrompt",
        "Start this scheduled coding task and make useful progress.",
      ),
  );
  const [enabled, setEnabled] = useState(true);

  const selectedProject = projects.find((p) => p.path === cwd) ?? null;

  const canSave =
    !busy &&
    name.trim().length > 0 &&
    prompt.trim().length > 0 &&
    cwd.trim().length > 0 &&
    cron.trim().length > 0;

  return (
    <ModalPortal>
      <div
        className="modal-overlay coding-job-modal-overlay"
        role="presentation"
        data-testid="coding-schedule-modal"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget && !busy) onCancel();
        }}
      >
        <section
          className="modal-panel coding-job-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="coding-schedule-modal-title"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <header className="modal-header">
            <h2 id="coding-schedule-modal-title">
              {t("codingView.scheduleAddTitle", "New schedule")}
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
              "codingView.scheduleAddDesc",
              "On a schedule, create a new Coding workspace for a project and run the prompt once. Distinct from heartbeats.",
            )}
          </p>

          <div className="coding-job-modal__body">
            <label className="modal-field">
              <span>{t("codingView.scheduleName", "Name")}</span>
              <input
                type="text"
                value={name}
                disabled={busy}
                data-testid="coding-schedule-name"
                onChange={(e) => setName(e.target.value)}
              />
            </label>

            <label className="modal-field">
              <span>{t("codingView.scheduleProject", "Project")}</span>
              {projects.length === 0 ? (
                <p
                  className="coding-job-modal__hint"
                  data-testid="coding-schedule-no-projects"
                >
                  {t(
                    "codingView.scheduleNoProjects",
                    "Add a project folder in Coding first.",
                  )}
                </p>
              ) : (
                <>
                  <select
                    value={cwd}
                    disabled={busy}
                    data-testid="coding-schedule-cwd"
                    onChange={(e) => setCwd(e.target.value)}
                  >
                    {projects.map((p) => (
                      <option key={p.path} value={p.path}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                  {selectedProject ? (
                    <p
                      className="coding-job-modal__path-hint"
                      title={selectedProject.path}
                    >
                      {selectedProject.path}
                    </p>
                  ) : null}
                </>
              )}
            </label>

            <label className="modal-field">
              <span>{t("codingView.scheduleHarness", "Agent")}</span>
              <select
                value={harness}
                disabled={busy}
                data-testid="coding-schedule-harness"
                onChange={(e) =>
                  setHarness(e.target.value as CodingScheduleHarness)
                }
              >
                {CODING_ALL_HARNESSES.map((h) => (
                  <option key={h} value={h}>
                    {codingHarnessLabel(h)}
                  </option>
                ))}
              </select>
            </label>

            <CodingCronFields
              testIdPrefix="coding-schedule"
              legend={t("codingView.scheduleCron", "How often")}
              busy={busy}
              value={cron}
              onChange={setCron}
            />

            <label className="modal-field">
              <span>{t("codingView.schedulePrompt", "Prompt")}</span>
              <textarea
                rows={4}
                value={prompt}
                disabled={busy}
                data-testid="coding-schedule-prompt"
                onChange={(e) => setPrompt(e.target.value)}
              />
            </label>

            <label className="coding-job-modal__toggle">
              <input
                type="checkbox"
                checked={enabled}
                disabled={busy}
                data-testid="coding-schedule-enabled"
                onChange={(e) => setEnabled(e.target.checked)}
              />
              <span>{t("codingView.scheduleEnabled", "Enable now")}</span>
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
              data-testid="coding-schedule-save"
              onClick={() => {
                if (!canSave) return;
                onSave({
                  name: name.trim(),
                  cron: cron.trim(),
                  prompt: prompt.trim(),
                  cwd: cwd.trim(),
                  harness,
                  enabled,
                });
              }}
            >
              {busy
                ? t("codingView.scheduleSaving", "Saving…")
                : t("codingView.scheduleSave", "Save schedule")}
            </button>
          </footer>
        </section>
      </div>
    </ModalPortal>
  );
}
