import { useEffect, useRef, useState } from "react";
import type { ContentEngageSurface } from "@envoymesh/api";
import { useT } from "../../context/I18nContext.js";
import {
  hasPendingBrowserOpen,
  OPEN_BROWSER_EVENT,
} from "../../lib/browser-nav.js";
import { KnowledgeView, type KnowledgeHubPanel } from "./KnowledgeView.js";
import { BrowserView } from "./BrowserView.js";
import { FeedView } from "./FeedView.js";
import { BlogView } from "./BlogView.js";
import {
  OPEN_CONTENT_KNOWLEDGE_EVENT,
  normalizeKnowledgeHubPanel,
  type OpenContentKnowledgeDetail,
} from "../../lib/content-knowledge-nav.js";

export type ContentTab = "feed" | "blog" | "explore" | "files";

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
  /** Peer feed.notify unread — shown on Feed tab when not already viewing Feed. */
  feedNotifyCount?: number;
  blogEngageCount?: number;
  /**
   * Clear engagement badges. Pass `feedNotify: true` when opening Content / Feed
   * (folder-open). Omit while already viewing so Likes don't also clear peer posts.
   */
  onDismissEngage?: (
    surface: ContentEngageSurface | "all",
    options?: { feedNotify?: boolean },
  ) => Promise<void>;
  /** Parent uses this to hide Content-nav badges while Feed/Blog is already open. */
  onActiveSurfaceChange?: (surface: ContentTab) => void;
}

export function ContentView({
  feedEngageCount = 0,
  feedNotifyCount = 0,
  blogEngageCount = 0,
  onDismissEngage,
  onActiveSurfaceChange,
}: ContentViewProps) {
  const t = useT();
  // Cold-open Explore when App routed here for a pending browser URL / author template.
  const [activeTab, setActiveTab] = useState<ContentTab>(() =>
    hasPendingBrowserOpen() ? "explore" : "feed",
  );
  const [knowledgePanel, setKnowledgePanel] = useState<KnowledgeHubPanel>("browse");
  const clearedOnOpen = useRef(false);
  const dismissRef = useRef(onDismissEngage);
  dismissRef.current = onDismissEngage;

  // Opening Content clears all engagement badges (folder-open UX).
  useEffect(() => {
    if (clearedOnOpen.current || !dismissRef.current) return;
    clearedOnOpen.current = true;
    void dismissRef.current("all", { feedNotify: true }).catch(console.error);
  }, []);

  useEffect(() => {
    onActiveSurfaceChange?.(activeTab);
  }, [activeTab, onActiveSurfaceChange]);

  // Already on Feed/Blog: keep that surface's Like/Comment inbox clear (no badge flash).
  // Do NOT clear feed.notify here — that would mark peer posts read on every like.
  useEffect(() => {
    const dismiss = dismissRef.current;
    if (!dismiss) return;
    if (activeTab === "feed" && feedEngageCount > 0) {
      void dismiss("feed").catch(console.error);
    }
    if (activeTab === "blog" && blogEngageCount > 0) {
      void dismiss("blog").catch(console.error);
    }
  }, [activeTab, feedEngageCount, blogEngageCount]);

  // Blog/Feed openBrowserAt → App shows Content; we must mount Explore (BrowserView)
  // so it can take the pending URL. Also covers events while Content is already open.
  useEffect(() => {
    const goExplore = () => setActiveTab("explore");
    if (hasPendingBrowserOpen()) goExplore();
    window.addEventListener(OPEN_BROWSER_EVENT, goExplore);
    return () => window.removeEventListener(OPEN_BROWSER_EVENT, goExplore);
  }, []);

  // Settings / deep-link → Content → Knowledge (optional Setup / Plugins panel).
  useEffect(() => {
    const goKnowledge = (ev: Event) => {
      const detail = (ev as CustomEvent<OpenContentKnowledgeDetail>).detail;
      setActiveTab("files");
      if (detail?.panel) setKnowledgePanel(normalizeKnowledgeHubPanel(detail.panel));
    };
    window.addEventListener(OPEN_CONTENT_KNOWLEDGE_EVENT, goKnowledge);
    return () => window.removeEventListener(OPEN_CONTENT_KNOWLEDGE_EVENT, goKnowledge);
  }, []);

  const selectTab = (tab: ContentTab) => {
    setActiveTab(tab);
    if (tab === "feed") {
      void dismissRef.current?.("feed", { feedNotify: true }).catch(console.error);
    }
    if (tab === "blog") void dismissRef.current?.("blog").catch(console.error);
  };

  const tabs: { id: ContentTab; label: string }[] = [
    { id: "feed", label: t("content.tabFeed", "Feed") },
    { id: "blog", label: t("content.tabBlog", "Blog") },
    { id: "files", label: t("content.tabFiles", "Knowledge") },
    { id: "explore", label: t("content.tabExplore", "Explore") },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case "feed":
        return <FeedView />;
      case "blog":
        return <BlogView />;
      case "files":
        return <KnowledgeView initialPanel={knowledgePanel} />;
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
          // Don't badge the tab the user is already looking at.
          const badge =
            tab.id === "feed" && activeTab !== "feed"
              ? feedEngageCount + feedNotifyCount
              : tab.id === "blog" && activeTab !== "blog"
                ? blogEngageCount
                : 0;
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
