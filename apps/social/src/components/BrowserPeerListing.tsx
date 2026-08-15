/**
 * Peer Feed / Blog listing in Browser — same card language as Content → Feed / Blog.
 */
import { useMemo } from "react";
import {
  parseBlogIndexMarkdown,
  parseEnvoyUrl,
  parseFeedIndexMarkdown,
  type ParsedFeedIndexEntry,
} from "@envoymesh/api";
import { useT } from "../context/I18nContext.js";
import { contactLabel, shortOwnerId } from "../lib/display.js";
import { formatMomentsTime } from "../lib/moments-time.js";
import { useNodeState } from "../context/NodeStateContext.js";
import { ContentEngagementBar } from "./ContentEngagementBar.js";
import { PeerProfileAvatar } from "./PeerProfileAvatar.js";

export type BrowserPeerListingKind = "feed" | "blog";

function normalizeListingPath(path: string): string {
  return path.replace(/^\/+/, "").replace(/\/+$/, "");
}

/** True when the Browser URL is a Feed or Blog index (not a single post). */
export function peerListingKindForUrl(url: string): BrowserPeerListingKind | null {
  try {
    const path = normalizeListingPath(parseEnvoyUrl(url).path);
    if (path === "feeds" || path === "feeds/index.md") return "feed";
    if (path === "blog" || path === "blog/index.md") return "blog";
  } catch {
    /* ignore */
  }
  return null;
}

export function parsePeerListingEntries(
  kind: BrowserPeerListingKind,
  body: string,
): ParsedFeedIndexEntry[] {
  return kind === "feed" ? parseFeedIndexMarkdown(body) : parseBlogIndexMarkdown(body);
}

export function isPeerListingMarkdown(kind: BrowserPeerListingKind, body: string): boolean {
  if (parsePeerListingEntries(kind, body).length > 0) return true;
  // Seeded empty indexes from buildFeedIndexMarkdown / buildBlogIndexMarkdown
  // (not visitor placeholders, which use different copy).
  return body.includes("_No posts yet._");
}

export function BrowserPeerListing({
  kind,
  entries,
  publisherOwnerId,
  onOpenUrl,
}: {
  kind: BrowserPeerListingKind;
  entries: ParsedFeedIndexEntry[];
  publisherOwnerId: string;
  onOpenUrl: (url: string) => void;
}) {
  const t = useT();
  const { bonds, humanProfile } = useNodeState();
  const locale = typeof navigator !== "undefined" ? navigator.language : "en";
  const selfOwnerId = humanProfile?.ownerId?.trim() ?? "";
  const name = useMemo(() => {
    if (publisherOwnerId && publisherOwnerId === selfOwnerId) {
      return humanProfile?.displayName?.trim() || t(kind === "feed" ? "feed.you" : "blog.you", "You");
    }
    const bond = bonds.find((b) => b.peerOwnerId === publisherOwnerId);
    if (bond) return contactLabel(bond);
    return shortOwnerId(publisherOwnerId);
  }, [bonds, humanProfile?.displayName, kind, publisherOwnerId, selfOwnerId, t]);

  const title =
    kind === "feed" ? t("agentCard.openFeeds", "Feed") : t("agentCard.openBlog", "Blog");
  const emptyTitle =
    kind === "feed"
      ? t("feed.emptyTitle", "Your circle is quiet")
      : t("blog.emptyTitle", "No posts yet");
  const emptyBody =
    kind === "feed"
      ? t("browser.peerFeedEmpty", "This contact hasn’t shared any Feed posts yet.")
      : t("browser.peerBlogEmpty", "This contact hasn’t published any Blog posts yet.");

  return (
    <div
      className={`feed-view browser-peer-listing${kind === "blog" ? " blog-view" : ""}`}
      data-testid={kind === "feed" ? "browser-peer-feed" : "browser-peer-blog"}
    >
      <div className="feed-view__atmosphere" aria-hidden />
      <header className="feed-view__header">
        <div className="feed-view__brand">
          <h2 className="feed-view__title">{title}</h2>
          <p className="feed-view__lede">{name}</p>
        </div>
      </header>

      {entries.length === 0 ? (
        <div className={`feed-view__empty${kind === "blog" ? " blog-view__empty" : ""}`}>
          <div className="feed-view__empty-orb" aria-hidden />
          <h3>{emptyTitle}</h3>
          <p>{emptyBody}</p>
        </div>
      ) : kind === "feed" ? (
        <ul className="feed-view__list" data-testid="browser-peer-feed-list">
          {entries.map((entry, index) => (
            <li
              key={entry.url}
              className="feed-view__card"
              style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
            >
              <button
                type="button"
                className="browser-peer-listing__hit"
                onClick={() => onOpenUrl(entry.url)}
                aria-label={`${title}: ${entry.title}`}
              >
                <div className="feed-view__card-head">
                  <PeerProfileAvatar
                    ownerId={publisherOwnerId}
                    fallbackLabel={name}
                    className="feed-view__card-avatar"
                  />
                  <div className="feed-view__card-meta">
                    <strong>{name}</strong>
                  </div>
                </div>
                <div className="feed-view__card-content">
                  <p className="feed-view__card-body">{entry.summary?.trim() || entry.title}</p>
                </div>
              </button>
              <div className="feed-view__card-content browser-peer-listing__engage">
                <ContentEngagementBar
                  url={entry.url}
                  className="feed-view__engagement"
                  meta={
                    <time className="content-engagement__time" dateTime={entry.publishedAt}>
                      {formatMomentsTime(entry.publishedAt, locale)}
                    </time>
                  }
                />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="blog-view__list" data-testid="browser-peer-blog-list">
          {entries.map((entry, index) => (
            <li
              key={entry.url}
              className="blog-view__card"
              data-testid="browser-peer-blog-card"
              style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
            >
              <button
                type="button"
                className="blog-view__card-hit"
                onClick={() => onOpenUrl(entry.url)}
                aria-label={t("blog.openPost", "Open post") + `: ${entry.title}`}
              >
                <h3 className="blog-view__card-title">{entry.title}</h3>
                {entry.summary ? (
                  <p className="blog-view__card-excerpt">{entry.summary}</p>
                ) : null}
              </button>
              <ContentEngagementBar
                url={entry.url}
                className="blog-view__engagement"
                meta={
                  <time className="content-engagement__time" dateTime={entry.publishedAt}>
                    {formatMomentsTime(entry.publishedAt, locale)}
                  </time>
                }
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
