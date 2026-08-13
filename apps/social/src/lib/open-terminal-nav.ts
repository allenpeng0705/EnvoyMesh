/** Deep-link / Chat π → top Terminal view (optional Pi start). */

export const OPEN_TERMINAL_EVENT = "envoymesh:open-terminal";

export type OpenTerminalDetail = {
  /** Focus Terminal and start / show Pi. */
  startPi?: boolean;
  /** Always pick a project folder (header “π Pi” / empty CTA). */
  startNew?: boolean;
};

let pending: OpenTerminalDetail | null = null;

export function takePendingTerminalOpen(): OpenTerminalDetail | null {
  const next = pending;
  pending = null;
  return next;
}

export function openTerminal(detail: OpenTerminalDetail = {}): void {
  pending = detail;
  window.dispatchEvent(
    new CustomEvent<OpenTerminalDetail>(OPEN_TERMINAL_EVENT, { detail }),
  );
}
