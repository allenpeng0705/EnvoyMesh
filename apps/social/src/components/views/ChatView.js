import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
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
    const [selectedContact, setSelectedContact] = useState(null);
    return (_jsxs("div", { className: "chat-view", children: [_jsx(ChatSidebar, { selectedContact: selectedContact, onSelectContact: setSelectedContact }), _jsx("section", { className: "chat-area", children: selectedContact === "__envoy_ai__" ? (_jsx(AIChatPanel, {})) : selectedContact ? (_jsx(ContactChatPanel, { selectedContact: selectedContact, onSelectContact: setSelectedContact })) : (_jsx("div", { className: "no-chat-selected", children: _jsx("p", { children: "Select a contact or Envoy AI to start chatting" }) })) })] }));
}
//# sourceMappingURL=ChatView.js.map