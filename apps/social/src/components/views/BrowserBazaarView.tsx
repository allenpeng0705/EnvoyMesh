/**
 * Phase 45 Pass 3 — Browser Bazaar: browse published mesh links without typing URLs.
 *
 * Composes existing APIs only:
 * - listFeedNotifications (push from bonded publishers)
 * - bonds + agent cards (contact shelves / public topics)
 * - searchPeers({ topic: "publish:…" }) for topic discovery
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FeedNotification, PeerSearchResult } from "@envoymesh/api";
import { useT } from "../../context/I18nContext.js";
import { useNodeState } from "../../context/NodeStateContext.js";
import { useAgentCards, useNodeService } from "../../hooks/useNodeService.js";
import { contactLabel, shortOwnerId } from "../../lib/display.js";
import { publishSearchTopic } from "../../lib/publish-topic.js";
import { webContentUrl } from "../../lib/web-content-urls.js";
import { ContactWebContentShortcuts } from "../ContactWebContentShortcuts.js";
import { MySitePanel } from "../MySitePanel.js";
import type { AuthorTemplate } from "./BrowserAuthorView.js";

export { publishSearchTopic } from "../../lib/publish-topic.js";

export interface BrowserBazaarViewProps {
  /** Open a content URL in Browse mode. */
  onOpenUrl: (url: string) => void;
  /** Open Browser author with a template. */
  onCreate?: (template: AuthorTemplate) => void;
  /** Local owner id for My site panel. */
  ownerId?: string;
}

const AGENT_CARD_WARM_LIMIT = 8;

export function BrowserBazaarView({ onOpenUrl, onCreate, ownerId }: BrowserBazaarViewProps) {
  const t = useT();
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

  const bondedIds = useMemo(
    () => new Set(bonds.map((b) => b.peerOwnerId)),
    [bonds],
  );

  const contactFeed = useMemo(
    () => feedItems.filter((item) => bondedIds.has(item.publisherOwnerId)),
    [feedItems, bondedIds],
  );

  const refreshFeed = useCallback(async () => {
    setFeedBusy(true);
    try {
      const rows = await nodeService.listFeedNotifications();
      setFeedItems(rows);
      // Warm only missing agent cards (capped) so shelves show webContentRoot / topics.
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
      console.error("[BrowserBazaar] refresh feed failed:", err);
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
      console.error("[BrowserBazaar] topic search failed:", err);
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

  const bondRows = useMemo(() => {
    return [...bonds]
      .filter((b) => b.level !== "blocked")
      .sort((a, b) => contactLabel(a).localeCompare(contactLabel(b)));
  }, [bonds]);

  return (
    <div className="browser-bazaar" data-testid="browser-bazaar">
      <div className="browser-bazaar__toolbar">
        <p className="browser-bazaar__intro">
          {t(
            "browser.bazaar.intro",
            "Published posts from contacts, their site shelves, and topic discovery — no long URLs required.",
          )}
        </p>
        <button
          type="button"
          className="browser-bazaar__refresh"
          data-testid="bazaar-refresh"
          disabled={feedBusy}
          onClick={() => void refreshFeed()}
        >
          <BazaarIconRefresh spinning={feedBusy} />
          {feedBusy
            ? t("browser.bazaar.refreshing", "Refreshing…")
            : t("browser.bazaar.refresh", "Refresh")}
        </button>
      </div>

      <section className="browser-bazaar__section" aria-labelledby="bazaar-feed-heading">
        <h3 id="bazaar-feed-heading" className="browser-bazaar__heading">
          {t("browser.bazaar.feedHeading", "From your contacts")}
        </h3>
        {contactFeed.length === 0 ? (
          <p className="browser-bazaar__empty" data-testid="bazaar-feed-empty">
            {t(
              "browser.bazaar.feedEmpty",
              "No published posts yet. When bonded contacts publish, they show up here.",
            )}
          </p>
        ) : (
          <ul className="browser-bazaar__feed" data-testid="bazaar-feed-list">
            {contactFeed.map((item) => (
              <li key={item.id} className="browser-bazaar__feed-item">
                <button
                  type="button"
                  className="browser-bazaar__feed-open"
                  data-testid="bazaar-feed-open"
                  onClick={() => onOpenUrl(item.url)}
                >
                  <span className="browser-bazaar__feed-title">{item.title}</span>
                  <span className="browser-bazaar__feed-meta">
                    {shortOwnerId(item.publisherOwnerId)}
                    {" · "}
                    {item.kind}
                    {item.publishedAt
                      ? ` · ${new Date(item.publishedAt).toLocaleString()}`
                      : ""}
                  </span>
                  {item.summary ? (
                    <span className="browser-bazaar__feed-summary">{item.summary}</span>
                  ) : null}
                  {item.tags && item.tags.length > 0 ? (
                    <span className="browser-bazaar__feed-tags">{item.tags.join(" · ")}</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="browser-bazaar__section" aria-labelledby="bazaar-shelves-heading">
        <h3 id="bazaar-shelves-heading" className="browser-bazaar__heading">
          {t("browser.bazaar.shelvesHeading", "Contact shelves")}
        </h3>
        {bondRows.length === 0 ? (
          <p className="browser-bazaar__empty">
            {t("browser.bazaar.shelvesEmpty", "Bond with contacts to see their published sites here.")}
          </p>
        ) : (
          <ul className="browser-bazaar__shelves" data-testid="bazaar-shelves">
            {bondRows.map((bond) => {
              const card = cards.find((c) => c.ownerId === bond.peerOwnerId);
              const label = contactLabel(bond);
              const topics = card?.publicTopics?.filter(Boolean) ?? [];
              return (
                <li key={bond.peerOwnerId} className="browser-bazaar__shelf">
                  <div className="browser-bazaar__shelf-head">
                    <button
                      type="button"
                      className="browser-bazaar__shelf-name"
                      onClick={() =>
                        onOpenUrl(card?.webContentRoot ?? webContentUrl(bond.peerOwnerId, "profile"))
                      }
                    >
                      {label}
                    </button>
                    {topics.length > 0 ? (
                      <span className="browser-bazaar__shelf-topics">{topics.slice(0, 6).join(" · ")}</span>
                    ) : null}
                  </div>
                  <ContactWebContentShortcuts
                    ownerId={bond.peerOwnerId}
                    includeFeeds={false}
                    onOpenUrl={onOpenUrl}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="browser-bazaar__section" aria-labelledby="bazaar-topic-heading">
        <h3 id="bazaar-topic-heading" className="browser-bazaar__heading">
          {t("browser.bazaar.topicHeading", "Discover by topic")}
        </h3>
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
            placeholder={t("browser.bazaar.topicPlaceholder", "photography, cooking, travel…")}
            value={topicQuery}
            onChange={(e) => setTopicQuery(e.target.value)}
          />
          <button
            type="submit"
            className="browser-bazaar__topic-go"
            data-testid="bazaar-topic-search"
            disabled={topicBusy}
          >
            <BazaarIconSearch />
            {topicBusy
              ? t("browser.bazaar.topicSearching", "Searching…")
              : t("browser.bazaar.topicSearch", "Search")}
          </button>
        </form>
        {topicError ? (
          <p className="browser-bazaar__topic-status" data-testid="bazaar-topic-status">
            {topicError}
          </p>
        ) : null}
        {topicResults.length > 0 ? (
          <ul className="browser-bazaar__topic-results" data-testid="bazaar-topic-results">
            {topicResults.map((peer) => (
              <li key={`${peer.ownerId}-${peer.nodeId}`} className="browser-bazaar__topic-row">
                <div className="browser-bazaar__topic-peer">
                  <strong>{peer.displayName || shortOwnerId(peer.ownerId)}</strong>
                  <span className="browser-bazaar__feed-meta">{shortOwnerId(peer.ownerId)}</span>
                  {peer.interests?.length ? (
                    <span className="browser-bazaar__shelf-topics">{peer.interests.slice(0, 6).join(" · ")}</span>
                  ) : null}
                </div>
                <div className="browser-bazaar__topic-actions">
                  <button
                    type="button"
                    className="contact-web-content__btn"
                    onClick={() => onOpenUrl(webContentUrl(peer.ownerId, "profile"))}
                  >
                    {t("agentCard.openProfile", "Profile")}
                  </button>
                  <button
                    type="button"
                    className="contact-web-content__btn"
                    onClick={() => onOpenUrl(webContentUrl(peer.ownerId, "blog"))}
                  >
                    {t("agentCard.openBlog", "Blog")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {ownerId ? (
        <MySitePanel ownerId={ownerId} onOpenUrl={onOpenUrl} onCreate={onCreate} />
      ) : null}
    </div>
  );
}

function BazaarIconRefresh({ spinning }: { spinning: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="15"
      height="15"
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

function BazaarIconSearch() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  );
}
