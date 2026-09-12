/**
 * Global Coding defaults (harness / model / provider).
 * Used when a project has no override. Empty Envoy/Pi model → EnvoyMesh AI.
 */
import { useEffect, useState } from "react";
import { useT } from "../context/I18nContext.js";
import type { CodingDefaults } from "../lib/coding-projects.js";
import {
  CodingAgentModelProviderFields,
  type CodingAgentModelProviderValue,
} from "./CodingAgentModelProviderFields.js";
import { ModalPortal } from "./ModalPortal.js";

export type CodingDefaultsModalProps = {
  defaults: CodingDefaults;
  busy?: boolean;
  error?: string | null;
  onCancel: () => void;
  onSave: (next: CodingDefaults) => void;
  /** EnvoyMesh AI model label when Coding defaults leave model empty. */
  envoymeshAiModelHint?: string;
};

function defaultsToValue(d: CodingDefaults): CodingAgentModelProviderValue {
  return {
    harness: d.harness,
    model: d.model,
    providerKind: d.providerKind,
    endpoint: d.endpoint,
    apiKey: d.apiKey,
  };
}

export function CodingDefaultsModal({
  defaults,
  busy = false,
  error = null,
  onCancel,
  onSave,
  envoymeshAiModelHint = "",
}: CodingDefaultsModalProps) {
  const t = useT();
  const [agentModel, setAgentModel] = useState(() => defaultsToValue(defaults));

  useEffect(() => {
    setAgentModel(defaultsToValue(defaults));
  }, [defaults]);

  const baseline = defaultsToValue(defaults);
  const dirty =
    agentModel.harness !== baseline.harness ||
    agentModel.model.trim() !== baseline.model.trim() ||
    agentModel.providerKind !== baseline.providerKind ||
    agentModel.endpoint.trim() !== baseline.endpoint.trim() ||
    agentModel.apiKey.trim() !== baseline.apiKey.trim();
  const canSave = !busy && dirty;

  return (
    <ModalPortal>
      <div
        className="modal-overlay coding-job-modal-overlay"
        role="presentation"
        data-testid="coding-defaults-settings"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget && !busy) onCancel();
        }}
      >
        <section
          className="modal-panel coding-job-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="coding-defaults-settings-title"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <header className="modal-header">
            <h2 id="coding-defaults-settings-title">
              {t("codingView.defaultsTitle", "Coding defaults")}
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
              "codingView.defaultsDesc",
              "Used when a project has no override. Empty model or provider for Envoy and Pi uses EnvoyMesh AI.",
            )}
          </p>

          <div className="coding-job-modal__body">
            <CodingAgentModelProviderFields
              value={agentModel}
              onChange={setAgentModel}
              busy={busy}
              scope="defaults"
              fallbackKind="envoymesh-ai"
              fallbackModelHint={envoymeshAiModelHint}
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
              data-testid="coding-defaults-settings-save"
              onClick={() => {
                if (!canSave) return;
                onSave({
                  harness: agentModel.harness,
                  model: agentModel.model.trim(),
                  providerKind: agentModel.providerKind,
                  endpoint: agentModel.endpoint.trim(),
                  apiKey: agentModel.apiKey.trim(),
                });
              }}
            >
              {busy
                ? t("codingView.defaultsSaving", "Saving…")
                : t("codingView.defaultsSave", "Save")}
            </button>
          </footer>
        </section>
      </div>
    </ModalPortal>
  );
}
