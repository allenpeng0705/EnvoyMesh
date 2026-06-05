/** Thread key for EnvoyAI (Human→Assistant) chat in `chat-messages.jsonl`. */
export const ENVOY_AI_THREAD_KEY = "__envoy_ai__";

export function isEnvoyAiThreadKey(threadKey: string | null | undefined): boolean {
  return threadKey?.trim() === ENVOY_AI_THREAD_KEY;
}
