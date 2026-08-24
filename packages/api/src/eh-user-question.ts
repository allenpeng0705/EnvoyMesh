/**
 * Envoy Harness interactive ask / plan-review event types.
 */

export interface EhUserQuestionEvent {
  requestId: string;
  prompt: string;
  options?: string[];
  recommendedIndex?: number;
  multiline?: boolean;
  timeoutMs: number;
  kind?: "ask" | "plan-review" | "mode-switch";
  /** Sidebar chat thread that owns this question. */
  chatId?: string;
}

export interface EhRespondToUserQuestionParams {
  requestId: string;
  /** Chosen option text, or free-form answer. */
  value: string;
  /** 0-based option index when picking from `options`. */
  optionIndex?: number;
  cancelled?: boolean;
}

export interface EhRespondToUserQuestionResult {
  requestId: string;
  delivered: boolean;
}
