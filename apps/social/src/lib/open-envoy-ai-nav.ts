/**
 * Navigate to EnvoyAI chat thread (Chat → EnvoyAI), with optional composer prefill.
 */
export const OPEN_ENVOY_AI_EVENT = "envoymesh:open-envoy-ai";

export interface OpenEnvoyAiDetail {
  /** Prefill EnvoyAI composer when the panel becomes active. */
  draftHint?: string;
}

let pendingDraftHint: string | null = null;

/** Consume one-shot composer prefill (clears after read). */
export function takeEnvoyAiDraftHint(): string | null {
  const next = pendingDraftHint;
  pendingDraftHint = null;
  return next;
}

/** Peek without clearing (tests). */
export function peekEnvoyAiDraftHint(): string | null {
  return pendingDraftHint;
}

export function openEnvoyAi(detail?: OpenEnvoyAiDetail): void {
  const hint = detail?.draftHint?.trim();
  pendingDraftHint = hint && hint.length > 0 ? hint : null;
  window.dispatchEvent(
    new CustomEvent<OpenEnvoyAiDetail>(OPEN_ENVOY_AI_EVENT, {
      detail: detail ?? {},
    }),
  );
}
