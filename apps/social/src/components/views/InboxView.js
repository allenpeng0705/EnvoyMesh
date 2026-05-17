import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useNodeState } from "../../context/NodeStateContext.js";
export function InboxView() {
    const { pendingHellOs, acceptHello, declineHello } = useNodeState();
    const handleAccept = async (request) => {
        try {
            await acceptHello(request.messageId);
        }
        catch (error) {
            console.error("Failed to accept hello:", error);
        }
    };
    const handleDecline = async (request) => {
        try {
            await declineHello(request.messageId);
        }
        catch (error) {
            console.error("Failed to decline hello:", error);
        }
    };
    if (pendingHellOs.length === 0) {
        return (_jsxs("div", { className: "inbox-view", children: [_jsx("div", { className: "inbox-header", children: _jsx("h2", { children: "Inbox" }) }), _jsxs("div", { className: "inbox-empty", children: [_jsx("p", { children: "No pending requests" }), _jsx("small", { children: "Hello requests from other users will appear here" })] })] }));
    }
    return (_jsxs("div", { className: "inbox-view", children: [_jsx("div", { className: "inbox-header", children: _jsx("h2", { children: "Inbox" }) }), _jsx("ul", { className: "inbox-list", children: pendingHellOs.map((request) => (_jsxs("li", { className: "inbox-item", children: [_jsxs("div", { className: "inbox-sender", children: [_jsx("span", { className: "avatar large", children: request.profile.displayName[0] }), _jsxs("div", { className: "inbox-sender-info", children: [_jsx("strong", { children: request.profile.displayName }), _jsx("span", { className: "owner-id", children: request.sender.ownerId })] })] }), request.profile.bio && (_jsx("p", { className: "inbox-bio", children: request.profile.bio })), request.profile.interests.length > 0 && (_jsx("span", { className: "interests", children: request.profile.interests.join(", ") })), request.message && (_jsxs("p", { className: "inbox-message", children: ["\"", request.message, "\""] })), _jsxs("div", { className: "inbox-actions", children: [_jsx("button", { className: "accept", onClick: () => handleAccept(request), children: "Accept" }), _jsx("button", { className: "decline", onClick: () => handleDecline(request), children: "Decline" })] })] }, request.messageId))) })] }));
}
//# sourceMappingURL=InboxView.js.map