import { useEffect, useState } from "react";
import type { BondRecord, LibraryItem } from "@envoymesh/api";
import { useT } from "../../context/I18nContext.js";
import { useNodeService } from "../../hooks/useNodeService.js";
import { useToast } from "../../hooks/useToast.js";

export interface ShareFileDialogProps {
  /** Pre-selected bonded contact (e.g. from chat). */
  targetOwnerId?: string;
  /** Pre-selected library item (e.g. from Library). */
  libraryItem?: LibraryItem | null;
  onClose: () => void;
  onShared?: () => void;
}

export function ShareFileDialog({
  targetOwnerId: initialTarget,
  libraryItem,
  onClose,
  onShared,
}: ShareFileDialogProps) {
  const t = useT();
  const nodeService = useNodeService();
  const { showToast } = useToast();
  const [bonds, setBonds] = useState<BondRecord[]>([]);
  const [libraryItems, setLibraryItems] = useState<LibraryItem[]>([]);
  const [targetOwnerId, setTargetOwnerId] = useState(initialTarget ?? "");
  const [vaultPath, setVaultPath] = useState(libraryItem?.relativePath ?? "");
  const [sensitivity, setSensitivity] = useState<"public" | "friends" | "private">("friends");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void nodeService.getBonds().then(setBonds).catch(() => setBonds([]));
    if (!libraryItem) {
      void nodeService.listLibraryItems().then(setLibraryItems).catch(() => setLibraryItems([]));
    }
  }, [nodeService, libraryItem]);

  useEffect(() => {
    if (initialTarget) setTargetOwnerId(initialTarget);
  }, [initialTarget]);

  useEffect(() => {
    if (libraryItem) setVaultPath(libraryItem.relativePath);
  }, [libraryItem]);

  const directBonds = bonds.filter((b) => b.level !== "blocked");

  return (
    <div className="library-share-panel" role="dialog" aria-label={t("fileShare.dialogAria")}>
      <h3 className="library-share-title">
        {libraryItem
          ? t("fileShare.shareTitle", { title: libraryItem.title })
          : t("fileShare.shareFromLibrary")}
      </h3>
      <p className="library-view-hint">{t("fileShare.hint")}</p>
      {err && (
        <p className="library-view-error" role="alert">
          {err}
        </p>
      )}
      <label className="library-share-label" htmlFor="share-file-contact">
        {t("fileShare.bondedContact")}
      </label>
      <select
        id="share-file-contact"
        className="library-view-search"
        value={targetOwnerId}
        onChange={(e) => setTargetOwnerId(e.target.value)}
      >
        <option value="">{t("fileShare.selectContact")}</option>
        {directBonds.map((b) => (
          <option key={b.peerOwnerId} value={b.peerOwnerId}>
            {b.displayName?.trim() || b.peerOwnerId}
          </option>
        ))}
      </select>
      {!libraryItem && (
        <>
          <label className="library-share-label" htmlFor="share-file-path">
            {t("fileShare.vaultFile")}
          </label>
          <select
            id="share-file-path"
            className="library-view-search"
            value={vaultPath}
            onChange={(e) => setVaultPath(e.target.value)}
          >
            <option value="">{t("fileShare.selectFile")}</option>
            {libraryItems.map((item) => (
              <option key={item.documentId} value={item.relativePath}>
                {item.title} ({item.relativePath})
              </option>
            ))}
          </select>
        </>
      )}
      <label className="library-share-label" htmlFor="share-file-sens">
        {t("fileShare.sensitivity")}
      </label>
      <select
        id="share-file-sens"
        className="library-view-search"
        value={sensitivity}
        onChange={(e) => setSensitivity(e.target.value as "public" | "friends" | "private")}
      >
        <option value="public">{t("fileShare.sensitivityPublic")}</option>
        <option value="friends">{t("fileShare.sensitivityFriends")}</option>
        <option value="private">{t("fileShare.sensitivityPrivate")}</option>
      </select>
      <div className="library-share-actions">
        <button
          type="button"
          disabled={busy || !targetOwnerId || !vaultPath.trim()}
          onClick={() => {
            void (async () => {
              if (!targetOwnerId || !vaultPath.trim()) return;
              setBusy(true);
              setErr(null);
              try {
                await nodeService.shareFile(targetOwnerId, {
                  path: vaultPath.trim(),
                  sensitivity,
                });
                showToast(t("fileShare.requestSent"), "info");
                onShared?.();
                onClose();
              } catch (e) {
                setErr(e instanceof Error ? e.message : String(e));
              } finally {
                setBusy(false);
              }
            })();
          }}
        >
          {busy ? t("fileShare.sending") : t("fileShare.sendRequest")}
        </button>
        <button type="button" className="secondary" onClick={onClose} disabled={busy}>
          {t("common.cancel")}
        </button>
      </div>
    </div>
  );
}
