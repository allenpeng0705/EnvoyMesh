/**
 * MobileDiscoverView — Mobile-native peer discovery / search.
 *
 * Segmented control for search mode, suggestion chips when empty,
 * skeleton loading during search, flat result rows.
 */
import { useState, useCallback } from "react";
import { useNodeState } from "@envoymesh/social/context/NodeStateContext.js";
import { useNodeService } from "@envoymesh/social/hooks/useNodeService.js";
import { SUGGESTED_TOPICS } from "@envoymesh/social/lib/display.js";
import type { HelloProfile, PeerSearchResult } from "@envoymesh/api";

type SearchMode = "interest" | "peerId";

export function MobileDiscoverView() {
  const nodeService = useNodeService();
  const { humanProfile, sendHello } = useNodeState();

  const [searchQuery, setSearchQuery] = useState("");
  const [searchMode, setSearchMode] = useState<SearchMode>("interest");
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<PeerSearchResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [helloing, setHelloing] = useState<Record<string, boolean>>({});

  const handleSearch = useCallback(async (override?: string) => {
    const q = (override ?? searchQuery).trim();
    if (!q) return;
    setIsSearching(true);
    setSearched(true);
    setResults([]);
    try {
      if (searchMode === "peerId") {
        setResults(await nodeService.searchPeers({ peerId: q }));
      } else {
        setResults(await nodeService.searchPeers({
          interests: [q.toLowerCase()],
          username: q.toLowerCase(),
        }));
      }
    } catch (e) {
      console.error("[MobileDiscover] search failed:", e);
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery, searchMode, nodeService]);

  const handleSayHello = useCallback(async (targetNodeId: string) => {
    setHelloing((p) => ({ ...p, [targetNodeId]: true }));
    try {
      const profile: HelloProfile = {
        displayName: humanProfile?.displayName ?? "Envoy User",
        bio: humanProfile?.bio ?? "",
        interests: [...(humanProfile?.hobbies ?? []), ...(humanProfile?.knowledge ?? [])],
        whatShares: [],
      };
      await sendHello(targetNodeId, profile, "Hello!");
    } catch (e) { console.error(e); }
    finally { setHelloing((p) => ({ ...p, [targetNodeId]: false })); }
  }, [humanProfile, sendHello]);

  return (
    <div className="mv-discover">
      {/* Search group: segmented control + input */}
      <div className="mv-discover-search-group">
        <div className="mv-segmented-control">
          <button
            className={`mv-segment-btn${searchMode === "interest" ? " active" : ""}`}
            onClick={() => setSearchMode("interest")}
          >
            By Interest
          </button>
          <button
            className={`mv-segment-btn${searchMode === "peerId" ? " active" : ""}`}
            onClick={() => setSearchMode("peerId")}
          >
            By Peer ID
          </button>
        </div>

        <div className="mv-search-bar">
          <input
            type="text"
            placeholder={
              searchMode === "peerId"
                ? "Enter Peer ID..."
                : "Search interests or username..."
            }
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
            enterKeyHint="search"
            inputMode="search"
          />
          <button
            className="mv-search-btn"
            onClick={() => handleSearch()}
            disabled={isSearching}
          >
            {isSearching ? "..." : "Search"}
          </button>
        </div>
      </div>

      {/* Skeleton loading */}
      {isSearching && (
        <div style={{ padding: "0 var(--space-4)" }}>
          {[1, 2, 3].map((i) => (
            <div key={i} style={{ display: "flex", gap: "var(--space-3)", padding: "var(--space-3) 0", alignItems: "center" }}>
              <div className="mv-skeleton mv-skeleton-avatar" />
              <div style={{ flex: 1 }}>
                <div className="mv-skeleton mv-skeleton-line medium" />
                <div className="mv-skeleton mv-skeleton-line short" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Results */}
      {!isSearching && results.length > 0 && (
        <ul className="mv-search-results">
          {results.map((r) => (
            <li key={r.nodeId} className="mv-search-result">
              <div className="mv-search-result-avatar">{r.displayName?.[0] || "?"}</div>
              <div className="mv-search-result-info">
                <div className="mv-search-result-name">{r.displayName}</div>
                {r.username && <div className="mv-search-result-username">@{r.username}</div>}
                {r.bio && <div className="mv-search-result-bio">{r.bio}</div>}
                {r.interests.length > 0 && (
                  <div className="mv-search-result-interests">
                    {r.interests.map((t, j) => (
                      <span key={j} className="mv-search-result-tag">{t}</span>
                    ))}
                  </div>
                )}
              </div>
              <button
                className="mv-say-hello-btn"
                onClick={() => handleSayHello(r.nodeId)}
                disabled={helloing[r.nodeId]}
              >
                {helloing[r.nodeId] ? "..." : "Say Hello"}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Empty search result */}
      {!isSearching && searched && results.length === 0 && (
        <div className="mv-empty-state">
          <div className="mv-empty-state-title">No peers found</div>
          <div className="mv-empty-state-desc">
            Try a different interest or check your connection to the network.
          </div>
        </div>
      )}

      {/* Initial state — suggestion chips */}
      {!isSearching && !searched && (
        <div className="mv-suggestions">
          <div className="mv-suggestions-title">Suggested Interests</div>
          <div className="mv-chips">
            {SUGGESTED_TOPICS.map((topic) => (
              <button
                key={topic}
                className="mv-chip"
                onClick={() => { setSearchQuery(topic); handleSearch(topic); }}
              >
                {topic}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export { MobileDiscoverView as default };
