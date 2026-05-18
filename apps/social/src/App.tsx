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

export type ViewName = "chat" | "contacts" | "search" | "profile" | "settings" | "inbox";

export function App() {
  const {
    isConnected,
    nodeStatus,
    peerId,
    nodeConfig,
    humanProfile,
    bonds,
    pendingHellOs,
    connectionStatus,
  } = useNodeState();

  const [currentView, setCurrentView] = useState<ViewName>("chat");

  const isPublicNetwork = (nodeConfig?.bootstrapPresets ?? []).length > 0;

  // ---- Loading ----
  if (!isConnected) {
    return (
      <div className="app">
        <div className="loading">Connecting to Envoy...</div>
      </div>
    );
  }

  // ---- Setup (node not initialized) ----
  if (nodeStatus === "offline") {
    return <SetupView />;
  }

  // ---- Main app ----
  return (
    <div className="app">
      <Header
        currentView={currentView}
        onNavigate={(v) => { setCurrentView(v); }}
        inboxCount={pendingHellOs.length}
        bondsCount={bonds.length}
        isPublicNetwork={isPublicNetwork}
        connectionStatus={connectionStatus}
        nodeStatus={nodeStatus}
        humanProfile={humanProfile}
        peerId={peerId}
      />

      <ErrorBoundary>
        <main className="main">
          {currentView === "chat" && <ChatView />}
          {currentView === "contacts" && <ContactsView />}
          {currentView === "search" && <SearchView />}
          {currentView === "profile" && <ProfileView />}
          {currentView === "settings" && <SettingsView />}
          {currentView === "inbox" && <InboxView />}
        </main>
      </ErrorBoundary>

    </div>
  );
}

export { App as default };
