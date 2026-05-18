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
      <h2>Discover</h2>
      <div className="search-mode-tabs">
        <button
          className={searchMode === "interest" ? "active" : ""}
          onClick={() => setSearchMode("interest")}
        >
          By Interest
        </button>
        <button
          className={searchMode === "peerId" ? "active" : ""}
          onClick={() => setSearchMode("peerId")}
        >
          By Peer ID
        </button>
      </div>
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
              <p>Looking for peers with this interest...</p>
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

      {!isSearching && searchResults.length > 0 ? (
        <ul className="search-results">
          {searchResults.map((result) => (
            <li key={result.nodeId} className="search-result">
              <span className="avatar">{result.displayName?.[0] || "?"}</span>
              <div className="result-info">
                <strong>{result.displayName}</strong>
                {result.username && <span className="result-username">@{result.username}</span>}
                {result.bio && <p>{result.bio}</p>}
                {result.interests.length > 0 && (
                  <span className="interests">{result.interests.join(", ")}</span>
                )}
              </div>
              <button onClick={() => handleSayHello(result.nodeId)}>
                Say Hello
              </button>
            </li>
          ))}
        </ul>
      ) : searchQuery.trim() ? (
        <div className="search-empty">
          <p>No peers found for "{searchQuery}"</p>
          <small>
            {searchMode === "peerId"
              ? "Check if the peer ID is correct. You may need to be connected to them first."
              : "Try a different interest or check your connection to the network."}
          </small>
        </div>
      ) : (
        <div className="empty-state">
          <div className="empty-state-icon">
            <SearchIcon size={40} />
          </div>
          <div className="empty-state-title">Discover people</div>
          <div className="empty-state-desc">Find peers by interest, username, or Peer ID</div>
        </div>
      )}
    </div>
  );
}
