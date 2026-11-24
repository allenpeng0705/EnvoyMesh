/**
 * FH-P2-B — live `task` tool children above the EH composer.
 */

import { useT } from "../../context/I18nContext.js";

export type EhSubagentDockRow = {
  id: string;
  summary: string;
  status: "running" | "succeeded" | "failed";
};

export type EhSubagentsDockProps = {
  rows: readonly EhSubagentDockRow[];
  maxSubagents?: number;
};

export function EhSubagentsDock({ rows, maxSubagents = 8 }: EhSubagentsDockProps) {
  const t = useT();
  if (rows.length === 0) return null;

  return (
    <div
      className="eh-subagents-dock"
      data-testid="eh-subagents-dock"
      aria-label={t("codingView.trackSubagents", "Subagents")}
    >
      <div className="eh-subagents-dock__head">
        <span className="eh-subagents-dock__title">
          {t("codingView.trackSubagents", "Subagents")}
        </span>
        <span className="eh-subagents-dock__cap" title={t("codingView.subagentsCapHint", "Per-turn cap")}>
          {t("codingView.subagentsCap", "up to {n}", { n: maxSubagents })}
        </span>
      </div>
      <ul className="eh-subagents-dock__list">
        {rows.map((row) => (
          <li
            key={row.id}
            className={`eh-subagents-dock__row eh-subagents-dock__row--${row.status}`}
            data-testid="eh-subagent-row"
          >
            <span className="eh-subagents-dock__status" aria-hidden="true" />
            <span className="eh-subagents-dock__summary">{row.summary}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}