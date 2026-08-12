/**
 * Project-folder picker — same UX as Pi:
 * - Tauri desktop: read-only field + Browse → native OS folder dialog
 * - Social (browser): editable absolute-path input (path is on the home node)
 */
import React, { useCallback, useEffect, useState } from "react";
import { isTauriShell, pickTauriDirectory } from "../lib/tauri-shell.js";
import { useT } from "../context/I18nContext.js";

export interface HomeFolderPickerProps {
  value?: string;
  onChange: (path: string | undefined) => void;
  /** Title for the native Tauri folder dialog. */
  title?: string;
  disabled?: boolean;
  /** Optional class on the field wrapper. */
  className?: string;
}

export function HomeFolderPicker({
  value,
  onChange,
  title,
  disabled,
  className,
}: HomeFolderPickerProps) {
  const t = useT();
  const tauriShell = isTauriShell();
  const [browsing, setBrowsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState(value ?? "");

  useEffect(() => {
    setDraft(value ?? "");
  }, [value]);

  const pickLabel = t("settings.ai.aiEngine.browseFolder", "Browse…");
  const clearLabel = t("settings.ai.aiEngine.clearFolder", "Clear");
  const applyLabel = t("settings.ai.aiEngine.applyFolder", "Set");
  const pickerTitle =
    title ?? t("settings.ai.aiEngine.projectFolderTitle", "Choose project folder");

  const commitDraft = useCallback(() => {
    if (disabled) return;
    const next = draft.trim();
    const prev = (value ?? "").trim();
    if (next === prev) return;
    onChange(next ? next : undefined);
  }, [disabled, draft, onChange, value]);

  const handleBrowse = useCallback(async () => {
    if (disabled || !tauriShell) return;
    setError(null);
    setBrowsing(true);
    try {
      const picked = await pickTauriDirectory({
        title: pickerTitle,
        defaultPath: value?.trim() || undefined,
      });
      if (!picked.ok) {
        setError(picked.error);
        return;
      }
      if (picked.path) onChange(picked.path);
    } finally {
      setBrowsing(false);
    }
  }, [disabled, onChange, pickerTitle, tauriShell, value]);

  return (
    <div className={className ?? "home-folder-picker"}>
      <div className="home-folder-picker-row">
        {tauriShell ? (
          <>
            <input
              type="text"
              className="agent-field-input agent-field-input--mono"
              value={value ?? ""}
              readOnly
              placeholder={t(
                "settings.ai.aiEngine.projectFolderPlaceholder",
                "No folder selected",
              )}
              aria-label={t("settings.ai.aiEngine.projectFolder", "Project folder")}
              disabled={disabled}
            />
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => void handleBrowse()}
              disabled={disabled || browsing}
            >
              {browsing
                ? t("settings.ai.aiEngine.browsingFolder", "Browsing…")
                : pickLabel}
            </button>
          </>
        ) : (
          <>
            <input
              type="text"
              className="agent-field-input agent-field-input--mono"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => commitDraft()}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitDraft();
                }
              }}
              placeholder={t(
                "settings.ai.aiEngine.projectFolderPathPlaceholder",
                "/absolute/path/on/home/node",
              )}
              aria-label={t("settings.ai.aiEngine.projectFolder", "Project folder")}
              disabled={disabled}
            />
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => commitDraft()}
              disabled={
                disabled || draft.trim() === (value ?? "").trim()
              }
            >
              {applyLabel}
            </button>
          </>
        )}
        {value ? (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setDraft("");
              onChange(undefined);
            }}
            disabled={disabled}
          >
            {clearLabel}
          </button>
        ) : null}
      </div>
      {error ? <p className="home-folder-picker-error">{error}</p> : null}
    </div>
  );
}
