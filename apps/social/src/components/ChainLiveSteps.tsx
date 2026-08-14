/**
 * Phase 58B/58C — Live job story + per-step cancel/reassign (assigner only).
 */

import { useState } from "react";
import type { ChainGetStateResult } from "@envoymesh/api";
import { useT } from "../context/I18nContext.js";
import { orderLiveSteps, parseGoalInputRefs } from "../lib/chain-live-steps.js";
import { ChainInputDeliveries } from "./ChainInputDeliveries.js";

export interface ChainLiveStepsProps {
  steps: NonNullable<ChainGetStateResult["steps"]>;
  goal?: string;
  inputAttachments?: ChainGetStateResult["inputAttachments"];
  inputDeliveries?: ChainGetStateResult["inputDeliveries"];
  /** When false/omitted, hide owner control buttons (observed / finalized). */
  allowStepControl?: boolean;
  busySubtaskId?: string | null;
  busyDeliveryKey?: string | null;
  onCancelStep?: (subtaskId: string) => void;
  onReassignStep?: (subtaskId: string) => void;
  onRetryInputDelivery?: (input: {
    workerPeerId: string;
    sourceRelativePath: string;
  }) => void;
}

function shortPeer(peerId: string | undefined): string {
  if (!peerId) return "—";
  return peerId.length > 14 ? `${peerId.slice(0, 12)}…` : peerId;
}

function canCancelStep(state: string): boolean {
  return state === "offered" || state === "awarded" || state === "running" || state === "pending";
}

function canReassignStep(state: string): boolean {
  return state === "awarded" || state === "running" || state === "failed";
}

export function ChainLiveSteps({
  steps,
  goal,
  inputAttachments,
  inputDeliveries,
  allowStepControl = false,
  busySubtaskId = null,
  busyDeliveryKey = null,
  onCancelStep,
  onReassignStep,
  onRetryInputDelivery,
}: ChainLiveStepsProps) {
  const t = useT();
  const ordered = orderLiveSteps(steps);
  const inputs = parseGoalInputRefs(goal);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  if (ordered.length === 0) return null;

  const idToIndex = new Map(ordered.map((s) => [s.subtaskId, s.index]));

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <section
      className="chain-detail-panel__section chain-live-steps"
      data-testid="chain-live-steps"
    >
      <h4>{t("chains.detail.stepsTitle")}</h4>

      {inputs.length > 0 ? (
        <div className="chain-live-steps__inputs" data-testid="chain-live-inputs">
          <p className="chain-live-steps__inputs-title">{t("chains.detail.inputsTitle")}</p>
          <ul>
            {inputs.map((inp) => (
              <li key={`${inp.label}:${inp.path}`}>
                <code>
                  [{inp.label}] {inp.path}
                </code>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {inputDeliveries && inputDeliveries.length > 0 ? (
        <ChainInputDeliveries
          deliveries={inputDeliveries}
          attachments={inputAttachments}
          allowRetry={allowStepControl}
          busyKey={busyDeliveryKey}
          onRetry={onRetryInputDelivery}
        />
      ) : null}

      <p className="chain-live-steps__honesty">{t("chains.detail.attachmentHonesty")}</p>

      <ol className="chain-live-steps__list">
        {ordered.map((step) => {
          const long = step.objective.length > 120;
          const isOpen = expanded.has(step.subtaskId);
          const objective =
            long && !isOpen ? `${step.objective.slice(0, 120)}…` : step.objective;
          const stateLabel = t(`chains.detail.stepState.${step.state}`, step.state);
          const showCancel = allowStepControl && canCancelStep(step.state) && onCancelStep;
          const showReassign = allowStepControl && canReassignStep(step.state) && onReassignStep;
          const busy = busySubtaskId === step.subtaskId;
          return (
            <li
              key={step.subtaskId}
              className="chain-live-steps__item"
              style={{ marginLeft: `${step.depth * 1.1}rem` }}
              data-testid={`chain-live-step-${step.subtaskId}`}
              data-state={step.state}
            >
              <div className="chain-live-steps__line1">
                <span className="chain-live-steps__index">{step.index}.</span>
                <span className="chain-live-steps__objective">{objective}</span>
                {long ? (
                  <button
                    type="button"
                    className="link-btn chain-live-steps__more"
                    onClick={() => toggle(step.subtaskId)}
                  >
                    {isOpen ? t("chains.detail.stepLess") : t("chains.detail.stepMore")}
                  </button>
                ) : null}
              </div>
              <div className="chain-live-steps__line2">
                <span>{shortPeer(step.workerPeerId)}</span>
                <span aria-hidden="true"> · </span>
                <span>{stateLabel}</span>
                {step.requiredRole ? (
                  <>
                    <span aria-hidden="true"> · </span>
                    <span>{step.requiredRole}</span>
                  </>
                ) : null}
              </div>
              {step.waitingOn && step.waitingOn.length > 0 ? (
                <div className="chain-live-steps__line3">
                  {t("chains.detail.waitingOn")}{" "}
                  {step.waitingOn
                    .map((w) => {
                      const from = idToIndex.get(w.fromSubtaskId);
                      const fromLabel = from
                        ? t("chains.detail.stepN", { n: from })
                        : w.fromSubtaskId.slice(0, 10);
                      const label = w.label ?? w.key;
                      return `${fromLabel} → ${label}`;
                    })
                    .join("; ")}
                </div>
              ) : null}
              {step.produced && step.produced.length > 0 ? (
                <div className="chain-live-steps__line3">
                  {t("chains.detail.produced")}{" "}
                  {step.produced
                    .map((p) => `${p.label ?? p.key} (${p.kind})`)
                    .join("; ")}
                </div>
              ) : null}
              {showCancel || showReassign ? (
                <div className="chain-live-steps__actions">
                  {showCancel ? (
                    <button
                      type="button"
                      className="secondary btn-sm"
                      disabled={busy}
                      data-testid={`chain-step-cancel-${step.subtaskId}`}
                      onClick={() => onCancelStep!(step.subtaskId)}
                    >
                      {t("chains.detail.cancelStep")}
                    </button>
                  ) : null}
                  {showReassign ? (
                    <button
                      type="button"
                      className="secondary btn-sm"
                      disabled={busy}
                      data-testid={`chain-step-reassign-${step.subtaskId}`}
                      onClick={() => onReassignStep!(step.subtaskId)}
                    >
                      {t("chains.detail.reassignStep")}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
