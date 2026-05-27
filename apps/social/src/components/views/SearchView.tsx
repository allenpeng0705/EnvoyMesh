import { useState, useEffect } from "react";
import { useNodeState } from "../../context/NodeStateContext.js";
import { useNodeService } from "../../hooks/useNodeService.js";
import { SUGGESTED_TOPICS } from "../../lib/display.js";
import { SearchIcon } from "../../icons.js";
import { bondTrustRank, type DiscoverPublishedLibraryPeerResult, type HelloProfile, type MorningReportEntry, type PeerSearchResult } from "@envoymesh/api";

export function SearchView({ embedded = false }: { embedded?: boolean }) {
  const nodeService = useNodeService();
  const { humanProfile, sendHello } = useNodeState();

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<PeerSearchResult[]>([]);
  const [searchMode, setSearchMode] = useState<"interest" | "peerId" | "topic" | "did" | "library">("interest");
  const [isSearching, setIsSearching] = useState(false);
  const [morningReport, setMorningReport] = useState<MorningReportEntry[] | null>(null);
  const [morningReportLoading, setMorningReportLoading] = useState(false);

  const [libraryQuery, setLibraryQuery] = useState("");
  const [libraryHashPrefix, setLibraryHashPrefix] = useState("");
  const [libraryResults, setLibraryResults] = useState<DiscoverPublishedLibraryPeerResult[] | null>(null);
  const [librarySearching, setLibrarySearching] = useState(false);
  const [libraryErr, setLibraryErr] = useState<string | null>(null);
  const [multiHopResults, setMultiHopResults] = useState<import("@envoymesh/api").MultiHopDiscoveryMatch[] | null>(null);
  const [multiHopLoading, setMultiHopLoading] = useState(false);
  const [multiHopSession, setMultiHopSession] = useState<import("@envoymesh/api").MultiHopDiscoverySessionView | null>(null);
  const [multiHopCorrelationId, setMultiHopCorrelationId] = useState<string | null>(null);

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
      const data = session as import("@envoymesh/api").MultiHopDiscoverySessionView;
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

  const handleSearch = async (overrideQuery?: string) => {
    const effectiveQuery = (overrideQuery ?? searchQuery).trim();
    if (!effectiveQuery) return;
    setIsSearching(true);
    setSearchResults([]);
    const startedAt = Date.now();
    try {
      await nodeService.runCapabilityDiscovery({ find: true }).catch(() => {});
      let results: PeerSearchResult[];
      const query = effectiveQuery;

      if (searchMode === "peerId") {
        results = await nodeService.searchPeers({ peerId: query });
      } else if (searchMode === "did") {
        results = await nodeService.searchPeers({ did: query });
      } else if (searchMode === "topic") {
        results = await nodeService.searchPeers({ topic: query.toLowerCase() });
      } else {
        const q = query.toLowerCase();
        results = await nodeService.searchPeers({
          interests: [q],
          username: q,
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

  const handleLibraryDiscover = async () => {
    setLibrarySearching(true);
    setLibraryErr(null);
    setLibraryResults(null);
    const startedAt = Date.now();
    try {
      const q = libraryQuery.trim();
      const hp = libraryHashPrefix.trim();
      const results = await nodeService.discoverPublishedLibrary({
        fileTitleQuery: q || undefined,
        contentHashPrefix: hp || undefined,
        maxResultsPerPeer: 8,
        timeoutMsPerPeer: 18_000,
      });
      const sorted = [...results].sort((a, b) => {
        const ar = a.bondRank ?? bondTrustRank(a.bondLevel);
        const br = b.bondRank ?? bondTrustRank(b.bondLevel);
        if (ar !== br) return ar - br;
        return (a.displayName ?? a.peerOwnerId).localeCompare(b.displayName ?? b.peerOwnerId);
      });
      const elapsed = Date.now() - startedAt;
      if (elapsed < 600) {
        await new Promise((r) => setTimeout(r, 600 - elapsed));
      }
      setLibraryResults(sorted);
    } catch (e) {
      setLibraryErr(e instanceof Error ? e.message : String(e));
      setLibraryResults([]);
    } finally {
      setLibrarySearching(false);
    }
  };

  const handleSayHello = async (targetNodeId: string) => {
    try {
      const profile: HelloProfile = {
        displayName: humanProfile?.displayName ?? "Envoy User",
        bio: humanProfile?.bio ?? "",
        interests: [...(humanProfile?.hobbies ?? []), ...(humanProfile?.knowledge ?? [])],
        whatShares: [],
      };
      await sendHello(targetNodeId, profile, "Hello!");
    } catch (error) {
      console.error("Failed to send hello:", error);
    }
  };

  return (
    <div className={`search-view${embedded ? " search-view--embedded" : ""}`}>
      {!embedded && <h2>Discover</h2>}
      <div className="search-mode-tabs">
        <button
          className={searchMode === "interest" ? "active" : ""}
          onClick={() => setSearchMode("interest")}
        >
          By Interest
        </button>
        <button
          className={searchMode === "topic" ? "active" : ""}
          onClick={() => setSearchMode("topic")}
        >
          By Topic (DHT)
        </button>
        <button
          className={searchMode === "peerId" ? "active" : ""}
          onClick={() => setSearchMode("peerId")}
        >
          By Peer ID
        </button>
        <button
          className={searchMode === "did" ? "active" : ""}
          onClick={() => setSearchMode("did")}
        >
          By DID
        </button>
        <button
          className={searchMode === "library" ? "active" : ""}
          onClick={() => setSearchMode("library")}
        >
          Published files
        </button>
      </div>

      {searchMode === "library" ? (
        <>
          <p className="library-view-hint" style={{ marginBottom: "0.75rem" }}>
            Search <strong>bonded contacts</strong> for published library metadata (titles and paths only — no file bytes). Contacts publish files from Library or Settings → Node.
          </p>
          <div className="search-bar" style={{ marginBottom: "0.5rem" }}>
            <input
              type="text"
              placeholder="Optional content-hash prefix (base64url)"
              value={libraryHashPrefix}
              onChange={(e) => setLibraryHashPrefix(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleLibraryDiscover();
                }
              }}
            />
          </div>
          <div className="search-bar">
            <input
              type="text"
              placeholder='Optional filter on title or path (leave empty for all published)'
              value={libraryQuery}
              onChange={(e) => setLibraryQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleLibraryDiscover();
                }
              }}
            />
            <button
              type="button"
              onClick={() => void handleLibraryDiscover()}
              disabled={librarySearching}
              className="search-btn"
            >
              {librarySearching ? (
                <>
                  <span className="search-spinner" />
                  Querying contacts…
                </>
              ) : (
                "Query contacts"
              )}
            </button>
          </div>
          {libraryErr && (
            <p className="library-view-error" role="alert">
              {libraryErr}
            </p>
          )}
          {librarySearching && (
            <div className="search-status">
              <div className="search-status-content">
                <span className="search-status-icon"><SearchIcon size={20} /></span>
                <div>
                  <strong>Published library discovery</strong>
                  <p>Querying each bond in trust order (direct first)…</p>
                </div>
              </div>
            </div>
          )}
          {!librarySearching && libraryResults !== null && (
            <ul className="search-results library-discovery-results">
              {libraryResults.length === 0 ? (
                <li className="search-empty">
                  <p>No bonded contacts returned results (or no matching published files).</p>
                </li>
              ) : (
                libraryResults.map((row) => (
                  <li key={row.peerOwnerId} className="search-result library-discovery-card">
                    <div className="result-info">
                      <strong>{row.displayName || row.peerOwnerId}</strong>
                      <span className="result-username">
                        {row.bondLevel} · {row.latencyMs}ms
                        {row.error ? ` · ${row.error}` : ""}
                      </span>
                      {row.files.length === 0 && !row.error ? (
                        <p className="library-view-hint">No published files matched.</p>
                      ) : (
                        <ul className="library-discovery-file-list">
                          {row.files.map((f) => (
                            <li key={`${row.peerOwnerId}:${f.documentId}`}>
                              <span className="library-discovery-file-title">{f.title}</span>
                              <span className="library-view-path">{f.relativePath}</span>
                              {f.contentHash ? (
                                <span className="library-discovery-hash" title={f.contentHash}>
                                  {" "}
                                  · {f.contentHash.slice(0, 12)}…
                                </span>
                              ) : null}
                              {f.cid ? (
                                <span className="library-discovery-hash" title={f.cid}>
                                  {" "}
                                  · IPFS {f.cid.slice(0, 12)}…
                                  <button
                                    type="button"
                                    className="secondary"
                                    style={{ marginLeft: "0.35rem", fontSize: "0.85em" }}
                                    onClick={() => void navigator.clipboard.writeText(f.cid!)}
                                  >
                                    Copy CID
                                  </button>
                                </span>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </li>
                ))
              )}
            </ul>
          )}
        </>
      ) : (
        <>
          <div className="search-bar">
            <input
              type="text"
              placeholder={
                searchMode === "peerId"
                  ? "Enter Peer ID (e.g., 12D3KooWSHXmS7N94yFj1...)"
                  : searchMode === "did"
                    ? "Enter did:key:z… or envoy:owner:…"
                  : searchMode === "topic"
                    ? "Enter capability topic (e.g., music, capability:envoymesh.smoke)"
                    : "Enter username or interest (e.g., alice, music)"
              }
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleSearch();
                }
              }}
            />
            <button onClick={() => handleSearch()} disabled={isSearching} className="search-btn">
              {isSearching ? (
                <>
                  <span className="search-spinner" />
                  Searching...
                </>
              ) : (
                "Search"
              )}
            </button>
          </div>

          {isSearching && (
            <div className="search-status">
              <div className="search-status-content">
                <span className="search-status-icon"><SearchIcon size={20} /></span>
                <div>
                  <strong>Searching for "{searchQuery}"</strong>
                  <p>
                    {searchMode === "topic"
                      ? "Querying DHT capability topic providers…"
                      : searchMode === "did"
                        ? "Matching bonded contacts and your identity by DID…"
                      : "Looking for peers with this interest..."}
                  </p>
                </div>
              </div>
              <div className="search-status-progress">
                <div className="progress-bar">
                  <div className="progress-bar-fill" />
                </div>
                <span className="progress-text">Querying network...</span>
              </div>
            </div>
          )}

          {searchMode === "interest" && !searchQuery && (
            <div className="topic-suggestions">
              <h4>Suggested Interests</h4>
              <div className="topic-chips">
                {SUGGESTED_TOPICS.map((topic) => (
                  <button
                    key={topic}
                    className="topic-chip"
                    onClick={() => {
                      setSearchQuery(topic);
                      handleSearch(topic);
                    }}
                  >
                    {topic}
                  </button>
                ))}
              </div>
            </div>
          )}

          {searchMode === "topic" && !searchQuery && (
            <p className="library-view-hint" style={{ marginTop: "0.75rem" }}>
              DHT capability topics find peers advertising on the global libp2p provider index — no prior bond required.
              Follow up with Say Hello; bonded peers can receive policy-gated <code>discovery.request</code>.
            </p>
          )}

          {searchMode === "topic" && (
            <div className="search-bar" style={{ marginTop: "0.75rem" }}>
              <button
                type="button"
                className="search-btn"
                disabled={multiHopLoading}
                onClick={() => void handleMultiHopDiscovery()}
              >
                {multiHopLoading ? "Querying bonds…" : "Multi-hop bond search (US-MH1)"}
              </button>
            </div>
          )}

          {searchMode === "topic" && multiHopResults !== null && (
            <>
              {multiHopSession && (
                <p className="library-view-hint" style={{ marginTop: "0.75rem" }}>
                  Aggregated {multiHopSession.matches.length} match(es) across {multiHopSession.bondsQueried} bond(s).
                  {multiHopSession.pendingForwardApprovals > 0
                    ? ` ${multiHopSession.pendingForwardApprovals} hop-2 forward approval(s) pending on intermediaries — results refresh automatically.`
                    : " Hop-2 responses merge as bonded intermediaries approve forwards."}
                </p>
              )}
              <ul className="search-results" style={{ marginTop: "0.75rem" }}>
                {multiHopResults.length === 0 ? (
                  <li className="search-empty">No matches yet (approvals may be pending for hop 2).</li>
                ) : (
                  multiHopResults.map((row) => (
                    <li key={row.ownerId} className="search-result">
                      <div className="result-info">
                        <strong>{row.ownerId.slice(0, 20)}…</strong>
                        <span className="result-username">
                          hop={row.hopDistance}
                          {row.viaDisplayName ? ` · via ${row.viaDisplayName}` : row.viaOwnerId ? ` · via ${row.viaOwnerId.slice(0, 16)}…` : ""}
                        </span>
                        {row.trustPath && (
                          <p className="library-view-hint" title={row.trustPath}>
                            {row.trustPath}
                          </p>
                        )}
                      </div>
                    </li>
                  ))
                )}
              </ul>
            </>
          )}

          {searchMode === "did" && !searchQuery && (
            <p className="library-view-hint" style={{ marginTop: "0.75rem" }}>
              Resolves <strong>bonded contacts only</strong> from a <code>did:key</code> or <code>envoy:owner:</code> id.
              Copy your DID from Profile → Identity. WAN resolver import remains parked.
            </p>
          )}

          {!morningReportLoading && morningReport && morningReport.length > 0 && (
            <section className="morning-report-panel" style={{ marginTop: "1.25rem" }}>
              <h4>Morning report — ranked discovery</h4>
              <ul className="search-results">
                {morningReport.map((entry) => (
                  <li key={entry.ownerId} className="search-result">
                    <div className="result-info">
                      <strong>{entry.ownerId.slice(0, 16)}…</strong>
                      <span className="result-username">
                        score={entry.score} · trust={entry.trustLevel} · matches={entry.discoveryMatchCount}
                      </span>
                      <p className="library-view-hint">{entry.reason}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {!isSearching && searchResults.length > 0 ? (
            <ul className="search-results">
              {searchResults.map((result) => (
                <li key={result.nodeId} className="search-result">
                  <span className="avatar">{result.displayName?.[0] || "?"}</span>
                  <div className="result-info">
                    <strong>{result.displayName}</strong>
                    {result.username && <span className="result-username">@{result.username}</span>}
                    {result.did && (
                      <span className="result-username" title={result.did}>
                        {result.did.slice(0, 24)}…
                      </span>
                    )}
                    {(result.discoverySource || result.trustLevel) && (
                      <span className="result-username">
                        {result.discoverySource ? `${result.discoverySource}` : ""}
                        {result.trustLevel ? ` · trust=${result.trustLevel}` : ""}
                        {result.signedRecordValid === true ? " · signed ✓" : result.signedRecordValid === false ? " · unsigned" : ""}
                      </span>
                    )}
                    {result.bio && <p>{result.bio}</p>}
                    {result.interests.length > 0 && (
                      <span className="interests">{result.interests.join(", ")}</span>
                    )}
                  </div>
                  <button type="button" onClick={() => void handleSayHello(result.nodeId)}>
                    Say Hello
                  </button>
                </li>
              ))}
            </ul>
          ) : searchQuery.trim() && !isSearching ? (
            <div className="search-empty">
              <div className="empty-state-icon">
                <SearchIcon size={32} />
              </div>
              <p>No peers found for "{searchQuery}"</p>
              <small>
                {searchMode === "peerId"
                  ? "Check if the peer ID is correct. You may need to be connected to them first."
                  : searchMode === "topic"
                    ? "No DHT providers for this topic yet. Confirm wan-default + bootstrap, or try a suggested interest topic."
                    : "No peers are advertising this interest on the network yet. Make sure you're connected to a relay and have set your profile interests."}
              </small>
            </div>
          ) : !isSearching ? (
            <div className="empty-state">
              <div className="empty-state-icon">
                <SearchIcon size={40} />
              </div>
              <div className="empty-state-title">Discover people</div>
              <div className="empty-state-desc">Find peers by interest, username, or Peer ID</div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
