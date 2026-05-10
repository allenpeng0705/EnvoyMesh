import { useState, useEffect, useRef } from "react";
import { ChatSidebar } from "./ChatSidebar.js";
import { AIChatPanel } from "./AIChatPanel.js";
import { ContactChatPanel } from "./ContactChatPanel.js";

/**
 * ChatView is a layout shell that manages `selectedContact` state and
 * delegates to ChatSidebar / AIChatPanel / ContactChatPanel.
 *
 * The "selectedContact" can be:
 *  - null       → "Select a contact" prompt
 *  - "__envoy_ai__" → AI chat panel
 *  - ownerId    → Human-to-human chat
 */
export function ChatView() {
  const [selectedContact, setSelectedContact] = useState<string | null>(null);

  return (
    <div className="chat-view">
      <ChatSidebar
        selectedContact={selectedContact}
        onSelectContact={setSelectedContact}
      />
      <section className="chat-area">
        {selectedContact === "__envoy_ai__" ? (
          <AIChatPanel />
        ) : selectedContact ? (
          <ContactChatPanel
            selectedContact={selectedContact}
            onSelectContact={setSelectedContact}
          />
        ) : (
          <div className="no-chat-selected">
            <p>Select a contact or Envoy AI to start chatting</p>
          </div>
        )}
      </section>
    </div>
  );
}
