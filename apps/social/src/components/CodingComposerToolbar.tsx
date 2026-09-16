/**
 * Shared Coding composer toolbar — model, Ask/Plan/Code, Fast, Think, Import.
 */

import { useMemo } from "react";
import type { CodingHarnessId } from "@envoymesh/api";
import { useT } from "../context/I18nContext.js";
import {
  codingComposerCapabilities,
  type CodingThinkingEffort,
  type CodingWorkingMode,
} from "../lib/coding-composer-capabilities.js";
import type { CodingComposerPrefs } from "../lib/coding-composer-state.js";

export type CodingComposerToolbarProps = {
  harness: CodingHarnessId;
  prefs: CodingComposerPrefs;
  onPrefsChange: (patch: Partial<CodingComposerPrefs>) => void;
  /** Suggested model ids for the datalist. */
  modelSuggestions?: readonly string[];
  busy?: boolean;
  disabled?: boolean;
  onImportSession?: () => void;
  /** When Fast is toggled, parent may send `/fast on|off` once. */
  onFastToggle?: (enabled: boolean) => void;
};

export function CodingComposerToolbar({
  harness,
  prefs,
  onPrefsChange,
  modelSuggestions = [],
  busy = false,
  disabled = false,
  onImportSession,
  onFastToggle,
}: CodingComposerToolbarProps) {
  const t = useT();
  const caps = useMemo(() => codingComposerCapabilities(harness), [harness]);
  const locked = busy || disabled;
  const datalistId = `coding-composer-models-${harness}`;

  const showAnything =
    caps.model ||
    caps.workingMode ||
    caps.fast ||
    caps.thinking ||
    caps.importSession;

  if (!showAnything) return null;

  return (
    <div
      className="coding-composer-toolbar"
      data-testid="coding-composer-toolbar"
      role="toolbar"
      aria-label={t("codingView.composerToolbarAria", "Coding composer options")}
    >
      {caps.model ? (
        <label className="coding-composer-toolbar__field">
          <span className="coding-composer-toolbar__label">
            {t("codingView.modelLabel", "Model")}
          </span>
          <input
            type="text"
            list={datalistId}
            className="coding-composer-toolbar__model"
            value={prefs.model ?? ""}
            disabled={locked}
            placeholder={t(
              "codingView.composerModelPlaceholder",
              "Default model",
            )}
            data-testid="coding-composer-model"
            onChange={(e) => onPrefsChange({ model: e.target.value })}
          />
          {modelSuggestions.length > 0 ? (
            <datalist id={datalistId}>
              {modelSuggestions.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          ) : null}
        </label>
      ) : null}

      {caps.workingMode ? (
        <div
          className="coding-composer-toolbar__modes"
          role="group"
          aria-label={t("codingView.workingModeAria", "Working mode")}
        >
          {(
            [
              ["ask", t("codingView.modeAsk", "Ask")],
              ["plan", t("codingView.modePlan", "Plan")],
              ["code", t("codingView.modeCode", "Code")],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`coding-composer-mode-btn${
                prefs.mode === id ? " coding-composer-mode-btn--active" : ""
              }`}
              disabled={locked}
              aria-pressed={prefs.mode === id}
              data-testid={`coding-composer-mode-${id}`}
              onClick={() =>
                onPrefsChange({ mode: id as CodingWorkingMode })
              }
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}

      {caps.fast ? (
        <button
          type="button"
          className={`coding-composer-chip${
            prefs.fast ? " coding-composer-chip--on" : ""
          }`}
          disabled={locked}
          aria-pressed={prefs.fast}
          data-testid="coding-composer-fast"
          onClick={() => {
            const next = !prefs.fast;
            onPrefsChange({ fast: next });
            onFastToggle?.(next);
          }}
        >
          {t("codingView.modeFast", "Fast")}
        </button>
      ) : null}

      {caps.thinking ? (
        <label className="coding-composer-toolbar__field">
          <span className="coding-composer-toolbar__label">
            {t("codingView.modeThinking", "Think")}
          </span>
          <select
            className="coding-composer-toolbar__think"
            value={prefs.thinking}
            disabled={locked}
            data-testid="coding-composer-thinking"
            onChange={(e) =>
              onPrefsChange({
                thinking: e.target.value as CodingThinkingEffort,
              })
            }
          >
            <option value="off">
              {t("codingView.thinkingOff", "Off")}
            </option>
            <option value="low">{t("codingView.thinkingLow", "Low")}</option>
            <option value="medium">
              {t("codingView.thinkingMedium", "Medium")}
            </option>
            <option value="high">
              {t("codingView.thinkingHigh", "High")}
            </option>
          </select>
        </label>
      ) : null}

      {caps.importSession && onImportSession ? (
        <button
          type="button"
          className="coding-composer-chip coding-composer-chip--ghost"
          disabled={locked}
          data-testid="coding-composer-import"
          onClick={onImportSession}
        >
          {t("codingView.importSession", "Import session")}
        </button>
      ) : null}
    </div>
  );
}
