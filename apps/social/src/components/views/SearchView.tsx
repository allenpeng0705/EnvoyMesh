import { useState, useEffect } from "react";
import { useNodeState } from "../../context/NodeStateContext.js";
import { useNodeService } from "../../hooks/useNodeService.js";
import { useToastOptional } from "../../hooks/useToast.js";
import { SUGGESTED_TOPICS } from "../../lib/display.js";
import {
  FriendSuggestionsPanel,
  MultiHopResultCard,
  PeerResultCard,
} from "../discover/DiscoverCards.js";
import { NearbyPeersPanel } from "../discover/NearbyPeersPanel.js";
import { ShareContactCard } from "../discover/ShareContactCard.js";
import { AddFriendWizard, type WizardStep } from "../discover/AddFriendWizard.js";
import { resolvePeerHelloState } from "../../lib/discover-peer-state.js";
import { ContactLinkScanner } from "../discover/ContactLinkScanner.js";
import { useT } from "../../context/I18nContext.js";
import { looksLikePeerId, parseContactCode } from "../../lib/discover-contact-code.js";
import {
  codeEmptyHint,
  nearbyEmptyHint,
  widerEmptyHint,
  widerTopicHint,
} from "../../lib/discover-empty-hints.js";
import { resolveDiscoverDefaultPath, type DiscoverPath } from "../../lib/discover-default-path.js";
import { extractGeoCitySummary } from "../../lib/discover-friend-suggestion.js";
import { loadOutboundHellos, markOutboundHello } from "../../lib/discover-peer-state.js";
import { resolveNetworkPreset } from "../../lib/network-presets.js";
import { SearchIcon } from "../../icons.js";
import {
  type HelloProfile,
  type MorningReportEntry,
  type MultiHopDiscoveryMatch,
  type MultiHopDiscoverySessionView,
  type PeerSearchResult,
  encodeGeohash,
  NEARBY_GEOHASH_PRECISION,
  locationSearchTopics,
} from "@envoymesh/api";

export type { DiscoverPath } from "../../lib/discover-default-path.js";
type WiderSearchMode = "name" | "topic" | "place";

export function SearchView({ embedded = false }: { embedded?: boolean }) {
  const t = useT();
  const nodeService = useNodeService();
  const { showToast } = useToastOptional();
  const {
    humanProfile,
    sendHello,
    discoveredPeers,
    nodeStatus,
    nodeConfig,
    refreshNodeConfig,
    bonds,
    pendingHellOs,
    acceptHello,
    declineHello,
  } = useNodeState();

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<PeerSearchResult[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [wizardStep, setWizardStep] = useState<WizardStep>("choose");
  const [discoverPath, setDiscoverPath] = useState<DiscoverPath>(() => resolveDiscoverDefaultPath(null));
  const [outboundHellos, setOutboundHellos] = useState(() => loadOutboundHellos());
  const [helloHint, setHelloHint] = useState<string | null>(null);
  const [widerMode, setWiderMode] = useState<WiderSearchMode>("name");
  const [isSearching, setIsSearching] = useState(false);
  const [morningReport, setMorningReport] = useState<MorningReportEntry[] | null>(null);
  const [morningReportLoading, setMorningReportLoading] = useState(false);

  const [multiHopResults, setMultiHopResults] = useState<MultiHopDiscoveryMatch[] | null>(null);
  const [multiHopLoading, setMultiHopLoading] = useState(false);
  const [multiHopSession, setMultiHopSession] = useState<MultiHopDiscoverySessionView | null>(null);
  const [multiHopCorrelationId, setMultiHopCorrelationId] = useState<string | null>(null);
  const [codeInviteHint, setCodeInviteHint] = useState<string | null>(null);
  const [codeInviteApplyMsg, setCodeInviteApplyMsg] = useState<string | null>(null);
  const [codeInviteApplyOk, setCodeInviteApplyOk] = useState<boolean | null>(null);
  const [codeInviteApplyBusy, setCodeInviteApplyBusy] = useState(false);

  useEffect(() => {
    if (!nodeConfig) return;
    setDiscoverPath(resolveDiscoverDefaultPath(nodeConfig));
  }, [nodeConfig?.discoveryProfile, nodeConfig?.bootstrapPresets]);

  const networkPreset = resolveNetworkPreset(nodeConfig?.discoveryProfile, nodeConfig?.bootstrapPresets);

  useEffect(() => {
    void nodeService.runCapabilityDiscovery({ find: true }).catch(() => {
      /* optional — lazy DHT may be disabled */
    });
    setMorningReportLoading(true);
    void nodeService
      .getMorningReport({ limit: 8 })
      .then(setMorningReport)
      .catch(() => setMorningReport([]))
      .finally(() => setMorningReportLoading(false));
  }, [nodeService]);

  useEffect(() => {
    if (!multiHopCorrelationId) return;
    const unsub = nodeService.on("discovery:multihop-update", (session) => {
      const data = session as MultiHopDiscoverySessionView;
      if (data.correlationId !== multiHopCorrelationId) return;
      setMultiHopSession(data);
      setMultiHopResults(data.matches);
    });
    const poll = window.setInterval(() => {
      void nodeService
        .getMultiHopDiscoverySession(multiHopCorrelationId)
        .then((session) => {
          if (!session) return;
          setMultiHopSession(session);
          setMultiHopResults(session.matches);
        })
        .catch(() => {
          /* optional refresh */
        });
    }, 4000);
    return () => {
      unsub();
      window.clearInterval(poll);
    };
  }, [nodeService, multiHopCorrelationId]);

  const handleGeoSearch = async (scope: "country" | "city" | "town" | "nearby") => {
    setIsSearching(true);
    setSearchResults([]);
    try {
      await nodeService.runCapabilityDiscovery({ find: true }).catch(() => {});
      let topics: string[] = [];
      if (scope === "nearby") {
        const loc = humanProfile?.discoveryLocation;
        if (loc?.geohash) {
          topics = locationSearchTopics({ location: loc, scope: "nearby" });
        } else if (!navigator.geolocation) {
          showToast?.(t("profileAbout.geolocationUnavailable"), "error");
          return;
        } else {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 12_000 });
          });
          const gh = encodeGeohash(pos.coords.latitude, pos.coords.longitude, NEARBY_GEOHASH_PRECISION);
          topics = locationSearchTopics({
            location: {
              countryCode: loc?.countryCode ?? "US",
              geohash: gh,
            },
            scope: "nearby",
          });
        }
      } else {
        const loc = humanProfile?.discoveryLocation;
        if (!loc?.countryCode) {
          showToast?.(t("discover.search.geoNeedsProfile"), "error");
          return;
        }
        topics = locationSearchTopics({ location: loc, scope });
      }
      const results = await nodeService.searchPeers({ topics, maxResults: 20 });
      setSearchResults(results);
    } catch (error) {
      console.error("[SearchView] geo search failed:", error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearch = async (overrideQuery?: string) => {
    const effectiveQuery = (overrideQuery ?? searchQuery).trim();
    const usingCodePath = showAdvanced ? discoverPath === "code" : wizardStep === "paste";
    const usingWiderPath = (showAdvanced && discoverPath === "wider") || wizardStep === "search";
    if (!effectiveQuery || (!usingCodePath && !usingWiderPath)) return;
    setIsSearching(true);
    setSearchResults([]);
    setCodeInviteHint(null);
    setCodeInviteApplyMsg(null);
    setCodeInviteApplyOk(null);
    const startedAt = Date.now();
    try {
      await nodeService.runCapabilityDiscovery({ find: true }).catch(() => {});
      let results: PeerSearchResult[];
      const query = effectiveQuery;

      if (usingCodePath) {
        const parsed = parseContactCode(query);
        if (parsed.kind === "pair") {
          setSearchResults([]);
          setCodeInviteHint("pair");
          return;
        }
        if (parsed.kind === "contact") {
          if (parsed.wanJoinToken) {
            setCodeInviteApplyBusy(true);
            try {
              await nodeService.applyWanJoinInvite(parsed.wanJoinToken);
              setCodeInviteApplyOk(true);
              setCodeInviteApplyMsg(t("discover.paste.contactLinkApplied"));
              await refreshNodeConfig();
            } catch (error) {
              setCodeInviteApplyOk(false);
              setCodeInviteApplyMsg(error instanceof Error ? error.message : String(error));
            } finally {
              setCodeInviteApplyBusy(false);
            }
          }
          if (!parsed.peerId) {
            setSearchResults([]);
            if (!parsed.wanJoinToken) {
              setCodeInviteApplyOk(false);
              setCodeInviteApplyMsg(t("discover.paste.noPeerId"));
            }
            return;
          }
          setCodeInviteHint(null);
          results = await nodeService.searchPeers({ peerId: parsed.peerId });
        } else if (parsed.kind === "wan-join") {
          setCodeInviteApplyBusy(true);
          try {
            const result = await nodeService.applyWanJoinInvite(parsed.wanJoinToken);
            setCodeInviteApplyOk(true);
            setCodeInviteApplyMsg(t("discover.paste.inviteAdded"));
            await refreshNodeConfig();
          } catch (error) {
            setCodeInviteApplyOk(false);
            setCodeInviteApplyMsg(error instanceof Error ? error.message : String(error));
          } finally {
            setCodeInviteApplyBusy(false);
          }
          setSearchResults([]);
          return;
        }
        if (parsed.kind === "join-invalid") {
          setSearchResults([]);
          setCodeInviteHint("join-invalid");
          return;
        }
        if (parsed.kind === "invalid") {
          setSearchResults([]);
          setCodeInviteApplyOk(false);
          setCodeInviteApplyMsg(parsed.message);
          return;
        }
        setCodeInviteHint(null);
        results = await nodeService.searchPeers({ peerId: parsed.peerId });
      } else if (widerMode === "topic") {
        results = await nodeService.searchPeers({ topic: query.toLowerCase() });
      } else if (looksLikePeerId(query)) {
        results = await nodeService.searchPeers({ peerId: query.trim() });
      } else {
        const q = query.toLowerCase();
        results = await nodeService.searchPeers({
          interests: [q],
          username: q,
          queryText: q,
        });
      }
      const elapsed = Date.now() - startedAt;
      if (elapsed < 800) {
        await new Promise((r) => setTimeout(r, 800 - elapsed));
      }
      setSearchResults(results);
    } catch (error) {
      console.error("[SearchView] search failed:", error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleMultiHopDiscovery = async () => {
    setMultiHopLoading(true);
    setMultiHopResults(null);
    setMultiHopSession(null);
    setMultiHopCorrelationId(null);
    try {
      const q = searchQuery.trim();
      const result = await nodeService.requestMultiHopDiscovery({
        requestedCapabilities: q ? [q.toLowerCase()] : ["capability:envoymesh.discovery"],
        maxHops: 2,
        maxBonds: 8,
      });
      setMultiHopCorrelationId(result.correlationId);
      setMultiHopResults(result.matches);
      setMultiHopSession({
        correlationId: result.correlationId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        bondsQueried: result.bondsQueried,
        pendingForwardApprovals: result.pendingForwardApprovals,
        matches: result.matches,
      });
    } catch (error) {
      console.error("[SearchView] multi-hop discovery failed:", error);
      setMultiHopResults([]);
      setMultiHopSession(null);
      setMultiHopCorrelationId(null);
    } finally {
      setMultiHopLoading(false);
    }
  };

  const handleSayHello = async (targetId: string) => {
    setHelloHint(null);
    try {
      const profile: HelloProfile = {
        displayName: humanProfile?.displayName ?? "Envoy User",
        bio: humanProfile?.bio ?? "",
        interests: [...(humanProfile?.hobbies ?? []), ...(humanProfile?.knowledge ?? [])],
        whatShares: [],
      };
      await sendHello(targetId, profile, "Hi — I'd like to connect on Envoy.");
      markOutboundHello(targetId);
      setOutboundHellos(loadOutboundHellos());
      setHelloHint(t("discover.hello.sent"));
      showToast(t("discover.hello.sentToast"), "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      showToast(message, "error");
      setHelloHint(
        nodeStatus !== "running" ? t("discover.hello.offline") : t("discover.hello.failed"),
      );
    }
  };

  const emptyHintContext = {
    path: discoverPath as "nearby" | "code" | "wider",
    widerMode,
    nodeStatus,
    nodeConfig,
    humanProfile,
  };

  return (
    <div className={`search-view${embedded ? " search-view--embedded" : ""}`}>
      {!embedded && (
        <header className="search-view__header">
          <h2>{t("discover.title")}</h2>
          <p className="search-view__lede">{t("discover.lede")}</p>
        </header>
      )}
      {embedded && (
        <p className="search-view__lede search-view__lede--embedded">{t("discover.embeddedLede")}</p>
      )}
      {!showAdvanced ? (
        <>
          <AddFriendWizard
            step={wizardStep}
            onStep={setWizardStep}
            networkPreset={networkPreset}
            discoveredPeers={discoveredPeers}
            bonds={bonds}
            outboundHellos={outboundHellos}
            nodeStatus={nodeStatus}
            nodeConfig={nodeConfig}
            helloHint={helloHint}
            pendingHellOs={pendingHellOs}
            onSayHello={handleSayHello}
            onAcceptHello={(request) => acceptHello(request.messageId)}
            onDeclineHello={(request) => declineHello(request.messageId)}
            pastePanel={renderLookupPanel("paste")}
            searchPanel={renderLookupPanel("wider")}
          />
          <button type="button" className="discover-text-action" onClick={() => setShowAdvanced(true)}>
            {t("discover.advanced")}
          </button>
        </>
      ) : (
        <>
          <div className="search-mode-tabs">
            <button
              type="button"
              className={discoverPath === "nearby" ? "active" : ""}
              onClick={() => setDiscoverPath("nearby")}
            >
              {t("discover.tabs.nearby")}
            </button>
            <button
              type="button"
              className={discoverPath === "code" ? "active" : ""}
              onClick={() => setDiscoverPath("code")}
            >
              {t("discover.tabs.pasteLink")}
            </button>
            <button
              type="button"
              className={discoverPath === "wider" ? "active" : ""}
              onClick={() => setDiscoverPath("wider")}
            >
              {t("discover.tabs.searchName")}
            </button>
          </div>

          {discoverPath === "nearby" ? (
            <>
              <NearbyPeersPanel
                discoveredPeers={discoveredPeers}
                bonds={bonds}
                outboundHellos={outboundHellos}
                nodeStatus={nodeStatus}
                emptyHint={nearbyEmptyHint({ ...emptyHintContext, path: "nearby" }, t)}
                helloHint={helloHint}
                onSayHello={handleSayHello}
              />
              <ShareContactCard compact />
            </>
          ) : discoverPath === "code" ? (
            renderLookupPanel("code")
          ) : (
            renderLookupPanel("wider")
          )}
          <button type="button" className="discover-text-action" onClick={() => setShowAdvanced(false)}>
            {t("discover.backToGuided")}
          </button>
        </>
      )}
    </div>
  );

  function renderLookupPanel(mode: "paste" | "code" | "wider") {
    const isCode = mode === "paste" || mode === "code";
    const isWider = mode === "wider";
    return (
      <section className="discover-panel discover-lookup-panel">
        {isCode ? (
          <header className="discover-panel__header">
            <h4 className="discover-panel__title">{t("discover.paste.panelTitle")}</h4>
            <p className="discover-panel__lede">{t("discover.paste.lede")}</p>
          </header>
        ) : (
          <header className="discover-panel__header">
            <h4 className="discover-panel__title">{t("discover.search.panelTitle")}</h4>
            <p className="discover-panel__lede">{t("discover.search.panelLede")}</p>
          </header>
        )}

        {isCode ? (
          <ContactLinkScanner
            onScan={(text) => {
              setSearchQuery(text);
              void handleSearch(text);
            }}
          />
        ) : (
          <>
            <div className="search-mode-tabs search-mode-tabs--sub" role="tablist" aria-label={t("discover.search.widerSearchTypeLabel")}>
              <button
                type="button"
                className={widerMode === "name" ? "active" : ""}
                onClick={() => setWiderMode("name")}
              >
                {t("discover.search.byName")}
              </button>
              <button
                type="button"
                className={widerMode === "topic" ? "active" : ""}
                onClick={() => setWiderMode("topic")}
              >
                {t("discover.search.byTopic")}
              </button>
              <button
                type="button"
                className={widerMode === "place" ? "active" : ""}
                onClick={() => setWiderMode("place")}
              >
                {t("discover.search.byLocation")}
              </button>
            </div>
            {widerMode === "place" ? (
              <div className="discover-geo-actions">
                <button type="button" className="btn-secondary btn-small" disabled={isSearching} onClick={() => void handleGeoSearch("country")}>
                  {t("discover.search.geoSameCountry")}
                </button>
                <button type="button" className="btn-secondary btn-small" disabled={isSearching} onClick={() => void handleGeoSearch("city")}>
                  {t("discover.search.geoSameCity")}
                </button>
                <button type="button" className="btn-secondary btn-small" disabled={isSearching} onClick={() => void handleGeoSearch("town")}>
                  {t("discover.search.geoSameTown")}
                </button>
                <button type="button" className="btn-secondary btn-small" disabled={isSearching} onClick={() => void handleGeoSearch("nearby")}>
                  {t("discover.search.geoNearMe")}
                </button>
              </div>
            ) : null}
            {widerMode === "topic" && !searchQuery ? (
              <p className="discover-status discover-status--muted">
                {widerTopicHint({ ...emptyHintContext, path: "wider" }, t) ?? t("discover.search.widerTopicFallback")}
              </p>
            ) : null}
          </>
        )}

        <div className="search-bar discover-search-bar">
          {widerMode !== "place" ? (
          <input
            type="text"
            placeholder={
              isCode
                ? t("discover.paste.placeholder")
                : widerMode === "topic"
                  ? t("discover.search.topicPlaceholder")
                  : t("discover.search.namePlaceholder")
            }
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void handleSearch();
              }
            }}
          />
          ) : (
            <p className="discover-status discover-status--muted">{t("discover.search.geoSearching")}</p>
          )}
          {widerMode !== "place" ? (
          <button
            type="button"
            onClick={() => void handleSearch()}
            disabled={isSearching || codeInviteApplyBusy}
            className="search-btn"
          >
            {isSearching || codeInviteApplyBusy ? (
              <>
                <span className="search-spinner" />
                {t("common.searching")}
              </>
            ) : isCode ? (
              t("common.lookUp")
            ) : (
              t("common.search")
            )}
          </button>
          ) : null}
        </div>

        {codeInviteApplyMsg ? (
          <p
            className={`discover-status${codeInviteApplyOk ? " discover-status--ok" : " discover-status--error"}`}
            role="status"
          >
            {codeInviteApplyMsg}
          </p>
        ) : null}

        {codeInviteHint === "pair" ? (
          <p className="discover-status discover-status--muted" role="status">
            {t("discover.paste.pairLinkHint")}
          </p>
        ) : codeInviteHint === "join-invalid" ? (
          <p className="discover-status discover-status--error" role="status">
            {t("discover.paste.joinInvalidHint")}
          </p>
        ) : null}

        {isSearching ? (
          <div className="search-status">
            <div className="search-status-content">
              <span className="search-status-icon">
                <SearchIcon size={20} />
              </span>
              <div>
                <strong>{t("discover.search.searchingFor", { query: searchQuery })}</strong>
                <p>
                  {isCode
                    ? t("discover.search.lookingUp")
                    : widerMode === "topic"
                      ? t("discover.search.queryingDht")
                      : t("discover.search.searchingName")}
                </p>
              </div>
            </div>
          </div>
        ) : null}

        {isWider && widerMode === "name" && !searchQuery ? (
          <div className="topic-suggestions">
            <h4>{t("discover.search.tryTopic")}</h4>
            <div className="topic-chips">
              {SUGGESTED_TOPICS.map((topic) => (
                <button
                  key={topic}
                  type="button"
                  className="topic-chip"
                  onClick={() => {
                    setWiderMode("topic");
                    setSearchQuery(topic);
                    void handleSearch(topic);
                  }}
                >
                  {topic}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {isWider && widerMode === "topic" ? (
          <section className="multihop-panel" aria-labelledby="multihop-discover-heading">
            <header className="multihop-panel__header">
              <h4 id="multihop-discover-heading" className="multihop-panel__title">
                {t("discover.search.multihopTitle")}
              </h4>
              <p className="multihop-panel__lede">{t("discover.search.multihopLede")}</p>
            </header>
            <div className="multihop-panel__actions">
              <button
                type="button"
                className="search-btn multihop-panel__trigger"
                disabled={multiHopLoading}
                onClick={() => void handleMultiHopDiscovery()}
              >
                {multiHopLoading ? (
                  <>
                    <span className="search-spinner" aria-hidden />
                    {t("discover.search.scanningBonds")}
                  </>
                ) : (
                  t("discover.search.multihopTrigger")
                )}
              </button>
            </div>
            {multiHopResults !== null ? (
              <ul className="search-results multihop-results">
                {multiHopResults.length === 0 ? (
                  <li className="search-empty multihop-results__empty">
                    <p>{t("discover.search.noMatches")}</p>
                  </li>
                ) : (
                  multiHopResults.map((row, index) => (
                    <MultiHopResultCard key={row.ownerId} row={row} index={index} onSayHello={handleSayHello} />
                  ))
                )}
              </ul>
            ) : null}
          </section>
        ) : null}

        {!morningReportLoading && morningReport && morningReport.length > 0 && isWider ? (
          <>
            {(() => {
              const geo = extractGeoCitySummary(morningReport);
              if (!geo) return null;
              return (
                <p className="discover-status discover-geo-city-summary" role="status">
                  {t("discover.search.geoCitySummary", { count: geo.peerCount, city: geo.cityLabel })}
                </p>
              );
            })()}
            <FriendSuggestionsPanel
              entries={morningReport}
              bonds={bonds}
              outboundHellos={outboundHellos}
              onSayHello={handleSayHello}
            />
          </>
        ) : null}

        {!isSearching && searchResults.length > 0 ? (
          <ul className="search-results peer-results-list">
            {searchResults.map((result, index) => (
              <PeerResultCard
                key={result.nodeId}
                result={result}
                index={index}
                helloState={resolvePeerHelloState(result.ownerId, result.nodeId, bonds, outboundHellos)}
                onSayHello={handleSayHello}
              />
            ))}
          </ul>
        ) : searchQuery.trim() && !isSearching && !codeInviteHint ? (
          <div className="search-empty">
            <p>{t("discover.search.noResults", { query: searchQuery })}</p>
            <small>
              {isCode
                ? codeEmptyHint({ ...emptyHintContext, path: "code" }, t)
                : widerEmptyHint({ ...emptyHintContext, path: "wider" }, t)}
            </small>
          </div>
        ) : !isSearching && isCode && !searchQuery ? (
          <div className="discover-empty">
            <SearchIcon size={32} className="discover-empty__icon" />
            <p className="discover-empty__title">{t("discover.paste.emptyTitle")}</p>
            <p className="discover-empty__desc">{t("discover.paste.emptyDesc")}</p>
          </div>
        ) : null}
      </section>
    );
  }
}
