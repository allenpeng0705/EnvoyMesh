/**
 * Agent and model for one existing task.
 * Saving does not change the project default or any other task.
 */
import { useEffect, useState } from "react";
import type { CodingHarnessId, ModelProviderConfig } from "@envoymesh/api";
import type { HarnessProbeBadge } from "../lib/coding-harness-probe.js";
import type { CodingAgentModelProviderValue } from "../lib/coding-agent-model-provider.js";
import { useT } from "../context/I18nContext.js";
import {
  CodingAgentModelProviderFields,
} from "./CodingAgentModelProviderFields.js";
import { ModalPortal } from "./ModalPortal.js";

export type CodingTaskAgentModalProps = {
  taskTitle: string;
  value: CodingAgentModelProviderValue;
  busy?: boolean;
  error?: string | null;
  codingDefaultsModelHint?: string;
  modelProviders?: ModelProviderConfig | null;
  /** Ready agents only — Settings lists the rest for install. */
  enabledHarnesses?: readonly CodingHarnessId[];
  harnessProbe?: Partial<
    Record<CodingAgentModelProviderValue["harness"], HarnessProbeBadge>
  >;
  onCancel: () => void;
  onSave: (next: CodingAgentModelProviderValue) => void;
};

export function CodingTaskAgentModal({
  taskTitle,
  value,
  busy = false,
  error = null,
  codingDefaultsModelHint = "",
  modelProviders = null,
  enabledHarnesses,
  harnessProbe = {},
  onCancel,
  onSave,
}: CodingTaskAgentModalProps) {
  const t = useT();
  const [agent, setAgent] = useState(value);

  useEffect(() => {
    setAgent(value);
  }, [value]);

  const dirty =
    agent.harness !== value.harness ||
    agent.model.trim() !== value.model.trim() ||
    agent.providerKind !== value.providerKind ||
    agent.endpoint.trim() !== value.endpoint.trim() ||
    agent.apiKey.trim() !== value.apiKey.trim();
  const switching = agent.harness !== value.harness;

  return (
    <ModalPortal>
      <div
        className="modal-overlay coding-job-modal-overlay"
        role="presentation"
        data-testid="coding-task-agent-settings"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget && !busy) onCancel();
        }}
      >
        <section
          className="modal-panel coding-job-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="coding-task-agent-title"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <header className="modal-header">
            <h2 id="coding-task-agent-title">
              {t("codingView.taskAgentTitle", "Agent settings")}
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
              "codingView.taskAgentDesc",
              "This task only. Other tasks keep their agent. The project default is used only when you create a new task.",
            )}
          </p>
          <div className="coding-job-modal__body">
            <p
              className="coding-job-modal__path-hint"
              data-testid="coding-task-agent-task"
            >
              {taskTitle}
            </p>
            <CodingAgentModelProviderFields
              scope="task"
              value={agent}
              onChange={setAgent}
              busy={busy}
              fallbackModelHint={codingDefaultsModelHint}
              modelProviders={modelProviders}
              enabledHarnesses={enabledHarnesses}
              harnessProbe={harnessProbe}
            />
            {switching ? (
              <p className="coding-job-modal__hint">
                {t(
                  "codingView.taskAgentSwitchHint",
                  "Switching the agent starts this task over with the new agent. Earlier messages stay with the previous one.",
                )}
              </p>
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
              disabled={busy || !dirty}
              data-testid="coding-task-agent-save"
              onClick={() => {
                if (busy || !dirty) return;
                onSave(agent);
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
