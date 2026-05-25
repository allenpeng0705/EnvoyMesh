import { useState, useEffect, useMemo } from "react";
import { useNodeState } from "../../context/NodeStateContext.js";
import { useNodeService } from "../../hooks/useNodeService.js";
import type {
  ContactAiPreferences,
  HelloProfile,
} from "@envoymesh/api";
import { resolveContactAiAccessLevel } from "@envoymesh/api";
import { contactLabel, peerDisplayLabel } from "../../lib/display.js";
import { ChatIcon, BridgeIcon } from "../../icons.js";
import { useChatThreadPreviews } from "../../hooks/useChatThreadPreviews.js";

interface ChatSidebarProps {
  selectedContact: string | null;
  onSelectContact: (id: string | null) => void;
}

export function ChatSidebar({ selectedContact, onSelectContact }: ChatSidebarProps) {
  const nodeService = useNodeService();
  const {
    bonds,
    bridgeStatus,
    pendingHellOs,
    pendingIntroProposals,
    pendingMessages,
    humanProfile,
    nodeConfig,
    sendHello,
    acceptHello,
    declineHello,
    clearPendingMessages,
    refreshNodeConfig,
  } = useNodeState();

  const [contextMenu, setContextMenu] = useState<{ ownerId: string; x: number; y: number } | null>(null);

  // Close context menu when clicking outside
  useEffect(() => {
    if (!contextMenu) return;
    const handleClick = () => setContextMenu(null);
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [contextMenu]);

  const getContactAiAccessLevel = (ownerId: string) =>
    resolveContactAiAccessLevel(
      ownerId,
      nodeConfig?.contactAiPreferences,
      nodeConfig?.aiSettings?.defaultModeForNewContacts,
    );

  const updateContactAiAccessLevel = async (ownerId: string, level: "none" | "assistant_only" | "full") => {
    const currentPrefs = nodeConfig?.contactAiPreferences ?? [];
    const existingPref = currentPrefs.find(p => p.peerOwnerId === ownerId);
    const otherPrefs = currentPrefs.filter(p => p.peerOwnerId !== ownerId);
    const newPrefs: ContactAiPreferences[] = [...otherPrefs, {
      peerOwnerId: ownerId,
      aiAccessLevel: level,
      knowledgeAccess: existingPref?.knowledgeAccess ?? "public",
      priority: existingPref?.priority ?? "high",
    }];
    await nodeService.updateNodeConfig({ contactAiPreferences: newPrefs });
    await refreshNodeConfig();
  };

  const handleAcceptHello = async (messageId: string) => {
    try { await acceptHello(messageId); } catch (e) { console.error(e); }
  };

  const handleDeclineHello = async (messageId: string) => {
    try { await declineHello(messageId); } catch (e) { console.error(e); }
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
    } catch (e) { console.error(e); }
  };

  const bondPeerIds = useMemo(() => bonds.map((b) => b.peerOwnerId), [bonds]);
  const threadPreviews = useChatThreadPreviews(bondPeerIds);

  return (
    <aside className="contact-list">
      <div className="contact-list-header">
        <h3>Chats</h3>
      </div>

      {/* Envoy AI contact */}
      <button
        type="button"
        className={`thread-row thread-row--ai ${selectedContact === "__envoy_ai__" ? "active" : ""}`}
        onClick={() => onSelectContact("__envoy_ai__")}
      >
        <span className="thread-avatar" aria-hidden>AI</span>
        <span className="thread-meta">
          <span className="thread-title-row">
            <span className="thread-title">Envoy AI</span>
          </span>
          <span className="thread-subtitle">Knowledge assistant</span>
        </span>
      </button>

      {/* Bridge agent contact — appears when external agent bridge is enabled */}
      {bridgeStatus?.enabled && (
        <button
          type="button"
          className={`thread-row thread-row--agent ${selectedContact === bridgeStatus.agentPeerId ? "active" : ""}`}
          onClick={() => onSelectContact(bridgeStatus.agentPeerId)}
        >
          <span className="thread-avatar" aria-hidden>AG</span>
          <span className="thread-meta">
            <span className="thread-title-row">
              <span className="thread-title">{bridgeStatus.agentName ?? "My Agent"}</span>
            </span>
            <span className="thread-subtitle">HomeClaw bridge</span>
          </span>
        </button>
      )}

      {/* Pending Hello requests — shown inline as contact list items */}
      {pendingHellOs.length > 0 && (
        <>
          <div className="contact-list-section-label">
            Requests ({pendingHellOs.length})
          </div>
          {pendingHellOs.map((request) => (
            <button
              key={request.messageId}
              type="button"
              className="thread-row thread-row--pending"
              onClick={() => handleAcceptHello(request.messageId)}
            >
              <span className="thread-avatar" aria-hidden>
                {request.profile.displayName[0]?.toUpperCase() ?? "?"}
              </span>
              <span className="thread-meta">
                <span className="thread-title-row">
                  <span className="thread-title">{request.profile.displayName}</span>
                </span>
                <span className="thread-subtitle">Tap to accept hello</span>
              </span>
            </button>
          ))}
        </>
      )}

      {/* Pending messages from unbonded peers — shown inline in contact list */}
      {pendingMessages.length > 0 && (
        <>
          <div className="contact-list-section-label">Pending</div>
          {pendingMessages.map((msg) => (
            <button
              key={msg.messageId}
              type="button"
              className="thread-row thread-row--pending"
              onClick={() => handleSayHello(msg.sender.ownerId ?? msg.sender.nodeId)}
            >
              <span className="thread-avatar" aria-hidden>
                {peerDisplayLabel(msg.sender).charAt(0).toUpperCase() || "?"}
              </span>
              <span className="thread-meta">
                <span className="thread-title-row">
                  <span className="thread-title">{peerDisplayLabel(msg.sender)}</span>
                </span>
                <span className="thread-subtitle">{msg.content?.text?.slice(0, 48) ?? "New message"}</span>
              </span>
            </button>
          ))}
          <button className="clear-pending-btn" onClick={clearPendingMessages}>
            Clear all
          </button>
        </>
      )}

      {/* Bonded contacts */}
      {bonds.length === 0 && pendingHellOs.length === 0 && pendingIntroProposals.length === 0 && pendingMessages.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <ChatIcon size={32} />
          </div>
          <div className="empty-state-title">No contacts yet</div>
          <div className="empty-state-desc">Discover people in Contacts and start connecting</div>
        </div>
      ) : (
        <>
          <div className="contact-list-section-label">Contacts</div>
          {bonds.map((contact) => {
            const pv = threadPreviews[contact.peerOwnerId];
            return (
              <button
                key={contact.peerOwnerId}
                type="button"
                className={`thread-row thread-row--contact ${selectedContact === contact.peerOwnerId ? "active" : ""}`}
                onClick={() => onSelectContact(contact.peerOwnerId)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextMenu({ ownerId: contact.peerOwnerId, x: e.clientX, y: e.clientY });
                }}
              >
                <span className="thread-avatar" aria-hidden>
                  {(contact.displayName?.[0] ?? "?").toUpperCase()}
                </span>
                <span className="thread-meta">
                  <span className="thread-title-row">
                    <span className="thread-title">{contactLabel(contact)}</span>
                    {pv ? <span className="thread-time">{pv.timeLabel}</span> : null}
                  </span>
                  <span className="thread-subtitle">{pv?.text ?? "No messages yet"}</span>
                </span>
              </button>
            );
          })}
        </>
      )}

      {/* Context menu for AI access level */}
      {contextMenu && (
        <div
          className="context-menu"
          style={{ position: "fixed", left: contextMenu.x, top: contextMenu.y, zIndex: 1000 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="context-menu-header">AI Access for Contact</div>
          {(["none", "assistant_only", "full"] as const).map((level) => {
            const currentLevel = getContactAiAccessLevel(contextMenu.ownerId);
            return (
              <div
                key={level}
                className={`context-menu-item ${currentLevel === level ? "active" : ""}`}
                onClick={() => {
                  void updateContactAiAccessLevel(contextMenu.ownerId, level);
                  setContextMenu(null);
                }}
              >
                {level === "none" && "○ None — AI never responds"}
                {level === "assistant_only" && <><ChatIcon size={14} /> Assistant Only — Draft suggestions only</>}
                {level === "full" && <><BridgeIcon size={14} /> Full Auto-Reply — AI can respond automatically</>}
              </div>
            );
          })}
        </div>
      )}
    </aside>
  );
}
