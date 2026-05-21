import { useCallback, useEffect, useMemo, useState } from "react";
import { useNodeState } from "../../context/NodeStateContext.js";
import { useIsInProcessMobileNode, useNodeService } from "../../hooks/useNodeService.js";
import type { BondRecord, LibraryItem } from "@envoymesh/api";

export function LibraryView() {
  const nodeService = useNodeService();
  const { nodeConfig } = useNodeState();
  const isMobileNode = useIsInProcessMobileNode();
  const ipfsPolicyEnabled = nodeConfig?.externalPublish?.allowIpfs ?? false;
  const ipfsDesktopActionsEnabled = ipfsPolicyEnabled && !isMobileNode;
  const ipfsGatewayVerifyEnabled =
    (nodeConfig?.externalPublish?.gatewayAllowlist?.length ?? 0) > 0 && !isMobileNode;
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
  const [ipfsBusyId, setIpfsBusyId] = useState<string | null>(null);
  const [ipfsVerifyBusyId, setIpfsVerifyBusyId] = useState<string | null>(null);
  const [ipfsErr, setIpfsErr] = useState<string | null>(null);
  const [ipfsOk, setIpfsOk] = useState<string | null>(null);

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
        Files under your shared vault appear here — any type can be published or offered for P2P share. Only .md /
        .txt / .json are full-text searchable for vault RAG.
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
      {ipfsErr && <p className="library-view-error" role="alert">{ipfsErr}</p>}
      {ipfsOk && <p className="library-view-hint" role="status">{ipfsOk}</p>}
      {isMobileNode && (
        <p className="library-view-hint">
          IPFS export and gateway verify run on your home desktop node (Kubo). Use Discover to view and copy CIDs that bonded peers publish.
        </p>
      )}
      {!isMobileNode && !ipfsPolicyEnabled && (
        <p className="library-view-hint">
          IPFS export is off. Enable it under Settings → Node → External distribution when you want CIDs for vault files.
        </p>
      )}
      {!isMobileNode && ipfsPolicyEnabled && (
        <p className="library-view-hint">
          Export starts the IPFS engine automatically on first use — no separate Kubo install required when using the desktop app bundle.
        </p>
      )}
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
              {ipfsDesktopActionsEnabled && <th scope="col">IPFS</th>}
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
                {ipfsDesktopActionsEnabled && (
                  <td>
                    {row.publishedExternal ? (
                      <>
                        <code className="library-view-path" title={row.publishedExternal.cid}>
                          {row.publishedExternal.cid.slice(0, 12)}…
                        </code>
                        <button
                          type="button"
                          className="secondary"
                          style={{ marginLeft: "0.5rem" }}
                          onClick={() => {
                            void navigator.clipboard.writeText(row.publishedExternal!.cid);
                            setIpfsOk("CID copied");
                            setIpfsErr(null);
                          }}
                        >
                          Copy CID
                        </button>
                      </>
                    ) : (
                      <span className="library-view-hint">—</span>
                    )}
                    <button
                      type="button"
                      className="secondary"
                      style={{ marginLeft: "0.5rem" }}
                      disabled={ipfsBusyId === row.documentId}
                      onClick={() => {
                        void (async () => {
                          setIpfsErr(null);
                          setIpfsOk(null);
                          setIpfsBusyId(row.documentId);
                          try {
                            await nodeService.exportLibraryItemToIpfs(row.documentId);
                            await load();
                          } catch (err) {
                            setIpfsErr(err instanceof Error ? err.message : String(err));
                          } finally {
                            setIpfsBusyId(null);
                          }
                        })();
                      }}
                    >
                      {ipfsBusyId === row.documentId ? "Exporting…" : row.publishedExternal ? "Re-export" : "Export"}
                    </button>
                    {ipfsGatewayVerifyEnabled && row.publishedExternal && (
                      <button
                        type="button"
                        className="secondary"
                        style={{ marginLeft: "0.5rem" }}
                        disabled={ipfsVerifyBusyId === row.documentId}
                        onClick={() => {
                          void (async () => {
                            setIpfsErr(null);
                            setIpfsOk(null);
                            setIpfsVerifyBusyId(row.documentId);
                            try {
                              const result = await nodeService.verifyLibraryItemIpfsGateway({
                                documentId: row.documentId,
                              });
                              setIpfsOk(
                                `Gateway verified (${result.fetchedBytes} bytes) — ${result.gatewayUrl}`,
                              );
                            } catch (err) {
                              setIpfsErr(err instanceof Error ? err.message : String(err));
                            } finally {
                              setIpfsVerifyBusyId(null);
                            }
                          })();
                        }}
                      >
                        {ipfsVerifyBusyId === row.documentId ? "Verifying…" : "Verify gateway"}
                      </button>
                    )}
                  </td>
                )}
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
