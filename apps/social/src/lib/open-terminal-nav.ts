/** Deep-link / Chat π → Terminal view (shell) or Coding (Pi). */

import { openCoding } from "./open-coding-nav.js";

export const OPEN_TERMINAL_EVENT = "envoymesh:open-terminal";

export type OpenTerminalDetail = {
  /**
   * @deprecated Prefer `openCoding({ harness: "pi" })`.
   * Still accepted: redirects to Coding.
   */
  startPi?: boolean;
  /** Always pick a project folder when starting Pi via Coding. */
  startNew?: boolean;
};

let pending: OpenTerminalDetail | null = null;

export function takePendingTerminalOpen(): OpenTerminalDetail | null {
  const next = pending;
  pending = null;
  return next;
}

export function openTerminal(detail: OpenTerminalDetail = {}): void {
  if (detail.startPi) {
    openCoding({
      harness: "pi",
      startNew: detail.startNew !== false,
    });
    return;
  }
  pending = detail;
  window.dispatchEvent(
    new CustomEvent<OpenTerminalDetail>(OPEN_TERMINAL_EVENT, { detail }),
  );
}
