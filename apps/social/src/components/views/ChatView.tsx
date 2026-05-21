import { ChatSidebar } from "./ChatSidebar.js";
import { AIChatPanel } from "./AIChatPanel.js";
import { ContactChatPanel } from "./ContactChatPanel.js";
import { InboxView } from "./InboxView.js";
import { ChatIcon } from "../../icons.js";
import type { ChatPanelMode } from "../../App.js";

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
}

export function ChatView({
  selectedContact,
  onSelectedContactChange,
  panelMode,
  onPanelModeChange,
  inboxActivityCount,
}: ChatViewProps) {
  return (
    <div className="chat-view">
      <div className="chat-view-primary-tabs" aria-label="Chat or inbox">
        <button
          type="button"
          aria-pressed={panelMode === "threads"}
          className={panelMode === "threads" ? "active" : ""}
          onClick={() => onPanelModeChange("threads")}
        >
          Chats
        </button>
        <button
          type="button"
          aria-pressed={panelMode === "inbox"}
          className={`${panelMode === "inbox" ? "active" : ""}${inboxActivityCount > 0 ? " has-inbox-tab" : ""}`}
          onClick={() => onPanelModeChange("inbox")}
        >
          Inbox
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
          <ChatSidebar selectedContact={selectedContact} onSelectContact={onSelectedContactChange} />
          <section className="chat-area">
            {selectedContact === "__envoy_ai__" ? (
              <AIChatPanel />
            ) : selectedContact ? (
              <ContactChatPanel
                selectedContact={selectedContact}
                onSelectContact={onSelectedContactChange}
              />
            ) : (
              <div className="no-chat-selected">
                <div className="no-chat-selected-icon">
                  <ChatIcon size={48} />
                </div>
                <h3>Select a contact</h3>
                <p>Choose a contact from the list or start a conversation with Envoy AI</p>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
