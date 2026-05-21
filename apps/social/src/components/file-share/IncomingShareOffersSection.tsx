import { useState } from "react";
import type { ShareOffer } from "@envoymesh/api";
import { useShareOffers } from "../../hooks/useNodeService.js";
import { useToast } from "../../hooks/useToast.js";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export interface IncomingShareOffersSectionProps {
  /** When nested under Inbox, omit outer section title */
  embedded?: boolean;
}

export function IncomingShareOffersSection({ embedded = false }: IncomingShareOffersSectionProps) {
  const { offers, accept, decline } = useShareOffers();
  const { showToast } = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [savePaths, setSavePaths] = useState<Record<string, string>>({});

  if (offers.length === 0) return null;

  const defaultSavePath = (o: ShareOffer) =>
    savePaths[o.shareId] ??
    o.senderVaultRelativePath?.replace(/^[\\/]+/, "") ??
    o.filename.replace(/^[\\/]+/, "");

  return (
    <>
      {!embedded && (
        <h3 className="inbox-section-title">Incoming file shares ({offers.length})</h3>
      )}
      {embedded && (
        <h3 className="inbox-section-title">File shares ({offers.length})</h3>
      )}
      <ul className="inbox-list">
        {offers.map((o) => (
          <li key={o.shareId} className="inbox-item">
            <div className="inbox-sender">
              <span className="avatar large">F</span>
              <div className="inbox-sender-info">
                <strong>{o.senderDisplayName}</strong>
                <span className="owner-id">{o.filename}</span>
              </div>
            </div>
            <p className="inbox-message">
              {formatBytes(o.sizeBytes)} · {o.sensitivity}
              {o.mimeType ? ` · ${o.mimeType}` : ""}
            </p>
            <label className="library-share-label" htmlFor={`share-save-${o.shareId}`}>
              Save as (vault path, optional)
            </label>
            <input
              id={`share-save-${o.shareId}`}
              type="text"
              className="library-view-search"
              placeholder={o.senderVaultRelativePath ?? o.filename}
              value={defaultSavePath(o)}
              onChange={(e) =>
                setSavePaths((prev) => ({ ...prev, [o.shareId]: e.target.value }))
              }
            />
            <div className="inbox-actions">
              <button
                type="button"
                className="accept"
                disabled={busyId === o.shareId}
                onClick={() => {
                  void (async () => {
                    setBusyId(o.shareId);
                    try {
                      const path = defaultSavePath(o).trim();
                      await accept(o.shareId, path);
                      showToast(`Accepted ${o.filename} — transfer in progress`, "info");
                    } catch (err) {
                      console.error(err);
                      showToast(
                        err instanceof Error ? err.message : "Accept failed",
                        "error",
                      );
                    } finally {
                      setBusyId(null);
                    }
                  })();
                }}
              >
                {busyId === o.shareId ? "Accepting…" : "Accept"}
              </button>
              <button
                type="button"
                className="decline"
                disabled={busyId === o.shareId}
                onClick={() => {
                  void (async () => {
                    setBusyId(o.shareId);
                    try {
                      await decline(o.shareId);
                    } catch (err) {
                      console.error(err);
                    } finally {
                      setBusyId(null);
                    }
                  })();
                }}
              >
                Decline
              </button>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
