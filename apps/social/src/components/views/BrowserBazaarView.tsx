/**
 * Explore → Following: browse published mesh links without typing URLs.
 *
 * Feed-first: recent posts from bonded contacts, then people shelves,
 * then quieter topic discovery.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FeedNotification, PeerSearchResult } from "@envoymesh/api";
import { useI18n, useT } from "../../context/I18nContext.js";
import { useNodeState } from "../../context/NodeStateContext.js";
import { useAgentCards, useNodeService } from "../../hooks/useNodeService.js";
import { contactLabel, shortOwnerId } from "../../lib/display.js";
import { formatMomentsTime } from "../../lib/moments-time.js";
import { publishSearchTopic } from "../../lib/publish-topic.js";
import { webContentUrl } from "../../lib/web-content-urls.js";
import { ContactWebContentShortcuts } from "../ContactWebContentShortcuts.js";
import { PeerProfileAvatar } from "../PeerProfileAvatar.js";

export { publishSearchTopic } from "../../lib/publish-topic.js";

export interface BrowserBazaarViewProps {
  /** Open a content URL in Open (reader) mode. */
  onOpenUrl: (url: string) => void;
}

const AGENT_CARD_WARM_LIMIT = 8;

export function BrowserBazaarView({ onOpenUrl }: BrowserBazaarViewProps) {
  const t = useT();
  const { locale } = useI18n();
  const nodeService = useNodeService();
  const { bonds } = useNodeState();
  const cards = useAgentCards();
  const warmedCardsRef = useRef(new Set<string>());
  const cardsRef = useRef(cards);
  cardsRef.current = cards;

  const [feedItems, setFeedItems] = useState<FeedNotification[]>([]);
  const [feedBusy, setFeedBusy] = useState(false);
  const [topicQuery, setTopicQuery] = useState("");
  const [topicResults, setTopicResults] = useState<PeerSearchResult[]>([]);
  const [topicBusy, setTopicBusy] = useState(false);
  const [topicError, setTopicError] = useState<string | null>(null);

  const bondByOwner = useMemo(() => {
    const map = new Map(bonds.map((b) => [b.peerOwnerId, b]));
    return map;
  }, [bonds]);

  const bondedIds = useMemo(() => new Set(bondByOwner.keys()), [bondByOwner]);

  const contactFeed = useMemo(
    () =>
      feedItems
        .filter((item) => bondedIds.has(item.publisherOwnerId))
        .slice()
        .sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1)),
    [feedItems, bondedIds],
  );

  const refreshFeed = useCallback(async () => {
    setFeedBusy(true);
    try {
      const rows = await nodeService.listFeedNotifications();
      setFeedItems(rows);
      const cached = new Set(cardsRef.current.map((c) => c.ownerId));
      const toWarm = bonds
        .filter((b) => b.level !== "blocked")
        .map((b) => b.peerOwnerId)
        .filter((id) => !cached.has(id) && !warmedCardsRef.current.has(id))
        .slice(0, AGENT_CARD_WARM_LIMIT);
      for (const id of toWarm) warmedCardsRef.current.add(id);
      if (toWarm.length > 0) {
        await Promise.allSettled(toWarm.map((id) => nodeService.requestAgentCard(id)));
      }
    } catch (err) {
      console.error("[BrowserFollowing] refresh feed failed:", err);
    } finally {
      setFeedBusy(false);
    }
  }, [nodeService, bonds]);

  useEffect(() => {
    void refreshFeed();
    const unsub = nodeService.on?.("feed:notify", (data: FeedNotification) => {
      setFeedItems((prev) => {
        if (prev.some((p) => p.messageId === data.messageId || p.id === data.id)) return prev;
        return [data, ...prev];
      });
    });
    return () => {
      unsub?.();
    };
  }, [nodeService, refreshFeed]);

  const runTopicSearch = useCallback(async () => {
    const topic = publishSearchTopic(topicQuery);
    if (!topic) {
      setTopicResults([]);
      setTopicError(t("browser.bazaar.topicEmpty", "Enter a topic to search (e.g. photography)."));
      return;
    }
    setTopicBusy(true);
    setTopicError(null);
    try {
      await nodeService.runCapabilityDiscovery?.({ find: true }).catch(() => undefined);
      const results = await nodeService.searchPeers({ topic, maxResults: 20 });
      setTopicResults(results);
      if (results.length === 0) {
        setTopicError(t("browser.bazaar.topicNoResults", "No publishers found for this topic yet."));
      }
    } catch (err) {
      console.error("[BrowserFollowing] topic search failed:", err);
      setTopicResults([]);
      setTopicError(
        t("browser.bazaar.topicError", {
          message: err instanceof Error ? err.message : String(err),
        }),
      );
    } finally {
      setTopicBusy(false);
    }
  }, [nodeService, topicQuery, t]);

  const shelves = useMemo(() => {
    return bonds
      .filter((b) => b.level !== "blocked")
      .map((bond) => {
        const card = cards.find((c) => c.ownerId === bond.peerOwnerId);
        return { bond, card };
      });
  }, [bonds, cards]);

  function publisherName(ownerId: string): string {
    const bond = bondByOwner.get(ownerId);
    return bond ? contactLabel(bond) : shortOwnerId(ownerId);
  }

  function kindLabel(kind: string): string | null {
    const k = kind.trim().toLowerCase();
    if (!k) return null;
    if (k === "blog" || k === "blog-post") return t("browser.bazaar.kindBlog", "Blog");
    if (k === "note" || k === "feed") return t("browser.bazaar.kindNote", "Note");
    if (k === "photo" || k === "photowall") return t("browser.bazaar.kindPhoto", "Photo");
    return null;
  }

  return (
    <div className="browser-bazaar" data-testid="browser-following">
      <header className="browser-bazaar__toolbar">
        <div className="browser-bazaar__lede">
          <p className="browser-bazaar__intro">
            {t("browser.bazaar.intro", "Posts and pages from people you follow.")}
          </p>
        </div>
        <button
          type="button"
          className="browser-bazaar__refresh"
          data-testid="bazaar-refresh"
          disabled={feedBusy}
          aria-label={
            feedBusy
              ? t("browser.bazaar.refreshing", "Refreshing…")
              : t("browser.bazaar.refresh", "Refresh")
          }
          title={t("browser.bazaar.refresh", "Refresh")}
          onClick={() => void refreshFeed()}
        >
          <BazaarIconRefresh spinning={feedBusy} />
        </button>
      </header>

      <section className="browser-bazaar__section" aria-labelledby="bazaar-feed-heading">
        <div className="browser-bazaar__section-head">
          <h3 id="bazaar-feed-heading" className="browser-bazaar__heading">
            {t("browser.bazaar.feedHeading", "Recent")}
          </h3>
          {contactFeed.length > 0 ? (
            <span className="browser-bazaar__count">{contactFeed.length}</span>
          ) : null}
        </div>
        {contactFeed.length === 0 ? (
          <p className="browser-bazaar__empty" data-testid="bazaar-feed-empty">
            {t(
              "browser.bazaar.feedEmpty",
              "Nothing new yet. When contacts publish, their posts land here.",
            )}
          </p>
        ) : (
          <ul className="browser-bazaar__feed" data-testid="bazaar-feed-list">
            {contactFeed.map((item, index) => {
              const name = publisherName(item.publisherOwnerId);
              const kind = kindLabel(item.kind);
              return (
                <li
                  key={item.id}
                  className="browser-bazaar__feed-item"
                  style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
                >
                  <button
                    type="button"
                    className="browser-bazaar__feed-open"
                    data-testid="bazaar-feed-open"
                    onClick={() => onOpenUrl(item.url)}
                  >
                    <PeerProfileAvatar
                      ownerId={item.publisherOwnerId}
                      fallbackLabel={name}
                      className="browser-bazaar__avatar"
                    />
                    <span className="browser-bazaar__feed-body">
                      <span className="browser-bazaar__feed-top">
                        <span className="browser-bazaar__feed-who">{name}</span>
                        <time
                          className="browser-bazaar__feed-time"
                          dateTime={item.publishedAt}
                        >
                          {formatMomentsTime(item.publishedAt, locale)}
                        </time>
                      </span>
                      <span className="browser-bazaar__feed-title">{item.title}</span>
                      {item.summary ? (
                        <span className="browser-bazaar__feed-summary">{item.summary}</span>
                      ) : null}
                      {kind || (item.tags && item.tags.length > 0) ? (
                        <span className="browser-bazaar__feed-tags">
                          {kind ? <span className="browser-bazaar__chip">{kind}</span> : null}
                          {(item.tags ?? []).slice(0, 3).map((tag) => (
                            <span key={tag} className="browser-bazaar__chip">
                              {tag}
                            </span>
                          ))}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="browser-bazaar__section" aria-labelledby="bazaar-shelves-heading">
        <div className="browser-bazaar__section-head">
          <h3 id="bazaar-shelves-heading" className="browser-bazaar__heading">
            {t("browser.bazaar.shelvesHeading", "People")}
          </h3>
        </div>
        {shelves.length === 0 ? (
          <p className="browser-bazaar__empty">
            {t("browser.bazaar.shelvesEmpty", "Bond with contacts to browse their sites here.")}
          </p>
        ) : (
          <ul className="browser-bazaar__shelves" data-testid="bazaar-shelves">
            {shelves.map(({ bond }) => {
              const name = contactLabel(bond);
              return (
                <li key={bond.peerOwnerId} className="browser-bazaar__shelf">
                  <div className="browser-bazaar__shelf-head">
                    <PeerProfileAvatar
                      ownerId={bond.peerOwnerId}
                      fallbackLabel={name}
                      className="browser-bazaar__avatar browser-bazaar__avatar--sm"
                    />
                    <button
                      type="button"
                      className="browser-bazaar__shelf-name"
                      onClick={() => onOpenUrl(webContentUrl(bond.peerOwnerId, "profile"))}
                    >
                      {name}
                    </button>
                  </div>
                  <ContactWebContentShortcuts
                    ownerId={bond.peerOwnerId}
                    onOpenUrl={onOpenUrl}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section
        className="browser-bazaar__section browser-bazaar__section--topic"
        aria-labelledby="bazaar-topic-heading"
      >
        <div className="browser-bazaar__section-head">
          <h3 id="bazaar-topic-heading" className="browser-bazaar__heading">
            {t("browser.bazaar.topicHeading", "Find by topic")}
          </h3>
        </div>
        <p className="browser-bazaar__topic-hint">
          {t(
            "browser.bazaar.topicHint",
            "Search publishers who advertise a topic on the mesh.",
          )}
        </p>
        <form
          className="browser-bazaar__topic-form"
          onSubmit={(e) => {
            e.preventDefault();
            void runTopicSearch();
          }}
        >
          <input
            type="search"
            className="browser-bazaar__topic-input"
            data-testid="bazaar-topic-input"
            value={topicQuery}
            onChange={(e) => setTopicQuery(e.target.value)}
            placeholder={t("browser.bazaar.topicPlaceholder", "photography, cooking, travel…")}
            aria-label={t("browser.bazaar.topicHeading", "Find by topic")}
          />
          <button
            type="submit"
            className="browser-bazaar__topic-go"
            data-testid="bazaar-topic-search"
            disabled={topicBusy}
          >
            {topicBusy
              ? t("browser.bazaar.topicSearching", "Searching…")
              : t("browser.bazaar.topicSearch", "Search")}
          </button>
        </form>
        {topicError ? (
          <p className="browser-bazaar__empty" data-testid="bazaar-topic-error">
            {topicError}
          </p>
        ) : null}
        {topicResults.length > 0 ? (
          <ul className="browser-bazaar__topic-results" data-testid="bazaar-topic-results">
            {topicResults.map((peer) => {
              const name = peer.displayName?.trim() || shortOwnerId(peer.ownerId);
              return (
                <li key={peer.ownerId} className="browser-bazaar__topic-peer">
                  <div className="browser-bazaar__topic-peer-main">
                    <PeerProfileAvatar
                      ownerId={peer.ownerId}
                      fallbackLabel={name}
                      className="browser-bazaar__avatar browser-bazaar__avatar--sm"
                    />
                    <div className="browser-bazaar__topic-peer-text">
                      <strong>{name}</strong>
                      {peer.interests?.length ? (
                        <span className="browser-bazaar__shelf-topics">
                          {peer.interests.slice(0, 6).join(" · ")}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="browser-bazaar__topic-actions">
                    <button
                      type="button"
                      className="contact-web-content__link"
                      onClick={() => onOpenUrl(webContentUrl(peer.ownerId, "profile"))}
                    >
                      {t("agentCard.openProfile", "Profile")}
                    </button>
                    <span className="contact-web-content__sep" aria-hidden="true">
                      ·
                    </span>
                    <button
                      type="button"
                      className="contact-web-content__link"
                      onClick={() => onOpenUrl(webContentUrl(peer.ownerId, "blog"))}
                    >
                      {t("agentCard.openBlog", "Blog")}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}
      </section>
    </div>
  );
}

function BazaarIconRefresh({ spinning }: { spinning: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={spinning ? { animation: "browser-spin 0.7s linear infinite" } : undefined}
    >
      <path d="M20 12a8 8 0 1 1-2.2-5.5M20 4v5h-5" />
    </svg>
  );
}
