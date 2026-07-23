/**
 * Phase 45 Pass 2 — Profile / Blog / PhotoWall / Feeds shortcuts.
 * Opens Browser (or Inbox for Feeds) so users never type envoy:// URLs.
 */
import { useT } from "../context/I18nContext.js";
import { openBrowserAt, openChatInbox } from "../lib/browser-nav.js";
import { webContentUrl, type WebContentSurface } from "../lib/web-content-urls.js";

export interface ContactWebContentShortcutsProps {
  ownerId: string;
  /** Compact row for agent-card / menus (default true). */
  compact?: boolean;
  /** Include Feeds → Chat Inbox filtered to this publisher. */
  includeFeeds?: boolean;
  /**
   * When set (e.g. Browser Bazaar already open), open URLs via this callback
   * instead of dispatching a cross-view Browser navigation event.
   */
  onOpenUrl?: (url: string) => void;
}

const SURFACES: Array<{
  surface: WebContentSurface;
  testId: string;
  key: string;
  fallback: string;
}> = [
  { surface: "profile", testId: "web-content-profile", key: "agentCard.openProfile", fallback: "Profile" },
  { surface: "blog", testId: "web-content-blog", key: "agentCard.openBlog", fallback: "Blog" },
  { surface: "photowall", testId: "web-content-photowall", key: "agentCard.openPhotoWall", fallback: "PhotoWall" },
];

export function ContactWebContentShortcuts({
  ownerId,
  compact = true,
  includeFeeds = true,
  onOpenUrl,
}: ContactWebContentShortcutsProps) {
  const t = useT();
  const id = ownerId.trim();
  if (!id) return null;

  const openSurface = (surface: WebContentSurface) => {
    const url = webContentUrl(id, surface);
    if (onOpenUrl) onOpenUrl(url);
    else openBrowserAt(url);
  };

  return (
    <div
      className={`contact-web-content${compact ? " contact-web-content--compact" : ""}`}
      data-testid="contact-web-content-shortcuts"
    >
      {!compact ? (
        <h5 className="contact-web-content__title">
          {t("agentCard.publishedContent", "Published content")}
        </h5>
      ) : null}
      <div
        className="contact-web-content__actions contact-web-content__actions--links"
        role="group"
        aria-label={t("agentCard.publishedContent", "Published content")}
      >
        {SURFACES.map(({ surface, testId, key, fallback }, i) => (
          <span key={surface} className="contact-web-content__link-item">
            {i > 0 ? <span className="contact-web-content__sep" aria-hidden="true">·</span> : null}
            <button
              type="button"
              className="contact-web-content__link"
              data-testid={testId}
              onClick={() => openSurface(surface)}
            >
              {t(key, fallback)}
            </button>
          </span>
        ))}
        {includeFeeds ? (
          <span className="contact-web-content__link-item">
            <span className="contact-web-content__sep" aria-hidden="true">·</span>
            <button
              type="button"
              className="contact-web-content__link"
              data-testid="web-content-feeds"
              onClick={() => openChatInbox({ publisherOwnerId: id })}
            >
              {t("agentCard.openFeeds", "Feeds")}
            </button>
          </span>
        ) : null}
      </div>
    </div>
  );
}
