import { ChatSidebar } from "./ChatSidebar.js";
import { AIChatPanel } from "./AIChatPanel.js";
import { ContactChatPanel } from "./ContactChatPanel.js";
import { ChatIcon } from "../../icons.js";

/**
 * ChatView is a layout shell: sidebar + AI or contact thread.
 * Selection is lifted to App when provided so switching views preserves the thread.
 */
export interface ChatViewProps {
  selectedContact: string | null;
  onSelectedContactChange: (id: string | null) => void;
  /** Sidebar "N new" opens full Inbox view */
  onNavigateToInbox?: () => void;
}

export function ChatView({ selectedContact, onSelectedContactChange, onNavigateToInbox }: ChatViewProps) {
  return (
    <div className="chat-view">
      <ChatSidebar
        selectedContact={selectedContact}
        onSelectContact={onSelectedContactChange}
        onNavigateToInbox={onNavigateToInbox}
      />
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
  );
}
