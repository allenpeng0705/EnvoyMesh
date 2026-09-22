/**
 * Global Coding defaults (harness / model / provider).
 * Used when a project has no override. Empty Envoy/Pi model → EnvoyMesh AI.
 */
import { useEffect, useState } from "react";
import type { CodingHarnessId, ModelProviderConfig } from "@envoymesh/api";
import type { HarnessProbeBadge } from "../lib/coding-harness-probe.js";
import { useT } from "../context/I18nContext.js";
import type { CodingDefaults } from "../lib/coding-projects.js";
import {
  CodingAgentModelProviderFields,
  type CodingAgentModelProviderValue,
} from "./CodingAgentModelProviderFields.js";
import { snapCodingAgentToReady } from "../lib/coding-agent-model-provider.js";
import { ModalPortal } from "./ModalPortal.js";

export type CodingDefaultsModalProps = {
  defaults: CodingDefaults;
  busy?: boolean;
  error?: string | null;
  onCancel: () => void;
  onSave: (next: CodingDefaults) => void;
  /** EnvoyMesh AI model label when Coding defaults leave model empty. */
  envoymeshAiModelHint?: string;
  /** Settings → AI provider, for the Envoy Harness / Pi model list. */
  modelProviders?: ModelProviderConfig | null;
  /** Ready agents only — Settings lists the rest for install. */
  enabledHarnesses?: readonly CodingHarnessId[];
  harnessProbe?: Partial<Record<CodingHarnessId, HarnessProbeBadge>>;
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
  modelProviders = null,
  enabledHarnesses,
  harnessProbe = {},
}: CodingDefaultsModalProps) {
  const t = useT();
  const [agentModel, setAgentModel] = useState(() => defaultsToValue(defaults));

  useEffect(() => {
    setAgentModel(defaultsToValue(defaults));
  }, [defaults]);

  useEffect(() => {
    if (enabledHarnesses === undefined) return;
    setAgentModel((prev) => snapCodingAgentToReady(prev, enabledHarnesses));
  }, [enabledHarnesses]);

  const baseline = defaultsToValue(defaults);
  const dirty =
    agentModel.harness !== baseline.harness ||
    agentModel.model.trim() !== baseline.model.trim() ||
    agentModel.providerKind !== baseline.providerKind ||
    agentModel.endpoint.trim() !== baseline.endpoint.trim() ||
    agentModel.apiKey.trim() !== baseline.apiKey.trim();
  const harnessOk =
    enabledHarnesses === undefined
      ? true
      : enabledHarnesses.length > 0 &&
        enabledHarnesses.includes(agentModel.harness);
  const canSave = !busy && dirty && harnessOk;

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
              "Used when a project has no override. Envoy and Pi with empty model use EnvoyMesh AI. Other agents use their own login unless you set a model or a compatible endpoint.",
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
              modelProviders={modelProviders}
              enabledHarnesses={enabledHarnesses}
              harnessProbe={harnessProbe}
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
