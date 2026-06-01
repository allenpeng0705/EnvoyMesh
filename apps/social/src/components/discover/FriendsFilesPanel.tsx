import { useState } from "react";
import { useNodeService } from "../../hooks/useNodeService.js";
import { useT } from "../../context/I18nContext.js";
import { bondTrustRank, type DiscoverPublishedLibraryPeerResult } from "@envoymesh/api";
import { SearchIcon } from "../../icons.js";

export function FriendsFilesPanel() {
  const t = useT();
  const nodeService = useNodeService();

  const [libraryQuery, setLibraryQuery] = useState("");
  const [libraryHashPrefix, setLibraryHashPrefix] = useState("");
  const [libraryResults, setLibraryResults] = useState<DiscoverPublishedLibraryPeerResult[] | null>(null);
  const [librarySearching, setLibrarySearching] = useState(false);
  const [libraryErr, setLibraryErr] = useState<string | null>(null);

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
      const msg = e instanceof Error ? e.message : String(e);
      setLibraryErr(msg);
      setLibraryResults([]);
    } finally {
      setLibrarySearching(false);
    }
  };

  return (
    <section className="discover-panel friends-files-panel" aria-labelledby="friends-files-heading">
      <header className="discover-panel__header">
        <h3 id="friends-files-heading" className="discover-panel__title">
          {t("discover.friendsFiles.title")}
        </h3>
        <p className="discover-panel__lede">{t("discover.friendsFiles.lede")}</p>
      </header>
      <div className="search-bar" style={{ marginBottom: "0.5rem" }}>
        <input
          type="text"
          placeholder={t("discover.friendsFiles.hashPlaceholder")}
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
          placeholder={t("discover.friendsFiles.titlePlaceholder")}
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
              {t("discover.friendsFiles.querying")}
            </>
          ) : (
            t("discover.friendsFiles.query")
          )}
        </button>
      </div>
      {libraryErr ? (
        <p className="library-view-error" role="alert">
          {libraryErr}
        </p>
      ) : null}
      {librarySearching ? (
        <div className="search-status">
          <div className="search-status-content">
            <span className="search-status-icon">
              <SearchIcon size={20} />
            </span>
            <div>
              <strong>{t("discover.friendsFiles.statusTitle")}</strong>
              <p>{t("discover.friendsFiles.queryingDetail")}</p>
            </div>
          </div>
        </div>
      ) : null}
      {!librarySearching && libraryResults !== null ? (
        <ul className="search-results library-discovery-results">
          {libraryResults.length === 0 ? (
            <li className="search-empty">
              <p>{t("discover.friendsFiles.empty")}</p>
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
                    <p className="library-view-hint">{t("discover.friendsFiles.noFiles")}</p>
                  ) : (
                    <ul className="library-discovery-file-list">
                      {row.files.map((f) => (
                        <li key={`${row.peerOwnerId}:${f.documentId}`}>
                          <span className="library-discovery-file-title">{f.title}</span>
                          <span className="library-view-path">{f.relativePath}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </section>
  );
}
