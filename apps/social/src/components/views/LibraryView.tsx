import { useCallback, useEffect, useMemo, useState } from "react";
import { useNodeService } from "../../hooks/useNodeService.js";
import type { BondRecord, LibraryItem } from "@envoymesh/api";

export function LibraryView() {
  const nodeService = useNodeService();
  const [query, setQuery] = useState("");
  const [rawItems, setRawItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [shareFor, setShareFor] = useState<LibraryItem | null>(null);
  const [bonds, setBonds] = useState<BondRecord[]>([]);
  const [targetOwnerId, setTargetOwnerId] = useState("");
  const [shareSensitivity, setShareSensitivity] = useState<"public" | "friends" | "private">("friends");
  const [shareBusy, setShareBusy] = useState(false);
  const [shareErr, setShareErr] = useState<string | null>(null);

  useEffect(() => {
    void nodeService.getBonds().then(setBonds).catch(() => setBonds([]));
  }, [nodeService]);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rawItems;
    return rawItems.filter(
      (r) => r.title.toLowerCase().includes(q) || r.relativePath.toLowerCase().includes(q),
    );
  }, [rawItems, query]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await nodeService.listLibraryItems();
      setRawItems(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRawItems([]);
    } finally {
      setLoading(false);
    }
  }, [nodeService]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="library-view">
      <h2>Library</h2>
      <p className="library-view-hint">
        Documents in your shared vault (supported: .md, .txt, .json) — same files used for knowledge indexing.
      </p>
      <div className="library-view-toolbar">
        <input
          type="search"
          className="library-view-search"
          placeholder="Filter by name or path…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Filter library"
        />
        <button type="button" className="secondary" onClick={() => void load()} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>
      {error && <p className="library-view-error" role="alert">{error}</p>}
      {!loading && !error && items.length === 0 && (
        <p className="library-view-empty">
          {rawItems.length === 0
            ? "No documents in the vault yet. Add files under your shared vault folder (or set ENVOYMESH_VAULT)."
            : "No entries match your filter."}
        </p>
      )}
      {items.length > 0 && (
        <table className="library-view-table">
          <thead>
            <tr>
              <th scope="col">Title</th>
              <th scope="col">Path</th>
              <th scope="col">Size</th>
              <th scope="col">Updated</th>
              <th scope="col">Published</th>
              <th scope="col">Share</th>
            </tr>
          </thead>
          <tbody>
            {items.map((row) => (
              <tr key={row.documentId}>
                <td>{row.title}</td>
                <td className="library-view-path">{row.relativePath}</td>
                <td>{formatBytes(row.byteLength)}</td>
                <td>{formatDate(row.updatedAt)}</td>
                <td>
                  <label className="library-published-toggle">
                    <input
                      type="checkbox"
                      checked={row.published}
                      onChange={(e) => {
                        void (async () => {
                          try {
                            await nodeService.setLibraryItemPublished(row.documentId, e.target.checked);
                            await load();
                          } catch (err) {
                            console.error(err);
                          }
                        })();
                      }}
                    />{" "}
                    {row.published ? "Yes" : "No"}
                  </label>
                </td>
                <td>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => {
                      setShareFor(row);
                      setShareErr(null);
                      const direct = bonds.find((b) => b.level !== "blocked");
                      if (direct) setTargetOwnerId(direct.peerOwnerId);
                    }}
                  >
                    Share…
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {shareFor && (
        <div className="library-share-panel" role="dialog" aria-label="Share from library">
          <h3 className="library-share-title">Share “{shareFor.title}”</h3>
          <p className="library-view-hint">
            Sends a <code>share.request</code> to a bonded contact; they accept in Incoming file shares (Settings → Node on desktop).
          </p>
          {shareErr && (
            <p className="library-view-error" role="alert">
              {shareErr}
            </p>
          )}
          <label className="library-share-label" htmlFor="library-share-contact">
            Bonded contact
          </label>
          <select
            id="library-share-contact"
            className="library-view-search"
            value={targetOwnerId}
            onChange={(e) => setTargetOwnerId(e.target.value)}
          >
            <option value="">Select a contact…</option>
            {bonds
              .filter((b) => b.level !== "blocked")
              .map((b) => (
                <option key={b.peerOwnerId} value={b.peerOwnerId}>
                  {b.displayName?.trim() || b.peerOwnerId}
                </option>
              ))}
          </select>
          <label className="library-share-label" htmlFor="library-share-sens">
            Sensitivity
          </label>
          <select
            id="library-share-sens"
            className="library-view-search"
            value={shareSensitivity}
            onChange={(e) =>
              setShareSensitivity(e.target.value as "public" | "friends" | "private")
            }
          >
            <option value="public">public</option>
            <option value="friends">friends</option>
            <option value="private">private</option>
          </select>
          <div className="library-share-actions">
            <button
              type="button"
              disabled={shareBusy || !targetOwnerId}
              onClick={() => {
                void (async () => {
                  if (!shareFor || !targetOwnerId) return;
                  setShareBusy(true);
                  setShareErr(null);
                  try {
                    await nodeService.shareFile(targetOwnerId, {
                      path: shareFor.relativePath,
                      sensitivity: shareSensitivity,
                    });
                    setShareFor(null);
                  } catch (e) {
                    setShareErr(e instanceof Error ? e.message : String(e));
                  } finally {
                    setShareBusy(false);
                  }
                })();
              }}
            >
              {shareBusy ? "Sending…" : "Send share request"}
            </button>
            <button type="button" className="secondary" onClick={() => setShareFor(null)} disabled={shareBusy}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}
