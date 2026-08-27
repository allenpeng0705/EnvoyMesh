/** Thread key for EnvoyAI (Human→Assistant) chat in `chat-messages.jsonl`. */
export const ENVOY_AI_THREAD_KEY = "__envoy_ai__";
/** U4+ — the dedicated Envoy (envoy-harness) chat thread. */
export const ENVOY_HARNESS_THREAD_KEY = "__envoy_harness__";

export function isEnvoyAiThreadKey(threadKey: string | null | undefined): boolean {
  const key = threadKey?.trim();
  if (!key) return false;
  return key === ENVOY_AI_THREAD_KEY || key.startsWith(`${ENVOY_AI_THREAD_KEY}:`);
}

/** Phase 51 — profile-scoped EnvoyAI thread (`__envoy_ai__:<profileId>`). */
export function envoyAiThreadKeyForProfile(profileId: string): string {
  const id = profileId.trim() || "owner";
  return `${ENVOY_AI_THREAD_KEY}:${id}`;
}

/** Extract profile id from a namespaced EnvoyAI key; null for legacy bare key. */
export function parseEnvoyAiProfileId(threadKey: string): string | null {
  const key = threadKey.trim();
  if (key === ENVOY_AI_THREAD_KEY) return null;
  if (!key.startsWith(`${ENVOY_AI_THREAD_KEY}:`)) return null;
  const id = key.slice(ENVOY_AI_THREAD_KEY.length + 1).trim();
  return id || null;
}
