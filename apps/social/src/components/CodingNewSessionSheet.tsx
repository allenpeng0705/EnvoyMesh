/**
 * New workspace sheet — project + agent + model + optional compatible provider.
 */
import { useEffect, useState } from "react";
import {
  CODING_ALL_HARNESSES,
  type CodingHarnessId,
} from "@envoymesh/api";
import { useT } from "../context/I18nContext.js";
import type {
  CodingProject,
  CodingProviderKind,
  CodingWorkspacePrefill,
} from "../lib/coding-projects.js";
import { resolveCodingWorkspacePrefill } from "../lib/coding-projects.js";
import {
  CodingAgentModelProviderFields,
  codingPrefillToValue,
  type CodingAgentModelProviderValue,
} from "./CodingAgentModelProviderFields.js";
import { ModalPortal } from "./ModalPortal.js";

export type { CodingHarnessId };

export type HarnessProbeBadge = "ready" | "install" | "unknown" | "checking";

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
  initialPrefill?: CodingWorkspacePrefill;
  busy?: boolean;
  error?: string | null;
  enabledHarnesses?: readonly CodingHarnessId[];
  harnessProbe?: Partial<Record<CodingHarnessId, HarnessProbeBadge>>;
  onClose: () => void;
  onConfirm: (opts: CodingNewSessionConfirm) => void;
  onAddProject: () => void;
  /** Current Settings → AI model for Envoy/Pi default hints. */
  settingsAiModelHint?: string;
};

export function CodingNewSessionSheet({
  open,
  projects,
  initialProjectPath = "",
  initialPrefill,
  busy = false,
  error = null,
  enabledHarnesses = CODING_ALL_HARNESSES,
  harnessProbe = {},
  onClose,
  onConfirm,
  onAddProject,
  settingsAiModelHint = "",
}: CodingNewSessionSheetProps) {
  const t = useT();
  const [projectPath, setProjectPath] = useState(initialProjectPath);
  const [agentModel, setAgentModel] = useState<CodingAgentModelProviderValue>(
    () =>
      codingPrefillToValue(
        initialPrefill ?? resolveCodingWorkspacePrefill({}),
      ),
  );

  useEffect(() => {
    if (!open) return;
    const preferred = initialProjectPath.trim();
    if (preferred && projects.some((p) => p.path === preferred)) {
      setProjectPath(preferred);
      return;
    }
    setProjectPath(projects[0]?.path ?? "");
  }, [open, initialProjectPath, projects]);

  useEffect(() => {
    if (!open) return;
    const next = codingPrefillToValue(
      initialPrefill ?? resolveCodingWorkspacePrefill({}),
    );
    const harness = enabledHarnesses.includes(next.harness)
      ? next.harness
      : (enabledHarnesses[0] ?? next.harness);
    const resolved = { ...next, harness };
    setAgentModel((prev) => {
      if (
        prev.harness === resolved.harness &&
        prev.model === resolved.model &&
        prev.providerKind === resolved.providerKind &&
        prev.endpoint === resolved.endpoint &&
        prev.apiKey === resolved.apiKey
      ) {
        return prev;
      }
      return resolved;
    });
  }, [open, initialPrefill, enabledHarnesses]);

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
              {t("codingView.newSessionTitle", "New workspace")}
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
              "Choose a project, agent, and model. Workspace choices override the project defaults.",
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
                    codingPrefillToValue(
                      resolveCodingWorkspacePrefill({
                        project: nextProject,
                        lastUsed: initialPrefill,
                      }),
                    ),
                  );
                }}
                data-testid="coding-new-workspace-project"
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
              data-testid="coding-new-workspace-no-projects"
            >
              <p>
                {t(
                  "codingView.needProjectFirst",
                  "Add a project first, then create a workspace under it.",
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
            scope="workspace"
            settingsAiModelHint={settingsAiModelHint}
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
              data-testid="coding-new-workspace-add-project"
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
                : t("codingView.startSession", "Start workspace")}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
