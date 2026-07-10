import { useT } from "../../context/I18nContext.js";
import { useNodeState } from "../../context/NodeStateContext.js";
import { SearchView } from "./SearchView.js";
import { SponsorSetupTile } from "../discover/SponsorSetupTile.js";

export function DiscoverView() {
  const t = useT();
  const { bonds } = useNodeState();
  const emptyGraph = bonds.length === 0;
  return (
    <div className="discover-view">
      <header className="discover-view__header">
        <h2>{t("discover.title")}</h2>
        <p className="discover-view__lede">{t("discover.lede")}</p>
        {emptyGraph ? (
          <p className="discover-view__auto-banner" role="status">
            <span className="loading-spinner discover-view__auto-banner-spinner" aria-hidden />
            {t("discover.emptyGraphAutoSearching")}
          </p>
        ) : null}
      </header>
      <SponsorSetupTile />
      <SearchView embedded />
    </div>
  );
}
