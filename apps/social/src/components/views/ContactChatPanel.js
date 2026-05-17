import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useEffect, useRef, useCallback } from "react";
import { useNodeState } from "../../context/NodeStateContext.js";
import { useNodeService, useChatMessages } from "../../hooks/useNodeService.js";
import { contactLabel, peerDisplayLabel } from "../../lib/display.js";
import { Markdown } from "../Markdown.js";
export function ContactChatPanel({ selectedContact }) {
    const nodeService = useNodeService();
    const { bonds, nodeConfig, bridgeStatus, appSettings, contactAiModes, setContactAiModes, } = useNodeState();
    const { messages, isOutgoing } = useChatMessages(selectedContact);
    const messagesEndRef = useRef(null);
    const [chatInput, setChatInput] = useState("");
    const [isSendingChat, setIsSendingChat] = useState(false);
    const lastChatSendRef = useRef(null);
    // Peer connection info (locally cached)
    const [peerConnectionInfo, setPeerConnectionInfo] = useState({});
    // Scroll to bottom on new messages
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);
    // Fetch peer connection info
    useEffect(() => {
        if (!appSettings.showConnectionStatus || peerConnectionInfo[selectedContact])
            return;
        nodeService.getPeerConnectionInfo(selectedContact).then((info) => {
            setPeerConnectionInfo((prev) => ({ ...prev, [selectedContact]: info }));
        }).catch(() => { });
    }, [appSettings.showConnectionStatus, selectedContact, nodeService]);
    // AI access
    const getContactAiAccessLevel = useCallback((ownerId) => nodeConfig?.contactAiPreferences?.find(p => p.peerOwnerId === ownerId)?.aiAccessLevel ?? "none", [nodeConfig]);
    const handleSendMessage = async () => {
        const text = chatInput.trim();
        if (!text || isSendingChat)
            return;
        // /ai command routing
        if (text.startsWith("/ai ")) {
            const question = text.slice(4);
            try {
                const answer = await nodeService.knowledgeQuery(question);
                // For now, we don't display AI answers inline in ContactChatPanel
                console.log("[ContactChatPanel] AI answer:", answer);
            }
            catch (e) {
                console.error("[ContactChatPanel] AI query failed:", e);
            }
            setChatInput("");
            return;
        }
        // Duplicate send guard (1.5s)
        const now = Date.now();
        const last = lastChatSendRef.current;
        if (last && last.contact === selectedContact && last.text === text && now - last.at < 1500) {
            return;
        }
        lastChatSendRef.current = { at: now, contact: selectedContact, text };
        setIsSendingChat(true);
        try {
            await nodeService.sendChat(selectedContact, text);
            setChatInput("");
        }
        catch (error) {
            console.error("[ContactChatPanel] sendChat failed:", error);
        }
        finally {
            setIsSendingChat(false);
        }
    };
    const currentAiMode = contactAiModes[selectedContact] ?? "manual";
    const aiAccessLevel = getContactAiAccessLevel(selectedContact);
    const isAssistantAllowed = aiAccessLevel === "assistant_only" || aiAccessLevel === "full";
    const isAutoAllowed = aiAccessLevel === "full" && (nodeConfig?.autonomousPolicies ?? []).some(p => p.domain === "social" && p.autoSendChat);
    const isChatAssistEnabled = nodeConfig?.chatAssistEnabled ?? false;
    return (_jsxs(_Fragment, { children: [_jsxs("header", { className: "chat-header has-assistant-switch", children: [_jsxs("div", { className: "chat-header-left", children: [_jsx("span", { className: "chat-name", children: selectedContact === bridgeStatus?.agentPeerId
                                    ? (bridgeStatus.agentName ?? "My Agent")
                                    : contactLabel(bonds.find((c) => c.peerOwnerId === selectedContact) ?? { peerOwnerId: selectedContact }) }), appSettings.showConnectionStatus && peerConnectionInfo[selectedContact] && (_jsx("span", { className: `connection-type ${peerConnectionInfo[selectedContact].direct ? "p2p" : "relay"}`, children: peerConnectionInfo[selectedContact].direct ? "P2P" : "Relay" }))] }), _jsx("div", { className: "chat-header-right", children: _jsxs("div", { className: "assistant-switch", title: `Current: ${currentAiMode.charAt(0).toUpperCase() + currentAiMode.slice(1)}`, children: [_jsx("span", { className: "assistant-switch-label", children: "AI" }), _jsx("button", { className: `assistant-switch-btn ${currentAiMode === "manual" ? "active" : ""}`, title: "Manual: Type yourself", onClick: () => setContactAiModes({ ...contactAiModes, [selectedContact]: "manual" }), children: "\u270F\uFE0F" }), _jsx("button", { className: `assistant-switch-btn ${currentAiMode === "assistant" ? "active" : ""} ${!isAssistantAllowed || !isChatAssistEnabled ? "disabled" : ""}`, title: !isAssistantAllowed ? "Assistant mode requires AI access for this contact" : isChatAssistEnabled ? "Assistant: AI suggests drafts" : "Chat Assist is disabled", onClick: () => {
                                        if (!isAssistantAllowed || !isChatAssistEnabled)
                                            return;
                                        setContactAiModes({ ...contactAiModes, [selectedContact]: "assistant" });
                                    }, children: "\uD83D\uDCAC" }), _jsx("button", { className: `assistant-switch-btn ${currentAiMode === "auto" ? "active" : ""} ${!isAutoAllowed ? "disabled" : ""}`, title: isAutoAllowed ? "Auto-Reply: AI responds automatically" : "Auto-Reply requires full AI access for this contact", onClick: () => {
                                        if (!isAutoAllowed)
                                            return;
                                        setContactAiModes({ ...contactAiModes, [selectedContact]: "auto" });
                                    }, children: "\uD83D\uDD04" })] }) })] }), _jsxs("div", { className: "messages", children: [messages.length === 0 ? (_jsx("p", { className: "empty", children: "No messages yet. Say hello!" })) : (messages.map((msg) => {
                        const outgoing = isOutgoing(msg);
                        return (_jsxs("div", { className: `message ${outgoing ? "outgoing" : "incoming"}`, children: [!outgoing && _jsx("span", { className: "message-sender", children: peerDisplayLabel(msg.sender) }), _jsx(Markdown, { text: msg.content.text, className: "message-text" }), _jsx("span", { className: "message-time", children: new Date(msg.metadata.timestamp).toLocaleTimeString() })] }, msg.messageId));
                    })), _jsx("div", { ref: messagesEndRef, className: "messages-scroll-anchor", "aria-hidden": true })] }), _jsxs("footer", { className: "chat-input", children: [_jsx("input", { type: "text", placeholder: "Type a message...", value: chatInput, onChange: (e) => setChatInput(e.target.value), onKeyDown: (e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                void handleSendMessage();
                            }
                        }, disabled: isSendingChat }), _jsx("button", { type: "button", onClick: () => void handleSendMessage(), disabled: isSendingChat || !chatInput.trim(), children: isSendingChat ? "Sending\u2026" : "Send" })] })] }));
}
//# sourceMappingURL=ContactChatPanel.js.map