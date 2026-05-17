import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { useNodeState } from "../../context/NodeStateContext.js";
import { useNodeService } from "../../hooks/useNodeService.js";
function contactLabel(contact) {
    const d = contact.displayName?.trim();
    if (d)
        return d;
    if (contact.libp2pPeerId?.trim())
        return contact.libp2pPeerId.trim();
    return contact.peerOwnerId;
}
export function ContactsView() {
    const nodeService = useNodeService();
    const { bonds, discoveredPeers, humanProfile, sendHello } = useNodeState();
    const [showAroundMe, setShowAroundMe] = useState(false);
    const handleRevokeBond = async (peerOwnerId) => {
        if (!confirm("Are you sure you want to remove this contact?"))
            return;
        try {
            await nodeService.revokeBond(peerOwnerId);
        }
        catch (error) {
            console.error("Failed to revoke bond:", error);
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
        catch (error) {
            console.error("Failed to send hello:", error);
        }
    };
    return (_jsxs("div", { className: "contacts-view", children: [_jsxs("div", { className: "contacts-header", children: [_jsx("h2", { children: "Your Contacts" }), _jsx("div", { className: "around-me-toggle", children: _jsxs("button", { className: `around-me-btn ${showAroundMe ? "active" : ""}`, onClick: () => setShowAroundMe(!showAroundMe), children: ["Around Me ", discoveredPeers.length > 0 && _jsx("span", { className: "badge", children: discoveredPeers.length })] }) })] }), showAroundMe && (_jsxs("div", { className: "around-me-section", children: [_jsx("h3", { children: "Discovered Peers" }), discoveredPeers.length === 0 ? (_jsx("p", { className: "empty", children: "No peers discovered yet. Keep your node running to discover nearby peers." })) : (_jsx("ul", { className: "around-me-list", children: discoveredPeers.map((peer) => (_jsxs("li", { className: "around-me-item", children: [_jsx("span", { className: "avatar", children: peer.displayName?.[0] ?? "?" }), _jsxs("div", { className: "peer-info", children: [_jsx("strong", { children: peer.displayName || "Unknown Peer" }), _jsxs("span", { className: "peer-id", children: [peer.nodeId.slice(0, 12), "..."] })] }), _jsx("button", { className: "say-hello-btn", onClick: () => handleSayHello(peer.nodeId), children: "Say Hello" })] }, peer.nodeId))) }))] })), bonds.length === 0 && !showAroundMe ? (_jsx("p", { className: "empty", children: "No contacts yet. Use Search to find people, or check Around Me for discovered peers." })) : (_jsx("ul", { className: "contact-cards", children: bonds.map((contact) => (_jsxs("li", { className: "contact-card", children: [_jsx("span", { className: "avatar large", children: contactLabel(contact).charAt(0) || "?" }), _jsxs("div", { className: "contact-info", children: [_jsx("strong", { children: contactLabel(contact) }), _jsx("span", { className: "bond-level", children: contact.level })] }), _jsx("button", { className: "remove-contact", onClick: () => handleRevokeBond(contact.peerOwnerId), title: "Remove contact", children: "\u00D7" })] }, contact.peerOwnerId))) }))] }));
}
//# sourceMappingURL=ContactsView.js.map