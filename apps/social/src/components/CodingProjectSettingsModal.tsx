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
    /** Omitted when unset and user did not choose an agent (rename-only). */
    defaultHarness?: CodingHarnessId;
    defaultModel: string | null;
    defaultProviderKind: CodingProviderKind | null;
    defaultEndpoint: string | null;
    defaultApiKey: string | null;
  }) => void;
  onReveal: () => void;
  /** Opens the Coding defaults modal. */
  onOpenCodingDefaults?: () => void;
  /** Coding defaults model hint for empty Envoy/Pi fields. */
  codingDefaultsModelHint?: string;
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
  onOpenCodingDefaults,
  codingDefaultsModelHint = "",
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
  /**
   * UI shows Envoy when `defaultHarness` is unset. Don't write Envoy on a
   * rename-only save; do write if the project already had a harness or the
   * user touched agent/model/provider fields.
   */
  const shouldPersistHarness =
    Boolean(project.defaultHarness) ||
    agentModel.harness !== "envoy-harness" ||
    agentModel.model.trim().length > 0 ||
    Boolean(agentModel.providerKind) ||
    agentModel.endpoint.trim().length > 0 ||
    agentModel.apiKey.trim().length > 0;

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
              "Overrides for new workspaces in this project. Leave agent or model empty to use Coding defaults.",
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
              fallbackKind="coding-defaults"
              fallbackModelHint={codingDefaultsModelHint}
            />

            {onOpenCodingDefaults ? (
              <button
                type="button"
                className="coding-project-settings__defaults-link"
                disabled={busy}
                data-testid="coding-project-open-defaults"
                onClick={onOpenCodingDefaults}
              >
                {t(
                  "codingView.projectOpenCodingDefaults",
                  "Edit Coding defaults…",
                )}
              </button>
            ) : null}

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
                  ...(shouldPersistHarness
                    ? { defaultHarness: agentModel.harness }
                    : {}),
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
