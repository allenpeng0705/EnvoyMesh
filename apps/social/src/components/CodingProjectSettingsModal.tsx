/**
 * Per-project Coding settings: name, location, default agent + model + provider.
 */
import { useEffect, useState } from "react";
import type { CodingHarnessId } from "@envoymesh/api";
import { useT } from "../context/I18nContext.js";
import type {
  CodingProject,
  CodingProviderKind,
} from "../lib/coding-projects.js";
import {
  CodingAgentModelProviderFields,
  type CodingAgentModelProviderValue,
} from "./CodingAgentModelProviderFields.js";
import { ModalPortal } from "./ModalPortal.js";

export type CodingProjectSettingsModalProps = {
  project: CodingProject;
  busy?: boolean;
  error?: string | null;
  revealBusy?: boolean;
  onCancel: () => void;
  onSave: (patch: {
    label: string;
    defaultHarness: CodingHarnessId;
    defaultModel: string | null;
    defaultProviderKind: CodingProviderKind | null;
    defaultEndpoint: string | null;
    defaultApiKey: string | null;
  }) => void;
  onReveal: () => void;
  /** Current Settings → AI model for Envoy/Pi default hints. */
  settingsAiModelHint?: string;
};

function projectToValue(project: CodingProject): CodingAgentModelProviderValue {
  return {
    harness: project.defaultHarness ?? "envoy-harness",
    model: project.defaultModel ?? "",
    providerKind: project.defaultProviderKind ?? "",
    endpoint: project.defaultEndpoint ?? "",
    apiKey: project.defaultApiKey ?? "",
  };
}

export function CodingProjectSettingsModal({
  project,
  busy = false,
  error = null,
  revealBusy = false,
  onCancel,
  onSave,
  onReveal,
  settingsAiModelHint = "",
}: CodingProjectSettingsModalProps) {
  const t = useT();
  const [label, setLabel] = useState(project.label);
  const [agentModel, setAgentModel] = useState(() => projectToValue(project));

  useEffect(() => {
    setLabel(project.label);
    setAgentModel(projectToValue(project));
  }, [project]);

  const trimmedLabel = label.trim();
  const baseline = projectToValue(project);
  const dirty =
    trimmedLabel !== project.label.trim() ||
    agentModel.harness !== baseline.harness ||
    agentModel.model.trim() !== baseline.model.trim() ||
    agentModel.providerKind !== baseline.providerKind ||
    agentModel.endpoint.trim() !== baseline.endpoint.trim() ||
    agentModel.apiKey.trim() !== baseline.apiKey.trim();
  const canSave = !busy && trimmedLabel.length > 0 && dirty;

  return (
    <ModalPortal>
      <div
        className="modal-overlay coding-job-modal-overlay"
        role="presentation"
        data-testid="coding-project-settings"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget && !busy) onCancel();
        }}
      >
        <section
          className="modal-panel coding-job-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="coding-project-settings-title"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <header className="modal-header">
            <h2 id="coding-project-settings-title">
              {t("codingView.projectSettingsTitle", "Project settings")}
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
              "codingView.projectSettingsDesc",
              "Defaults for new workspaces in this project. A workspace can override them when you create it.",
            )}
          </p>

          <div className="coding-job-modal__body">
            <label className="modal-field">
              <span>{t("codingView.projectName", "Name")}</span>
              <input
                type="text"
                value={label}
                disabled={busy}
                data-testid="coding-project-settings-name"
                onChange={(e) => setLabel(e.target.value)}
              />
            </label>

            <div className="modal-field">
              <span>{t("codingView.projectLocation", "Location")}</span>
              <p
                className="coding-job-modal__path-hint coding-project-settings__path"
                title={project.path}
                data-testid="coding-project-settings-path"
              >
                {project.path}
              </p>
              <button
                type="button"
                className="coding-btn coding-project-settings__reveal"
                disabled={busy || revealBusy}
                data-testid="coding-project-settings-reveal"
                onClick={onReveal}
              >
                {revealBusy
                  ? t("codingView.projectRevealBusy", "Opening…")
                  : t(
                      "codingView.projectOpenInFileManager",
                      "Open in file manager",
                    )}
              </button>
            </div>

            <CodingAgentModelProviderFields
              value={agentModel}
              onChange={setAgentModel}
              busy={busy}
              scope="project"
              settingsAiModelHint={settingsAiModelHint}
            />

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
              data-testid="coding-project-settings-save"
              onClick={() => {
                if (!canSave) return;
                const model = agentModel.model.trim();
                const endpoint = agentModel.endpoint.trim();
                const apiKey = agentModel.apiKey.trim();
                onSave({
                  label: trimmedLabel,
                  defaultHarness: agentModel.harness,
                  defaultModel: model.length > 0 ? model : null,
                  defaultProviderKind: agentModel.providerKind || null,
                  defaultEndpoint: endpoint.length > 0 ? endpoint : null,
                  defaultApiKey: apiKey.length > 0 ? apiKey : null,
                });
              }}
            >
              {busy
                ? t("codingView.projectSettingsSaving", "Saving…")
                : t("codingView.projectSettingsSave", "Save")}
            </button>
          </footer>
        </section>
      </div>
    </ModalPortal>
  );
}
