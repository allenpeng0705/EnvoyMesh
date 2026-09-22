/**
 * New task sheet — project + agent + model + optional compatible provider.
 */
import { useEffect, useState } from "react";
import {
  type CodingHarnessId,
  type ModelProviderConfig,
} from "@envoymesh/api";
import { useT } from "../context/I18nContext.js";
import type {
  CodingProject,
  CodingProviderKind,
  CodingTaskPrefill,
} from "../lib/coding-projects.js";
import {
  normalizeCodingProjectPath,
  resolveCodingTaskPrefill,
} from "../lib/coding-projects.js";
import {
  CodingAgentModelProviderFields,
  type CodingAgentModelProviderValue,
} from "./CodingAgentModelProviderFields.js";
import { codingPrefillToValue, snapCodingAgentToReady } from "../lib/coding-agent-model-provider.js";
import { ModalPortal } from "./ModalPortal.js";

export type { CodingHarnessId };

// Declared in the lib and re-exported: this file uses the type as well as lending it to its own
// consumers, and a second declaration is exactly what drifted from the lib's.
import type { HarnessProbeBadge } from "../lib/coding-harness-probe.js";
export type { HarnessProbeBadge };

/** Selected project for a new task, matching a stored path or its normalized form. */
function projectForNewTask(
  projects: CodingProject[],
  initialProjectPath: string,
): { path: string; project: CodingProject | undefined } {
  const preferred = initialProjectPath.trim();
  const normalized = normalizeCodingProjectPath(preferred);
  const project = projects.find(
    (p) =>
      p.path === preferred ||
      p.path === normalized ||
      (normalized.length > 0 &&
        normalizeCodingProjectPath(p.path) === normalized),
  );
  if (project) return { path: project.path, project };
  const fallback = projects[0];
  return { path: fallback?.path ?? "", project: fallback };
}

function agentForNewTask(
  project: CodingProject | undefined,
  enabledHarnesses: readonly CodingHarnessId[],
  fallback?: CodingTaskPrefill,
): CodingAgentModelProviderValue {
  const prefill = project
    ? resolveCodingTaskPrefill({ project })
    : (fallback ?? resolveCodingTaskPrefill({}));
  const next = codingPrefillToValue(prefill);
  const harness = enabledHarnesses.includes(next.harness)
    ? next.harness
    : (enabledHarnesses[0] ?? next.harness);
  return { ...next, harness };
}

export type CodingNewSessionConfirm = {
  harness: CodingHarnessId;
  cwd: string;
  model: string;
  providerKind: CodingProviderKind | "";
  endpoint: string;
  apiKey: string;
};

export type CodingNewSessionSheetProps = {
  open: boolean;
  projects: CodingProject[];
  initialProjectPath?: string;
  initialPrefill?: CodingTaskPrefill;
  busy?: boolean;
  error?: string | null;
  enabledHarnesses?: readonly CodingHarnessId[];
  harnessProbe?: Partial<Record<CodingHarnessId, HarnessProbeBadge>>;
  onClose: () => void;
  onConfirm: (opts: CodingNewSessionConfirm) => void;
  onAddProject: () => void;
  /** Current Coding defaults model for Envoy/Pi empty hints. */
  codingDefaultsModelHint?: string;
  /** Settings → AI provider, for the Envoy Harness / Pi model list. */
  modelProviders?: ModelProviderConfig | null;
};

export function CodingNewSessionSheet({
  open,
  projects,
  initialProjectPath = "",
  initialPrefill,
  busy = false,
  error = null,
  enabledHarnesses = [],
  harnessProbe = {},
  onClose,
  onConfirm,
  onAddProject,
  codingDefaultsModelHint = "",
  modelProviders = null,
}: CodingNewSessionSheetProps) {
  const t = useT();
  const opened = projectForNewTask(projects, initialProjectPath);
  const [projectPath, setProjectPath] = useState(opened.path);
  const [agentModel, setAgentModel] = useState<CodingAgentModelProviderValue>(
    () => agentForNewTask(opened.project, enabledHarnesses, initialPrefill),
  );

  useEffect(() => {
    setAgentModel((prev) => snapCodingAgentToReady(prev, enabledHarnesses));
  }, [enabledHarnesses]);

  if (!open) return null;

  const hasProjects = projects.length > 0;
  const trimmed = projectPath.trim();
  const harnessOk = enabledHarnesses.includes(agentModel.harness);
  const canConfirm = hasProjects && trimmed.length > 0 && harnessOk && !busy;
  const selected = projects.find((p) => p.path === trimmed);

  const resetAndClose = () => {
    if (busy) return;
    onClose();
  };

  return (
    <ModalPortal>
      <div
        className="modal-overlay coding-project-modal-overlay"
        role="presentation"
        onClick={resetAndClose}
      >
        <div
          className="modal-panel coding-project-modal coding-new-session-sheet"
          role="dialog"
          aria-modal="true"
          aria-labelledby="coding-new-session-title"
          data-testid="coding-new-session-sheet"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="modal-header">
            <h2 id="coding-new-session-title">
              {t("codingView.newSessionTitle", "New task")}
            </h2>
            <button
              type="button"
              className="modal-close"
              onClick={resetAndClose}
              disabled={busy}
              aria-label={t("common.close", "Close")}
            >
              ×
            </button>
          </div>

          <p className="modal-desc coding-project-modal__desc">
            {t(
              "codingView.newSessionDesc",
              "Choose a project, agent, and model. Task choices override the project defaults.",
            )}
          </p>

          {hasProjects ? (
            <label className="modal-field coding-project-modal__field">
              {t("codingView.projectLabel", "Project")}
              <select
                value={trimmed}
                disabled={busy}
                onChange={(e) => {
                  const nextPath = e.target.value;
                  setProjectPath(nextPath);
                  const nextProject = projects.find((p) => p.path === nextPath);
                  setAgentModel(
                    agentForNewTask(nextProject, enabledHarnesses),
                  );
                }}
                data-testid="coding-new-task-project"
              >
                {projects.map((p) => (
                  <option key={p.path} value={p.path}>
                    {p.label}
                  </option>
                ))}
              </select>
              {selected ? (
                <p
                  className="coding-project-modal__path-hint"
                  title={selected.path}
                >
                  {selected.path}
                </p>
              ) : null}
            </label>
          ) : (
            <div
              className="coding-pane-empty"
              data-testid="coding-new-task-no-projects"
            >
              <p>
                {t(
                  "codingView.needProjectFirst",
                  "Add a project first, then create a task under it.",
                )}
              </p>
            </div>
          )}

          <CodingAgentModelProviderFields
            value={agentModel}
            onChange={setAgentModel}
            busy={busy}
            disabled={!hasProjects}
            harnessAsRadios
            enabledHarnesses={enabledHarnesses}
            harnessProbe={harnessProbe}
            scope="task"
            fallbackKind="coding-defaults"
            fallbackModelHint={codingDefaultsModelHint}
            modelProviders={modelProviders}
          />

          <p className="coding-project-modal__path-hint">
            {t(
              "codingView.isolationLocalHint",
              "Isolation: Local (this project folder). Worktrees come later.",
            )}
          </p>

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
              onClick={() => {
                if (busy) return;
                onClose();
                onAddProject();
              }}
              data-testid="coding-new-task-add-project"
            >
              {t("codingView.addProjectCta", "Add project")}
            </button>
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={resetAndClose}
            >
              {t("common.cancel", "Cancel")}
            </button>
            <button
              type="button"
              className="primary"
              disabled={!canConfirm}
              data-testid="coding-new-session-confirm"
              onClick={() =>
                onConfirm({
                  harness: agentModel.harness,
                  cwd: trimmed,
                  model: agentModel.model.trim(),
                  providerKind: agentModel.providerKind,
                  endpoint: agentModel.endpoint.trim(),
                  apiKey: agentModel.apiKey.trim(),
                })
              }
            >
              {busy
                ? t("eh.openingChat", "Opening…")
                : t("codingView.startSession", "Start task")}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
