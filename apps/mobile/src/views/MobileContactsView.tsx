/**
 * MobileContactsView — Mobile-native contacts list.
 *
 * Flat row layout with avatar, name, bond level, and "Around Me" discovery.
 * Reuses useNodeState() / useNodeService() hooks — zero props.
 */
import { useState, useCallback } from "react";
import { useNodeState } from "@envoymesh/social/context/NodeStateContext.js";
import { useNodeService } from "@envoymesh/social/hooks/useNodeService.js";
import type { HelloProfile } from "@envoymesh/api";
import { ChatIcon, SearchIcon } from "@envoymesh/social/icons.js";

export interface MobileContactsViewProps {
  onOpenChat?: (peerOwnerId: string) => void;
  onGoDiscover?: () => void;
}

export function MobileContactsView({ onOpenChat, onGoDiscover }: MobileContactsViewProps) {
  const nodeService = useNodeService();
  const { bonds, humanProfile, discoveredPeers, sendHello } = useNodeState();

  const [showAroundMe, setShowAroundMe] = useState(false);
  const [helloing, setHelloing] = useState<Record<string, boolean>>({});

  const handleSayHello = useCallback(async (targetNodeId: string) => {
    setHelloing((prev) => ({ ...prev, [targetNodeId]: true }));
    try {
      const profile: HelloProfile = {
        displayName: humanProfile?.displayName ?? "Envoy User",
        bio: humanProfile?.bio ?? "",
        interests: [...(humanProfile?.hobbies ?? []), ...(humanProfile?.knowledge ?? [])],
        whatShares: [],
      };
      await sendHello(targetNodeId, profile, "Hello!");
    } catch (e) {
      console.error(e);
    } finally {
      setHelloing((prev) => ({ ...prev, [targetNodeId]: false }));
    }
  }, [humanProfile, sendHello]);

  const handleRevokeBond = useCallback(async (ownerId: string) => {
    try { await nodeService.revokeBond(ownerId); } catch (e) { console.error(e); }
  }, [nodeService]);

  if (bonds.length === 0 && discoveredPeers.length === 0) {
    return (
      <div className="mv-contacts">
        <div className="mv-empty-state">
          <div className="mv-empty-state-icon"><ChatIcon size={48} /></div>
          <div className="mv-empty-state-title">No contacts yet</div>
          <div className="mv-empty-state-desc">Use Discover to find people and start connecting</div>
          <button type="button" className="mv-empty-state-cta" onClick={() => onGoDiscover?.()}>
            <SearchIcon size={16} />
            Discover people
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mv-contacts">
      <p className="mv-tab-hint">
        Bonded contacts and nearby peers. Tap to chat — swipe left on a row to remove a bond.
      </p>
      {/* Around Me section */}
      {discoveredPeers.length > 0 && (
        <>
          <button
            className="mv-around-me-toggle"
            onClick={() => setShowAroundMe(!showAroundMe)}
          >
            <span>Around Me ({discoveredPeers.length})</span>
            <span className={`mv-around-me-chevron${showAroundMe ? " open" : ""}`}>
              &#9662;
            </span>
          </button>
          {showAroundMe && discoveredPeers.map((peer) => (
            <div key={peer.nodeId} className="mv-around-me-peer">
              <div className="mv-contact-avatar">{peer.displayName?.[0] || "?"}</div>
              <div>
                <div className="mv-around-me-name">{peer.displayName}</div>
                <div className="mv-around-me-id">{peer.nodeId.slice(0, 12)}...</div>
              </div>
              <button
                className="mv-say-hello-btn"
                onClick={() => handleSayHello(peer.nodeId)}
                disabled={helloing[peer.nodeId]}
              >
                {helloing[peer.nodeId] ? "..." : "Say Hello"}
              </button>
            </div>
          ))}
        </>
      )}

      {/* Bonded contacts */}
      <div className="mv-contacts-list">
        {bonds.map((contact) => (
          <div key={contact.peerOwnerId} className="mv-swipe-row">
            <div
              className="mv-contacts-row mv-swipe-content"
              role="button"
              tabIndex={0}
              onClick={() => onOpenChat?.(contact.peerOwnerId)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onOpenChat?.(contact.peerOwnerId);
                }
              }}
            >
              <div className="mv-contacts-avatar">
                {contact.displayName?.[0] ?? "?"}
              </div>
              <div className="mv-contacts-detail">
                <div className="mv-contacts-name">
                  {contact.displayName || contact.libp2pPeerId || contact.peerOwnerId}
                </div>
                <div className="mv-contacts-bond">
                  {contact.level ?? "direct"} bond
                </div>
              </div>
              <span className="mv-contacts-chevron">&#8250;</span>
            </div>
            <div className="mv-swipe-actions">
              <button
                className="mv-swipe-action remove"
                onClick={() => handleRevokeBond(contact.peerOwnerId)}
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export { MobileContactsView as default };
