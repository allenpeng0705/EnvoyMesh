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
  /** Opens the Team jobs how-to guide (3-node example). */
  onOpenHowTo?: () => void;
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
  onOpenHowTo,
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

  // Compact empty-home: only incomplete rows (pass rows are noise).
  let visibleRows =
    variant === "compact"
      ? readiness.rows.filter((r) => r.tone !== "pass")
      : readiness.rows;

  // Compact: drop "other ready" when earlier steps already explain the block —
  // it only restates "finish the steps above".
  if (
    variant === "compact" &&
    visibleRows.some((r) => r.id === "otherReady") &&
    visibleRows.some((r) => r.id !== "otherReady")
  ) {
    visibleRows = visibleRows.filter((r) => r.id !== "otherReady");
  }

  // Never list every bonded contact who hasn't joined — the peerJoin row
  // already says "ask them to join". Gaps are for people who did join but
  // still need a card refresh / online check / lease fix.
  const actionableGaps = workerGaps.filter((g) => g.reasonCode !== "join_off");
  const gapsToShow =
    variant === "compact" ? actionableGaps.slice(0, 3) : actionableGaps;

  const showGapsUnder =
    gapsToShow.length > 0 &&
    readiness.rows.some((r) => GAP_ROW_IDS.has(r.id) && r.tone !== "pass");

  return (
    <div
      className={`fleet-readiness fleet-readiness--${variant}`}
      data-testid="fleet-readiness-panel"
      data-blocked={readiness.blocked ? "true" : "false"}
    >
      <header className="fleet-readiness__header">
        <p className="fleet-readiness__title">{t("chains.readiness.title")}</p>
        {variant === "compact" ? (
          <p className="fleet-readiness__lead">{t("chains.readiness.compactLead")}</p>
        ) : (
          <p className="fleet-readiness__desc">{t("chains.readiness.desc")}</p>
        )}
        {onOpenHowTo ? (
          <button
            type="button"
            className="fleet-readiness__howto-link"
            data-testid="fleet-readiness-howto"
            onClick={onOpenHowTo}
          >
            {t("chains.readiness.howToLink")}
          </button>
        ) : null}
      </header>
      <ol className="fleet-readiness__list">
        {visibleRows.map((row, index) => {
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
              <div className="fleet-readiness__row-main">
                <span className="fleet-readiness__glyph" aria-hidden>
                  {variant === "compact" && row.tone !== "pass"
                    ? index + 1
                    : toneGlyph(row.tone)}
                </span>
                <div className="fleet-readiness__body">
                  <span className="fleet-readiness__label">{rowLabel(row)}</span>
                  {hint ? <span className="fleet-readiness__hint">{hint}</span> : null}
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
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      {showGapsUnder ? (
        <ul className="fleet-readiness__gaps" data-testid="fleet-readiness-gaps">
          {gapsToShow.map((gap) => {
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
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
