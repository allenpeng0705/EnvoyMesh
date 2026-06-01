import { ChatSidebar } from "./ChatSidebar.js";
import { ContactChatPanel } from "./ContactChatPanel.js";
import { GroupChatPanel } from "./GroupChatPanel.js";
import { InboxView } from "./InboxView.js";
import { ChatIcon } from "../../icons.js";
import { useT } from "../../context/I18nContext.js";
import type { ChatPanelMode } from "../../App.js";
import { isChatRoomThreadKey, parseChatRoomThreadKey } from "@envoymesh/api";
import { useEffect, useState } from "react";
import { useNodeService } from "../../hooks/useNodeService.js";
import type { ChatRoom } from "@envoymesh/api";

/**
 * ChatView is a layout shell: sidebar + AI or contact thread, with Inbox as a second panel.
 * Selection is lifted to App when provided so switching views preserves the thread.
 */
export interface ChatViewProps {
  selectedContact: string | null;
  onSelectedContactChange: (id: string | null) => void;
  panelMode: ChatPanelMode;
  onPanelModeChange: (mode: ChatPanelMode) => void;
  inboxActivityCount: number;
  onOpenAssistant?: () => void;
  onOpenDiscover?: () => void;
}

export function ChatView({
  selectedContact,
  onSelectedContactChange,
  panelMode,
  onPanelModeChange,
  inboxActivityCount,
  onOpenAssistant,
  onOpenDiscover,
}: ChatViewProps) {
  const t = useT();
  const nodeService = useNodeService();
  const [chatRooms, setChatRooms] = useState<ChatRoom[]>([]);
  const [postCreateRoomId, setPostCreateRoomId] = useState<string | null>(null);
  const selectedRoom = isChatRoomThreadKey(selectedContact ?? "")
    ? chatRooms.find((r) => r.roomId === parseChatRoomThreadKey(selectedContact!))
    : undefined;

  useEffect(() => {
    if (!nodeService.isConnected) return;
    let cancelled = false;
    void nodeService.listChatRooms().then((rooms) => {
      if (!cancelled) setChatRooms(rooms);
    });
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
      if (selectedContact && parseChatRoomThreadKey(selectedContact) === roomId) {
        onSelectedContactChange(null);
      }
    });
    return () => {
      cancelled = true;
      unsub();
      unsubRemoved();
    };
  }, [nodeService, nodeService.isConnected, onSelectedContactChange, selectedContact]);

  return (
    <div className="chat-view">
      <div className="chat-view-primary-tabs" aria-label={t("chat.tabsLabel")}>
        <button
          type="button"
          aria-pressed={panelMode === "threads"}
          className={panelMode === "threads" ? "active" : ""}
          onClick={() => onPanelModeChange("threads")}
        >
          {t("chat.chats")}
        </button>
        <button
          type="button"
          aria-pressed={panelMode === "inbox"}
          className={`${panelMode === "inbox" ? "active" : ""}${inboxActivityCount > 0 ? " has-inbox-tab" : ""}`}
          onClick={() => onPanelModeChange("inbox")}
        >
          {t("chat.inbox")}
          {inboxActivityCount > 0 ? (
            <span className="inbox-badge" aria-hidden>
              {inboxActivityCount > 99 ? "99+" : inboxActivityCount}
            </span>
          ) : null}
        </button>
      </div>

      {panelMode === "inbox" ? (
        <div className="chat-view-inbox-panel">
          <InboxView embedded />
        </div>
      ) : (
        <div className="chat-view-threads-shell">
          <ChatSidebar
            selectedContact={selectedContact}
            onSelectContact={(id) => {
              onSelectedContactChange(id);
              if (id && isChatRoomThreadKey(id)) {
                const rid = parseChatRoomThreadKey(id);
                if (rid) setPostCreateRoomId(rid);
              }
            }}
            onGroupCreated={(roomId) => setPostCreateRoomId(roomId)}
            onOpenAssistant={onOpenAssistant}
            onOpenDiscover={onOpenDiscover}
          />
          <section className="chat-area">
            {selectedContact ? (
              isChatRoomThreadKey(selectedContact) ? (
                <GroupChatPanel
                  threadKey={selectedContact}
                  room={selectedRoom}
                  showPostCreateHint={
                    !!selectedRoom && postCreateRoomId === selectedRoom.roomId
                  }
                  onDismissPostCreateHint={() => setPostCreateRoomId(null)}
                  onLeaveGroup={() => onSelectedContactChange(null)}
                />
              ) : (
                <ContactChatPanel
                  selectedContact={selectedContact}
                  onSelectContact={onSelectedContactChange}
                />
              )
            ) : (
              <div className="no-chat-selected">
                <div className="no-chat-selected-icon">
                  <ChatIcon size={48} />
                </div>
                <h3>{t("chat.selectContact")}</h3>
                <p>{t("chat.selectContactDesc")}</p>
                {onOpenAssistant && (
                  <button type="button" className="primary" style={{ marginTop: "1rem" }} onClick={onOpenAssistant}>
                    {t("chat.openAssistant")}
                  </button>
                )}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
