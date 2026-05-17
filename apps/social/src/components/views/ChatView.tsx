import { useState, useCallback } from "react";
import { ChatSidebar } from "./ChatSidebar.js";
import { AIChatPanel } from "./AIChatPanel.js";
import { ContactChatPanel } from "./ContactChatPanel.js";
import { ChatIcon } from "../../icons.js";

/**
 * ChatView — layout shell managing selectedContact state.
 *
 * "selectedContact" can be:
 *  - null           → "Select a contact" prompt
 *  - "__envoy_ai__" → AI chat panel
 *  - ownerId        → Human-to-human chat
 *
 * On mobile, selecting a contact hides the sidebar and shows a back button.
 */
export function ChatView() {
  const [selectedContact, setSelectedContact] = useState<string | null>(null);
  const [sidebarVisible, setSidebarVisible] = useState(true);

  const handleSelectContact = useCallback((id: string | null) => {
    setSelectedContact(id);
    // On mobile: hide sidebar when contact selected, show it when going back
    if (id && window.innerWidth <= 768) {
      setSidebarVisible(false);
    }
    if (!id) {
      setSidebarVisible(true);
    }
  }, []);

  return (
    <div className="chat-view">
      <div className={`contact-list${!sidebarVisible ? " sidebar-hidden" : ""}`}>
        <ChatSidebar
          selectedContact={selectedContact}
          onSelectContact={handleSelectContact}
        />
      </div>
      <section className="chat-panel">
        {selectedContact === "__envoy_ai__" ? (
          <AIChatPanel />
        ) : selectedContact ? (
          <ContactChatPanel
            selectedContact={selectedContact}
            onSelectContact={handleSelectContact}
          />
        ) : (
          <div className="no-chat-selected">
            <div className="no-chat-selected-icon">
              <ChatIcon size={32} />
            </div>
            <h3>Select a Conversation</h3>
            <p>Choose a contact from the sidebar or chat with Envoy AI</p>
          </div>
        )}
      </section>
    </div>
  );
}
