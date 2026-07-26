import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNodeState } from "../../context/NodeStateContext.js";
import { useT } from "../../context/I18nContext.js";
import { useIsInProcessMobileNode, useNodeService } from "../../hooks/useNodeService.js";
import { useToast } from "../../hooks/useToast.js";
import { openLocalFile, revealVaultLibraryFile } from "../../lib/library-file-actions.js";
import {
  isHiddenFromLibraryList,
  localFileRowKey,
  vaultLibraryItemFromLocalFile,
} from "../../lib/local-file-display.js";
import { ShareFileDialog } from "../file-share/ShareFileDialog.js";
import { FriendsFilesPanel } from "../discover/FriendsFilesPanel.js";
import { NoteEditorView } from "./NoteEditorView.js";
import type { LibraryItem, LocalFileItem } from "@envoymesh/api";
import type { NoteEditorMode } from "./NoteEditorView.js";

type LibraryRowMenu = {
  rowKey: string;
  row: LocalFileItem;
  x: number;
  y: number;
};

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
  const [rawItems, setRawItems] = useState<LocalFileItem[]>([]);
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
  const [rowMenu, setRowMenu] = useState<LibraryRowMenu | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Note editor state (Phase 44A2).
  const [noteEditor, setNoteEditor] = useState<{
    mode: NoteEditorMode;
    relativePath?: string;
  } | null>(null);

  const openNoteEditor = (mode: NoteEditorMode, relativePath?: string) => {
    setNoteEditor(mode === "edit" && relativePath ? { mode, relativePath } : { mode });
  };

  const runLibraryFileAction = async (row: LocalFileItem, action: "open" | "reveal") => {
    const busyKey = `${action}:${localFileRowKey(row)}`;
    setFileActionBusy(busyKey);
    try {
      if (action === "open") {
        await openLocalFile(nodeService, {
          source: row.source,
          relativePath: row.relativePath,
          documentId: row.documentId,
        });
      } else {
        if (row.source !== "vault") {
          showToast(t("library.revealVaultOnly"), "error");
          return;
        }
        await revealVaultLibraryFile(nodeService, row.relativePath);
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setFileActionBusy(null);
    }
  };

  const items = useMemo(() => {
    const visible = rawItems.filter(
      (r) => r.source === "vault" && !isHiddenFromLibraryList(r.relativePath),
    );
    const q = query.trim().toLowerCase();
    if (!q) return visible;
    return visible.filter(
      (r) => r.title.toLowerCase().includes(q) || r.relativePath.toLowerCase().includes(q),
    );
  }, [rawItems, query]);

  const visibleCount = useMemo(
    () =>
      rawItems.filter(
        (r) => r.source === "vault" && !isHiddenFromLibraryList(r.relativePath),
      ).length,
    [rawItems],
  );
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await nodeService.listAllLocalFiles();
      setRawItems(result.items);
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

  useEffect(() => {
    if (!rowMenu) return;
    const onPointerDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setRowMenu(null);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setRowMenu(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [rowMenu]);

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

  const closeRowMenu = () => setRowMenu(null);

  const renderRowActions = (row: LocalFileItem) => {
    const rowKey = localFileRowKey(row);
    const vaultItem = vaultLibraryItemFromLocalFile(row);
    const openLabel =
      fileActionBusy === `open:${rowKey}` ? t("library.opening") : t("library.open");
    const canEditNote = row.extension === ".md" && row.relativePath.startsWith("notes/");
    const canReveal = !isMobileNode && row.source === "vault";
    const menuOpen = rowMenu?.rowKey === rowKey;
    const hasOverflow =
      canEditNote || canReveal || (Boolean(vaultItem) && ipfsExportActionsEnabled);

    return (
      <div className="library-view-actions">
        {vaultItem ? (
          <label className="library-published-toggle">
            <input
              type="checkbox"
              checked={vaultItem.published}
              onChange={(e) => {
                void (async () => {
                  try {
                    await nodeService.setLibraryItemPublished(
                      vaultItem.documentId,
                      e.target.checked,
                    );
                    await load();
                  } catch (err) {
                    console.error(err);
                  }
                })();
              }}
            />
            {vaultItem.published ? t("library.published") : t("library.private")}
          </label>
        ) : null}
        <button
          type="button"
          className="library-view__icon-btn"
          disabled={fileActionBusy === `open:${rowKey}`}
          title={openLabel}
          aria-label={openLabel}
          onClick={() => void runLibraryFileAction(row, "open")}
        >
          <LibraryIconOpen />
        </button>
        {vaultItem ? (
          <button
            type="button"
            className="library-view__icon-btn library-view__icon-btn--primary"
            title={t("library.share")}
            aria-label={t("library.share")}
            onClick={() => setShareFor(vaultItem)}
          >
            <LibraryIconShare />
          </button>
        ) : null}
        {hasOverflow ? (
          <button
            type="button"
            className="library-view__icon-btn"
            title={t("library.moreActions", "More actions")}
            aria-label={t("library.moreActions", "More actions")}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            data-testid={`library-more-${rowKey}`}
            onClick={(e) => {
              if (menuOpen) {
                closeRowMenu();
                return;
              }
              const rect = e.currentTarget.getBoundingClientRect();
              setRowMenu({
                rowKey,
                row,
                x: Math.max(8, rect.right - 200),
                y: rect.bottom + 4,
              });
            }}
          >
            <LibraryIconMore />
          </button>
        ) : null}
      </div>
    );
  };

  const renderOverflowMenu = () => {
    if (!rowMenu || typeof document === "undefined") return null;
    const { row, rowKey } = rowMenu;
    // Prefer live list data so publish/IPFS state stays current while menu is open.
    const liveRow = items.find((r) => localFileRowKey(r) === rowKey) ?? row;
    const vaultItem = vaultLibraryItemFromLocalFile(liveRow);
    const revealLabel =
      fileActionBusy === `reveal:${rowKey}` ? t("library.opening") : t("library.showInFolder");
    const canEditNote = liveRow.extension === ".md" && liveRow.relativePath.startsWith("notes/");
    const canReveal = !isMobileNode && liveRow.source === "vault";

    return createPortal(
      <div
        ref={menuRef}
        className="library-view__menu"
        role="menu"
        data-testid="library-row-menu"
        style={{ position: "fixed", left: rowMenu.x, top: rowMenu.y }}
        onClick={(e) => e.stopPropagation()}
      >
        {canEditNote ? (
          <button
            type="button"
            className="library-view__menu-item"
            role="menuitem"
            onClick={() => {
              closeRowMenu();
              openNoteEditor("edit", liveRow.relativePath);
            }}
          >
            <span className="library-view__menu-icon" aria-hidden>
              <LibraryIconEdit />
            </span>
            {t("notes.editNote")}
          </button>
        ) : null}
        {canReveal ? (
          <button
            type="button"
            className="library-view__menu-item"
            role="menuitem"
            disabled={fileActionBusy === `reveal:${rowKey}`}
            onClick={() => {
              closeRowMenu();
              void runLibraryFileAction(liveRow, "reveal");
            }}
          >
            <span className="library-view__menu-icon" aria-hidden>
              <LibraryIconFolder />
            </span>
            {revealLabel}
          </button>
        ) : null}
        {vaultItem && ipfsExportActionsEnabled ? (
          <>
            {vaultItem.publishedExternal ? (
              <button
                type="button"
                className="library-view__menu-item"
                role="menuitem"
                onClick={() => {
                  void navigator.clipboard.writeText(vaultItem.publishedExternal!.cid);
                  setIpfsOk(t("library.cidCopied"));
                  setIpfsErr(null);
                  closeRowMenu();
                }}
              >
                <span className="library-view__menu-icon" aria-hidden>
                  <LibraryIconCopy />
                </span>
                {t("library.copyCid")}
              </button>
            ) : null}
            <button
              type="button"
              className="library-view__menu-item"
              role="menuitem"
              disabled={ipfsBusyId === vaultItem.documentId}
              onClick={() => {
                void (async () => {
                  setIpfsErr(null);
                  setIpfsOk(null);
                  setIpfsBusyId(vaultItem.documentId);
                  closeRowMenu();
                  try {
                    await nodeService.exportLibraryItemToIpfs(vaultItem.documentId);
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
              <span className="library-view__menu-icon" aria-hidden>
                <LibraryIconExport />
              </span>
              {ipfsBusyId === vaultItem.documentId
                ? t("library.exporting")
                : vaultItem.publishedExternal
                  ? t("library.reExport")
                  : t("library.export")}
            </button>
            {ipfsPinningEnabled && vaultItem.publishedExternal ? (
              <button
                type="button"
                className="library-view__menu-item"
                role="menuitem"
                disabled={ipfsPinBusyId === vaultItem.documentId}
                onClick={() => {
                  void (async () => {
                    setIpfsErr(null);
                    setIpfsOk(null);
                    setIpfsPinBusyId(vaultItem.documentId);
                    closeRowMenu();
                    try {
                      const result = await nodeService.pinLibraryItemExternal(
                        vaultItem.documentId,
                      );
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
                <span className="library-view__menu-icon" aria-hidden>
                  <LibraryIconPin />
                </span>
                {ipfsPinBusyId === vaultItem.documentId
                  ? t("library.pinning")
                  : t("library.pin")}
              </button>
            ) : null}
            {ipfsGatewayVerifyEnabled && vaultItem.publishedExternal ? (
              <button
                type="button"
                className="library-view__menu-item"
                role="menuitem"
                disabled={ipfsVerifyBusyId === vaultItem.documentId}
                onClick={() => {
                  void (async () => {
                    setIpfsErr(null);
                    setIpfsOk(null);
                    setIpfsVerifyBusyId(vaultItem.documentId);
                    closeRowMenu();
                    try {
                      const result = await nodeService.verifyLibraryItemIpfsGateway({
                        documentId: vaultItem.documentId,
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
                <span className="library-view__menu-icon" aria-hidden>
                  <LibraryIconVerify />
                </span>
                {ipfsVerifyBusyId === vaultItem.documentId
                  ? t("library.verifying")
                  : t("library.verifyGateway")}
              </button>
            ) : null}
          </>
        ) : null}
      </div>,
      document.body,
    );
  };
  return (
    <div className="library-view">
      {renderOverflowMenu()}
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
        <button
          type="button"
          className="secondary"
          onClick={() => openNoteEditor("create")}
        >
          {t("notes.newNote")}
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
          {visibleCount === 0 ? t("library.empty") : t("library.emptyFilter")}
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
                <tr key={localFileRowKey(row)}>
                  <td className="library-view-title">{row.title}</td>
                  <td className="library-view-path" title={row.relativePath}>
                    {row.relativePath}
                  </td>
                  <td>{formatBytes(row.byteLength)}</td>
                  <td>{formatDate(row.updatedAt)}</td>
                  <td>{renderRowActions(row)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="library-view-cards" aria-label={t("library.filesAria")}>
            {items.map((row) => (
              <li key={localFileRowKey(row)} className="library-view-card">
                <div className="library-view-card-head">
                  <strong className="library-view-title">{row.title}</strong>
                  <span className="library-view-card-meta">{formatBytes(row.byteLength)}</span>
                </div>
                <div className="library-view-path" title={row.relativePath}>
                  {row.relativePath}
                </div>
                <div className="library-view-card-meta">{formatDate(row.updatedAt)}</div>
                {renderRowActions(row)}
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
      {noteEditor && (
        <NoteEditorView
          mode={noteEditor.mode}
          relativePath={noteEditor.relativePath}
          onSaved={(_path) => {
            setNoteEditor(null);
            void load();
          }}
          onClose={() => setNoteEditor(null)}
        />
      )}
    </div>
  );
}

function LibraryIconMore() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="5" cy="12" r="1.75" fill="currentColor" />
      <circle cx="12" cy="12" r="1.75" fill="currentColor" />
      <circle cx="19" cy="12" r="1.75" fill="currentColor" />
    </svg>
  );
}

function LibraryIconOpen() {
  // Standard "file" / open-document glyph (Lucide File).
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M14 2v6h6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LibraryIconEdit() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LibraryIconFolder() {
  // Folder-open — common “reveal in Finder/Explorer” glyph.
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 20a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h4l2 2h4a2 2 0 0 1 2 2v1"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3 14h14l3 6H6z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LibraryIconCopy() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="2" />
      <path
        d="M5 15V5a2 2 0 0 1 2-2h10"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function LibraryIconExport() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 16V4M7 9l5-5 5 5M5 20h14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LibraryIconPin() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 17v5M9 3l.7 4.2L6 10.5 8 14h8l2-3.5-3.7-3.3L15 3H9z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LibraryIconVerify() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M20 6L9 17l-5-5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LibraryIconShare() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="18" cy="5" r="3" stroke="currentColor" strokeWidth="2" />
      <circle cx="6" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
      <circle cx="18" cy="19" r="3" stroke="currentColor" strokeWidth="2" />
      <path
        d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
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
