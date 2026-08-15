/**
 * Social shell — Chats | Feed | Blog | Discover | Explore.
 * Discover = people discovery; Explore = web content browser (former Browse).
 */
import { useEffect, useRef, useState } from "react";
import type { ContentEngageSurface } from "@envoymesh/api";
import { useT } from "../../context/I18nContext.js";
import {
  hasPendingBrowserOpen,
  OPEN_BROWSER_EVENT,
} from "../../lib/browser-nav.js";
import {
  clearSocialContentPeerFilter,
  OPEN_SOCIAL_CONTENT_EVENT,
  takePendingSocialContentPeer,
  type OpenSocialContentDetail,
} from "../../lib/social-content-nav.js";
import { ChatView, type ChatViewProps } from "./ChatView.js";
import { FeedView } from "./FeedView.js";
import { BlogView } from "./BlogView.js";
import { DiscoverView } from "./DiscoverView.js";
import { BrowserView } from "./BrowserView.js";

export type SocialTab = "chats" | "feed" | "blog" | "discover" | "explore";

function Badge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="inbox-badge" aria-hidden>
      {count > 99 ? "99+" : count}
    </span>
  );
}

export interface SocialViewProps {
  activeTab: SocialTab;
  onActiveTabChange: (tab: SocialTab) => void;
  feedEngageCount?: number;
  feedNotifyCount?: number;
  blogEngageCount?: number;
  onDismissEngage?: (
    surface: ContentEngageSurface | "all",
    options?: { feedNotify?: boolean },
  ) => Promise<void>;
  chatProps: ChatViewProps;
}

export function SocialView({
  activeTab,
  onActiveTabChange,
  feedEngageCount = 0,
  feedNotifyCount = 0,
  blogEngageCount = 0,
  onDismissEngage,
  chatProps,
}: SocialViewProps) {
  const t = useT();
  const dismissRef = useRef(onDismissEngage);
  dismissRef.current = onDismissEngage;
  /** Contact Feed/Blog shortcut — filter Content tabs to that publisher. */
  const [peerOwnerId, setPeerOwnerId] = useState<string | null>(null);

  // Do NOT dismiss-all on Social mount: Chats is the default tab, and clearing
  // Feed/Blog engage (+ feed.notify) when the user only opens Chats would hide
  // Social/Feed badges before they visit those surfaces.

  // Dismiss when Feed/Blog is active — covers tab clicks AND programmatic opens
  // (legacy `content` alias, Getting Started, setSocialTab("feed")).
  useEffect(() => {
    const dismiss = dismissRef.current;
    if (!dismiss) return;
    if (activeTab === "feed") {
      void dismiss("feed", { feedNotify: true }).catch(console.error);
    }
    if (activeTab === "blog") {
      void dismiss("blog").catch(console.error);
    }
  }, [activeTab, feedEngageCount, blogEngageCount]);

  // Blog/Feed openBrowserAt → mount Explore (browser).
  useEffect(() => {
    const goExplore = () => {
      onActiveTabChange("explore");
    };
    if (hasPendingBrowserOpen()) goExplore();
    window.addEventListener(OPEN_BROWSER_EVENT, goExplore);
    return () => window.removeEventListener(OPEN_BROWSER_EVENT, goExplore);
  }, [onActiveTabChange]);

  useEffect(() => {
    const pending = takePendingSocialContentPeer();
    if (pending) {
      setPeerOwnerId(pending.ownerId);
      onActiveTabChange(pending.surface === "blog" ? "blog" : "feed");
    }
    const onOpen = (ev: Event) => {
      const detail = (ev as CustomEvent<OpenSocialContentDetail>).detail;
      if (!detail?.ownerId?.trim()) return;
      setPeerOwnerId(detail.ownerId.trim());
      onActiveTabChange(detail.surface === "blog" ? "blog" : "feed");
    };
    window.addEventListener(OPEN_SOCIAL_CONTENT_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_SOCIAL_CONTENT_EVENT, onOpen);
  }, [onActiveTabChange]);

  const clearPeerFilter = () => {
    clearSocialContentPeerFilter();
    setPeerOwnerId(null);
  };

  const selectTab = (tab: SocialTab) => {
    // Manual tab click clears contact filter so Feed/Blog mean the full circle again.
    // Programmatic openSocialContent sets peerOwnerId via the event listener instead.
    clearPeerFilter();
    onActiveTabChange(tab);
  };

  const tabs: { id: SocialTab; label: string }[] = [
    { id: "chats", label: t("social.tabChats", "Chats") },
    { id: "feed", label: t("content.tabFeed", "Feed") },
    { id: "blog", label: t("content.tabBlog", "Blog") },
    { id: "discover", label: t("social.tabDiscover", "Discover") },
    { id: "explore", label: t("social.tabExplore", "Explore") },
  ];

  return (
    <div className="content-view social-view" data-testid="social-view">
      <div
        className="content-view__tabs"
        role="tablist"
        aria-label={t("social.tabs", "Social")}
      >
        {tabs.map((tab) => {
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
              aria-controls={`social-view-${tab.id}`}
              className={`content-view__tab${activeTab === tab.id ? " content-view__tab--active" : ""}${badge > 0 ? " has-inbox" : ""}`}
              onClick={() => selectTab(tab.id)}
              data-testid={`social-tab-${tab.id}`}
            >
              {tab.label}
              <Badge count={badge} />
            </button>
          );
        })}
      </div>
      <div
        className="content-view__content"
        role="tabpanel"
        id={`social-view-${activeTab}`}
      >
        {activeTab === "chats" ? (
          <ChatView {...chatProps} />
        ) : activeTab === "feed" ? (
          <FeedView
            peerOwnerId={peerOwnerId}
            onClearPeerFilter={clearPeerFilter}
          />
        ) : activeTab === "blog" ? (
          <BlogView
            peerOwnerId={peerOwnerId}
            onClearPeerFilter={clearPeerFilter}
          />
        ) : activeTab === "discover" ? (
          <DiscoverView />
        ) : (
          <BrowserView initialMode="bazaar" />
        )}
      </div>
    </div>
  );
}
