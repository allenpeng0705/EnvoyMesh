/**
 * Composer track pills — Changes + Queue (Subagents skipped for C4).
 * Toggle / focus existing docks; not a parallel surface.
 */

import { useT } from "../../context/I18nContext.js";

export type EhTrackId = "changes" | "queue";

export type EhTrackPillsProps = {
  changesCount: number;
  queueCount: number;
  /** Which dock is currently emphasized (expanded / visible). */
  activeTrack?: EhTrackId | null;
  onSelectTrack: (track: EhTrackId) => void;
};

export function EhTrackPills({
  changesCount,
  queueCount,
  activeTrack = null,
  onSelectTrack,
}: EhTrackPillsProps) {
  const t = useT();

  return (
    <div
      className="eh-track-pills"
      role="toolbar"
      aria-label={t("codingView.tracksAria", "Tracks")}
      data-testid="eh-track-pills"
    >
      <button
        type="button"
        className={
          activeTrack === "changes"
            ? "eh-track-pill eh-track-pill--active"
            : "eh-track-pill"
        }
        aria-pressed={activeTrack === "changes"}
        onClick={() => onSelectTrack("changes")}
        data-testid="eh-track-pill-changes"
      >
        <span>{t("codingView.trackChanges", "Changes")}</span>
        <span className="eh-track-pill__count" aria-hidden="true">
          {changesCount}
        </span>
      </button>
      <button
        type="button"
        className={
          activeTrack === "queue"
            ? "eh-track-pill eh-track-pill--active"
            : "eh-track-pill"
        }
        aria-pressed={activeTrack === "queue"}
        onClick={() => onSelectTrack("queue")}
        data-testid="eh-track-pill-queue"
      >
        <span>{t("codingView.trackQueue", "Queue")}</span>
        <span className="eh-track-pill__count" aria-hidden="true">
          {queueCount}
        </span>
      </button>
    </div>
  );
}
