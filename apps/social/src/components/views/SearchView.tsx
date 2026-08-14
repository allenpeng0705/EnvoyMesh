import { useState, useEffect, useRef, useCallback } from "react";
import { useNodeState } from "../../context/NodeStateContext.js";
import { useNodeService } from "../../hooks/useNodeService.js";
import { useToastOptional } from "../../hooks/useToast.js";
import { SUGGESTED_TOPICS } from "../../lib/display.js";
import {
  FriendSuggestionsPanel,
  MultiHopResultCard,
  PeerResultCard,
} from "../discover/DiscoverCards.js";
import { DiscoverSections } from "../discover/AddFriendWizard.js";
import { ContactLinkScanner } from "../discover/ContactLinkScanner.js";
import { useT } from "../../context/I18nContext.js";
import { looksLikePeerId, parseContactCode } from "../../lib/discover-contact-code.js";
import {
  codeEmptyHint,
  nearbyEmptyHint,
  widerEmptyHint,
  widerTopicHint,
} from "../../lib/discover-empty-hints.js";
import { extractGeoCitySummary } from "../../lib/discover-friend-suggestion.js";
import { loadOutboundHellos, markOutboundHello, resolvePeerHelloState } from "../../lib/discover-peer-state.js";
import { publishSearchTopic } from "../../lib/publish-topic.js";
import { SearchIcon, CloseIcon } from "../../icons.js";
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

/** Deduplicate peer hits from interest + publish topic searches. */
function mergePeerSearchResults(...lists: PeerSearchResult[][]): PeerSearchResult[] {
  const byKey = new Map<string, PeerSearchResult>();
  for (const list of lists) {
    for (const peer of list) {
      const key = peer.ownerId?.trim() || peer.nodeId?.trim();
      if (!key || byKey.has(key)) continue;
      byKey.set(key, peer);
    }
  }
  return [...byKey.values()];
}

type LookupPanelMode = "network" | "paste";

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

  // Cached lookup of the bundled sponsor-friend proofOfContext. When the
  // installer ships a bundled sponsor-friend.json with a proofOfContext, the
  // same token lets a node configured with `bondAutonomy.sponsorProofToken`
  // auto-accept our hello on the recipient side. We resolve it once and cache
  // it in a ref — the bundled config is static for the lifetime of the app.
  const proofOfContextRef = useRef<{
    state: "pending" | "resolved";
    value: string | undefined;
  }>({ state: "pending", value: undefined });

  // Opening Discover no longer auto-scans — user taps Refresh on People nearby.

  useEffect(() => {
    if (proofOfContextRef.current.state !== "pending") return;
    let cancelled = false;
    void nodeService
      .getSetupSponsorFriendStatus()
      .then((status) => {
        if (cancelled) return;
        const token = status?.config?.proofOfContext?.trim();
        proofOfContextRef.current = {
          state: "resolved",
          value: token && token.length > 0 ? token : undefined,
        };
      })
      .catch(() => {
        // Bundled config is best-effort — fall back to no proof token.
        if (cancelled) return;
        proofOfContextRef.current = { state: "resolved", value: undefined };
      });
    return () => {
      cancelled = true;
    };
  }, [nodeService]);

  const getHelloProofOfContext = useCallback((): string | undefined => {
    const cached = proofOfContextRef.current;
    return cached.state === "resolved" ? cached.value : undefined;
  }, []);

  const [networkQuery, setNetworkQuery] = useState("");
  const [pasteQuery, setPasteQuery] = useState("");
  const [networkResults, setNetworkResults] = useState<PeerSearchResult[]>([]);
  const [pasteResults, setPasteResults] = useState<PeerSearchResult[]>([]);
  const [networkSearching, setNetworkSearching] = useState(false);
  const [pasteSearching, setPasteSearching] = useState(false);
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
  const [outboundHellos, setOutboundHellos] = useState(() => loadOutboundHellos());
  const [helloHint, setHelloHint] = useState<string | null>(null);
  const [widerMode, setWiderMode] = useState<WiderSearchMode>("name");

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

  // Cold-start: when the user has zero bonds, automatically run an
  // interest- + location-based search once per owner so the Discover tab
  // isn't empty on first launch. Gated by a localStorage flag so it does
  // not refire on every visit.
  useEffect(() => {
    if (bonds.length > 0) return;
    const ownerId = humanProfile?.ownerId;
    if (!ownerId) return;
    const interests = [...(humanProfile?.hobbies ?? []), ...(humanProfile?.knowledge ?? [])];
    const loc = humanProfile?.discoveryLocation;
    const locPrecision = humanProfile?.discoveryLocationPrecision;
    if (interests.length === 0 && !loc) return;
    const flagKey = `envoymesh_auto_discover_done:${ownerId}`;
    if (typeof localStorage !== "undefined" && localStorage.getItem(flagKey)) return;

    let cancelled = false;
    setNetworkSearching(true);
    const run = async () => {
      try {
        await nodeService.runCapabilityDiscovery({ find: true }).catch(() => {});
        const topics =
          loc && locPrecision && locPrecision !== "hidden"
            ? locationSearchTopics({ location: loc, scope: "city" })
            : [];
        const results = await nodeService.searchPeers({
          ...(interests.length > 0 ? { interests } : {}),
          ...(topics.length > 0 ? { topics } : {}),
          maxResults: 20,
        });
        if (!cancelled) {
          setNetworkResults(results);
          if (typeof localStorage !== "undefined") {
            localStorage.setItem(flagKey, "1");
          }

          // Auto-hello the single best (top) match. Still respects the trust
          // boundary: the recipient must accept; we send exactly one hello to
          // a peer the user is not already bonded to and has not already
          // hello'd. Reduces cold-start friction without auto-bonding.
          const bondedOwnerIds = new Set(bonds.map((b) => b.peerOwnerId));
          const helloedIds = new Set(outboundHellos);
          const top = results.find(
            (r) =>
              r.ownerId &&
              r.ownerId !== ownerId &&
              !bondedOwnerIds.has(r.ownerId) &&
              !helloedIds.has(r.ownerId),
          );
          if (top?.ownerId) {
            try {
              const helloProfile: HelloProfile = {
                displayName: humanProfile?.displayName ?? "Envoy User",
                bio: humanProfile?.bio ?? "",
                interests: [...(humanProfile?.hobbies ?? []), ...(humanProfile?.knowledge ?? [])],
                whatShares: [],
              };
              const proofOfContext = getHelloProofOfContext();
              await sendHello(
                top.ownerId,
                helloProfile,
                "Hi — Envoy suggested we might share interests. I'd like to connect.",
                proofOfContext ? { proofOfContext } : undefined,
              );
              markOutboundHello(top.ownerId);
              setOutboundHellos(loadOutboundHellos());
              showToast?.(t("discover.hello.autoSentToast"), "success");
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              // Don't mark outbound on failure — that way the next cold-start (or
              // a manual search) can retry. Surface the error so the user knows
              // the auto-hello didn't go through.
              showToast?.(
                t("discover.hello.autoSendFailed", { error: message }),
                "error",
              );
            }
          }
        }
      } catch (error) {
        // Don't mark the auto-discover flag on failure — let the next cold-start
        // (or a manual search) retry. Surface so the user knows nothing came
        // back, rather than silently showing "no one here yet".
        if (!cancelled) {
          const message = error instanceof Error ? error.message : String(error);
          showToast?.(
            t("discover.hello.autoSendFailed", { error: message }),
            "error",
          );
        }
      } finally {
        if (!cancelled) setNetworkSearching(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [nodeService, bonds, outboundHellos, humanProfile, sendHello, showToast, t, getHelloProofOfContext]);

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
    setNetworkSearching(true);
    setNetworkResults([]);
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
      setNetworkResults(results);
    } catch (error) {
      console.error("[SearchView] geo search failed:", error);
      setNetworkResults([]);
    } finally {
      setNetworkSearching(false);
    }
  };

  const handleSearch = async (panel: LookupPanelMode, overrideQuery?: string) => {
    const isPaste = panel === "paste";
    const queryState = isPaste ? pasteQuery : networkQuery;
    const effectiveQuery = (overrideQuery ?? queryState).trim();
    if (!effectiveQuery) return;

    const setSearching = isPaste ? setPasteSearching : setNetworkSearching;
    const setResults = isPaste ? setPasteResults : setNetworkResults;

    setSearching(true);
    setResults([]);
    if (isPaste) {
      setCodeInviteHint(null);
      setCodeInviteApplyMsg(null);
      setCodeInviteApplyOk(null);
    }
    const startedAt = Date.now();
    try {
      await nodeService.runCapabilityDiscovery({ find: true }).catch(() => {});
      let results: PeerSearchResult[];
      const query = effectiveQuery;

      if (isPaste) {
        const parsed = parseContactCode(query);
        if (parsed.kind === "pair") {
          setPasteResults([]);
          setCodeInviteHint("pair");
          return;
        }
        if (parsed.kind === "invite") {
          // Company / kiosk invite (Phase 35A/35D joiner side): redeem the
          // bearer token, which seeds connectivity + sends a hello to the
          // issuer so the bond is established.
          setCodeInviteApplyBusy(true);
          try {
            const result = await nodeService.redeemCompanyInvite({
              token: parsed.token,
              wsUrl: parsed.wsUrl,
              ownerId: parsed.ownerId,
            });
            if (result.ok) {
              setCodeInviteApplyOk(true);
              setCodeInviteApplyMsg(t("discover.paste.inviteRedeemed"));
              await refreshNodeConfig();
            } else {
              setCodeInviteApplyOk(false);
              setCodeInviteApplyMsg(
                result.reason
                  ? t("discover.paste.inviteRedeemedWithReason", { reason: result.reason })
                  : t("discover.paste.inviteRedeemedFailed"),
              );
            }
          } catch (error) {
            setCodeInviteApplyOk(false);
            setCodeInviteApplyMsg(error instanceof Error ? error.message : String(error));
          } finally {
            setCodeInviteApplyBusy(false);
          }
          setPasteResults([]);
          return;
        } else if (parsed.kind === "invite-invalid") {
          setPasteResults([]);
          setCodeInviteHint("invite-invalid");
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
            setPasteResults([]);
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
            await nodeService.applyWanJoinInvite(parsed.wanJoinToken);
            setCodeInviteApplyOk(true);
            setCodeInviteApplyMsg(t("discover.paste.inviteAdded"));
            await refreshNodeConfig();
          } catch (error) {
            setCodeInviteApplyOk(false);
            setCodeInviteApplyMsg(error instanceof Error ? error.message : String(error));
          } finally {
            setCodeInviteApplyBusy(false);
          }
          setPasteResults([]);
          return;
        } else if (parsed.kind === "join-invalid") {
          setPasteResults([]);
          setCodeInviteHint("join-invalid");
          return;
        } else if (parsed.kind === "invalid") {
          setPasteResults([]);
          setCodeInviteApplyOk(false);
          setCodeInviteApplyMsg(parsed.message);
          return;
        } else {
          setCodeInviteHint(null);
          results = await nodeService.searchPeers({ peerId: parsed.peerId });
        }
      } else if (widerMode === "topic") {
        // Interest/capability topics (node normalizes bare text → interest:<slug>)
        // plus published web tags (DHT publish:<slug>) — one "By topic" search.
        const q = query.trim();
        const publishTopic = publishSearchTopic(q);
        const [interestHits, publishHits] = await Promise.all([
          nodeService.searchPeers({ topic: q }),
          publishTopic
            ? nodeService.searchPeers({ topic: publishTopic, maxResults: 20 })
            : Promise.resolve([] as PeerSearchResult[]),
        ]);
        results = mergePeerSearchResults(interestHits, publishHits);
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
      setResults(results);
    } catch (error) {
      console.error("[SearchView] search failed:", error);
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleMultiHopDiscovery = async () => {
    setMultiHopLoading(true);
    setMultiHopResults(null);
    setMultiHopSession(null);
    setMultiHopCorrelationId(null);
    try {
      const q = networkQuery.trim();
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
      const proofOfContext = getHelloProofOfContext();
      await sendHello(
        targetId,
        profile,
        "Hi — I'd like to connect on Envoy.",
        proofOfContext ? { proofOfContext } : undefined,
      );
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
    widerMode,
    nodeStatus,
    nodeConfig,
    humanProfile,
  };

  return (
    <div className={`search-view${embedded ? " search-view--embedded" : ""}`}>
      {embedded ? null : (
        <header className="search-view__header">
          <h2>{t("discover.title")}</h2>
          <p className="search-view__lede">{t("discover.lede")}</p>
        </header>
      )}
      <DiscoverSections
        discoveredPeers={discoveredPeers}
        bonds={bonds}
        outboundHellos={outboundHellos}
        nodeStatus={nodeStatus}
        nodeConfig={nodeConfig}
        helloHint={helloHint}
        nearbyEmptyHint={nearbyEmptyHint({ ...emptyHintContext, path: "nearby" }, t)}
        pendingHellOs={pendingHellOs}
        onSayHello={handleSayHello}
        onAcceptHello={(request) => acceptHello(request.messageId)}
        onDeclineHello={(request) => declineHello(request.messageId)}
        networkPanel={renderLookupPanel("network")}
        pastePanel={renderLookupPanel("paste")}
      />
    </div>
  );

  function renderLookupPanel(panel: LookupPanelMode) {
    const isPaste = panel === "paste";
    const isNetwork = panel === "network";
    const query = isPaste ? pasteQuery : networkQuery;
    const setQuery = isPaste ? setPasteQuery : setNetworkQuery;
    const searchResults = isPaste ? pasteResults : networkResults;
    const isSearching = isPaste ? pasteSearching : networkSearching;
    return (
      <section className="discover-panel discover-lookup-panel">
        {isPaste ? (
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

        {isPaste ? (
          <ContactLinkScanner
            onScan={(text) => {
              setPasteQuery(text);
              void handleSearch("paste", text);
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
            {widerMode === "topic" && !networkQuery ? (
              <p className="discover-status discover-status--muted">
                {widerTopicHint({ ...emptyHintContext, path: "wider" }, t) ?? t("discover.search.widerTopicFallback")}
              </p>
            ) : null}
          </>
        )}

        <div className="search-bar discover-search-bar">
          {isPaste || widerMode !== "place" ? (
          <div className="search-input-wrapper">
            <input
              type="text"
              placeholder={
                isPaste
                  ? t("discover.paste.placeholder")
                  : widerMode === "topic"
                    ? t("discover.search.topicPlaceholder")
                    : t("discover.search.namePlaceholder")
              }
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleSearch(panel);
                }
              }}
            />
            {query && (
              <button
                type="button"
                className="search-clear-btn"
                onClick={() => setQuery("")}
                aria-label={t("common.clear")}
                title={t("common.clear")}
              >
                <CloseIcon size={14} />
              </button>
            )}
          </div>
          ) : (
            <p className="discover-status discover-status--muted">{t("discover.search.geoSearching")}</p>
          )}
          {isPaste || widerMode !== "place" ? (
          <button
            type="button"
            onClick={() => void handleSearch(panel)}
            disabled={isSearching || (isPaste && codeInviteApplyBusy)}
            className="search-btn"
          >
            {isSearching || (isPaste && codeInviteApplyBusy) ? (
              <>
                <span className="search-spinner" />
                {t("common.searching")}
              </>
            ) : isPaste ? (
              t("common.lookUp")
            ) : (
              t("common.search")
            )}
          </button>
          ) : null}
        </div>

        {isPaste && codeInviteApplyMsg ? (
          <p
            className={`discover-status${codeInviteApplyOk ? " discover-status--ok" : " discover-status--error"}`}
            role="status"
          >
            {codeInviteApplyMsg}
          </p>
        ) : null}

        {isPaste && codeInviteHint === "pair" ? (
          <p className="discover-status discover-status--muted" role="status">
            {t("discover.paste.pairLinkHint")}
          </p>
        ) : isPaste && codeInviteHint === "join-invalid" ? (
          <p className="discover-status discover-status--error" role="status">
            {t("discover.paste.joinInvalidHint")}
          </p>
        ) : isPaste && codeInviteHint === "invite-invalid" ? (
          <p className="discover-status discover-status--error" role="status">
            {t("discover.paste.inviteInvalidHint")}
          </p>
        ) : null}

        {isSearching ? (
          <div className="search-status">
            <div className="search-status-content">
              <span className="search-status-icon">
                <SearchIcon size={20} />
              </span>
              <div>
                {/* When the user hasn't typed a query, the auto-discover
                    effect is what set networkSearching=true. Don't show
                    `Searching for ""` — that's confusing and looks broken.
                    Fall back to the auto-discover banner instead. */}
                <strong>
                  {query
                    ? t("discover.search.searchingFor", { query })
                    : t("discover.emptyGraphAutoSearching")}
                </strong>
                <p>
                  {isPaste
                    ? t("discover.search.lookingUp")
                    : widerMode === "topic"
                      ? t("discover.search.queryingDht")
                      : t("discover.search.searchingName")}
                </p>
              </div>
            </div>
          </div>
        ) : null}

        {isNetwork && widerMode === "name" && !networkQuery ? (
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
                    setNetworkQuery(topic);
                    void handleSearch("network", topic);
                  }}
                >
                  {topic}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {isNetwork && widerMode === "topic" ? (
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

        {isNetwork && !morningReportLoading && morningReport && morningReport.length > 0 ? (
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
          <>
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
            {searchResults.length > 20 && (
              <p className="search-results__count" role="status">
                {t("discover.search.resultCount", { count: searchResults.length })}
              </p>
            )}
          </>
        ) : query.trim() && !isSearching && !(isPaste && codeInviteHint) ? (
          <div className="search-empty">
            <p>{t("discover.search.noResults", { query })}</p>
            <small>
              {isPaste
                ? codeEmptyHint({ ...emptyHintContext, path: "code" }, t)
                : widerEmptyHint({ ...emptyHintContext, path: "wider" }, t)}
            </small>
          </div>
        ) : !isSearching && isPaste && !query ? (
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
