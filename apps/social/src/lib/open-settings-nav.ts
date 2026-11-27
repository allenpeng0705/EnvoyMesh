/**
 * Deep-link → Settings (optionally a tab + scroll target).
 */

export const OPEN_SETTINGS_EVENT = "envoymesh:open-settings";

export type OpenSettingsDetail = {
  /** Settings rail tab id (account | app | ai | …). */
  tab?: string;
  /** Optional `[data-testid]` to scroll into view after the tab mounts. */
  focusTestId?: string;
  /** When true, Coding closes open task/project/defaults pickers. */
  closeCodingPickers?: boolean;
};

export function openSettings(detail: OpenSettingsDetail = {}): void {
  window.dispatchEvent(
    new CustomEvent<OpenSettingsDetail>(OPEN_SETTINGS_EVENT, { detail }),
  );
}

/** Coding task pickers → Settings → AI → Coding tools. */
export function openCodingToolsSettings(): void {
  openSettings({
    tab: "ai",
    focusTestId: "settings-coding-agents",
    closeCodingPickers: true,
  });
}
