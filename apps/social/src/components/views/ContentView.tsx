import { useState } from "react";
import { useT } from "../../context/I18nContext.js";
import { LibraryView } from "./LibraryView.js";
import { BrowserView } from "./BrowserView.js";

type ContentTab = "sites" | "files";

export function ContentView() {
  const t = useT();
  const [activeTab, setActiveTab] = useState<ContentTab>("sites");

  const tabs: { id: ContentTab; label: string }[] = [
    { id: "sites", label: t("content.tabSites", "Sites") },
    { id: "files", label: t("content.tabFiles", "My Files") },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case "files":
        return <LibraryView />;
      case "sites":
        return <BrowserView initialMode="browse" />;
      default:
        return <LibraryView />;
    }
  };

  return (
    <div className="content-view" data-testid="content-view">
      <div className="content-view__tabs" role="tablist" aria-label={t("content.tabs", "Content")}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`content-view-${tab.id}`}
            className={`content-view__tab${activeTab === tab.id ? " content-view__tab--active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
            data-testid={`content-tab-${tab.id}`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="content-view__content" role="tabpanel" id={`content-view-${activeTab}`}>
        {renderContent()}
      </div>
    </div>
  );
}