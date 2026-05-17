import { useState } from "react";
import { useNodeState } from "../../context/NodeStateContext.js";
import { useNodeService } from "../../hooks/useNodeService.js";
import { SUGGESTED_TOPICS } from "../../lib/display.js";
import { SearchIcon } from "../../icons.js";
import type { HelloProfile, PeerSearchResult } from "@envoymesh/api";

export function SearchView() {
  const nodeService = useNodeService();
  const { humanProfile, sendHello } = useNodeState();

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<PeerSearchResult[]>([]);
  const [searchMode, setSearchMode] = useState<"interest" | "peerId">("interest");
  const [isSearching, setIsSearching] = useState(false);

  const handleSearch = async (overrideQuery?: string) => {
    const effectiveQuery = (overrideQuery ?? searchQuery).trim();
    if (!effectiveQuery) return;
    setIsSearching(true);
    setSearchResults([]);
    try {
      let results: PeerSearchResult[];
      const query = effectiveQuery;

      if (searchMode === "peerId") {
        results = await nodeService.searchPeers({ peerId: query });
      } else {
        const q = query.toLowerCase();
        results = await nodeService.searchPeers({
          interests: [q],
          username: q,
        });
      }
      setSearchResults(results);
    } catch (error) {
      console.error("[SearchView] search failed:", error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
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
    <div className="search-view">
      <h2>Find People</h2>

      {/* Search mode tabs */}
      <div className="search-tabs">
        <button
          className={`search-tab-btn${searchMode === "interest" ? " active" : ""}`}
          onClick={() => setSearchMode("interest")}
        >
          By Interest
        </button>
        <button
          className={`search-tab-btn${searchMode === "peerId" ? " active" : ""}`}
          onClick={() => setSearchMode("peerId")}
        >
          By Peer ID
        </button>
      </div>

      {/* Search bar */}
      <div className="search-bar">
        <input
          type="text"
          placeholder={
            searchMode === "peerId"
              ? "Enter Peer ID (e.g., 12D3KooWSHXmS7N94yFj1...)"
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
        <button onClick={() => handleSearch()} disabled={isSearching}>
          <SearchIcon size={16} />
          {isSearching ? "Searching..." : "Search"}
        </button>
      </div>

      {/* Searching indicator */}
      {isSearching && (
        <div className="search-loading">
          <div className="spinner" />
          <span>Searching for "{searchQuery}"...</span>
        </div>
      )}

      {/* Suggested topics */}
      {searchMode === "interest" && !searchQuery && (
        <div style={{ marginTop: "var(--space-4)" }}>
          <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, marginBottom: "var(--space-3)", color: "var(--color-text-muted)" }}>
            Suggested Interests
          </div>
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

      {/* Results */}
      {!isSearching && searchResults.length > 0 ? (
        <div className="search-results">
          {searchResults.map((result) => (
            <div key={result.nodeId} className="search-result">
              <span className="contact-avatar">{result.displayName?.[0] || "?"}</span>
              <div className="search-result-info">
                <div className="search-result-name">
                  {result.displayName}
                  {result.username && (
                    <span style={{ fontSize: "var(--text-sm)", color: "var(--color-text-muted)", marginLeft: 8 }}>
                      @{result.username}
                    </span>
                  )}
                </div>
                {result.bio && <div className="search-result-detail">{result.bio}</div>}
                {result.interests.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8 }}>
                    {result.interests.map((interest) => (
                      <span key={interest} className="profile-tag neutral">{interest}</span>
                    ))}
                  </div>
                )}
              </div>
              <button className="say-hello-btn" onClick={() => handleSayHello(result.nodeId)}>
                Say Hello
              </button>
            </div>
          ))}
        </div>
      ) : searchQuery.trim() && !isSearching ? (
        <div className="search-empty">
          <h3>No peers found for "{searchQuery}"</h3>
          <p>
            {searchMode === "peerId"
              ? "Check if the peer ID is correct. You may need to be connected to them first."
              : "Try a different interest or check your connection to the network."}
          </p>
        </div>
      ) : null}
    </div>
  );
}
