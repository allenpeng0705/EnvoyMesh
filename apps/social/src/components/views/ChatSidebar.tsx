import { useState, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { useT } from "../../context/I18nContext.js";
import { useNodeState } from "../../context/NodeStateContext.js";
import { useNodeService } from "../../hooks/useNodeService.js";
import type {
  ChatRoom,
  ContactAiPreferences,
  HelloProfile,
} from "@envoymesh/api";
import { chatRoomThreadKey } from "@envoymesh/api";
import { resolveContactAiAccessLevel } from "@envoymesh/api";
import { contactLabel, peerDisplayLabel } from "../../lib/display.js";
import { PeerProfileAvatar } from "../PeerProfileAvatar.js";
import { ChatIcon, BridgeIcon, AddIcon } from "../../icons.js";
import { ExtAgentSwitcher } from "../ExtAgentSwitcher.js";
import { useChatThreadPreviews } from "../../hooks/useChatThreadPreviews.js";
import { useBondConnectionPreload } from "../../hooks/useBondConnectionPreload.js";
import { CreateGroupModal } from "./CreateGroupModal.js";
import { RemoveContactConfirmModal } from "../RemoveContactConfirmModal.js";
import { PullToRefresh } from "../PullToRefresh.js";
import { loadOutboundHellos } from "../../lib/discover-peer-state.js";
import type { BondRecord } from "@envoymesh/api";
import { openBrowserAt } from "../../lib/browser-nav.js";
import { webContentUrl } from "../../lib/web-content-urls.js";

const CONTEXT_MENU_PAD = 8;

function clampMenuPosition(
  x: number,
  y: number,
  width: number,
  height: number,
): { x: number; y: number } {
  const maxX = Math.max(CONTEXT_MENU_PAD, window.innerWidth - width - CONTEXT_MENU_PAD);
  const maxY = Math.max(CONTEXT_MENU_PAD, window.innerHeight - height - CONTEXT_MENU_PAD);
  return {
    x: Math.min(Math.max(CONTEXT_MENU_PAD, x), maxX),
    y: Math.min(Math.max(CONTEXT_MENU_PAD, y), maxY),
  };
}

function sortByLatestMessage<T>(
  items: readonly T[],
  threadKey: (item: T) => string,
  previews: Record<string, { timestampMs?: number }>,
): T[] {
  return [...items].sort((a, b) => {
    const ta = previews[threadKey(a)]?.timestampMs ?? 0;
    const tb = previews[threadKey(b)]?.timestampMs ?? 0;
    return tb - ta;
  });
}

interface ChatSidebarProps {
  selectedContact: string | null;
  onSelectContact: (id: string | null) => void;
  onOpenAssistant?: () => void;
  onOpenDiscover?: () => void;
  /** Phase 49 — open the Pi chat panel. */
  onOpenPi?: () => void;
}

export function ChatSidebar({ selectedContact, onSelectContact, onOpenAssistant, onOpenDiscover, onOpenPi }: ChatSidebarProps) {
  const t = useT();
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
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const [removeTarget, setRemoveTarget] = useState<{ ownerId: string; name: string } | null>(null);
  const [chatRooms, setChatRooms] = useState<ChatRoom[]>([]);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [outboundHellos, setOutboundHellos] = useState<Set<string>>(() => loadOutboundHellos());

  // Refresh outbound hellos when the sidebar mounts (e.g. after auto-hello
  // from Discover or the sponsor friend flow).
  useEffect(() => {
    setOutboundHellos(loadOutboundHellos());
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshNodeConfig();
    } finally {
      setIsRefreshing(false);
    }
  };

  // Close context menu when clicking outside / Escape
  useEffect(() => {
    if (!contextMenu) return;
    const handleClick = () => setContextMenu(null);
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setContextMenu(null);
    };
    document.addEventListener("click", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("click", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [contextMenu]);

  // Keep the portaled menu inside the viewport (avoids truncation near list edges).
  useLayoutEffect(() => {
    if (!contextMenu || !contextMenuRef.current) return;
    const el = contextMenuRef.current;
    const next = clampMenuPosition(
      contextMenu.x,
      contextMenu.y,
      el.offsetWidth,
      el.offsetHeight,
    );
    if (next.x !== contextMenu.x || next.y !== contextMenu.y) {
      setContextMenu({ ...contextMenu, ...next });
    }
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
        displayName: humanProfile?.displayName ?? t("inbox.defaultUserName"),
        bio: humanProfile?.bio ?? "",
        interests: [...(humanProfile?.hobbies ?? []), ...(humanProfile?.knowledge ?? [])],
        whatShares: [],
      };
      await sendHello(targetOwnerId, profile, t("inbox.defaultHello"));
    } catch (e) { console.error(e); }
  };

  const openRemoveContact = (peerOwnerId: string, name: string) => {
    setContextMenu(null);
    setRemoveTarget({ ownerId: peerOwnerId, name });
  };

  const bondPeerIds = useMemo(() => bonds.map((b) => b.peerOwnerId), [bonds]);
  const roomThreadKeys = useMemo(() => chatRooms.map((r) => chatRoomThreadKey(r.roomId)), [chatRooms]);
  const previewThreadKeys = useMemo(
    () => [...bondPeerIds, ...roomThreadKeys],
    [bondPeerIds, roomThreadKeys],
  );
  const threadPreviews = useChatThreadPreviews(previewThreadKeys);

  const preloadBondIds = useMemo(
    () =>
      sortByLatestMessage(bonds, (contact: BondRecord) => contact.peerOwnerId, threadPreviews).map(
        (c) => c.peerOwnerId,
      ),
    [bonds, threadPreviews],
  );
  const { preloadOnHover } = useBondConnectionPreload(preloadBondIds);

  const sortedChatRooms = useMemo(
    () => sortByLatestMessage(chatRooms, (room) => chatRoomThreadKey(room.roomId), threadPreviews),
    [chatRooms, threadPreviews],
  );

  const sortedBonds = useMemo(
    () => sortByLatestMessage(bonds, (contact: BondRecord) => contact.peerOwnerId, threadPreviews),
    [bonds, threadPreviews],
  );

  const showAiSection = Boolean(onOpenAssistant || onOpenPi) || bridgeStatus?.enabled;

  useEffect(() => {
    if (!nodeService.isConnected) return;
    let cancelled = false;
    void nodeService
      .listChatRooms()
      .then((rooms) => {
        if (!cancelled) setChatRooms(rooms);
      })
      .catch(console.error);
    const unsub = nodeService.on("chat:room-updated", (room) => {
      setChatRooms((prev) => {
        const idx = prev.findIndex((r) => r.roomId === room.roomId);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = room;
          return next;
        }
        return [room, ...prev];
      });
    });
    const unsubRemoved = nodeService.on("chat:room-removed", ({ roomId }) => {
      setChatRooms((prev) => prev.filter((r) => r.roomId !== roomId));
      if (selectedContact && chatRoomThreadKey(roomId) === selectedContact) {
        onSelectContact(null);
      }
    });
    return () => {
      cancelled = true;
      unsub();
      unsubRemoved();
    };
  }, [nodeService, nodeService.isConnected, onSelectContact, selectedContact]);

  return (
    <aside className="contact-list">
      <PullToRefresh onRefresh={handleRefresh} isRefreshing={isRefreshing}>
        {/* AI — assistant + home agent bridge */}
      {showAiSection ? (
        <>
          <div className="contact-list-section-label">{t("chat.aiSection")}</div>
          {onOpenAssistant ? (
            <button
              type="button"
              className="thread-row thread-row--ai"
              onClick={onOpenAssistant}
            >
              <span className="thread-avatar" aria-hidden>AI</span>
              <span className="thread-meta">
                <span className="thread-title-row">
                  <span className="thread-title">{t("chat.assistant")}</span>
                </span>
                <span className="thread-subtitle">{t("chat.assistantSubtitle")}</span>
              </span>
            </button>
          ) : null}

          {bridgeStatus?.enabled ? (
            <div className="thread-row-with-actions thread-row-with-actions--ext-agent">
              <button
                type="button"
                className={`thread-row thread-row--agent ${selectedContact === bridgeStatus.agentPeerId ? "active" : ""}`}
                onClick={() => onSelectContact(bridgeStatus.agentPeerId)}
              >
                <span className="thread-avatar" aria-hidden>AG</span>
                <span className="thread-meta">
                  <span className="thread-title-row">
                    <span className="thread-title">{t("chat.myAgent")}</span>
                  </span>
                  <span className="thread-subtitle">
                    {bridgeStatus.agentName || t("chat.extAgentDefaultName", "Ext Agent")}
                  </span>
                </span>
              </button>
              <ExtAgentSwitcher stopRowClick iconOnly />
            </div>
          ) : null}

          {onOpenPi ? (
            <button
              type="button"
              className="thread-row thread-row--ai thread-row--pi"
              onClick={onOpenPi}
            >
              <span className="thread-avatar thread-avatar--pi" aria-hidden>π</span>
              <span className="thread-meta">
                <span className="thread-title-row">
                  <span className="thread-title">{t("pi.title", "Pi")}</span>
                </span>
                <span className="thread-subtitle">{t("pi.subtitle", "Local coding agent")}</span>
              </span>
            </button>
          ) : null}
        </>
      ) : null}

      {/* Pending Hello requests */}
      {pendingHellOs.length > 0 && (
        <>
          <div className="contact-list-section-label">
            {t("chat.requests", { count: pendingHellOs.length })}
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
                <span className="thread-subtitle">{t("chat.tapAcceptHello")}</span>
              </span>
            </button>
          ))}
        </>
      )}

      {/* Pending messages from unbonded peers — shown inline in contact list */}
      {pendingMessages.length > 0 && (
        <>
          <div className="contact-list-section-label">{t("chat.pending")}</div>
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
                <span className="thread-subtitle">{msg.content?.text?.slice(0, 48) ?? t("chat.newMessage")}</span>
              </span>
            </button>
          ))}
          <button className="clear-pending-btn" onClick={clearPendingMessages}>
            {t("chat.clearAll")}
          </button>
        </>
      )}

      {/* Group chats — always listed under Group when user has contacts */}
      {bonds.length > 0 ? (
        <>
          <div className="contact-list-section-header">
            <span className="contact-list-section-label">{t("chat.groupsSection")}</span>
            <button
              type="button"
              className="contact-list-section-add-btn"
              aria-label={t("chat.addGroupAria")}
              title={t("chat.addGroupAria")}
              onClick={() => setShowCreateGroup(true)}
            >
              <AddIcon size={18} />
            </button>
          </div>
          {sortedChatRooms.map((room) => {
            const threadKey = chatRoomThreadKey(room.roomId);
            const pv = threadPreviews[threadKey];
            return (
              <button
                key={room.roomId}
                type="button"
                className={`thread-row thread-row--group ${selectedContact === threadKey ? "active" : ""}`}
                onClick={() => onSelectContact(threadKey)}
              >
                <span className="thread-avatar thread-avatar--group" aria-hidden>
                  {room.title.slice(0, 2).toUpperCase()}
                </span>
                <span className="thread-meta">
                  <span className="thread-title-row">
                    <span className="thread-title">{room.title}</span>
                    {pv ? <span className="thread-time">{pv.timeLabel}</span> : null}
                  </span>
                  <span className="thread-subtitle">{pv?.text ?? t("chat.noMessagesYet")}</span>
                </span>
              </button>
            );
          })}
        </>
      ) : null}

      {/* Bonded contacts — primary chat list */}
      {bonds.length > 0 ? (
        <>
          <div className="contact-list-section-label">{t("chat.contactsSection")}</div>
          <p className="contact-list-hint">{t("contacts.tapHint")}</p>
          {sortedBonds.map((contact) => {
            const pv = threadPreviews[contact.peerOwnerId];
            const label = contactLabel(contact);
            return (
              <div key={contact.peerOwnerId} className="thread-row-with-actions">
                <button
                  type="button"
                  className={`thread-row thread-row--contact ${selectedContact === contact.peerOwnerId ? "active" : ""}`}
                  onClick={() => onSelectContact(contact.peerOwnerId)}
                  onMouseEnter={() => preloadOnHover(contact.peerOwnerId)}
                  onFocus={() => preloadOnHover(contact.peerOwnerId)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setContextMenu({ ownerId: contact.peerOwnerId, x: e.clientX, y: e.clientY });
                  }}
                >
                  <PeerProfileAvatar
                    ownerId={contact.peerOwnerId}
                    fallbackLabel={label}
                    className="thread-avatar"
                  />
                  <span className="thread-meta">
                    <span className="thread-title-row">
                      <span className="thread-title">{label}</span>
                      {pv ? <span className="thread-time">{pv.timeLabel}</span> : null}
                    </span>
                    <span className="thread-subtitle">{pv?.text ?? t("chat.noMessagesYet")}</span>
                  </span>
                </button>
                <button
                  type="button"
                  className="thread-row-remove-btn"
                  aria-label={t("contacts.removeNamed", { name: label })}
                  title={t("contacts.removeContact")}
                  onClick={(e) => {
                    e.stopPropagation();
                    openRemoveContact(contact.peerOwnerId, label);
                  }}
                >
                  <span aria-hidden="true">×</span>
                </button>
              </div>
            );
          })}
        </>
      ) : null}

      {/* Pending outgoing hellos — show when the user has sent a hello
          (auto-hello or manual) that hasn't been accepted yet. This gives
          visible feedback that "something is happening" even with 0 bonds. */}
      {bonds.length === 0 && outboundHellos.size > 0 && (
        <div className="chat-sidebar-pending">
          <div className="chat-sidebar-pending__header">
            {t("chat.pendingHellos", { count: outboundHellos.size })}
          </div>
          <p className="chat-sidebar-pending__desc">{t("chat.pendingHellosDesc")}</p>
        </div>
      )}

      {bonds.length === 0 &&
      chatRooms.length === 0 &&
      pendingHellOs.length === 0 &&
      pendingIntroProposals.length === 0 &&
      pendingMessages.length === 0 &&
      outboundHellos.size === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <ChatIcon size={32} />
          </div>
          <div className="empty-state-title">{t("chat.noContactsTitle")}</div>
          <div className="empty-state-desc">{t("chat.noContactsDesc")}</div>
          {onOpenDiscover ? (
            <button type="button" className="discover-primary-btn chat-sidebar-discover-btn" onClick={onOpenDiscover}>
              {t("chat.openDiscover")}
            </button>
          ) : null}
        </div>
      ) : null}

      </PullToRefresh>

      {/* Portaled so overflow on the contact list / pull-to-refresh cannot clip it. */}
      {contextMenu &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={contextMenuRef}
            className="context-menu"
            style={{ position: "fixed", left: contextMenu.x, top: contextMenu.y }}
            onClick={(e) => e.stopPropagation()}
            data-testid="contact-context-menu"
            role="menu"
          >
            <div className="context-menu-header context-menu-header--row">
              <span className="context-menu-header__label">{t("chat.aiAccessMenu")}</span>
              <div
                className="context-menu-links"
                role="group"
                aria-label={t("agentCard.publishedContent", "Published content")}
              >
                {(
                  [
                    ["profile", "agentCard.openProfile", "Profile"],
                    ["blog", "agentCard.openBlog", "Blog"],
                    ["photowall", "agentCard.openPhotoWall", "PhotoWall"],
                  ] as const
                ).map(([surface, key, fallback], i) => (
                  <span key={surface} className="context-menu-links__item">
                    {i > 0 ? <span className="context-menu-links__sep" aria-hidden="true">·</span> : null}
                    <button
                      type="button"
                      className="context-menu-link"
                      role="menuitem"
                      data-testid={`context-web-content-${surface}`}
                      onClick={() => {
                        const ownerId = contextMenu.ownerId;
                        setContextMenu(null);
                        openBrowserAt(webContentUrl(ownerId, surface));
                      }}
                    >
                      {t(key, fallback)}
                    </button>
                  </span>
                ))}
                <span className="context-menu-links__item">
                  <span className="context-menu-links__sep" aria-hidden="true">·</span>
                  <button
                    type="button"
                    className="context-menu-link"
                    role="menuitem"
                    data-testid="context-web-content-feeds"
                    onClick={() => {
                      const ownerId = contextMenu.ownerId;
                      setContextMenu(null);
                      openBrowserAt(webContentUrl(ownerId, "feeds"));
                    }}
                  >
                    {t("agentCard.openFeeds", "Feeds")}
                  </button>
                </span>
              </div>
            </div>
            {(["none", "assistant_only", "full"] as const).map((level) => {
              const currentLevel = getContactAiAccessLevel(contextMenu.ownerId);
              return (
                <div
                  key={level}
                  className={`context-menu-item ${currentLevel === level ? "active" : ""}`}
                  role="menuitem"
                  onClick={() => {
                    void updateContactAiAccessLevel(contextMenu.ownerId, level);
                    setContextMenu(null);
                  }}
                >
                  {level === "none" && t("chat.aiAccessNone")}
                  {level === "assistant_only" && <><ChatIcon size={14} /> {t("chat.aiAccessAssistant")}</>}
                  {level === "full" && <><BridgeIcon size={14} /> {t("chat.aiAccessFull")}</>}
                </div>
              );
            })}
            <div className="context-menu-divider" role="separator" />
            {(() => {
              const bond = bonds.find((b) => b.peerOwnerId === contextMenu.ownerId);
              const isBlocked = bond?.level === "blocked";
              return (
                <div
                  className="context-menu-item context-menu-item--danger"
                  role="menuitem"
                  onClick={() => {
                    const ownerId = contextMenu.ownerId;
                    setContextMenu(null);
                    void (isBlocked
                      ? nodeService.unblockPeer(ownerId)
                      : nodeService.blockPeer(ownerId)
                    ).catch((err) => {
                      console.error("[ChatSidebar] trust-tier change failed:", err);
                    });
                  }}
                >
                  {isBlocked ? t("contacts.unblock") : t("contacts.block")}
                </div>
              );
            })()}
            <div
              className="context-menu-item context-menu-item--danger"
              role="menuitem"
              onClick={() => {
                const bond = bonds.find((b) => b.peerOwnerId === contextMenu.ownerId);
                openRemoveContact(contextMenu.ownerId, contactLabel(bond ?? { peerOwnerId: contextMenu.ownerId }));
              }}
            >
              {t("contacts.removeContact")}
            </div>
          </div>,
          document.body,
        )}

      {showCreateGroup ? (
        <CreateGroupModal
          onClose={() => setShowCreateGroup(false)}
          onCreated={(threadKey) => {
            onSelectContact(threadKey);
            setShowCreateGroup(false);
          }}
        />
      ) : null}

      {removeTarget ? (
        <RemoveContactConfirmModal
          peerOwnerId={removeTarget.ownerId}
          displayName={removeTarget.name}
          onClose={() => setRemoveTarget(null)}
          onRemoved={() => {
            if (selectedContact === removeTarget.ownerId) {
              onSelectContact(null);
            }
          }}
        />
      ) : null}
    </aside>
  );
}
