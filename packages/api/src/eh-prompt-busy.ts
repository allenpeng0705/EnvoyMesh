/** Envoy Harness turn in flight (LLM + tools + user questions). */

export interface EhPromptBusyEvent {
  busy: boolean;
  /** When set, busy state applies to this chat thread only. */
  chatId?: string;
}
