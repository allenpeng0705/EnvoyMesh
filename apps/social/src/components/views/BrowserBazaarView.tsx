/**
 * Explore → People: discover non-bonded peers (topic / interest / place),
 * or sample the mesh for public profiles & blogs. Say Hello to bond.
 * Bonded Moments stay on Content → Feed — not duplicated here.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { HelloProfile, PeerSearchResult } from "@envoymesh/api";
import { locationSearchTopics } from "@envoymesh/api";
import { useT } from "../../context/I18nContext.js";
import { useNodeState } from "../../context/NodeStateContext.js";
import { useNodeService } from "../../hooks/useNodeService.js";
import { useToastOptional } from "../../hooks/useToast.js";
import { SUGGESTED_TOPICS, shortOwnerId } from "../../lib/display.js";
import {
  loadOutboundHellos,
  markOutboundHello,
  resolvePeerHelloState,
} from "../../lib/discover-peer-state.js";
import { publishSearchTopic } from "../../lib/publish-topic.js";
import { webContentUrl } from "../../lib/web-content-urls.js";
import { PeerProfileAvatar } from "../PeerProfileAvatar.js";

export { publishSearchTopic } from "../../lib/publish-topic.js";

export interface BrowserBazaarViewProps {
  /** Open a content URL in Open (reader) mode. */
  onOpenUrl: (url: string) => void;
}

type PeopleSearchMode = "topic" | "interest" | "place";

const SAMPLE_CAP = 20;
const WEB_CONTENT_CAPABILITY_TOPIC = "capability:envoymesh.web-content";

function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return arr;
}

function mergePeers(
  into: PeerSearchResult[],
  rows: PeerSearchResult[],
  exclude: ReadonlySet<string>,
): void {
  for (const r of rows) {
    const owner = r.ownerId?.trim();
    if (!owner || exclude.has(owner)) continue;
    if (into.some((e) => e.ownerId === owner || e.nodeId === r.nodeId)) continue;
    into.push(r);
  }
}

export function BrowserBazaarView({ onOpenUrl }: BrowserBazaarViewProps) {
  const t = useT();
  const nodeService = useNodeService();
  const { bonds, humanProfile, discoveredPeers, sendHello } = useNodeState();
  const { showToast } = useToastOptional() ?? { showToast: undefined };

  const [searchMode, setSearchMode] = useState<PeopleSearchMode>("topic");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PeerSearchResult[]>([]);
  const [resultSource, setResultSource] = useState<"search" | "sample">("sample");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outboundHellos, setOutboundHellos] = useState(() => loadOutboundHellos());
  const [helloBusyId, setHelloBusyId] = useState<string | null>(null);

  const excludeIds = useMemo(() => {
    const s = new Set<string>();
    const self = humanProfile?.ownerId?.trim();
    if (self) s.add(self);
    for (const b of bonds) {
      if (b.peerOwnerId) s.add(b.peerOwnerId);
      if (b.libp2pPeerId) s.add(b.libp2pPeerId);
    }
    return s;
  }, [bonds, humanProfile?.ownerId]);

  const filterNonBonded = useCallback(
    (rows: PeerSearchResult[]) =>
      rows.filter((r) => {
        const owner = r.ownerId?.trim();
        if (!owner || excludeIds.has(owner)) return false;
        if (r.nodeId && excludeIds.has(r.nodeId)) return false;
        // Hide already-bonded trust levels if present
        if (r.trustLevel === "direct" || r.trustLevel === "referred") return false;
        return true;
      }),
    [excludeIds],
  );

  const { searchPeers, runCapabilityDiscovery } = nodeService;

  const sampleMesh = useCallback(async (): Promise<PeerSearchResult[]> => {
    const out: PeerSearchResult[] = [];
    await runCapabilityDiscovery?.({ find: true }).catch(() => undefined);

    try {
      const web = await searchPeers({
        topic: WEB_CONTENT_CAPABILITY_TOPIC,
        maxResults: SAMPLE_CAP,
      });
      mergePeers(out, filterNonBonded(web), excludeIds);
    } catch {
      /* best-effort */
    }

    const topics = shuffleInPlace([...SUGGESTED_TOPICS]).slice(0, 4);
    const profileHints = [
      ...(humanProfile?.hobbies ?? []),
      ...(humanProfile?.knowledge ?? []),
    ]
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 3);
    for (const slug of [...profileHints, ...topics]) {
      if (out.length >= SAMPLE_CAP) break;
      try {
        const hits = await searchPeers({
          interests: [slug],
          maxResults: 8,
        });
        mergePeers(out, filterNonBonded(hits), excludeIds);
      } catch {
        /* continue */
      }
    }

    const loc = humanProfile?.discoveryLocation;
    const locPrecision = humanProfile?.discoveryLocationPrecision;
    if (loc && locPrecision && locPrecision !== "hidden" && out.length < SAMPLE_CAP) {
      try {
        const geoTopics = locationSearchTopics({ location: loc, scope: "city" });
        if (geoTopics.length > 0) {
          const geo = await searchPeers({
            topics: geoTopics,
            maxResults: 12,
          });
          mergePeers(out, filterNonBonded(geo), excludeIds);
        }
      } catch {
        /* best-effort */
      }
    }

    mergePeers(out, filterNonBonded(discoveredPeers ?? []), excludeIds);
    return shuffleInPlace(out).slice(0, SAMPLE_CAP);
  }, [
    searchPeers,
    runCapabilityDiscovery,
    filterNonBonded,
    excludeIds,
    humanProfile?.hobbies,
    humanProfile?.knowledge,
    humanProfile?.discoveryLocation,
    humanProfile?.discoveryLocationPrecision,
    discoveredPeers,
  ]);

  const refreshSample = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const rows = await sampleMesh();
      setResults(rows);
      setResultSource("sample");
      if (rows.length === 0) {
        setError(
          t(
            "browser.bazaar.sampleEmpty",
            "No public people found on the mesh yet. Try a topic search, or check back when more nodes are online.",
          ),
        );
      }
    } catch (err) {
      console.error("[BrowserPeople] sample failed:", err);
      setResults([]);
      setError(
        t("browser.bazaar.topicError", {
          message: err instanceof Error ? err.message : String(err),
        }),
      );
    } finally {
      setBusy(false);
    }
  }, [sampleMesh, t]);

  // Initial mesh sample only — Refresh / Search re-run explicitly.
  // Avoid depending on refreshSample: mocks often return new [] / client each render.
  useEffect(() => {
    void refreshSample();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only
  }, []);

  const runSearch = useCallback(async () => {
    const q = query.trim();
    if (searchMode !== "place" && !q) {
      setError(t("browser.bazaar.topicEmpty", "Enter a topic to search (e.g. photography)."));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await runCapabilityDiscovery?.({ find: true }).catch(() => undefined);
      let rows: PeerSearchResult[] = [];

      if (searchMode === "topic") {
        const topic = publishSearchTopic(q);
        if (!topic) {
          setError(t("browser.bazaar.topicEmpty", "Enter a topic to search (e.g. photography)."));
          setBusy(false);
          return;
        }
        rows = await searchPeers({ topic, maxResults: 20 });
      } else if (searchMode === "interest") {
        rows = await searchPeers({ interests: [q], maxResults: 20 });
      } else {
        const loc = humanProfile?.discoveryLocation;
        const locPrecision = humanProfile?.discoveryLocationPrecision;
        if (!loc || !locPrecision || locPrecision === "hidden") {
          setError(
            t(
              "browser.bazaar.placeNeedsLocation",
              "Set a discovery location in your profile to search by place.",
            ),
          );
          setBusy(false);
          return;
        }
        const topics = locationSearchTopics({ location: loc, scope: "city" });
        rows = topics.length
          ? await searchPeers({ topics, maxResults: 20 })
          : [];
      }

      const filtered = filterNonBonded(rows);
      if (filtered.length === 0) {
        // Fallback: random-ish mesh sample
        const sample = await sampleMesh();
        setResults(sample);
        setResultSource("sample");
        setError(
          sample.length > 0
            ? t(
                "browser.bazaar.fallbackSample",
                "No matches for that search — showing other people on the mesh with public pages.",
              )
            : t(
                "browser.bazaar.topicNoResults",
                "No publishers found for this topic yet.",
              ),
        );
      } else {
        setResults(filtered);
        setResultSource("search");
      }
    } catch (err) {
      console.error("[BrowserPeople] search failed:", err);
      setResults([]);
      setError(
        t("browser.bazaar.topicError", {
          message: err instanceof Error ? err.message : String(err),
        }),
      );
    } finally {
      setBusy(false);
    }
  }, [
    query,
    searchMode,
    searchPeers,
    runCapabilityDiscovery,
    humanProfile?.discoveryLocation,
    humanProfile?.discoveryLocationPrecision,
    filterNonBonded,
    sampleMesh,
    t,
  ]);

  const handleSayHello = async (ownerId: string) => {
    if (!ownerId || helloBusyId) return;
    setHelloBusyId(ownerId);
    try {
      const profile: HelloProfile = {
        displayName: humanProfile?.displayName ?? "Envoy User",
        bio: humanProfile?.bio ?? "",
        interests: [...(humanProfile?.hobbies ?? []), ...(humanProfile?.knowledge ?? [])],
        whatShares: [],
      };
      await sendHello(ownerId, profile, t("inbox.defaultHello", "Hi — I'd like to connect on Envoy."));
      markOutboundHello(ownerId);
      setOutboundHellos(loadOutboundHellos());
      showToast?.(t("discover.hello.sentToast", "Hello sent"), "success");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      showToast?.(message, "error");
    } finally {
      setHelloBusyId(null);
    }
  };

  return (
    <div className="browser-bazaar" data-testid="browser-people">
      <header className="browser-bazaar__toolbar">
        <div className="browser-bazaar__lede">
          <p className="browser-bazaar__intro">
            {t(
              "browser.bazaar.intro",
              "Find people you haven’t bonded with — open their public profile or blog, then say hello.",
            )}
          </p>
        </div>
        <button
          type="button"
          className="browser-bazaar__refresh"
          data-testid="people-refresh"
          disabled={busy}
          aria-label={
            busy
              ? t("browser.bazaar.refreshing", "Refreshing…")
              : t("browser.bazaar.refresh", "Refresh")
          }
          title={t("browser.bazaar.refresh", "Refresh")}
          onClick={() => void refreshSample()}
        >
          <PeopleIconRefresh spinning={busy} />
        </button>
      </header>

      <section
        className="browser-bazaar__section browser-bazaar__section--topic"
        aria-labelledby="people-search-heading"
      >
        <div className="browser-bazaar__section-head">
          <h3 id="people-search-heading" className="browser-bazaar__heading">
            {t("browser.bazaar.searchHeading", "Search")}
          </h3>
        </div>
        <div className="browser-bazaar__mode-row" role="tablist" aria-label={t("browser.bazaar.searchModes", "Search by")}>
          {(
            [
              ["topic", t("browser.bazaar.modeTopic", "Topic")],
              ["interest", t("browser.bazaar.modeInterest", "Interest")],
              ["place", t("browser.bazaar.modePlace", "Place")],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              className={`browser-bazaar__mode-chip${searchMode === id ? " is-active" : ""}`}
              aria-selected={searchMode === id}
              data-testid={`people-mode-${id}`}
              onClick={() => setSearchMode(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="browser-bazaar__topic-hint">
          {searchMode === "place"
            ? t(
                "browser.bazaar.placeHint",
                "Uses your profile discovery location to find people nearby on the mesh.",
              )
            : searchMode === "interest"
              ? t(
                  "browser.bazaar.interestHint",
                  "Match people who share an interest.",
                )
              : t(
                  "browser.bazaar.topicHint",
                  "Search publishers who advertise a topic on the mesh.",
                )}
        </p>
        <form
          className="browser-bazaar__topic-form"
          onSubmit={(e) => {
            e.preventDefault();
            void runSearch();
          }}
        >
          {searchMode !== "place" ? (
            <input
              type="search"
              className="browser-bazaar__topic-input"
              data-testid="people-search-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                searchMode === "interest"
                  ? t("browser.bazaar.interestPlaceholder", "music, coding, travel…")
                  : t("browser.bazaar.topicPlaceholder", "photography, cooking, travel…")
              }
              aria-label={t("browser.bazaar.searchHeading", "Search")}
            />
          ) : null}
          <button
            type="submit"
            className="browser-bazaar__topic-go"
            data-testid="people-search-go"
            disabled={busy}
          >
            {busy
              ? t("browser.bazaar.topicSearching", "Searching…")
              : searchMode === "place"
                ? t("browser.bazaar.searchPlace", "Find nearby")
                : t("browser.bazaar.topicSearch", "Search")}
          </button>
        </form>
      </section>

      <section className="browser-bazaar__section" aria-labelledby="people-results-heading">
        <div className="browser-bazaar__section-head">
          <h3 id="people-results-heading" className="browser-bazaar__heading">
            {resultSource === "sample"
              ? t("browser.bazaar.sampleHeading", "People on the mesh")
              : t("browser.bazaar.resultsHeading", "Results")}
          </h3>
          {results.length > 0 ? (
            <span className="browser-bazaar__count">{results.length}</span>
          ) : null}
        </div>
        {error ? (
          <p className="browser-bazaar__empty" data-testid="people-status">
            {error}
          </p>
        ) : null}
        {results.length === 0 && !busy && !error ? (
          <p className="browser-bazaar__empty" data-testid="people-empty">
            {t(
              "browser.bazaar.sampleEmpty",
              "No public people found on the mesh yet. Try a topic search, or check back when more nodes are online.",
            )}
          </p>
        ) : null}
        {results.length > 0 ? (
          <ul className="browser-bazaar__topic-results" data-testid="people-results">
            {results.map((peer) => {
              const name = peer.displayName?.trim() || shortOwnerId(peer.ownerId);
              const helloState = resolvePeerHelloState(
                peer.ownerId,
                peer.nodeId,
                bonds,
                outboundHellos,
              );
              return (
                <li key={peer.ownerId || peer.nodeId} className="browser-bazaar__topic-peer">
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
                      data-testid="people-open-profile"
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
                      data-testid="people-open-blog"
                      onClick={() => onOpenUrl(webContentUrl(peer.ownerId, "blog"))}
                    >
                      {t("agentCard.openBlog", "Blog")}
                    </button>
                    <span className="contact-web-content__sep" aria-hidden="true">
                      ·
                    </span>
                    {helloState === "connected" ? (
                      <span className="browser-bazaar__hello-status">
                        {t("common.connected", "Connected")}
                      </span>
                    ) : helloState === "sent" ? (
                      <span className="browser-bazaar__hello-status">
                        {t("common.helloSentWaiting", "Hello sent")}
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="contact-web-content__link"
                        data-testid="people-say-hello"
                        disabled={helloBusyId === peer.ownerId}
                        onClick={() => void handleSayHello(peer.ownerId)}
                      >
                        {t("common.sayHello", "Say Hello")}
                      </button>
                    )}
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

function PeopleIconRefresh({ spinning }: { spinning: boolean }) {
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
