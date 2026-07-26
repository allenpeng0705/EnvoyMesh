/**
 * Phase 45 Pass 2 — Profile / Blog / PhotoWall / Feeds shortcuts.
 * Opens Browser so users never type envoy:// URLs.
 */
import { useT } from "../context/I18nContext.js";
import { openBrowserAt } from "../lib/browser-nav.js";
import { webContentUrl, type WebContentSurface } from "../lib/web-content-urls.js";

export interface ContactWebContentShortcutsProps {
  ownerId: string;
  /** Compact row for agent-card / menus (default true). */
  compact?: boolean;
  /** Include Feeds → contact Feed archive (`envoy://…/feeds/`). */
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
  { surface: "feeds", testId: "web-content-feeds", key: "agentCard.openFeeds", fallback: "Feeds" },
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

  const surfaces = includeFeeds
    ? SURFACES
    : SURFACES.filter((s) => s.surface !== "feeds");

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
        {surfaces.map(({ surface, testId, key, fallback }, i) => (
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
      </div>
    </div>
  );
}
