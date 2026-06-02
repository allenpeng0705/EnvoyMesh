/**
 * MobileContactsView — Mobile-native contacts list.
 *
 * Flat row layout with avatar, name, bond level, and "Around Me" discovery.
 * Reuses useNodeState() / useNodeService() hooks — zero props.
 */
import { useState, useCallback } from "react";
import { useNodeState } from "@envoymesh/social/context/NodeStateContext.js";
import { useT } from "@envoymesh/social/context/I18nContext.js";
import { RemoveContactConfirmModal } from "@envoymesh/social/components/RemoveContactConfirmModal.js";
import type { HelloProfile } from "@envoymesh/api";
import { ChatIcon, SearchIcon } from "@envoymesh/social/icons.js";

export interface MobileContactsViewProps {
  onOpenChat?: (peerOwnerId: string) => void;
  onGoDiscover?: () => void;
}

export function MobileContactsView({ onOpenChat, onGoDiscover }: MobileContactsViewProps) {
  const t = useT();
  const { bonds, humanProfile, discoveredPeers, sendHello } = useNodeState();

  const [showAroundMe, setShowAroundMe] = useState(false);
  const [helloing, setHelloing] = useState<Record<string, boolean>>({});
  const [removeTarget, setRemoveTarget] = useState<{ ownerId: string; name: string } | null>(null);

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

  const handleRevokeBond = useCallback((ownerId: string, name: string) => {
    setRemoveTarget({ ownerId, name });
  }, []);

  if (bonds.length === 0 && discoveredPeers.length === 0) {
    return (
      <div className="mv-contacts">
        <div className="mv-empty-state">
          <div className="mv-empty-state-icon"><ChatIcon size={48} /></div>
          <div className="mv-empty-state-title">{t("mobile.contacts.emptyTitle")}</div>
          <div className="mv-empty-state-desc">{t("mobile.contacts.emptyDesc")}</div>
          <button type="button" className="mv-empty-state-cta" onClick={() => onGoDiscover?.()}>
            <SearchIcon size={16} />
            {t("mobile.contacts.emptyCta")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mv-contacts">
      <p className="mv-tab-hint">
        {t("contacts.tapHint")}
      </p>
      {/* Around Me section */}
      {discoveredPeers.length > 0 && (
        <>
          <button
            className="mv-around-me-toggle"
            onClick={() => setShowAroundMe(!showAroundMe)}
          >
            <span>{t("mobile.contacts.aroundMe")} ({discoveredPeers.length})</span>
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
                {helloing[peer.nodeId] ? "..." : t("common.sayHello")}
              </button>
            </div>
          ))}
        </>
      )}

      {/* Bonded contacts */}
      <div className="mv-contacts-list">
        {bonds.map((contact) => {
          const label =
            contact.displayName || contact.libp2pPeerId || contact.peerOwnerId;
          return (
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
                  {label}
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
                onClick={() => handleRevokeBond(contact.peerOwnerId, label)}
              >
                {t("contacts.remove")}
              </button>
            </div>
          </div>
          );
        })}
      </div>

      {removeTarget ? (
        <RemoveContactConfirmModal
          peerOwnerId={removeTarget.ownerId}
          displayName={removeTarget.name}
          onClose={() => setRemoveTarget(null)}
        />
      ) : null}
    </div>
  );
}

export { MobileContactsView as default };
