import { ChatSidebar } from "./ChatSidebar.js";
import { ContactChatPanel } from "./ContactChatPanel.js";
import { GroupChatPanel } from "./GroupChatPanel.js";
import { InboxView } from "./InboxView.js";
import { TerminalPanel } from "../terminals/TerminalPanel.js";
import { TerminalSidebar } from "../terminals/TerminalSidebar.js";
import { ChatIcon } from "../../icons.js";
import { useT } from "../../context/I18nContext.js";
import { useNodeState } from "../../context/NodeStateContext.js";
import type { ChatPanelMode } from "../../App.js";
import { isChatRoomThreadKey, parseChatRoomThreadKey } from "@envoymesh/api";
import type { TerminalSessionSummary } from "@envoymesh/api";
import { useEffect, useMemo, useState } from "react";
import { useIsInProcessMobileNode, useNodeService } from "../../hooks/useNodeService.js";
import type { ChatRoom } from "@envoymesh/api";
import { loadTerminalSelectedSessionId, saveTerminalSelectedSessionId } from "../../lib/storage.js";
import { OpenClawOfflineBanner } from "./OpenClawOfflineBanner.js";

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
  /** Phase 49 — open the Pi chat panel. */
  onOpenPi?: () => void;
}

export function ChatView({
  selectedContact,
  onSelectedContactChange,
  panelMode,
  onPanelModeChange,
  inboxActivityCount,
  onOpenAssistant,
  onOpenDiscover,
  onOpenPi,
}: ChatViewProps) {
  const t = useT();
  const nodeService = useNodeService();
  const isMobileNode = useIsInProcessMobileNode();
  const { connectionStatus, nodeConfig, bonds } = useNodeState();
  const [chatRooms, setChatRooms] = useState<ChatRoom[]>([]);
  const [terminalSessions, setTerminalSessions] = useState<TerminalSessionSummary[]>([]);
  const [selectedTerminalId, setSelectedTerminalId] = useState<string | null>(() => loadTerminalSelectedSessionId());
  const homeRemote = connectionStatus?.homeRemote;
  const terminalsAvailable =
    connectionStatus?.terminalsAvailable === true || homeRemote?.terminalsAvailable === true;
  const showTerminalsTab =
    connectionStatus?.terminalsAvailable === true || isMobileNode;
  const terminalsNeedPair = isMobileNode && homeRemote?.paired !== true;
  const selectedTerminal = useMemo(
    () => terminalSessions.find((s) => s.sessionId === selectedTerminalId) ?? null,
    [selectedTerminalId, terminalSessions],
  );

  const selectedRoom = isChatRoomThreadKey(selectedContact ?? "")
    ? chatRooms.find((r) => r.roomId === parseChatRoomThreadKey(selectedContact!))
    : undefined;

  useEffect(() => {
    if (!showTerminalsTab && panelMode === "terminals") {
      onPanelModeChange("threads");
    }
  }, [showTerminalsTab, panelMode, onPanelModeChange]);

  useEffect(() => {
    saveTerminalSelectedSessionId(selectedTerminalId);
  }, [selectedTerminalId]);

  useEffect(() => {
    const running = terminalSessions.filter((s) => s.state === "running");
    if (running.length === 0) {
      if (selectedTerminalId) setSelectedTerminalId(null);
      return;
    }
    if (selectedTerminalId && running.some((s) => s.sessionId === selectedTerminalId)) return;
    setSelectedTerminalId(running[0]?.sessionId ?? null);
  }, [selectedTerminalId, terminalSessions]);

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
    <div className={`chat-view${panelMode === "terminals" ? " chat-view--terminals" : ""}`}>
      <OpenClawOfflineBanner />
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
          data-testid="chat-tab-inbox"
        >
          {t("chat.inbox")}
          {inboxActivityCount > 0 ? (
            <span className="inbox-badge" aria-hidden>
              {inboxActivityCount > 99 ? "99+" : inboxActivityCount}
            </span>
          ) : null}
        </button>
        {showTerminalsTab ? (
          <button
            type="button"
            aria-pressed={panelMode === "terminals"}
            className={panelMode === "terminals" ? "active" : ""}
            onClick={() => onPanelModeChange("terminals")}
          >
            {t("chat.terminals")}
          </button>
        ) : null}
      </div>

      {panelMode === "inbox" ? (
        <div className="chat-view-inbox-panel">
          <InboxView embedded />
        </div>
      ) : panelMode === "terminals" ? (
        terminalsNeedPair ? (
          <div className="terminal-panel terminal-panel-empty chat-view-terminals-shell">
            <h3>{t("terminals.pairRequired")}</h3>
            <p>{t("terminals.pairRequiredDesc")}</p>
          </div>
        ) : (
          <div className="chat-view-terminals-shell">
            <TerminalSidebar
              selectedSessionId={selectedTerminalId}
              onSelectSession={(id) => setSelectedTerminalId(id || null)}
              onSessionsChange={setTerminalSessions}
              disabled={!terminalsAvailable}
              onOpenAssistant={onOpenAssistant}
            />
            <TerminalPanel session={selectedTerminal} onOpenAssistant={onOpenAssistant} active={panelMode === "terminals"} />
          </div>
        )
      ) : (
        <div className="chat-view-threads-shell">
          <ChatSidebar
            selectedContact={selectedContact}
            onSelectContact={onSelectedContactChange}
            onOpenAssistant={onOpenAssistant}
            onOpenDiscover={onOpenDiscover}
            onOpenPi={onOpenPi}
          />
          <section className="chat-area">
            {selectedContact ? (
              isChatRoomThreadKey(selectedContact) ? (
                <GroupChatPanel
                  threadKey={selectedContact}
                  room={selectedRoom}
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
                {bonds.length === 0 ? (
                  <>
                    <h3>{t("chat.welcomeTitle")}</h3>
                    <p>{t("chat.welcomeDesc")}</p>
                    {onOpenDiscover && (
                      <button type="button" className="primary" style={{ marginTop: "1rem" }} onClick={onOpenDiscover}>
                        {t("chat.openDiscover")}
                      </button>
                    )}
                    {/* Show "Open EnvoyAI" only when AI is not disabled */}
                    {onOpenAssistant && nodeConfig?.modelProviders?.mode !== "disabled" && (
                      <button type="button" className="secondary" style={{ marginTop: "0.5rem" }} onClick={onOpenAssistant}>
                        {t("chat.openAssistant")}
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <h3>{t("chat.selectContact")}</h3>
                    <p>{t("chat.selectContactDesc")}</p>
                    {onOpenAssistant && nodeConfig?.modelProviders?.mode !== "disabled" && (
                      <button type="button" className="primary" style={{ marginTop: "1rem" }} onClick={onOpenAssistant}>
                        {t("chat.openAssistant")}
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
