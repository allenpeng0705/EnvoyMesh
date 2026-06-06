import { TERMINAL_NESTED_MULTIPLEXER_TIP_KEY } from "./storage.js";

const NESTED_MULTIPLEXER_RE = /\b(tmux|tmuxai)\b/i;

export function isNestedMultiplexerTipDismissed(): boolean {
  try {
    return localStorage.getItem(TERMINAL_NESTED_MULTIPLEXER_TIP_KEY) === "1";
  } catch {
    return false;
  }
}

export function shouldShowNestedMultiplexerTip(data: string): boolean {
  if (isNestedMultiplexerTipDismissed()) return false;
  return NESTED_MULTIPLEXER_RE.test(data);
}

export function dismissNestedMultiplexerTip(): void {
  try {
    localStorage.setItem(TERMINAL_NESTED_MULTIPLEXER_TIP_KEY, "1");
  } catch {
    //
  }
}
