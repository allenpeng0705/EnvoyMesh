/**
 * History filter chips for the Coding left rail (not a separate nav tab).
 */
import { useT } from "../context/I18nContext.js";
import {
  CODING_HISTORY_FILTERS,
  type CodingHistoryFilter,
} from "../lib/coding-history.js";

export type CodingHistoryFiltersProps = {
  filter: CodingHistoryFilter;
  onFilterChange: (filter: CodingHistoryFilter) => void;
  flatMode: boolean;
  onFlatModeChange: (flat: boolean) => void;
};

export function CodingHistoryFilters({
  filter,
  onFilterChange,
  flatMode,
  onFlatModeChange,
}: CodingHistoryFiltersProps) {
  const t = useT();

  const labelFor = (f: CodingHistoryFilter): string => {
    switch (f) {
      case "needs_you":
        return t("codingView.historyNeedsYou", "Action");
      case "recent":
        return t("codingView.historyRecent", "Recent");
      case "archived":
        return t("codingView.historyArchived", "Archived");
      case "all":
      default:
        return t("codingView.historyAll", "All");
    }
  };

  return (
    <div className="coding-history-filters" data-testid="coding-history-filters">
      <div
        className="coding-seg coding-history-filters__chips"
        role="tablist"
        aria-label={t("codingView.historyFiltersAria", "History filters")}
      >
        {CODING_HISTORY_FILTERS.map((f) => {
          const selected = filter === f;
          return (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={selected}
              className={`coding-seg__btn coding-history-chip${selected ? " coding-seg__btn--active coding-history-chip--active" : ""}`}
              data-testid={`coding-history-filter-${f}`}
              onClick={() => onFilterChange(f)}
            >
              {labelFor(f)}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        className={`coding-history-flat-toggle${flatMode ? " coding-history-flat-toggle--active" : ""}`}
        data-testid="coding-history-flat-toggle"
        aria-pressed={flatMode}
        onClick={() => onFlatModeChange(!flatMode)}
        title={t(
          "codingView.historyAllWorkspaces",
          "All workspaces",
        )}
      >
        {t("codingView.historyAllWorkspaces", "All workspaces")}
      </button>
    </div>
  );
}
