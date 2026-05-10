import { useState } from "react";
import { useNodeState } from "../../context/NodeStateContext.js";
import { useNodeService } from "../../hooks/useNodeService.js";
import type { BondRecord, HelloProfile } from "@envoymesh/api";

function contactLabel(contact: Partial<BondRecord> & { peerOwnerId: string }): string {
  const d = contact.displayName?.trim();
  if (d) return d;
  if (contact.libp2pPeerId?.trim()) return contact.libp2pPeerId.trim();
  return contact.peerOwnerId;
}

export function ContactsView() {
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
    <div className="contacts-view">
      <div className="contacts-header">
        <h2>Your Contacts</h2>
        <div className="around-me-toggle">
          <button
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
                  <button className="say-hello-btn" onClick={() => handleSayHello(peer.nodeId)}>
                    Say Hello
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {bonds.length === 0 && !showAroundMe ? (
        <p className="empty">No contacts yet. Use Search to find people, or check Around Me for discovered peers.</p>
      ) : (
        <ul className="contact-cards">
          {bonds.map((contact) => (
            <li key={contact.peerOwnerId} className="contact-card">
              <span className="avatar large">{contactLabel(contact).charAt(0) || "?"}</span>
              <div className="contact-info">
                <strong>{contactLabel(contact)}</strong>
                <span className="bond-level">{contact.level}</span>
              </div>
              <button
                className="remove-contact"
                onClick={() => handleRevokeBond(contact.peerOwnerId)}
                title="Remove contact"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
