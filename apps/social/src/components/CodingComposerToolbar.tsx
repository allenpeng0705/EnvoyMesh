/**
 * Shared Coding composer toolbar — model, Mode, Permissions, Fast, Think, Import.
 *
 * It renders **under the field** (the row the reference product puts there: the field, then what
 * the message will do), and every control in it describes the *next* turn, which is what decides
 * which of them stay usable while one is running (see `valueLocked` / `actionLocked` below).
 */

import { useMemo } from "react";
import type { CodingHarnessId } from "@envoymesh/api";
import { BoltIcon } from "../icons.js";
import { useT } from "../context/I18nContext.js";
import {
  codingComposerCapabilities,
  type CodingPermissionPolicy,
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
  /** When Permissions change for EH / Pi / gated agents. */
  onPermissionPolicyChange?: (policy: CodingPermissionPolicy) => void;
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
  onPermissionPolicyChange,
}: CodingComposerToolbarProps) {
  const t = useT();
  const caps = useMemo(() => codingComposerCapabilities(harness), [harness]);
  /**
   * Two locks, because the controls do two different things.
   *
   * `valueLocked` covers the **choices the next run reads** (model, mode, permissions, thinking):
   * they are a description of what happens next, not an interruption of what is happening, so a
   * running turn must not grey them out — the reference product's row stays live for exactly
   * this reason. `actionLocked` covers the controls that **act now** — Fast sends `/fast on|off`
   * as a message, Import replaces the session — and those must not fire mid-turn.
   */
  const valueLocked = disabled;
  const actionLocked = busy || disabled;
  const datalistId = `coding-composer-models-${harness}`;

  const showAnything =
    caps.model ||
    caps.workingMode ||
    caps.agentModes.length > 0 ||
    caps.permissions ||
    caps.fast ||
    caps.thinking ||
    caps.importSession;

  if (!showAnything) return null;

  const permissionValue =
    caps.permissionAskDisabledReason &&
    prefs.permissionPolicy === "always-confirm"
      ? "safe-only"
      : (prefs.permissionPolicy ?? "safe-only");

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
            disabled={valueLocked}
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

      {caps.agentModes.length > 0 ? (
        <label className="coding-composer-toolbar__field">
          <span className="coding-composer-toolbar__label">
            {t("codingView.agentModeLabel", "Mode")}
          </span>
          <select
            className="coding-composer-toolbar__perms"
            value={
              prefs.agentModeId &&
              caps.agentModes.some((m) => m.id === prefs.agentModeId)
                ? prefs.agentModeId
                : (caps.agentModes[0]?.id ?? "")
            }
            disabled={valueLocked}
            title={
              caps.canSetMode
                ? undefined
                : t(
                    "codingView.agentModePromptOnly",
                    "Guides this turn’s prompt — native mode switching is not wired for this agent yet.",
                  )
            }
            data-testid="coding-composer-agent-mode"
            onChange={(e) => {
              const id = e.target.value;
              const opt = caps.agentModes.find((m) => m.id === id);
              onPrefsChange({
                agentModeId: id,
                ...(opt?.workingMode ? { mode: opt.workingMode } : {}),
              });
            }}
          >
            {caps.agentModes.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
      ) : caps.workingMode ? (
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
              disabled={valueLocked}
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

      {caps.permissions ? (
        <label className="coding-composer-toolbar__field">
          <span className="coding-composer-toolbar__label">
            {t("codingView.permissionsShort", "Perms")}
          </span>
          <select
            className="coding-composer-toolbar__perms"
            value={permissionValue}
            disabled={valueLocked}
            title={
              caps.permissionDisabledReason ||
              t(
                "codingView.permissionsTitle",
                "Safe default auto-runs read-only tools. Ask every time confirms each tool. Full access never prompts — only for tasks you fully trust.",
              )
            }
            data-testid="coding-composer-permissions"
            onChange={(e) => {
              const policy = e.target.value as CodingPermissionPolicy;
              if (
                policy === "off" &&
                caps.permissionFullDisabledReason
              ) {
                return;
              }
              if (
                policy === "always-confirm" &&
                caps.permissionAskDisabledReason
              ) {
                return;
              }
              onPrefsChange({ permissionPolicy: policy });
              onPermissionPolicyChange?.(policy);
            }}
          >
            <option value="safe-only">
              {t("codingView.permSafe", "Safe default")}
            </option>
            <option
              value="always-confirm"
              disabled={Boolean(caps.permissionAskDisabledReason)}
              title={caps.permissionAskDisabledReason}
            >
              {t("codingView.permAsk", "Ask every time")}
            </option>
            <option
              value="off"
              disabled={Boolean(caps.permissionFullDisabledReason)}
              title={caps.permissionFullDisabledReason}
            >
              {t("codingView.permFull", "Full access (no ask)")}
            </option>
          </select>
          {caps.permissionFullDisabledReason && permissionValue === "off" ? (
            <span className="coding-composer-toolbar__hint" role="note">
              {caps.permissionFullDisabledReason}
            </span>
          ) : null}
        </label>
      ) : caps.permissionDisabledReason ? (
        <span
          className="coding-composer-toolbar__hint"
          data-testid="coding-composer-permissions-disabled"
          title={caps.permissionDisabledReason}
        >
          {t("codingView.permissionsUnavailable", "Perms unavailable")}
        </span>
      ) : null}

      {caps.fast ? (
        <button
          type="button"
          className={`coding-composer-chip coding-composer-chip--icon${
            prefs.fast ? " coding-composer-chip--on" : ""
          }`}
          // **An action, so `actionLocked` and not `valueLocked`.** Fast is not a preference the
          // next run reads: it sends `/fast on|off` as its own message, so pressing it mid-turn
          // would inject a turn. The mode/model/thinking selects, by contrast, stay usable while
          // the agent works — they describe the next run, and freezing them is what makes a user
          // wait for a turn to end to change their mind.
          disabled={actionLocked}
          aria-pressed={prefs.fast}
          title={t("codingView.modeFast", "Fast")}
          aria-label={t("codingView.modeFast", "Fast")}
          data-testid="coding-composer-fast"
          onClick={() => {
            const next = !prefs.fast;
            onPrefsChange({ fast: next });
            onFastToggle?.(next);
          }}
        >
          <BoltIcon size={14} />
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
            disabled={valueLocked}
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
          disabled={actionLocked}
          data-testid="coding-composer-import"
          onClick={onImportSession}
        >
          {t("codingView.importSession", "Import session")}
        </button>
      ) : null}
    </div>
  );
}
