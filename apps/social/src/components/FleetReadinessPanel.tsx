/**
 * Phase 58A — Shared Team jobs fleet readiness checklist.
 * Phase 66A — optional named per-worker gaps under failing rows.
 */

import type {
  FleetReadinessAction,
  FleetReadinessResult,
  FleetReadinessRow,
  FleetReadinessTone,
} from "../lib/fleet-readiness.js";
import type { FleetWorkerGap } from "../lib/fleet-worker-gaps.js";
import { useT } from "../context/I18nContext.js";

export interface FleetReadinessPanelProps {
  readiness: FleetReadinessResult;
  /** compact = empty Team jobs strip; default = start dialog / bid inbox */
  variant?: "default" | "compact";
  /** Phase 66A — one actionable gap per bonded worker (display names). */
  workerGaps?: readonly FleetWorkerGap[];
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

const GAP_ROW_IDS = new Set(["peerJoin", "freshCard", "online", "otherReady"]);

export function FleetReadinessPanel({
  readiness,
  variant = "default",
  workerGaps = [],
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

  const gapReason = (code: FleetWorkerGap["reasonCode"]): string =>
    t(`chains.readiness.gap.${code}`);

  const showGapsUnder =
    workerGaps.length > 0 &&
    readiness.rows.some((r) => GAP_ROW_IDS.has(r.id) && r.tone !== "pass");

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
      {showGapsUnder ? (
        <ul className="fleet-readiness__gaps" data-testid="fleet-readiness-gaps">
          {workerGaps.map((gap) => {
            const cta = actionLabel(gap.action);
            const showCta = gap.action !== "none" && cta && actionAvailable(gap.action);
            return (
              <li
                key={`${gap.peerOwnerId}:${gap.reasonCode}`}
                className="fleet-readiness__gap"
                data-testid="fleet-readiness-gap"
                data-reason={gap.reasonCode}
              >
                <div className="fleet-readiness__gap-body">
                  <span className="fleet-readiness__gap-name">{gap.displayName}</span>
                  <span className="fleet-readiness__gap-reason">{gapReason(gap.reasonCode)}</span>
                </div>
                {showCta ? (
                  <button
                    type="button"
                    className="secondary fleet-readiness__cta"
                    data-testid={`fleet-readiness-gap-cta-${gap.reasonCode}`}
                    onClick={() => runAction(gap.action)}
                  >
                    {cta}
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
