import { useState, useEffect } from "react";
import { useNodeState } from "../../context/NodeStateContext.js";
import { useNodeService } from "../../hooks/useNodeService.js";
import type {
  ContactAiPreferences,
  HelloProfile,
} from "@envoymesh/api";
import { contactLabel, peerDisplayLabel } from "../../lib/display.js";
import { ChatIcon, BridgeIcon } from "../../icons.js";

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
    pendingMessages,
    humanProfile,
    nodeConfig,
    sendHello,
    acceptHello,
    declineHello,
    clearPendingMessages,
  } = useNodeState();

  const [contextMenu, setContextMenu] = useState<{ ownerId: string; x: number; y: number } | null>(null);

  // Close context menu when clicking outside
  useEffect(() => {
    if (!contextMenu) return;
    const handleClick = () => setContextMenu(null);
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [contextMenu]);

  const getContactAiAccessLevel = (ownerId: string): "none" | "assistant_only" | "full" => {
    return nodeConfig?.contactAiPreferences?.find(p => p.peerOwnerId === ownerId)?.aiAccessLevel ?? "none";
  };

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
    await nodeService.getNodeConfig().catch(() => {});
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

  const totalPending = pendingHellOs.length + pendingMessages.length;

  return (
    <aside className="contact-list">
      <div className="contact-list-header">
        <h3>Chats</h3>
        {totalPending > 0 && (
          <span className="inbox-count">{totalPending} new</span>
        )}
      </div>

      {/* Envoy AI contact */}
      <button
        className={`${selectedContact === "__envoy_ai__" ? "active" : ""}`}
        onClick={() => onSelectContact("__envoy_ai__")}
      >
        <span className="avatar ai-avatar">AI</span>
        <span className="name">Envoy AI</span>
      </button>

      {/* Bridge agent contact — appears when external agent bridge is enabled */}
      {bridgeStatus?.enabled && (
        <button
          className={selectedContact === bridgeStatus.agentPeerId ? "active" : ""}
          onClick={() => onSelectContact(bridgeStatus.agentPeerId)}
        >
          <span className="avatar">AG</span>
          <span className="name">{bridgeStatus.agentName ?? "My Agent"}</span>
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
              className="pending-contact"
              onClick={() => handleAcceptHello(request.messageId)}
            >
              <span className="avatar">{request.profile.displayName[0]}</span>
              <div className="name-group">
                <span className="name">{request.profile.displayName}</span>
                <span className="preview">Tap to accept</span>
              </div>
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
              className="pending-contact"
              onClick={() => handleSayHello(msg.sender.ownerId ?? msg.sender.nodeId)}
            >
              <span className="avatar">{peerDisplayLabel(msg.sender).charAt(0) || "?"}</span>
              <div className="name-group">
                <span className="name">{peerDisplayLabel(msg.sender)}</span>
                <span className="preview">{msg.content?.text?.slice(0, 40) ?? ""}</span>
              </div>
            </button>
          ))}
          <button className="clear-pending-btn" onClick={clearPendingMessages}>
            Clear all
          </button>
        </>
      )}

      {/* Bonded contacts */}
      {bonds.length === 0 && pendingHellOs.length === 0 && pendingMessages.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <ChatIcon size={32} />
          </div>
          <div className="empty-state-title">No contacts yet</div>
          <div className="empty-state-desc">Search to find people and start connecting</div>
        </div>
      ) : (
        <>
          <div className="contact-list-section-label">Contacts</div>
          {bonds.map((contact) => (
            <button
              key={contact.peerOwnerId}
              className={selectedContact === contact.peerOwnerId ? "active" : ""}
              onClick={() => onSelectContact(contact.peerOwnerId)}
              onContextMenu={(e) => {
                e.preventDefault();
                setContextMenu({ ownerId: contact.peerOwnerId, x: e.clientX, y: e.clientY });
              }}
            >
              <span className="avatar">{contact.displayName?.[0] ?? "?"}</span>
              <span className="name">{contactLabel(contact)}</span>
            </button>
          ))}
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
