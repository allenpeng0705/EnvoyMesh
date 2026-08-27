/**
 * Follow-up chips and deferred-task list after an Envoy Harness turn.
 */

import { useT } from "../../context/I18nContext.js"
import type { EhTurnHintsEvent } from "@envoymesh/api"

export interface EhTurnHintsDockProps {
  hints: EhTurnHintsEvent
  onDismiss?: () => void
  onSelectFollowUp?: (text: string) => void
}

export function EhTurnHintsDock({
  hints,
  onDismiss,
  onSelectFollowUp,
}: EhTurnHintsDockProps) {
  const t = useT();
  const followUps = hints.followUps ?? [];
  const deferred = hints.deferred ?? [];
  if (followUps.length === 0 && deferred.length === 0) return null;

  return (
    <div
      className="eh-turn-hints-dock"
      role="region"
      aria-label={t("eh.turnHintsTitle", "Suggested next steps")}
    >
      {followUps.length > 0 ? (
        <div className="eh-turn-hints-section">
          <div className="eh-turn-hints-label">
            {t("eh.followUpsLabel", "Follow-ups")}
          </div>
          <div className="eh-turn-hints-chips">
            {followUps.map((label, i) => (
              <button
                key={`${i}-${label}`}
                type="button"
                className="eh-turn-hints-chip"
                onClick={() => {
                  onSelectFollowUp?.(label);
                  onDismiss?.();
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {deferred.length > 0 ? (
        <div className="eh-turn-hints-section">
          <div className="eh-turn-hints-label">
            {t("eh.deferredLabel", "Deferred")}
          </div>
          <ul className="eh-turn-hints-deferred">
            {deferred.map((item, i) => (
              <li key={`${i}-${item.task}`}>
                <span className="eh-turn-hints-deferred-task">{item.task}</span>
                <span className="eh-turn-hints-deferred-reason">{item.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="eh-turn-hints-actions">
        <button type="button" className="secondary eh-turn-hints-dismiss" onClick={onDismiss}>
          {t("eh.dismiss", "Dismiss")}
        </button>
      </div>
    </div>
  );
}
