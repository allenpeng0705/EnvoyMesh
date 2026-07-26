import { useEffect, useRef, useState } from "react";
import type { ContentEngageSurface } from "@envoymesh/api";
import { useT } from "../../context/I18nContext.js";
import {
  hasPendingBrowserOpen,
  OPEN_BROWSER_EVENT,
} from "../../lib/browser-nav.js";
import { LibraryView } from "./LibraryView.js";
import { BrowserView } from "./BrowserView.js";
import { FeedView } from "./FeedView.js";
import { BlogView } from "./BlogView.js";

type ContentTab = "feed" | "blog" | "explore" | "files";

function Badge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="inbox-badge" aria-hidden>
      {count > 99 ? "99+" : count}
    </span>
  );
}

export interface ContentViewProps {
  feedEngageCount?: number;
  blogEngageCount?: number;
  onDismissEngage?: (surface: ContentEngageSurface | "all") => Promise<void>;
}

export function ContentView({
  feedEngageCount = 0,
  blogEngageCount = 0,
  onDismissEngage,
}: ContentViewProps) {
  const t = useT();
  // Cold-open Explore when App routed here for a pending browser URL / author template.
  const [activeTab, setActiveTab] = useState<ContentTab>(() =>
    hasPendingBrowserOpen() ? "explore" : "feed",
  );
  const clearedOnOpen = useRef(false);

  // Opening Content clears all engagement badges (folder-open UX).
  useEffect(() => {
    if (clearedOnOpen.current || !onDismissEngage) return;
    clearedOnOpen.current = true;
    void onDismissEngage("all").catch(console.error);
  }, [onDismissEngage]);

  // Blog/Feed openBrowserAt → App shows Content; we must mount Explore (BrowserView)
  // so it can take the pending URL. Also covers events while Content is already open.
  useEffect(() => {
    const goExplore = () => setActiveTab("explore");
    if (hasPendingBrowserOpen()) goExplore();
    window.addEventListener(OPEN_BROWSER_EVENT, goExplore);
    return () => window.removeEventListener(OPEN_BROWSER_EVENT, goExplore);
  }, []);

  const selectTab = (tab: ContentTab) => {
    setActiveTab(tab);
    if (tab === "feed") void onDismissEngage?.("feed").catch(console.error);
    if (tab === "blog") void onDismissEngage?.("blog").catch(console.error);
  };

  const tabs: { id: ContentTab; label: string }[] = [
    { id: "feed", label: t("content.tabFeed", "Feed") },
    { id: "blog", label: t("content.tabBlog", "Blog") },
    { id: "explore", label: t("content.tabExplore", "Explore") },
    { id: "files", label: t("content.tabFiles", "My Files") },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case "feed":
        return <FeedView />;
      case "blog":
        return <BlogView />;
      case "files":
        return <LibraryView />;
      case "explore":
        return <BrowserView initialMode="bazaar" />;
      default:
        return <FeedView />;
    }
  };

  return (
    <div className="content-view" data-testid="content-view">
      <div className="content-view__tabs" role="tablist" aria-label={t("content.tabs", "Content")}>
        {tabs.map((tab) => {
          const badge =
            tab.id === "feed" ? feedEngageCount : tab.id === "blog" ? blogEngageCount : 0;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`content-view-${tab.id}`}
              className={`content-view__tab${activeTab === tab.id ? " content-view__tab--active" : ""}${badge > 0 ? " has-inbox" : ""}`}
              onClick={() => selectTab(tab.id)}
              data-testid={`content-tab-${tab.id}`}
            >
              {tab.label}
              <Badge count={badge} />
            </button>
          );
        })}
      </div>
      <div className="content-view__content" role="tabpanel" id={`content-view-${activeTab}`}>
        {renderContent()}
      </div>
    </div>
  );
}
