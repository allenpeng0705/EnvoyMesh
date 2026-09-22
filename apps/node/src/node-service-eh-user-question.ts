/**
 * In-flight user-question waiter for Envoy Harness chat / terminal and
 * Coding catalog ACP (`ask_user`).
 *
 * Mirrors ToolPermissionBridge: emit → UI cards → respond RPC.
 * Event name defaults to `eh:user_question`; Coding uses `coding:user_question`.
 */

import { randomUUID } from "node:crypto";

import type {
  UserQuestionAnswer,
  UserQuestionRequest,
} from "@envoymesh/envoy-harness";

export interface EhUserQuestionEvent {
  requestId: string;
  prompt: string;
  options?: string[];
  recommendedIndex?: number;
  /** When true, the user may pick more than one option. */
  multiple?: boolean;
  multiline?: boolean;
  timeoutMs: number;
  /** Discriminator for plan review vs generic ask. */
  kind?: "ask" | "plan-review" | "mode-switch";
  chatId?: string;
  turnId?: string;
  /** Coding session id when the event is `coding:user_question`. */
  sessionId?: string;
}

export interface AcpUserQuestionBridgeEmit {
  (event: string, payload: EhUserQuestionEvent): void;
}

interface Pending {
  resolve: (answer: UserQuestionAnswer) => void;
  timer: ReturnType<typeof setTimeout>;
  chatId?: string;
  sessionId?: string;
}

const DEFAULT_TIMEOUT_MS = 120_000;

export class AcpUserQuestionBridge {
  readonly #pending = new Map<string, Pending>();
  readonly #emit: AcpUserQuestionBridgeEmit;
  readonly #timeoutMs: number;
  readonly #eventName: string;
  readonly #onResolved:
    | ((
        requestId: string,
        status: "answered" | "cancelled" | "expired",
        answer: string | undefined,
        chatId?: string,
      ) => void)
    | undefined;

  constructor(
    emit: AcpUserQuestionBridgeEmit,
    opts?: {
      timeoutMs?: number;
      /** Wire event this bridge emits. Default `eh:user_question`. */
      eventName?: string;
      onResolved?: (
        requestId: string,
        status: "answered" | "cancelled" | "expired",
        answer: string | undefined,
        chatId?: string,
      ) => void;
    },
  ) {
    this.#emit = emit;
    this.#timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.#eventName = opts?.eventName ?? "eh:user_question";
    this.#onResolved = opts?.onResolved;
  }

  /**
   * Block until the UI answers or timeout → cancelled.
   *
   * Second arg may be a chat id (legacy EH callers) or a scope object.
   */
  ask(
    req: UserQuestionRequest,
    chatIdOrScope?: string | { chatId?: string; sessionId?: string },
  ): Promise<UserQuestionAnswer> {
    const scope =
      typeof chatIdOrScope === "string"
        ? { chatId: chatIdOrScope }
        : (chatIdOrScope ?? {});
    const chatId = scope.chatId;
    const sessionId = scope.sessionId;
    const requestId = randomUUID();
    const kind = inferKind(req);
    return new Promise<UserQuestionAnswer>((resolve) => {
      const timer = setTimeout(() => {
        const entry = this.#pending.get(requestId);
        this.#pending.delete(requestId);
        this.#onResolved?.(requestId, "expired", undefined, entry?.chatId);
        resolve({
          value: "",
          cancelled: true,
          cancelledReason: "timeout",
        });
      }, this.#timeoutMs);

      this.#pending.set(requestId, {
        resolve,
        timer,
        ...(chatId ? { chatId } : {}),
        ...(sessionId ? { sessionId } : {}),
      });
      this.#emit(this.#eventName, {
        requestId,
        prompt: req.prompt,
        ...(req.options !== undefined ? { options: [...req.options] } : {}),
        ...(req.recommendedIndex !== undefined
          ? { recommendedIndex: req.recommendedIndex }
          : {}),
        ...(req.multiline !== undefined ? { multiline: req.multiline } : {}),
        ...(req.multiple === true ? { multiple: true } : {}),
        timeoutMs: this.#timeoutMs,
        ...(kind !== undefined ? { kind } : {}),
        ...(chatId ? { chatId } : {}),
        ...(sessionId ? { sessionId } : {}),
      });
    });
  }

  respond(
    requestId: string,
    answer: {
      value: string;
      optionIndex?: number;
      optionIndexes?: number[];
      cancelled?: boolean;
    },
  ): { delivered: boolean } {
    const entry = this.#pending.get(requestId);
    if (!entry) return { delivered: false };
    clearTimeout(entry.timer);
    this.#pending.delete(requestId);
    const optionIndexes = (answer.optionIndexes ?? []).filter(
      (index) => Number.isInteger(index) && index >= 0,
    );
    entry.resolve(
      answer.cancelled === true
        ? {
            value: answer.value,
            cancelled: true,
            cancelledReason: "aborted" as const,
            ...(answer.optionIndex !== undefined
              ? { optionIndex: answer.optionIndex }
              : {}),
            ...(optionIndexes.length > 0 ? { optionIndexes } : {}),
          }
        : {
            value: answer.value,
            cancelled: false,
            ...(answer.optionIndex !== undefined
              ? { optionIndex: answer.optionIndex }
              : {}),
            ...(optionIndexes.length > 0 ? { optionIndexes } : {}),
          },
    );
    this.#onResolved?.(
      requestId,
      answer.cancelled === true ? "cancelled" : "answered",
      answer.cancelled === true ? undefined : answer.value,
      entry.chatId,
    );
    return { delivered: true };
  }

  clearForChat(chatId: string): void {
    for (const [id, entry] of this.#pending) {
      if (entry.chatId !== chatId) continue;
      this.#cancelPending(id, entry);
    }
  }

  clearForSession(sessionId: string): void {
    for (const [id, entry] of this.#pending) {
      if (entry.sessionId !== sessionId) continue;
      this.#cancelPending(id, entry);
    }
  }

  clear(): void {
    for (const [id, entry] of this.#pending) {
      this.#cancelPending(id, entry);
    }
  }

  #cancelPending(id: string, entry: Pending): void {
    clearTimeout(entry.timer);
    entry.resolve({
      value: "",
      cancelled: true,
      cancelledReason: "aborted",
    });
    this.#pending.delete(id);
    this.#onResolved?.(id, "cancelled", undefined, entry.chatId);
  }

  get size(): number {
    return this.#pending.size;
  }
}

function inferKind(
  req: UserQuestionRequest,
): EhUserQuestionEvent["kind"] | undefined {
  const p = req.prompt.toLowerCase();
  if (p.includes("plan review") || p.includes("approve this plan")) {
    return "plan-review";
  }
  if (p.includes("switch to plan mode")) {
    return "mode-switch";
  }
  return "ask";
}
