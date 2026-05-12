import { useState, useEffect } from "react";
import { useNodeState } from "../../context/NodeStateContext.js";
import { useNodeService } from "../../hooks/useNodeService.js";
import type {
  ContactAiPreferences,
  HelloProfile,
} from "@envoymesh/api";
import type { AssistantMode } from "../../lib/storage.js";
import { contactLabel, peerDisplayLabel } from "../../lib/display.js";

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
    contactAiModes,
    setContactAiModes,
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

  return (
    <aside className="contact-list">
      <div className="contact-list-header">
        <h3>Contacts</h3>
        <span className="inbox-count">{pendingHellOs.length} pending</span>
      </div>

      {/* Inbox section */}
      <div className="inbox-section">
        <h4>Inbox <button className="clear-btn small" onClick={() => {
          // Hello requests are managed by useHelloRequests; view-level clearing
        }}>Clear All</button></h4>
        {pendingHellOs.length === 0 ? (
          <p className="empty inbox-empty-text">No pending requests</p>
        ) : (
          pendingHellOs.map((request) => (
            <div key={request.messageId} className="inbox-mini-card">
              <span className="avatar small">{request.profile.displayName[0]}</span>
              <div className="inbox-mini-info">
                <strong>{request.profile.displayName}</strong>
                <span className="owner-id">{request.sender.ownerId.slice(0, 12)}...</span>
              </div>
              <div className="inbox-mini-actions">
                <button className="accept small" onClick={() => handleAcceptHello(request.messageId)}>✓</button>
                <button className="decline small" onClick={() => handleDeclineHello(request.messageId)}>✗</button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pending messages from unbonded peers */}
      {pendingMessages.length > 0 && (
        <div className="pending-messages-section">
          <h4>Pending Messages <button className="clear-btn small" onClick={clearPendingMessages}>Clear All</button></h4>
          {pendingMessages.map((msg) => (
            <div key={msg.messageId} className="pending-message-card">
              <span className="avatar small">{peerDisplayLabel(msg.sender).charAt(0) || "?"}</span>
              <div className="pending-message-info">
                <strong>{peerDisplayLabel(msg.sender)}</strong>
                <span className="message-preview">{msg.content?.text?.slice(0, 30)}...</span>
              </div>
              <button className="say-hello-btn small"
                onClick={() => handleSayHello(msg.sender.ownerId ?? msg.sender.nodeId)}>
                Say Hello
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Envoy AI contact */}
      <button
        className={`${selectedContact === "__envoy_ai__" ? "active" : ""}`}
        onClick={() => onSelectContact("__envoy_ai__")}
      >
        <span className="avatar">AI</span>
        <span className="name">Envoy AI</span>
      </button>

      {/* Bridge agent contact — appears when external agent bridge is enabled */}
      {bridgeStatus?.enabled && (
        <button
          className={selectedContact === bridgeStatus.agentPeerId ? "active" : ""}
          onClick={() => onSelectContact(bridgeStatus.agentPeerId)}
        >
          <span className="avatar">AG</span>
          <span className="name">My Agent</span>
        </button>
      )}

      {/* Bonded contacts */}
      {bonds.length === 0 && pendingHellOs.length === 0 && pendingMessages.length === 0 ? (
        <p className="empty">No contacts yet. Search to find people!</p>
      ) : (
        bonds.map((contact) => (
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
            {getContactAiAccessLevel(contact.peerOwnerId) === "full" && (
              <span className="ai-access-badge" title="Full AI Access">🔄</span>
            )}
            {getContactAiAccessLevel(contact.peerOwnerId) === "assistant_only" && (
              <span className="ai-access-badge" title="Assistant Only">💬</span>
            )}
          </button>
        ))
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
                {level === "assistant_only" && "💬 Assistant Only — Draft suggestions only"}
                {level === "full" && "🔄 Full Auto-Reply — AI can respond automatically"}
              </div>
            );
          })}
        </div>
      )}
    </aside>
  );
}
