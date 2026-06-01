import { useT } from "../../context/I18nContext.js";
import { SearchView } from "./SearchView.js";

export function DiscoverView() {
  const t = useT();
  return (
    <div className="discover-view">
      <header className="discover-view__header">
        <h2>{t("discover.title")}</h2>
        <p className="discover-view__lede">{t("discover.lede")}</p>
      </header>
      <SearchView embedded />
    </div>
  );
}
