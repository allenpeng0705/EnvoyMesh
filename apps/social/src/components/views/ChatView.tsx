import { ChatSidebar } from "./ChatSidebar.js";
import { ContactChatPanel } from "./ContactChatPanel.js";
import { FamilyChatPanel } from "./FamilyChatPanel.js";
import { FamilyGroupChatPanel } from "./FamilyGroupChatPanel.js";
import { GroupChatPanel } from "./GroupChatPanel.js";
import { ChatIcon } from "../../icons.js";
import { useT } from "../../context/I18nContext.js";
import { useNodeState } from "../../context/NodeStateContext.js";
import {
  isChatRoomThreadKey,
  isAiBotThread,
  parseChatRoomThreadKey,
  isFamilyThreadKey,
  OWNER_FAMILY_PROFILE_ID,
  threadVisibleTo,
  ENVOY_AI_THREAD_KEY,
  isEnvoyHarnessThreadKey,
  parseEnvoyHarnessChatId,
} from "@envoymesh/api";
import { useEffect, useState } from "react";
import { useNodeService } from "../../hooks/useNodeService.js";
import type { ChatRoom, FamilyRoom } from "@envoymesh/api";
import { OpenClawOfflineBanner } from "./OpenClawOfflineBanner.js";
import { BotChatPanel } from "./BotChatPanel.js";
import { AIChatPanel } from "./AIChatPanel.js";
import { getEnvoyAiInflight, subscribeEnvoyAiInflight } from "../../lib/envoy-ai-inflight.js";
import { openCoding } from "../../lib/open-coding-nav.js";

/**
 * Chat threads UI (sidebar + contact/AI panel).
 * Inbox and Terminals live outside this view (header popover / top Terminal tab).
 * Envoy Harness coding sessions live under the Coding tab (not here).
 */
export interface ChatViewProps {
  selectedContact: string | null;
  onSelectedContactChange: (id: string | null) => void;
  onOpenAssistant?: () => void;
  onOpenDiscover?: () => void;
  onOpenActivity?: () => void;
  onOpenChains?: () => void;
  onOpenSettingsAi?: () => void;
  onOpenInbox?: () => void;
}

export function ChatView({
  selectedContact,
  onSelectedContactChange,
  onOpenAssistant,
  onOpenDiscover,
  onOpenActivity,
  onOpenChains,
  onOpenSettingsAi,
  onOpenInbox: onOpenInboxProp,
}: ChatViewProps) {
  const t = useT();
  const nodeService = useNodeService();
  const { nodeConfig, bonds } = useNodeState();
  const [chatRooms, setChatRooms] = useState<ChatRoom[]>([]);
  const [familyRooms, setFamilyRooms] = useState<FamilyRoom[]>([]);
  const [envoyAiInflight, setEnvoyAiInflightState] = useState(getEnvoyAiInflight);
  useEffect(() => {
    const unsub = subscribeEnvoyAiInflight(() => setEnvoyAiInflightState(getEnvoyAiInflight()));
    return unsub;
  }, []);

  // Legacy Chat EH thread keys → Coding tab (clear Chat selection).
  useEffect(() => {
    if (!selectedContact || !isEnvoyHarnessThreadKey(selectedContact)) return;
    const chatId = parseEnvoyHarnessChatId(selectedContact) ?? undefined;
    openCoding(chatId ? { chatId } : {});
    onSelectedContactChange(null);
  }, [selectedContact, onSelectedContactChange]);

  const selectedFamilyRoom = isChatRoomThreadKey(selectedContact ?? "")
    ? familyRooms.find((r) => r.roomId === parseChatRoomThreadKey(selectedContact!))
    : undefined;
  const selectedRoom = isChatRoomThreadKey(selectedContact ?? "")
    ? chatRooms.find((r) => r.roomId === parseChatRoomThreadKey(selectedContact!))
    : undefined;

  useEffect(() => {
    if (!nodeService.isConnected || !selectedContact) return;
    if (!isChatRoomThreadKey(selectedContact)) return;
    const roomId = parseChatRoomThreadKey(selectedContact);
    if (!roomId) return;
    if (selectedRoom || selectedFamilyRoom) return;
    if (!nodeService.listFamilyRooms) return;
    let cancelled = false;
    void nodeService
      .listFamilyRooms()
      .then((result) => {
        if (cancelled) return;
        setFamilyRooms(result.rooms ?? []);
      })
      .catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [
    nodeService,
    nodeService.isConnected,
    selectedContact,
    selectedRoom,
    selectedFamilyRoom,
  ]);

  useEffect(() => {
    if (!nodeService.isConnected) return;
    let cancelled = false;
    void nodeService
      .listChatRooms()
      .then((rooms) => {
        if (!cancelled) setChatRooms(rooms);
      })
      .catch(console.error);
    if (nodeService.listFamilyRooms) {
      void nodeService
        .listFamilyRooms()
        .then((result) => {
          if (!cancelled) setFamilyRooms(result.rooms ?? []);
        })
        .catch(console.error);
    }
    const unsub = nodeService.on("chat:room-updated", (room) => {
      const kind = (room as { kind?: string }).kind;
      if (kind === "family") {
        const familyRoom = room as unknown as FamilyRoom;
        setFamilyRooms((prev) => {
          const idx = prev.findIndex((r) => r.roomId === familyRoom.roomId);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = familyRoom;
            return next;
          }
          return [familyRoom, ...prev];
        });
        return;
      }
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
      setFamilyRooms((prev) => prev.filter((r) => r.roomId !== roomId));
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

  const isEhRedirect =
    Boolean(selectedContact) && isEnvoyHarnessThreadKey(selectedContact ?? "");

  return (
    <div className="chat-view">
      <OpenClawOfflineBanner />
      <div className="chat-view-threads-shell">
        <ChatSidebar
          selectedContact={selectedContact}
          onSelectContact={onSelectedContactChange}
          onOpenAssistant={onOpenAssistant}
          onOpenDiscover={onOpenDiscover}
        />
        <section className="chat-area">
          {(selectedContact === ENVOY_AI_THREAD_KEY || envoyAiInflight) && (
            <div
              className="assistant-chat-wrapper"
              hidden={selectedContact !== ENVOY_AI_THREAD_KEY}
            >
              <div className="assistant-chat-panel">
                <AIChatPanel
                  active={selectedContact === ENVOY_AI_THREAD_KEY}
                  onOpenActivity={onOpenActivity}
                  onOpenInbox={onOpenInboxProp}
                  onOpenChains={onOpenChains}
                  onOpenSettingsAi={onOpenSettingsAi}
                />
              </div>
            </div>
          )}
          {selectedContact &&
          selectedContact !== ENVOY_AI_THREAD_KEY &&
          !isEhRedirect ? (
            isChatRoomThreadKey(selectedContact) && selectedFamilyRoom ? (
              <FamilyGroupChatPanel
                threadKey={selectedContact}
                room={selectedFamilyRoom}
              />
            ) : isChatRoomThreadKey(selectedContact) ? (
              <GroupChatPanel
                threadKey={selectedContact}
                room={selectedRoom}
                onLeaveGroup={() => onSelectedContactChange(null)}
                onOpenChains={onOpenChains}
                onOpenSettingsAi={onOpenSettingsAi}
                onOpenDiscover={onOpenDiscover}
              />
            ) : isAiBotThread(selectedContact) ? (
              <BotChatPanel threadKey={selectedContact} />
            ) : isFamilyThreadKey(selectedContact) &&
              threadVisibleTo(
                selectedContact,
                nodeConfig?.callerFamilyProfileId?.trim() ||
                  OWNER_FAMILY_PROFILE_ID,
              ) ? (
              <FamilyChatPanel threadKey={selectedContact} />
            ) : isFamilyThreadKey(selectedContact) ? (
              <div className="no-chat-selected">
                <h3>{t("chat.familyInvalidTitle", "Invalid family chat")}</h3>
                <p>
                  {t(
                    "chat.familyInvalidDesc",
                    "This family thread is not available for your profile.",
                  )}
                </p>
              </div>
            ) : (
              <ContactChatPanel
                key={selectedContact}
                selectedContact={selectedContact}
                onSelectContact={onSelectedContactChange}
                onOpenChains={onOpenChains}
                onOpenSettingsAi={onOpenSettingsAi}
                onOpenDiscover={onOpenDiscover}
              />
            )
          ) : selectedContact === ENVOY_AI_THREAD_KEY ||
            isEhRedirect ||
            envoyAiInflight ? null : (
            <div className="no-chat-selected">
              <div className="no-chat-selected-icon">
                <ChatIcon size={48} />
              </div>
              {bonds.length === 0 ? (
                <>
                  <h3>{t("chat.emptyTitle")}</h3>
                  <p>{t("chat.emptyDesc")}</p>
                  {onOpenDiscover ? (
                    <button type="button" className="primary" onClick={onOpenDiscover}>
                      {t("chat.openDiscover")}
                    </button>
                  ) : null}
                </>
              ) : (
                <>
                  <h3>{t("chat.selectContactTitle", "Select a contact")}</h3>
                  <p>{t("chat.selectContactDesc", "Choose someone from the list to start chatting.")}</p>
                </>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
