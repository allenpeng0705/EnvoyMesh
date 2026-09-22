/**
 * Envoy Harness interactive cards: ask_user options, plan review, mode switch.
 * Shares styling with Pi's proposal dock.
 */

import { useCallback, useEffect, useState } from "react"

import type { EhUserQuestionEvent } from "@envoymesh/api"
import { useT } from "../../context/I18nContext.js"
import { useNodeService } from "../../hooks/useNodeService.js"
import { Markdown } from "../Markdown.js"

export interface EhUserQuestionDockProps {
  question: EhUserQuestionEvent
  onDismiss?: () => void
  onResponded?: (optionLabel: string) => void
  /**
   * How this card's answer reaches the node.
   *
   * Defaults to the Envoy Harness RPC. Coding passes
   * `codingRespondToUserQuestion` because those requestIds live on the coding
   * bridge.
   */
  answer?: (params: {
    requestId: string
    value: string
    optionIndex?: number
    optionIndexes?: number[]
    cancelled?: boolean
  }) => Promise<unknown>
}

function splitPlanPrompt(prompt: string): { title: string; body: string } {
  const marker = "\n\nApprove this plan";
  const idx = prompt.indexOf(marker);
  if (idx === -1) {
    return { title: prompt.trim(), body: "" };
  }
  const head = prompt.slice(0, idx).trim();
  const rest = prompt.slice(idx).trim();
  const planStart = rest.indexOf("\n\n");
  if (planStart === -1) {
    return { title: head, body: rest };
  }
  return {
    title: `${head}\n${rest.slice(0, planStart).trim()}`,
    body: rest.slice(planStart).trim(),
  };
}

export function EhUserQuestionDock({
  question,
  onDismiss,
  onResponded,
  answer,
}: EhUserQuestionDockProps) {
  const t = useT();
  const nodeService = useNodeService();
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<number[]>([]);
  const [text, setText] = useState("");

  useEffect(() => {
    setPicked([]);
    setText("");
  }, [question.requestId]);

  const respond = useCallback(
    async (
      value: string,
      extra?: {
        optionIndex?: number;
        optionIndexes?: number[];
        cancelled?: boolean;
      },
    ) => {
      if (busy) return;
      setBusy(true);
      onDismiss?.();
      const payload = {
        requestId: question.requestId,
        value,
        ...(extra?.optionIndex !== undefined
          ? { optionIndex: extra.optionIndex }
          : {}),
        ...(extra?.optionIndexes !== undefined
          ? { optionIndexes: extra.optionIndexes }
          : {}),
        ...(extra?.cancelled === true ? { cancelled: true } : {}),
      };
      try {
        if (answer) {
          await answer(payload);
        } else {
          await nodeService.ehRespondToUserQuestion(payload);
        }
        if (extra?.cancelled !== true) {
          onResponded?.(value);
        }
      } catch {
        onResponded?.(
          extra?.cancelled
            ? t("eh.questionCancelled", "Question cancelled.")
            : t("eh.questionRespondFailed", "Failed to send your answer."),
        );
      } finally {
        setBusy(false);
      }
    },
    [answer, busy, nodeService, onDismiss, onResponded, question.requestId, t],
  );

  useEffect(() => {
    const graceMs = 500;
    const id = window.setTimeout(() => {
      onDismiss?.();
    }, question.timeoutMs + graceMs);
    return () => window.clearTimeout(id);
  }, [question.requestId, question.timeoutMs, onDismiss]);

  const isPlan = question.kind === "plan-review";
  const isMode = question.kind === "mode-switch";
  const { title, body } = isPlan
    ? splitPlanPrompt(question.prompt)
    : { title: question.prompt, body: "" };

  const dockTitle = isPlan
    ? t("eh.planReviewTitle", "Review plan")
    : isMode
      ? t("eh.modeSwitchTitle", "Switch mode?")
      : t("eh.questionTitle", "Envoy needs your input");

  const options = question.options ?? [];
  const many = question.multiple === true && options.length > 1;
  const freeText = options.length === 0;

  const toggle = (index: number) => {
    setPicked((current) =>
      current.includes(index)
        ? current.filter((item) => item !== index)
        : [...current, index],
    );
  };

  return (
    <div
      className="pi-proposal-dock eh-user-question-dock"
      role="alertdialog"
      aria-label={dockTitle}
      aria-live="assertive"
    >
      <div className="pi-proposal-dock-title">{dockTitle}</div>
      {title ? (
        <div className="eh-user-question-prompt">
          <Markdown text={title} className="eh-user-question-markdown" />
        </div>
      ) : null}
      {body ? (
        <div className="eh-user-question-plan-body">
          <Markdown text={body} className="eh-user-question-markdown eh-plan-markdown" />
        </div>
      ) : null}

      {many ? (
        <div className="eh-user-question-options">
          {options.map((label: string, i: number) => {
            const recommended = question.recommendedIndex === i;
            return (
              <label
                key={`${question.requestId}-${i}`}
                className={`eh-user-question-option${recommended ? " eh-user-question-option--recommended" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={picked.includes(i)}
                  disabled={busy}
                  data-testid={`eh-question-option-${i}`}
                  onChange={() => toggle(i)}
                />
                <span className="eh-user-question-option-label">{label}</span>
                {recommended ? (
                  <span className="eh-user-question-recommended-badge">
                    {t("eh.recommended", "Recommended")}
                  </span>
                ) : null}
              </label>
            );
          })}
          <div className="pi-proposal-dock-actions">
            <button
              type="button"
              className="pi-proposal-deny-btn"
              disabled={busy}
              onClick={() => void respond("", { cancelled: true })}
            >
              {t("eh.dismiss", "Dismiss")}
            </button>
            <button
              type="button"
              className="primary"
              disabled={busy || picked.length === 0}
              data-testid="eh-question-confirm"
              onClick={() => {
                const indexes = [...picked].sort((a, b) => a - b);
                const value = indexes.map((index) => options[index] ?? "").join(", ");
                void respond(value, { optionIndexes: indexes });
              }}
            >
              {t("eh.questionConfirm", "Confirm")}
            </button>
          </div>
        </div>
      ) : options.length > 0 ? (
        <div className="eh-user-question-options">
          {options.map((label: string, i: number) => {
            const recommended = question.recommendedIndex === i;
            return (
              <button
                key={`${question.requestId}-${i}`}
                type="button"
                className={`eh-user-question-option${recommended ? " eh-user-question-option--recommended" : ""}`}
                disabled={busy}
                data-testid={`eh-question-option-${i}`}
                onClick={() => void respond(label, { optionIndex: i })}
              >
                <span className="eh-user-question-option-label">{label}</span>
                {recommended ? (
                  <span className="eh-user-question-recommended-badge">
                    {t("eh.recommended", "Recommended")}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : freeText ? (
        <form
          className="eh-user-question-options"
          onSubmit={(event) => {
            event.preventDefault();
            const value = text.trim();
            if (!value || busy) return;
            void respond(value);
          }}
        >
          <textarea
            className="eh-user-question-text"
            rows={question.multiline ? 6 : 3}
            value={text}
            disabled={busy}
            data-testid="eh-question-text"
            aria-label={t("eh.questionTextAria", "Your answer")}
            onChange={(event) => setText(event.target.value)}
          />
          <div className="pi-proposal-dock-actions">
            <button
              type="button"
              className="pi-proposal-deny-btn"
              disabled={busy}
              onClick={() => void respond("", { cancelled: true })}
            >
              {t("eh.dismiss", "Dismiss")}
            </button>
            <button
              type="submit"
              className="primary"
              disabled={busy || text.trim().length === 0}
              data-testid="eh-question-confirm"
            >
              {t("eh.questionConfirm", "Confirm")}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
