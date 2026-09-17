/**
 * Classify whether a Pi tool proposal should prompt under autoRunPolicy.
 * Used when Pi emits extension_ui_request (no structured tool name).
 */

export type PiCodingAutoRunPolicy =
  | "always-confirm"
  | "safe-only"
  | "off"
  | "never"
  | string
  | undefined;

const SAFE_HINT =
  /\b(read|list|search|find|grep|glob|cat|ls|stat|show|view|inspect|get|look)\b/i;
const UNSAFE_HINT =
  /\b(write|edit|create|delete|remove|rm\b|mv\b|chmod|sudo|install|run|exec|bash|shell|overwrite|patch|apply|mkdir|touch)\b/i;

/**
 * Returns true when the host should show the proposal dock / ask the user.
 */
export function shouldAskPiProposal(
  title: string,
  message: string,
  policy: PiCodingAutoRunPolicy,
): boolean {
  if (policy === "off" || policy === "never") return false;
  if (policy === "always-confirm" || !policy) return true;
  // safe-only
  const blob = `${title}\n${message}`;
  if (UNSAFE_HINT.test(blob)) return true;
  if (SAFE_HINT.test(blob)) return false;
  // Unknown → ask (safer than silent allow).
  return true;
}
