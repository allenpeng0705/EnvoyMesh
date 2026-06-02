import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNodeState } from "../../context/NodeStateContext.js";
import { useT } from "../../context/I18nContext.js";
import { useIsInProcessMobileNode, useNodeService } from "../../hooks/useNodeService.js";
import { useToast } from "../../hooks/useToast.js";
import { openVaultLibraryFile, revealVaultLibraryFile } from "../../lib/library-file-actions.js";
import { ShareFileDialog } from "../file-share/ShareFileDialog.js";
import { FriendsFilesPanel } from "../discover/FriendsFilesPanel.js";
import type { LibraryItem } from "@envoymesh/api";

export function LibraryView() {
  const t = useT();
  const nodeService = useNodeService();
  const { nodeConfig } = useNodeState();
  const { showToast } = useToast();
  const isMobileNode = useIsInProcessMobileNode();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const ipfsExportEngine = nodeConfig?.externalPublish?.ipfsExportEngine ?? (isMobileNode ? "helia" : "kubo");
  const ipfsPolicyEnabled = nodeConfig?.externalPublish?.allowIpfs ?? false;
  const ipfsPinningEnabled =
    ipfsPolicyEnabled && (nodeConfig?.externalPublish?.pinningEnabled ?? false);
  const ipfsMobileHeliaEnabled =
    isMobileNode && ipfsPolicyEnabled && ipfsExportEngine === "helia";
  const ipfsHeliaPrimaryEnabled =
    ipfsPolicyEnabled && !isMobileNode && ipfsExportEngine === "helia";
  const ipfsExportActionsEnabled = ipfsPolicyEnabled && (!isMobileNode || ipfsMobileHeliaEnabled);
  const ipfsGatewayVerifyEnabled =
    ipfsPolicyEnabled && (nodeConfig?.externalPublish?.gatewayAllowlist?.length ?? 0) > 0;
  const [query, setQuery] = useState("");
  const [rawItems, setRawItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [importBusy, setImportBusy] = useState(false);

  const [shareFor, setShareFor] = useState<LibraryItem | null>(null);
  const [ipfsBusyId, setIpfsBusyId] = useState<string | null>(null);
  const [ipfsPinBusyId, setIpfsPinBusyId] = useState<string | null>(null);
  const [ipfsVerifyBusyId, setIpfsVerifyBusyId] = useState<string | null>(null);
  const [ipfsErr, setIpfsErr] = useState<string | null>(null);
  const [ipfsOk, setIpfsOk] = useState<string | null>(null);
  const [fileActionBusy, setFileActionBusy] = useState<string | null>(null);

  const runLibraryFileAction = async (relativePath: string, action: "open" | "reveal") => {
    setFileActionBusy(`${action}:${relativePath}`);
    try {
      if (action === "open") {
        await openVaultLibraryFile(nodeService, relativePath);
      } else {
        await revealVaultLibraryFile(nodeService, relativePath);
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setFileActionBusy(null);
    }
  };

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

  const handleImportFile = async (file: File) => {
    setImportBusy(true);
    setError(null);
    try {
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
      const contentBase64 = btoa(binary);
      const relativePath = `imports/${file.name.replace(/^[\\/]+/, "")}`;
      const result = await nodeService.importToLibrary({
        relativePath,
        contentBase64,
        mimeType: file.type || undefined,
      });
      showToast(t("library.importedToast", { path: result.relativePath }), "success");
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      showToast(msg, "error");
    } finally {
      setImportBusy(false);
    }
  };

  const renderRowActions = (row: LibraryItem) => (
    <>
      <button
        type="button"
        className="secondary"
        disabled={fileActionBusy === `open:${row.relativePath}`}
        onClick={() => void runLibraryFileAction(row.relativePath, "open")}
      >
        {fileActionBusy === `open:${row.relativePath}` ? t("library.opening") : t("library.open")}
      </button>
      <button
        type="button"
        className="secondary"
        disabled={fileActionBusy === `reveal:${row.relativePath}`}
        onClick={() => void runLibraryFileAction(row.relativePath, "reveal")}
      >
        {fileActionBusy === `reveal:${row.relativePath}` ? t("library.opening") : t("library.showInFolder")}
      </button>
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
        {row.published ? t("library.published") : t("library.private")}
      </label>
      {ipfsExportActionsEnabled && (
        <div className="library-row-ipfs">
          {row.publishedExternal ? (
            <>
              <code className="library-view-path" title={row.publishedExternal.cid}>
                {row.publishedExternal.cid.slice(0, 12)}…
              </code>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  void navigator.clipboard.writeText(row.publishedExternal!.cid);
                  setIpfsOk(t("library.cidCopied"));
                  setIpfsErr(null);
                }}
              >
                {t("library.copyCid")}
              </button>
            </>
          ) : null}
          <button
            type="button"
            className="secondary"
            disabled={ipfsBusyId === row.documentId}
            onClick={() => {
              void (async () => {
                setIpfsErr(null);
                setIpfsOk(null);
                setIpfsBusyId(row.documentId);
                try {
                  await nodeService.exportLibraryItemToIpfs(row.documentId);
                  showToast(t("library.ipfsExportComplete"), "success");
                  await load();
                } catch (err) {
                  setIpfsErr(err instanceof Error ? err.message : String(err));
                } finally {
                  setIpfsBusyId(null);
                }
              })();
            }}
          >
            {ipfsBusyId === row.documentId
              ? t("library.exporting")
              : row.publishedExternal
                ? t("library.reExport")
                : t("library.export")}
          </button>
          {ipfsPinningEnabled && row.publishedExternal && (
            <button
              type="button"
              className="secondary"
              disabled={ipfsPinBusyId === row.documentId}
              onClick={() => {
                void (async () => {
                  setIpfsErr(null);
                  setIpfsOk(null);
                  setIpfsPinBusyId(row.documentId);
                  try {
                    const result = await nodeService.pinLibraryItemExternal(row.documentId);
                    if (!result.ok) {
                      throw new Error(result.error ?? t("library.pinFailed"));
                    }
                    setIpfsOk(
                      t("library.pinnedStatus", {
                        provider: result.provider,
                        pinId: result.pinId ? ` (${result.pinId})` : "",
                      }),
                    );
                    showToast(t("library.cidPinnedToast"), "success");
                  } catch (err) {
                    setIpfsErr(err instanceof Error ? err.message : String(err));
                  } finally {
                    setIpfsPinBusyId(null);
                  }
                })();
              }}
            >
              {ipfsPinBusyId === row.documentId ? t("library.pinning") : t("library.pin")}
            </button>
          )}
          {ipfsGatewayVerifyEnabled && row.publishedExternal && (
            <button
              type="button"
              className="secondary"
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
                      t("library.gatewayVerifiedStatus", {
                        bytes: String(result.fetchedBytes),
                        url: result.gatewayUrl,
                      }),
                    );
                    showToast(t("library.gatewayMatch"), "success");
                  } catch (err) {
                    setIpfsErr(err instanceof Error ? err.message : String(err));
                  } finally {
                    setIpfsVerifyBusyId(null);
                  }
                })();
              }}
            >
              {ipfsVerifyBusyId === row.documentId ? t("library.verifying") : t("library.verifyGateway")}
            </button>
          )}
        </div>
      )}
      <button type="button" className="primary" onClick={() => setShareFor(row)}>
        {t("library.share")}
      </button>
    </>
  );

  return (
    <div className="library-view">
      <h2>{t("library.title")}</h2>
      <p className="library-view-hint">{t("library.hint")}</p>
      <div className="library-view-toolbar">
        <input
          type="search"
          className="library-view-search"
          placeholder={t("library.filterPlaceholder")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label={t("library.filterAria")}
        />
        <button type="button" className="secondary" onClick={() => void load()} disabled={loading}>
          {loading ? t("common.loading") : t("common.refresh")}
        </button>
        <button
          type="button"
          className="primary"
          disabled={importBusy}
          onClick={() => fileInputRef.current?.click()}
        >
          {importBusy ? t("library.importing") : t("library.importFile")}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void handleImportFile(file);
          }}
        />
      </div>
      {error && <p className="library-view-error" role="alert">{error}</p>}
      {ipfsErr && <p className="library-view-error" role="alert">{ipfsErr}</p>}
      {ipfsOk && <p className="library-view-hint" role="status">{ipfsOk}</p>}
      {isMobileNode && !ipfsMobileHeliaEnabled && (
        <p className="library-view-hint">{t("library.heliaHint")}</p>
      )}
      {isMobileNode && ipfsMobileHeliaEnabled && (
        <p className="library-view-hint">{t("library.ipfsMobileHeliaOn")}</p>
      )}
      {!isMobileNode && !ipfsPolicyEnabled && (
        <p className="library-view-hint">{t("library.ipfsDisabled")}</p>
      )}
      {!isMobileNode && ipfsPolicyEnabled && ipfsHeliaPrimaryEnabled && (
        <p className="library-view-hint">{t("library.ipfsDesktopHelia")}</p>
      )}
      {!isMobileNode && ipfsPolicyEnabled && !ipfsHeliaPrimaryEnabled && (
        <p className="library-view-hint">{t("library.ipfsDesktopKubo")}</p>
      )}
      <FriendsFilesPanel />
      {!loading && !error && items.length === 0 && (
        <p className="library-view-empty">
          {rawItems.length === 0 ? t("library.empty") : t("library.emptyFilter")}
        </p>
      )}
      {items.length > 0 && (
        <>
          <table className="library-view-table">
            <thead>
              <tr>
                <th scope="col">{t("library.colTitle")}</th>
                <th scope="col">{t("library.colPath")}</th>
                <th scope="col">{t("library.colSize")}</th>
                <th scope="col">{t("library.colUpdated")}</th>
                <th scope="col">{t("library.colActions")}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.documentId}>
                  <td>{row.title}</td>
                  <td className="library-view-path">{row.relativePath}</td>
                  <td>{formatBytes(row.byteLength)}</td>
                  <td>{formatDate(row.updatedAt)}</td>
                  <td className="library-view-actions">{renderRowActions(row)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="library-view-cards" aria-label={t("library.filesAria")}>
            {items.map((row) => (
              <li key={row.documentId} className="library-view-card">
                <div className="library-view-card-head">
                  <strong>{row.title}</strong>
                  <span className="library-view-card-meta">{formatBytes(row.byteLength)}</span>
                </div>
                <div className="library-view-path">{row.relativePath}</div>
                <div className="library-view-card-meta">{formatDate(row.updatedAt)}</div>
                <div className="library-view-card-actions">{renderRowActions(row)}</div>
              </li>
            ))}
          </ul>
        </>
      )}
      {shareFor && (
        <ShareFileDialog
          libraryItem={shareFor}
          onClose={() => setShareFor(null)}
          onShared={() => setShareFor(null)}
        />
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
