import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from "react";
import { useNodeState } from "../../context/NodeStateContext.js";
import { useNodeService } from "../../hooks/useNodeService.js";
import { SUGGESTED_TOPICS } from "../../lib/display.js";
export function SearchView() {
    const nodeService = useNodeService();
    const { humanProfile, sendHello } = useNodeState();
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState([]);
    const [searchMode, setSearchMode] = useState("interest");
    const [isSearching, setIsSearching] = useState(false);
    const handleSearch = async (overrideQuery) => {
        const effectiveQuery = (overrideQuery ?? searchQuery).trim();
        if (!effectiveQuery)
            return;
        setIsSearching(true);
        setSearchResults([]);
        try {
            let results;
            const query = effectiveQuery;
            if (searchMode === "peerId") {
                results = await nodeService.searchPeers({ peerId: query });
            }
            else {
                const q = query.toLowerCase();
                results = await nodeService.searchPeers({
                    interests: [q],
                    username: q,
                });
            }
            setSearchResults(results);
        }
        catch (error) {
            console.error("[SearchView] search failed:", error);
            setSearchResults([]);
        }
        finally {
            setIsSearching(false);
        }
    };
    const handleSayHello = async (targetNodeId) => {
        try {
            const profile = {
                displayName: humanProfile?.displayName ?? "Envoy User",
                bio: humanProfile?.bio ?? "",
                interests: [...(humanProfile?.hobbies ?? []), ...(humanProfile?.knowledge ?? [])],
                whatShares: [],
            };
            await sendHello(targetNodeId, profile, "Hello!");
        }
        catch (error) {
            console.error("Failed to send hello:", error);
        }
    };
    return (_jsxs("div", { className: "search-view", children: [_jsx("h2", { children: "Find People" }), _jsxs("div", { className: "search-mode-tabs", children: [_jsx("button", { className: searchMode === "interest" ? "active" : "", onClick: () => setSearchMode("interest"), children: "By Interest" }), _jsx("button", { className: searchMode === "peerId" ? "active" : "", onClick: () => setSearchMode("peerId"), children: "By Peer ID" })] }), _jsxs("div", { className: "search-bar", children: [_jsx("input", { type: "text", placeholder: searchMode === "peerId"
                            ? "Enter Peer ID (e.g., 12D3KooWSHXmS7N94yFj1...)"
                            : "Enter username or interest (e.g., alice, music)", value: searchQuery, onChange: (e) => setSearchQuery(e.target.value), onKeyDown: (e) => {
                            if (e.key === "Enter") {
                                e.preventDefault();
                                handleSearch();
                            }
                        } }), _jsx("button", { onClick: () => handleSearch(), disabled: isSearching, className: "search-btn", children: isSearching ? (_jsxs(_Fragment, { children: [_jsx("span", { className: "search-spinner" }), "Searching..."] })) : ("Search") })] }), isSearching && (_jsxs("div", { className: "search-status", children: [_jsxs("div", { className: "search-status-content", children: [_jsx("span", { className: "search-status-icon", children: "\uD83D\uDD0D" }), _jsxs("div", { children: [_jsxs("strong", { children: ["Searching for \"", searchQuery, "\""] }), _jsx("p", { children: "Looking for peers with this interest..." })] })] }), _jsxs("div", { className: "search-status-progress", children: [_jsx("div", { className: "progress-bar", children: _jsx("div", { className: "progress-bar-fill" }) }), _jsx("span", { className: "progress-text", children: "Querying network..." })] })] })), searchMode === "interest" && !searchQuery && (_jsxs("div", { className: "topic-suggestions", children: [_jsx("h4", { children: "Suggested Interests" }), _jsx("div", { className: "topic-chips", children: SUGGESTED_TOPICS.map((topic) => (_jsx("button", { className: "topic-chip", onClick: () => {
                                setSearchQuery(topic);
                                handleSearch(topic);
                            }, children: topic }, topic))) })] })), !isSearching && searchResults.length > 0 ? (_jsx("ul", { className: "search-results", children: searchResults.map((result) => (_jsxs("li", { className: "search-result", children: [_jsx("span", { className: "avatar", children: result.displayName?.[0] || "?" }), _jsxs("div", { className: "result-info", children: [_jsx("strong", { children: result.displayName }), result.username && _jsxs("span", { className: "result-username", children: ["@", result.username] }), result.bio && _jsx("p", { children: result.bio }), result.interests.length > 0 && (_jsx("span", { className: "interests", children: result.interests.join(", ") }))] }), _jsx("button", { onClick: () => handleSayHello(result.nodeId), children: "Say Hello" })] }, result.nodeId))) })) : searchQuery.trim() ? (_jsxs("div", { className: "search-empty", children: [_jsxs("p", { children: ["No peers found for \"", searchQuery, "\""] }), _jsx("small", { children: searchMode === "peerId"
                            ? "Check if the peer ID is correct. You may need to be connected to them first."
                            : "Try a different interest or check your connection to the network." })] })) : (_jsx("p", { className: "empty", children: "Enter an interest to find people" }))] }));
}
//# sourceMappingURL=SearchView.js.map