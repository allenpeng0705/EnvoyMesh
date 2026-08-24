/**
 * In-flight user-question waiter for Envoy Harness chat / terminal.
 *
 * Mirrors AcpPermissionBridge: emit → Social UI cards → respond RPC.
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
  multiline?: boolean;
  timeoutMs: number;
  /** Discriminator for plan review vs generic ask. */
  kind?: "ask" | "plan-review" | "mode-switch";
}

export interface AcpUserQuestionBridgeEmit {
  (event: "eh:user_question", payload: EhUserQuestionEvent): void;
}

interface Pending {
  resolve: (answer: UserQuestionAnswer) => void;
  timer: ReturnType<typeof setTimeout>;
  chatId?: string;
}

const DEFAULT_TIMEOUT_MS = 120_000;

export class AcpUserQuestionBridge {
  readonly #pending = new Map<string, Pending>();
  readonly #emit: AcpUserQuestionBridgeEmit;
  readonly #timeoutMs: number;

  constructor(
    emit: AcpUserQuestionBridgeEmit,
    opts?: { timeoutMs?: number },
  ) {
    this.#emit = emit;
    this.#timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /** Block until Social answers or timeout → cancelled. */
  ask(req: UserQuestionRequest, chatId?: string): Promise<UserQuestionAnswer> {
    const requestId = randomUUID();
    const kind = inferKind(req);
    return new Promise<UserQuestionAnswer>((resolve) => {
      const timer = setTimeout(() => {
        this.#pending.delete(requestId);
        resolve({
          value: "",
          cancelled: true,
          cancelledReason: "timeout",
        });
      }, this.#timeoutMs);

      this.#pending.set(requestId, { resolve, timer, chatId });
      this.#emit("eh:user_question", {
        requestId,
        prompt: req.prompt,
        ...(req.options !== undefined ? { options: [...req.options] } : {}),
        ...(req.recommendedIndex !== undefined
          ? { recommendedIndex: req.recommendedIndex }
          : {}),
        ...(req.multiline !== undefined ? { multiline: req.multiline } : {}),
        timeoutMs: this.#timeoutMs,
        ...(kind !== undefined ? { kind } : {}),
        ...(chatId ? { chatId } : {}),
      });
    });
  }

  respond(
    requestId: string,
    answer: {
      value: string;
      optionIndex?: number;
      cancelled?: boolean;
    },
  ): { delivered: boolean } {
    const entry = this.#pending.get(requestId);
    if (!entry) return { delivered: false };
    clearTimeout(entry.timer);
    this.#pending.delete(requestId);
    entry.resolve(
      answer.cancelled === true
        ? {
            value: answer.value,
            cancelled: true,
            cancelledReason: "aborted" as const,
            ...(answer.optionIndex !== undefined
              ? { optionIndex: answer.optionIndex }
              : {}),
          }
        : {
            value: answer.value,
            cancelled: false,
            ...(answer.optionIndex !== undefined
              ? { optionIndex: answer.optionIndex }
              : {}),
          },
    );
    return { delivered: true };
  }

  clearForChat(chatId: string): void {
    for (const [id, entry] of this.#pending) {
      if (entry.chatId !== chatId) continue;
      clearTimeout(entry.timer);
      entry.resolve({
        value: "",
        cancelled: true,
        cancelledReason: "aborted",
      });
      this.#pending.delete(id);
    }
  }

  clear(): void {
    for (const [id, entry] of this.#pending) {
      clearTimeout(entry.timer);
      entry.resolve({
        value: "",
        cancelled: true,
        cancelledReason: "aborted",
      });
      this.#pending.delete(id);
    }
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
