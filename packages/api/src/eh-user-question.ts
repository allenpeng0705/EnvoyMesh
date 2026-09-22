/**
 * Envoy Harness interactive ask / plan-review event types.
 *
 * Coding catalog ACP uses the same card shape on `coding:user_question`,
 * answered by `codingRespondToUserQuestion`.
 */

export interface EhUserQuestionEvent {
  requestId: string;
  prompt: string;
  options?: string[];
  recommendedIndex?: number;
  /** When true, the user may pick more than one option. */
  multiple?: boolean;
  multiline?: boolean;
  timeoutMs: number;
  kind?: "ask" | "plan-review" | "mode-switch";
  /** Sidebar chat thread that owns this question (Envoy Harness). */
  chatId?: string;
  turnId?: string;
  /** Coding session that owns this question (catalog ACP). */
  sessionId?: string;
}

/** A Coding session's ask_user card. Same fields as {@link EhUserQuestionEvent}. */
export type CodingUserQuestionEvent = EhUserQuestionEvent;

export interface EhRespondToUserQuestionParams {
  requestId: string;
  /** Chosen option text, or free-form answer. */
  value: string;
  /** 0-based option index when picking one option. */
  optionIndex?: number;
  /** Every 0-based index picked when `multiple` is set. */
  optionIndexes?: number[];
  cancelled?: boolean;
}

export interface EhRespondToUserQuestionResult {
  requestId: string;
  delivered: boolean;
}

/** Answer a Coding session's `coding:user_question` card. */
export type CodingRespondToUserQuestionParams = EhRespondToUserQuestionParams;
export type CodingRespondToUserQuestionResult = EhRespondToUserQuestionResult;
