/**
 * Add Coding project — folder + default agent / model / provider.
 */
import { useEffect, useState } from "react";
import type { CodingHarnessId, ModelProviderConfig } from "@envoymesh/api";
import { useT } from "../context/I18nContext.js";
import type { CodingTaskPrefill } from "../lib/coding-projects.js";
import { HomeFolderPicker } from "./HomeFolderPicker.js";
import {
  CodingAgentModelProviderFields,
  type CodingAgentModelProviderValue,
} from "./CodingAgentModelProviderFields.js";
import { codingPrefillToValue, snapCodingAgentToReady } from "../lib/coding-agent-model-provider.js";
import { ModalPortal } from "./ModalPortal.js";

export type CodingAddProjectConfirm = {
  path: string;
  harness: CodingAgentModelProviderValue["harness"];
  model: string;
  providerKind: CodingAgentModelProviderValue["providerKind"];
  endpoint: string;
  apiKey: string;
};

import type { HarnessProbeBadge } from "../lib/coding-harness-probe.js";

export interface CodingProjectPickerModalProps {
  open: boolean;
  title: string;
  description: string;
  value: string;
  onChange: (path: string) => void;
  /** Prefill agent defaults (usually Coding defaults). */
  initialPrefill?: CodingTaskPrefill;
  codingDefaultsModelHint?: string;
  /** Settings → AI provider, for the Envoy Harness / Pi model list. */
  modelProviders?: ModelProviderConfig | null;
  harnessProbe?: Partial<Record<CodingHarnessId, HarnessProbeBadge>>;
  /** Ready agents only — Settings lists the rest for install. */
  enabledHarnesses?: readonly CodingHarnessId[];
  error?: string | null;
  busy?: boolean;
  confirmLabel: string;
  busyLabel?: string;
  pickerTitle?: string;
  onClose: () => void;
  onConfirm: (result: CodingAddProjectConfirm) => void;
}

export function CodingProjectPickerModal({
  open,
  title,
  description,
  value,
  onChange,
  initialPrefill,
  codingDefaultsModelHint = "",
  modelProviders = null,
  harnessProbe = {},
  enabledHarnesses,
  error,
  busy = false,
  confirmLabel,
  busyLabel,
  pickerTitle,
  onClose,
  onConfirm,
}: CodingProjectPickerModalProps) {
  const t = useT();
  const [agentModel, setAgentModel] = useState<CodingAgentModelProviderValue>(
    () =>
      codingPrefillToValue(
        initialPrefill ?? {
          harness: "envoy-harness",
          model: "",
          providerKind: "",
          endpoint: "",
          apiKey: "",
        },
      ),
  );

  useEffect(() => {
    if (!open) return;
    if (initialPrefill) setAgentModel(codingPrefillToValue(initialPrefill));
    // Reset only when the modal opens — not on every parent re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (enabledHarnesses === undefined) return;
    setAgentModel((prev) => snapCodingAgentToReady(prev, enabledHarnesses));
  }, [open, enabledHarnesses]);

  if (!open) return null;

  const trimmed = value.trim();
  const harnessOk =
    enabledHarnesses === undefined
      ? true
      : enabledHarnesses.length > 0 &&
        enabledHarnesses.includes(agentModel.harness);
  const canConfirm = trimmed.length > 0 && harnessOk && !busy;

  return (
    <ModalPortal>
      <div
        className="modal-overlay coding-project-modal-overlay"
        role="presentation"
        data-testid="coding-add-project-modal"
        onClick={() => {
          if (!busy) onClose();
        }}
      >
        <div
          className="modal-panel coding-project-modal coding-job-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="coding-project-modal-title"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="modal-header">
            <h2 id="coding-project-modal-title">{title}</h2>
            <button
              type="button"
              className="modal-close"
              onClick={onClose}
              disabled={busy}
              aria-label={t("common.close", "Close")}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <p className="modal-desc coding-project-modal__desc">{description}</p>

          <div className="coding-job-modal__body">
            <div className="coding-project-modal__picker-wrap">
              <label className="modal-field coding-project-modal__field">
                {t("pi.projectPathLabel", "Project folder")}
                <HomeFolderPicker
                  value={trimmed || undefined}
                  onChange={(path) => onChange(path ?? "")}
                  title={pickerTitle ?? title}
                  disabled={busy}
                />
              </label>
              {trimmed ? (
                <p className="coding-project-modal__path-hint" title={trimmed}>
                  {trimmed}
                </p>
              ) : null}
            </div>

            <CodingAgentModelProviderFields
              value={agentModel}
              onChange={setAgentModel}
              busy={busy}
              scope="project"
              fallbackKind="coding-defaults"
              fallbackModelHint={codingDefaultsModelHint}
              harnessProbe={harnessProbe}
              enabledHarnesses={enabledHarnesses}
              modelProviders={modelProviders}
            />
          </div>

          {error ? (
            <p className="modal-error coding-project-modal__error" role="alert">
              {error}
            </p>
          ) : null}

          <div className="modal-actions coding-project-modal__actions">
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={onClose}
            >
              {t("common.cancel", "Cancel")}
            </button>
            <button
              type="button"
              className="primary"
              disabled={!canConfirm}
              data-testid="coding-add-project-confirm"
              onClick={() => {
                if (!canConfirm) return;
                onConfirm({
                  path: trimmed,
                  harness: agentModel.harness,
                  model: agentModel.model,
                  providerKind: agentModel.providerKind,
                  endpoint: agentModel.endpoint,
                  apiKey: agentModel.apiKey,
                });
              }}
            >
              {busy ? (busyLabel ?? "…") : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
