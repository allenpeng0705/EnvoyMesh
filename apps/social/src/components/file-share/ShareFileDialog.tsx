import { useEffect, useState } from "react";
import type { BondRecord, LibraryItem } from "@envoymesh/api";
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
    <div className="library-share-panel" role="dialog" aria-label="Share file">
      <h3 className="library-share-title">
        {libraryItem ? `Share “${libraryItem.title}”` : "Share from library"}
      </h3>
      <p className="library-view-hint">
        Sends a verified P2P file offer; the recipient accepts from Chat → Inbox.
      </p>
      {err && (
        <p className="library-view-error" role="alert">
          {err}
        </p>
      )}
      <label className="library-share-label" htmlFor="share-file-contact">
        Bonded contact
      </label>
      <select
        id="share-file-contact"
        className="library-view-search"
        value={targetOwnerId}
        onChange={(e) => setTargetOwnerId(e.target.value)}
      >
        <option value="">Select a contact…</option>
        {directBonds.map((b) => (
          <option key={b.peerOwnerId} value={b.peerOwnerId}>
            {b.displayName?.trim() || b.peerOwnerId}
          </option>
        ))}
      </select>
      {!libraryItem && (
        <>
          <label className="library-share-label" htmlFor="share-file-path">
            Vault file
          </label>
          <select
            id="share-file-path"
            className="library-view-search"
            value={vaultPath}
            onChange={(e) => setVaultPath(e.target.value)}
          >
            <option value="">Select a file…</option>
            {libraryItems.map((item) => (
              <option key={item.documentId} value={item.relativePath}>
                {item.title} ({item.relativePath})
              </option>
            ))}
          </select>
        </>
      )}
      <label className="library-share-label" htmlFor="share-file-sens">
        Sensitivity
      </label>
      <select
        id="share-file-sens"
        className="library-view-search"
        value={sensitivity}
        onChange={(e) => setSensitivity(e.target.value as "public" | "friends" | "private")}
      >
        <option value="public">public</option>
        <option value="friends">friends</option>
        <option value="private">private</option>
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
                showToast("Share request sent — waiting for peer to accept", "info");
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
          {busy ? "Sending…" : "Send share request"}
        </button>
        <button type="button" className="secondary" onClick={onClose} disabled={busy}>
          Cancel
        </button>
      </div>
    </div>
  );
}
