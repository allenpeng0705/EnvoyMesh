import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect } from "react";
import { useNodeState } from "../../context/NodeStateContext.js";
import { useNodeService } from "../../hooks/useNodeService.js";
import { contactLabel, peerDisplayLabel } from "../../lib/display.js";
export function ChatSidebar({ selectedContact, onSelectContact }) {
    const nodeService = useNodeService();
    const { bonds, bridgeStatus, pendingHellOs, pendingMessages, humanProfile, nodeConfig, sendHello, acceptHello, declineHello, clearPendingMessages, contactAiModes, setContactAiModes, } = useNodeState();
    const [contextMenu, setContextMenu] = useState(null);
    // Close context menu when clicking outside
    useEffect(() => {
        if (!contextMenu)
            return;
        const handleClick = () => setContextMenu(null);
        document.addEventListener("click", handleClick);
        return () => document.removeEventListener("click", handleClick);
    }, [contextMenu]);
    const getContactAiAccessLevel = (ownerId) => {
        return nodeConfig?.contactAiPreferences?.find(p => p.peerOwnerId === ownerId)?.aiAccessLevel ?? "none";
    };
    const updateContactAiAccessLevel = async (ownerId, level) => {
        const currentPrefs = nodeConfig?.contactAiPreferences ?? [];
        const existingPref = currentPrefs.find(p => p.peerOwnerId === ownerId);
        const otherPrefs = currentPrefs.filter(p => p.peerOwnerId !== ownerId);
        const newPrefs = [...otherPrefs, {
                peerOwnerId: ownerId,
                aiAccessLevel: level,
                knowledgeAccess: existingPref?.knowledgeAccess ?? "public",
                priority: existingPref?.priority ?? "high",
            }];
        await nodeService.updateNodeConfig({ contactAiPreferences: newPrefs });
        await nodeService.getNodeConfig().catch(() => { });
    };
    const handleAcceptHello = async (messageId) => {
        try {
            await acceptHello(messageId);
        }
        catch (e) {
            console.error(e);
        }
    };
    const handleDeclineHello = async (messageId) => {
        try {
            await declineHello(messageId);
        }
        catch (e) {
            console.error(e);
        }
    };
    const handleSayHello = async (targetOwnerId) => {
        try {
            const profile = {
                displayName: humanProfile?.displayName ?? "Envoy User",
                bio: humanProfile?.bio ?? "",
                interests: [...(humanProfile?.hobbies ?? []), ...(humanProfile?.knowledge ?? [])],
                whatShares: [],
            };
            await sendHello(targetOwnerId, profile, "Hello!");
        }
        catch (e) {
            console.error(e);
        }
    };
    return (_jsxs("aside", { className: "contact-list", children: [_jsxs("div", { className: "contact-list-header", children: [_jsx("h3", { children: "Contacts" }), _jsxs("span", { className: "inbox-count", children: [pendingHellOs.length, " pending"] })] }), _jsxs("div", { className: "inbox-section", children: [_jsxs("h4", { children: ["Inbox ", _jsx("button", { className: "clear-btn small", onClick: () => {
                                    // Hello requests are managed by useHelloRequests; view-level clearing
                                }, children: "Clear All" })] }), pendingHellOs.length === 0 ? (_jsx("p", { className: "empty inbox-empty-text", children: "No pending requests" })) : (pendingHellOs.map((request) => (_jsxs("div", { className: "inbox-mini-card", children: [_jsx("span", { className: "avatar small", children: request.profile.displayName[0] }), _jsxs("div", { className: "inbox-mini-info", children: [_jsx("strong", { children: request.profile.displayName }), _jsxs("span", { className: "owner-id", children: [request.sender.ownerId.slice(0, 12), "..."] })] }), _jsxs("div", { className: "inbox-mini-actions", children: [_jsx("button", { className: "accept small", onClick: () => handleAcceptHello(request.messageId), children: "\u2713" }), _jsx("button", { className: "decline small", onClick: () => handleDeclineHello(request.messageId), children: "\u2717" })] })] }, request.messageId))))] }), pendingMessages.length > 0 && (_jsxs("div", { className: "pending-messages-section", children: [_jsxs("h4", { children: ["Pending Messages ", _jsx("button", { className: "clear-btn small", onClick: clearPendingMessages, children: "Clear All" })] }), pendingMessages.map((msg) => (_jsxs("div", { className: "pending-message-card", children: [_jsx("span", { className: "avatar small", children: peerDisplayLabel(msg.sender).charAt(0) || "?" }), _jsxs("div", { className: "pending-message-info", children: [_jsx("strong", { children: peerDisplayLabel(msg.sender) }), _jsxs("span", { className: "message-preview", children: [msg.content?.text?.slice(0, 30), "..."] })] }), _jsx("button", { className: "say-hello-btn small", onClick: () => handleSayHello(msg.sender.ownerId ?? msg.sender.nodeId), children: "Say Hello" })] }, msg.messageId)))] })), _jsxs("button", { className: `${selectedContact === "__envoy_ai__" ? "active" : ""}`, onClick: () => onSelectContact("__envoy_ai__"), children: [_jsx("span", { className: "avatar", children: "AI" }), _jsx("span", { className: "name", children: "Envoy AI" })] }), bridgeStatus?.enabled && (_jsxs("button", { className: selectedContact === bridgeStatus.agentPeerId ? "active" : "", onClick: () => onSelectContact(bridgeStatus.agentPeerId), children: [_jsx("span", { className: "avatar", children: "AG" }), _jsx("span", { className: "name", children: bridgeStatus.agentName ?? "My Agent" })] })), bonds.length === 0 && pendingHellOs.length === 0 && pendingMessages.length === 0 ? (_jsx("p", { className: "empty", children: "No contacts yet. Search to find people!" })) : (bonds.map((contact) => (_jsxs("button", { className: selectedContact === contact.peerOwnerId ? "active" : "", onClick: () => onSelectContact(contact.peerOwnerId), onContextMenu: (e) => {
                    e.preventDefault();
                    setContextMenu({ ownerId: contact.peerOwnerId, x: e.clientX, y: e.clientY });
                }, children: [_jsx("span", { className: "avatar", children: contact.displayName?.[0] ?? "?" }), _jsx("span", { className: "name", children: contactLabel(contact) }), getContactAiAccessLevel(contact.peerOwnerId) === "full" && (_jsx("span", { className: "ai-access-badge", title: "Full AI Access", children: "\uD83D\uDD04" })), getContactAiAccessLevel(contact.peerOwnerId) === "assistant_only" && (_jsx("span", { className: "ai-access-badge", title: "Assistant Only", children: "\uD83D\uDCAC" }))] }, contact.peerOwnerId)))), contextMenu && (_jsxs("div", { className: "context-menu", style: { position: "fixed", left: contextMenu.x, top: contextMenu.y, zIndex: 1000 }, onClick: (e) => e.stopPropagation(), children: [_jsx("div", { className: "context-menu-header", children: "AI Access for Contact" }), ["none", "assistant_only", "full"].map((level) => {
                        const currentLevel = getContactAiAccessLevel(contextMenu.ownerId);
                        return (_jsxs("div", { className: `context-menu-item ${currentLevel === level ? "active" : ""}`, onClick: () => {
                                void updateContactAiAccessLevel(contextMenu.ownerId, level);
                                setContextMenu(null);
                            }, children: [level === "none" && "○ None — AI never responds", level === "assistant_only" && "💬 Assistant Only — Draft suggestions only", level === "full" && "🔄 Full Auto-Reply — AI can respond automatically"] }, level));
                    })] }))] }));
}
//# sourceMappingURL=ChatSidebar.js.map