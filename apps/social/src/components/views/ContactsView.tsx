import { useState } from "react";
import { useNodeState } from "../../context/NodeStateContext.js";
import { useNodeService } from "../../hooks/useNodeService.js";
import { RemoveIcon, AddIcon } from "../../icons.js";
import type { BondRecord, HelloProfile } from "@envoymesh/api";

function contactLabel(contact: Partial<BondRecord> & { peerOwnerId: string }): string {
  const d = contact.displayName?.trim();
  if (d) return d;
  if (contact.libp2pPeerId?.trim()) return contact.libp2pPeerId.trim();
  return contact.peerOwnerId;
}

function shortId(id: string): string {
  if (!id) return "";
  return id.length > 12 ? id.slice(0, 6) + "..." + id.slice(-4) : id;
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
        <button
          className={`around-me-toggle${showAroundMe ? " active" : ""}`}
          onClick={() => setShowAroundMe(!showAroundMe)}
        >
          <AddIcon size={14} />
          Around Me
          {discoveredPeers.length > 0 && (
            <span className="around-me-badge">{discoveredPeers.length}</span>
          )}
        </button>
      </div>

      {/* Discovered peers section */}
      {showAroundMe && (
        <div className="profile-section" style={{ marginBottom: "var(--space-4)" }}>
          <h3>Discovered Peers</h3>
          {discoveredPeers.length === 0 ? (
            <div className="empty-contacts">
              <p>No peers discovered yet. Keep your node running to discover nearby peers.</p>
            </div>
          ) : (
            <div className="contact-card-list">
              {discoveredPeers.map((peer) => (
                <div key={peer.nodeId} className="contact-card">
                  <span className="contact-avatar">{peer.displayName?.[0] ?? "?"}</span>
                  <div className="contact-card-info">
                    <div className="contact-card-name">{peer.displayName || "Unknown Peer"}</div>
                    <div className="contact-card-id">{shortId(peer.nodeId)}</div>
                  </div>
                  <button className="say-hello-btn" onClick={() => handleSayHello(peer.nodeId)}>
                    Say Hello
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Bonded contacts */}
      {bonds.length === 0 && !showAroundMe ? (
        <div className="empty-contacts">
          <h3>No contacts yet</h3>
          <p>Use Search to find people, or check Around Me for discovered peers.</p>
        </div>
      ) : (
        <div className="contact-card-list">
          {bonds.map((contact) => (
            <div key={contact.peerOwnerId} className="contact-card">
              <span className="contact-avatar">{contactLabel(contact).charAt(0) || "?"}</span>
              <div className="contact-card-info">
                <div className="contact-card-name">{contactLabel(contact)}</div>
                <div className="contact-card-id">{shortId(contact.peerOwnerId)}</div>
                {contact.level && (
                  <span className={`contact-card-badge ${contact.level}`}>{contact.level}</span>
                )}
              </div>
              <button
                className="contact-card-remove"
                onClick={() => handleRevokeBond(contact.peerOwnerId)}
                title="Remove contact"
                aria-label={`Remove ${contactLabel(contact)}`}
              >
                <RemoveIcon size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
