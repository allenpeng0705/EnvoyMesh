import { useState, useEffect, useRef, useCallback } from "react";
import { useNodeState } from "../../context/NodeStateContext.js";
import { useNodeService } from "../../hooks/useNodeService.js";
import type {
  ContactAiPreferences,
  HelloProfile,
} from "@envoymesh/api";
import { contactLabel, peerDisplayLabel } from "../../lib/display.js";
import {
  ChatIcon,
  AIIcon,
  BridgeIcon,
  CheckIcon,
  CloseIcon,
  ExpandIcon,
  CollapseIcon,
  InboxIcon,
  PendingIcon,
  MoreIcon,
} from "../../icons.js";

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

  const [contextMenu, setContextMenu] = useState<{
    ownerId: string; x: number; y: number;
  } | null>(null);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    inbox: true,
    pending: true,
    contacts: true,
  });
  const contextBtnRef = useRef<Record<string, HTMLButtonElement | null>>({});

  // Close context menu when clicking outside
  useEffect(() => {
    if (!contextMenu) return;
    const handleClick = () => setContextMenu(null);
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [contextMenu]);

  const toggleSection = (key: string) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

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

  const handleContextMenu = useCallback((ownerId: string, e: React.MouseEvent) => {
    e.preventDefault();
    const btn = contextBtnRef.current[ownerId];
    if (btn) {
      const rect = btn.getBoundingClientRect();
      const x = Math.min(rect.right, window.innerWidth - 170);
      const y = Math.min(rect.bottom, window.innerHeight - 200);
      setContextMenu({ ownerId, x, y });
    } else {
      setContextMenu({ ownerId, x: e.clientX, y: e.clientY });
    }
  }, []);

  return (
    <>
      <div className="contact-list-header">
        <span className="contact-list-title">Contacts</span>
        {pendingHellOs.length > 0 && (
          <span className="section-count">{pendingHellOs.length} pending</span>
        )}
      </div>

      <div className="contact-list-scroll">
        {/* Inbox section */}
        <div className="sidebar-section">
          <button
            className="sidebar-section-header"
            onClick={() => toggleSection("inbox")}
            aria-expanded={expandedSections.inbox}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <InboxIcon size={14} />
              Inbox
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              {pendingHellOs.length > 0 && (
                <span className="section-count">{pendingHellOs.length}</span>
              )}
              {expandedSections.inbox ? <CollapseIcon size={12} /> : <ExpandIcon size={12} />}
            </span>
          </button>
          {expandedSections.inbox && (
            <div className="sidebar-section-body">
              {pendingHellOs.length === 0 ? (
                <p className="empty" style={{ padding: "8px 16px", fontSize: "11px", color: "var(--color-text-subtle)" }}>
                  No pending requests
                </p>
              ) : (
                pendingHellOs.map((request) => (
                  <div key={request.messageId} className="inbox-mini-card">
                    <span className="contact-avatar">{request.profile.displayName[0]}</span>
                    <div className="inbox-mini-info">
                      <div className="inbox-mini-name">{request.profile.displayName}</div>
                      <div className="inbox-mini-bio">{request.sender.ownerId?.slice(0, 12)}...</div>
                    </div>
                    <div className="inbox-mini-actions">
                      <button className="inbox-mini-btn accept" aria-label="Accept" onClick={() => handleAcceptHello(request.messageId)}>
                        <CheckIcon size={14} />
                      </button>
                      <button className="inbox-mini-btn decline" aria-label="Decline" onClick={() => handleDeclineHello(request.messageId)}>
                        <CloseIcon size={14} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Pending messages from unbonded peers */}
        {pendingMessages.length > 0 && (
          <div className="sidebar-section">
            <button
              className="sidebar-section-header"
              onClick={() => toggleSection("pending")}
              aria-expanded={expandedSections.pending}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <PendingIcon size={14} />
                Pending Messages
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span className="section-count">{pendingMessages.length}</span>
                {expandedSections.pending ? <CollapseIcon size={12} /> : <ExpandIcon size={12} />}
              </span>
            </button>
            {expandedSections.pending && (
              <div className="sidebar-section-body">
                {pendingMessages.map((msg) => (
                  <div key={msg.messageId} className="inbox-mini-card">
                    <span className="contact-avatar small">
                      {peerDisplayLabel(msg.sender).charAt(0) || "?"}
                    </span>
                    <div className="inbox-mini-info">
                      <div className="inbox-mini-name">{peerDisplayLabel(msg.sender)}</div>
                      <div className="inbox-mini-bio">{msg.content?.text?.slice(0, 30)}...</div>
                    </div>
                    <button className="btn btn-sm btn-primary"
                      onClick={() => handleSayHello(msg.sender.ownerId ?? msg.sender.nodeId)}>
                      Say Hello
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* AI & Agents section */}
        <div className="sidebar-section">
          <button
            className="sidebar-section-header"
            onClick={() => toggleSection("contacts")}
            aria-expanded={expandedSections.contacts}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <AIIcon size={14} />
              AI &amp; Contacts
            </span>
            {expandedSections.contacts ? <CollapseIcon size={12} /> : <ExpandIcon size={12} />}
          </button>
          {expandedSections.contacts && (
            <div className="sidebar-section-body">
              {/* Envoy AI */}
              <button
                className={`contact-item${selectedContact === "__envoy_ai__" ? " active" : ""}`}
                onClick={() => onSelectContact("__envoy_ai__")}
              >
                <span className="contact-avatar" style={{ background: "linear-gradient(135deg, var(--color-primary), var(--color-secondary))" }}>
                  <AIIcon size={18} color="#fff" stroke="none" fill="#fff" />
                </span>
                <div className="contact-item-info">
                  <span className="contact-item-name">Envoy AI</span>
                </div>
              </button>

              {/* Bridge agent */}
              {bridgeStatus?.enabled && (
                <button
                  className={`contact-item${selectedContact === bridgeStatus.agentPeerId ? " active" : ""}`}
                  onClick={() => onSelectContact(bridgeStatus.agentPeerId)}
                >
                  <span className="contact-avatar" style={{ background: "linear-gradient(135deg, var(--color-secondary), var(--color-primary))" }}>
                    <BridgeIcon size={18} color="#fff" stroke="none" fill="#fff" />
                  </span>
                  <div className="contact-item-info">
                    <span className="contact-item-name">{bridgeStatus.agentName ?? "My Agent"}</span>
                  </div>
                </button>
              )}

              {/* Bonded contacts */}
              {bonds.length === 0 && (
                <p className="empty" style={{ padding: "8px 16px", fontSize: "11px", color: "var(--color-text-subtle)" }}>
                  No contacts yet. Search to find people!
                </p>
              )}
              {bonds.map((contact) => (
                <div key={contact.peerOwnerId} style={{ position: "relative" }}>
                  <button
                    ref={(el) => { contextBtnRef.current[contact.peerOwnerId] = el; }}
                    className={`contact-item${selectedContact === contact.peerOwnerId ? " active" : ""}`}
                    onClick={() => onSelectContact(contact.peerOwnerId)}
                    onContextMenu={(e) => handleContextMenu(contact.peerOwnerId, e)}
                  >
                    <span className="contact-avatar">
                      {contact.displayName?.[0] ?? "?"}
                    </span>
                    <div className="contact-item-info">
                      <span className="contact-item-name">{contactLabel(contact)}</span>
                      {contact.level && (
                        <span className="contact-item-preview" style={{ textTransform: "capitalize" }}>
                          {contact.level}
                        </span>
                      )}
                    </div>
                    <div className="contact-item-meta">
                      {getContactAiAccessLevel(contact.peerOwnerId) === "full" && (
                        <AIIcon size={14} className="ai-access-badge" />
                      )}
                      {getContactAiAccessLevel(contact.peerOwnerId) === "assistant_only" && (
                        <ChatIcon size={14} className="ai-access-badge" />
                      )}
                      <button
                        className="contact-item-more"
                        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-subtle)", padding: 0, opacity: 0.5 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleContextMenu(contact.peerOwnerId, e);
                        }}
                      >
                        <MoreIcon size={14} />
                      </button>
                    </div>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          className="context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="context-menu-item" style={{ fontWeight: 600, fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--color-text-subtle)", cursor: "default" }}>
            AI Access
          </div>
          {(["none", "assistant_only", "full"] as const).map((level) => {
            const currentLevel = getContactAiAccessLevel(contextMenu.ownerId);
            return (
              <button
                key={level}
                className={`context-menu-item${currentLevel === level ? " active" : ""}`}
                onClick={() => {
                  void updateContactAiAccessLevel(contextMenu.ownerId, level);
                  setContextMenu(null);
                }}
              >
                {level === "none" && <span><CloseIcon size={14} /> None</span>}
                {level === "assistant_only" && <span><ChatIcon size={14} /> Assistant Only</span>}
                {level === "full" && <span><AIIcon size={14} /> Full Auto-Reply</span>}
                {currentLevel === level && <CheckIcon size={14} style={{ marginLeft: "auto" }} />}
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}
