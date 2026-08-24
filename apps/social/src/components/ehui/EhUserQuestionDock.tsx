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
}: EhUserQuestionDockProps) {
  const t = useT();
  const nodeService = useNodeService();
  const [busy, setBusy] = useState(false);

  const respond = useCallback(
    async (value: string, optionIndex?: number, cancelled?: boolean) => {
      if (busy) return;
      setBusy(true);
      onDismiss?.();
      try {
        await nodeService.ehRespondToUserQuestion({
          requestId: question.requestId,
          value,
          ...(optionIndex !== undefined ? { optionIndex } : {}),
          ...(cancelled === true ? { cancelled: true } : {}),
        });
        if (!cancelled) {
          onResponded?.(value);
        }
      } catch {
        onResponded?.(
          cancelled
            ? t("eh.questionCancelled", "Question cancelled.")
            : t("eh.questionRespondFailed", "Failed to send your answer."),
        );
      } finally {
        setBusy(false);
      }
    },
    [busy, nodeService, onDismiss, onResponded, question.requestId, t],
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

      {question.options && question.options.length > 0 ? (
        <div className="eh-user-question-options">
          {question.options.map((label: string, i: number) => {
            const recommended = question.recommendedIndex === i;
            return (
              <button
                key={`${question.requestId}-${i}`}
                type="button"
                className={`eh-user-question-option${recommended ? " eh-user-question-option--recommended" : ""}`}
                disabled={busy}
                onClick={() => void respond(label, i)}
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
      ) : (
        <div className="pi-proposal-dock-actions">
          <button
            type="button"
            className="pi-proposal-deny-btn"
            disabled={busy}
            onClick={() => void respond("", undefined, true)}
          >
            {t("eh.dismiss", "Dismiss")}
          </button>
        </div>
      )}
    </div>
  );
}
