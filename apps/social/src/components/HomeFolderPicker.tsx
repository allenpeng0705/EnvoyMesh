/**
 * Shared project-folder picker (Pi, Ext Agent, Obsidian vaults, …):
 * - Tauri desktop: read-only field + Browse → native OS folder dialog
 * - Social (browser): read-only field + Browse → home-node folder modal
 */
import React, { useCallback, useState } from "react";
import { isTauriShell, pickTauriDirectory } from "../lib/tauri-shell.js";
import { useT } from "../context/I18nContext.js";
import { HomeFolderBrowserModal } from "./HomeFolderBrowserModal.js";

export interface HomeFolderPickerProps {
  value?: string;
  onChange: (path: string | undefined) => void;
  /** Title for the native Tauri / home-node folder dialog. */
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
  const [webBrowserOpen, setWebBrowserOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pickLabel = t("settings.ai.aiEngine.browseFolder", "Browse…");
  const clearLabel = t("settings.ai.aiEngine.clearFolder", "Clear");
  const pickerTitle =
    title ?? t("settings.ai.aiEngine.projectFolderTitle", "Choose project folder");

  const handleBrowse = useCallback(async () => {
    if (disabled) return;
    setError(null);
    if (tauriShell) {
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
      return;
    }
    setWebBrowserOpen(true);
  }, [disabled, onChange, pickerTitle, tauriShell, value]);

  return (
    <div className={className ?? "home-folder-picker"}>
      <div className="home-folder-picker-row">
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
        {value ? (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => onChange(undefined)}
            disabled={disabled}
          >
            {clearLabel}
          </button>
        ) : null}
      </div>
      {error ? <p className="home-folder-picker-error">{error}</p> : null}
      {webBrowserOpen ? (
        <HomeFolderBrowserModal
          title={pickerTitle}
          initialPath={value?.trim() || undefined}
          onClose={() => setWebBrowserOpen(false)}
          onSelect={(path) => {
            setWebBrowserOpen(false);
            onChange(path);
          }}
        />
      ) : null}
    </div>
  );
}
