/**
 * Phase 58A — Shared Team jobs fleet readiness checklist.
 */

import type {
  FleetReadinessAction,
  FleetReadinessResult,
  FleetReadinessRow,
  FleetReadinessTone,
} from "../lib/fleet-readiness.js";
import { useT } from "../context/I18nContext.js";

export interface FleetReadinessPanelProps {
  readiness: FleetReadinessResult;
  /** compact = empty Team jobs strip; default = start dialog / bid inbox */
  variant?: "default" | "compact";
  onManageWorkers?: () => void;
  onOpenSettingsAi?: () => void;
  onOpenDiscover?: () => void;
  onRefreshCards?: () => void;
  onRetryProbe?: () => void;
}

function toneGlyph(tone: FleetReadinessTone): string {
  if (tone === "pass") return "✓";
  if (tone === "warn") return "!";
  return "✗";
}

export function FleetReadinessPanel({
  readiness,
  variant = "default",
  onManageWorkers,
  onOpenSettingsAi,
  onOpenDiscover,
  onRefreshCards,
  onRetryProbe,
}: FleetReadinessPanelProps) {
  const t = useT();

  const runAction = (action: FleetReadinessAction) => {
    switch (action) {
      case "manageWorkers":
        onManageWorkers?.();
        break;
      case "openSettingsAi":
        onOpenSettingsAi?.();
        break;
      case "openDiscover":
        onOpenDiscover?.();
        break;
      case "refreshCards":
        onRefreshCards?.();
        break;
      case "retryProbe":
        onRetryProbe?.();
        break;
      default:
        break;
    }
  };

  const actionLabel = (action: FleetReadinessAction): string | null => {
    switch (action) {
      case "manageWorkers":
        return t("chains.readiness.ctaManageWorkers");
      case "openSettingsAi":
        return t("chains.readiness.ctaOpenSettingsAi");
      case "openDiscover":
        return t("chains.readiness.ctaOpenDiscover");
      case "refreshCards":
        return t("chains.readiness.ctaRefreshCards");
      case "retryProbe":
        return t("chains.readiness.ctaRetryProbe");
      default:
        return null;
    }
  };

  const actionAvailable = (action: FleetReadinessAction): boolean => {
    switch (action) {
      case "manageWorkers":
        return Boolean(onManageWorkers);
      case "openSettingsAi":
        return Boolean(onOpenSettingsAi);
      case "openDiscover":
        return Boolean(onOpenDiscover);
      case "refreshCards":
        return Boolean(onRefreshCards);
      case "retryProbe":
        return Boolean(onRetryProbe);
      default:
        return false;
    }
  };

  const rowLabel = (row: FleetReadinessRow): string =>
    t(`chains.readiness.row.${row.id}`);

  const rowHint = (row: FleetReadinessRow): string | null => {
    if (row.tone === "pass") return null;
    const text = t(`chains.readiness.hint.${row.id}.${row.tone}`, "");
    return text.trim() ? text : null;
  };

  return (
    <div
      className={`fleet-readiness fleet-readiness--${variant}`}
      data-testid="fleet-readiness-panel"
      data-blocked={readiness.blocked ? "true" : "false"}
    >
      <p className="fleet-readiness__title">{t("chains.readiness.title")}</p>
      {variant === "default" ? (
        <p className="fleet-readiness__desc">{t("chains.readiness.desc")}</p>
      ) : null}
      <ul className="fleet-readiness__list">
        {readiness.rows.map((row) => {
          const label = actionLabel(row.action);
          const showCta =
            row.action !== "none" &&
            row.tone !== "pass" &&
            label &&
            actionAvailable(row.action);
          const hint = rowHint(row);
          return (
            <li
              key={row.id}
              className={`fleet-readiness__row fleet-readiness__row--${row.tone}`}
              data-testid={`fleet-readiness-row-${row.id}`}
              data-tone={row.tone}
            >
              <span className="fleet-readiness__glyph" aria-hidden>
                {toneGlyph(row.tone)}
              </span>
              <div className="fleet-readiness__body">
                <span className="fleet-readiness__label">{rowLabel(row)}</span>
                {hint ? <span className="fleet-readiness__hint">{hint}</span> : null}
              </div>
              {showCta ? (
                <button
                  type="button"
                  className="secondary fleet-readiness__cta"
                  data-testid={`fleet-readiness-cta-${row.id}`}
                  onClick={() => runAction(row.action)}
                >
                  {label}
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
