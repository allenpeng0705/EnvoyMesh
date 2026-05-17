import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { useNodeState } from "./context/NodeStateContext.js";
import { ErrorBoundary } from "./components/ErrorBoundary.js";
import { Header } from "./components/Header.js";
import { SetupView } from "./components/views/SetupView.js";
import { ChatView } from "./components/views/ChatView.js";
import { ContactsView } from "./components/views/ContactsView.js";
import { SearchView } from "./components/views/SearchView.js";
import { ProfileView } from "./components/views/ProfileView.js";
import { SettingsView } from "./components/views/SettingsView.js";
import { InboxView } from "./components/views/InboxView.js";
export function App() {
    const { isConnected, nodeStatus, peerId, nodeConfig, humanProfile, bonds, pendingHellOs, connectionStatus, } = useNodeState();
    const [currentView, setCurrentView] = useState("chat");
    const [showInbox, setShowInbox] = useState(false);
    const isPublicNetwork = (nodeConfig?.bootstrapPresets ?? []).length > 0;
    // ---- Loading ----
    if (!isConnected) {
        return (_jsx("div", { className: "app", children: _jsx("div", { className: "loading", children: "Connecting to Envoy..." }) }));
    }
    // ---- Setup (node not initialized) ----
    if (nodeStatus === "offline") {
        return _jsx(SetupView, {});
    }
    // ---- Main app ----
    return (_jsxs("div", { className: "app", children: [_jsx(Header, { currentView: currentView, onNavigate: (v) => {
                    setCurrentView(v);
                    if (v === "inbox")
                        setShowInbox(true);
                }, inboxCount: pendingHellOs.length, bondsCount: bonds.length, isPublicNetwork: isPublicNetwork, connectionStatus: connectionStatus, nodeStatus: nodeStatus, humanProfile: humanProfile, peerId: peerId }), _jsx(ErrorBoundary, { children: _jsxs("main", { className: "main", children: [currentView === "chat" && _jsx(ChatView, {}), currentView === "contacts" && _jsx(ContactsView, {}), currentView === "search" && _jsx(SearchView, {}), currentView === "profile" && _jsx(ProfileView, {}), currentView === "settings" && _jsx(SettingsView, {}), currentView === "inbox" && _jsx(InboxView, {})] }) }), !showInbox && pendingHellOs.length > 0 && currentView !== "inbox" && (_jsxs("aside", { className: "hello-requests", children: [_jsxs("h3", { children: ["Hello Requests (", pendingHellOs.length, ")"] }), pendingHellOs.map((request) => (_jsxs("div", { className: "hello-card", children: [_jsx("span", { className: "avatar", children: request.profile.displayName[0] }), _jsxs("div", { className: "hello-info", children: [_jsx("strong", { children: request.profile.displayName }), request.profile.bio && _jsx("p", { children: request.profile.bio }), _jsx("span", { className: "interests", children: request.profile.interests.join(", ") })] })] }, request.messageId)))] }))] }));
}
export { App as default };
//# sourceMappingURL=App.js.map