import { useState, useEffect } from "react";
import { useNodeState } from "../../context/NodeStateContext.js";
import { useNodeService } from "../../hooks/useNodeService.js";
import type { BondRecord, HelloProfile, PeerReputationSummary } from "@envoymesh/api";
import type { ContactsPanelMode } from "../../App.js";
import { SearchView } from "./SearchView.js";

function contactLabel(contact: Partial<BondRecord> & { peerOwnerId: string }): string {
  const d = contact.displayName?.trim();
  if (d) return d;
  if (contact.libp2pPeerId?.trim()) return contact.libp2pPeerId.trim();
  return contact.peerOwnerId;
}

function ContactReputationMeta({ peerOwnerId }: { peerOwnerId: string }) {
  const nodeService = useNodeService();
  const [summary, setSummary] = useState<PeerReputationSummary | null>(null);

  useEffect(() => {
    void nodeService.getPeerReputationSummary(peerOwnerId).then(setSummary).catch(() => {});
  }, [nodeService, peerOwnerId]);

  if (!summary) return null;
  const parts: string[] = [];
  if (summary.local) {
    parts.push(`${summary.local.successfulTasks} ok · ${summary.local.failedTasks} fail`);
  }
  if (summary.attestations.length > 0) {
    parts.push(`${summary.attestations.length} attestation${summary.attestations.length === 1 ? "" : "s"}`);
  }
  if (parts.length === 0) return null;
  return <span className="contact-reputation">{parts.join(" · ")}</span>;
}

export interface ContactsViewProps {
  panelMode: ContactsPanelMode;
  onPanelModeChange: (mode: ContactsPanelMode) => void;
  onOpenChat?: (peerOwnerId: string) => void;
}

export function ContactsView({ panelMode, onPanelModeChange, onOpenChat }: ContactsViewProps) {
  const nodeService = useNodeService();
  const { bonds, discoveredPeers, humanProfile, sendHello } = useNodeState();
  const [showAroundMe, setShowAroundMe] = useState(false);

  const handleRevokeBond = async (peerOwnerId: string) => {
    if (!confirm("Are you sure you want to remove this contact?")) return;
    try {
      await nodeService.revokeBond(peerOwnerId);
    } catch (error) {
      console.error("Failed to revoke bond:", error);
    }
  };

  const handleSayHello = async (targetOwnerId: string) => {
    try {
      const profile: HelloProfile = {
        displayName: humanProfile?.displayName ?? "Envoy User",
        bio: humanProfile?.bio ?? "",
        interests: [...(humanProfile?.hobbies ?? []), ...(humanProfile?.knowledge ?? [])],
        whatShares: [],
      };
      await sendHello(targetOwnerId, profile, "Hello!");
    } catch (error) {
      console.error("Failed to send hello:", error);
    }
  };

  return (
    <div className={`contacts-view${panelMode === "discover" ? " contacts-view-discover" : ""}`}>
      <div className="contacts-panel-tabs" aria-label="Contacts or discover">
        <button
          type="button"
          aria-pressed={panelMode === "list"}
          className={panelMode === "list" ? "active" : ""}
          onClick={() => onPanelModeChange("list")}
        >
          My contacts ({bonds.length})
        </button>
        <button
          type="button"
          aria-pressed={panelMode === "discover"}
          className={panelMode === "discover" ? "active" : ""}
          onClick={() => onPanelModeChange("discover")}
        >
          Discover
        </button>
      </div>

      {panelMode === "discover" ? (
        <SearchView embedded />
      ) : (
        <>
          <div className="contacts-toolbar">
            <span className="contacts-toolbar-label">Nearby</span>
            <div className="around-me-toggle">
              <button
                type="button"
                className={`around-me-btn ${showAroundMe ? "active" : ""}`}
                onClick={() => setShowAroundMe(!showAroundMe)}
              >
                Around Me {discoveredPeers.length > 0 && <span className="badge">{discoveredPeers.length}</span>}
              </button>
            </div>
          </div>

          {showAroundMe && (
            <div className="around-me-section">
              <h3>Discovered Peers</h3>
              {discoveredPeers.length === 0 ? (
                <p className="empty">No peers discovered yet. Keep your node running to discover nearby peers.</p>
              ) : (
                <ul className="around-me-list">
                  {discoveredPeers.map((peer) => (
                    <li key={peer.nodeId} className="around-me-item">
                      <span className="avatar">{peer.displayName?.[0] ?? "?"}</span>
                      <div className="peer-info">
                        <strong>{peer.displayName || "Unknown Peer"}</strong>
                        <span className="peer-id">{peer.nodeId.slice(0, 12)}...</span>
                      </div>
                      <button type="button" className="say-hello-btn" onClick={() => handleSayHello(peer.nodeId)}>
                        Say Hello
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {bonds.length === 0 && !showAroundMe ? (
            <p className="empty">
              No contacts yet. Open <strong>Discover</strong> to find people, or use Around Me for discovered peers.
            </p>
          ) : (
            <>
              {bonds.length > 0 && onOpenChat && (
                <p className="contacts-view-hint">Tap a contact to open Chat. Use × to remove a bond.</p>
              )}
              <ul className="contact-cards">
                {bonds.map((contact) => (
                  <li key={contact.peerOwnerId} className="contact-card">
                    <button
                      type="button"
                      className="contact-card-main"
                      onClick={() => onOpenChat?.(contact.peerOwnerId)}
                      disabled={!onOpenChat}
                      aria-label={`Open chat with ${contactLabel(contact)}`}
                    >
                      <span className="avatar large">{contactLabel(contact).charAt(0) || "?"}</span>
                      <div className="contact-info">
                        <strong>{contactLabel(contact)}</strong>
                        <span className="bond-level">{contact.level}</span>
                        <ContactReputationMeta peerOwnerId={contact.peerOwnerId} />
                      </div>
                    </button>
                    <button
                      type="button"
                      className="remove-contact"
                      onClick={() => handleRevokeBond(contact.peerOwnerId)}
                      title="Remove contact"
                      aria-label={`Remove ${contactLabel(contact)}`}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  );
}
