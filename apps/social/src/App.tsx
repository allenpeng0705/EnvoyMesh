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
import { CloseIcon } from "./icons.js";

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
  const [showInbox, setShowInbox] = useState(false);

  const isPublicNetwork = (nodeConfig?.bootstrapPresets ?? []).length > 0;

  // ---- Loading ----
  if (!isConnected) {
    return (
      <div className="app">
        <div className="loading">
          <div className="spinner" />
          <p>Connecting to EnvoyMesh...</p>
        </div>
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
        onNavigate={(v) => {
          setCurrentView(v);
          if (v === "inbox") setShowInbox(true);
        }}
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
          {currentView === "chat" && <ChatView key="chat" />}
          {currentView === "contacts" && <ContactsView key="contacts" />}
          {currentView === "search" && <SearchView key="search" />}
          {currentView === "profile" && <ProfileView key="profile" />}
          {currentView === "settings" && <SettingsView key="settings" />}
          {currentView === "inbox" && <InboxView key="inbox" />}
        </main>
      </ErrorBoundary>

      {/* Floating hello requests panel */}
      {!showInbox && pendingHellOs.length > 0 && currentView !== "inbox" && (
        <aside className="hello-requests">
          <div className="hello-requests-header">
            <h3>Hello Requests ({pendingHellOs.length})</h3>
            <button
              className="close-btn"
              aria-label="Close"
              onClick={() => setShowInbox(true)}
            >
              <CloseIcon size={18} />
            </button>
          </div>
          {pendingHellOs.map((request) => (
            <div key={request.messageId} className="hello-card">
              <span className="avatar">{request.profile.displayName[0]}</span>
              <div className="hello-info">
                <strong>{request.profile.displayName}</strong>
                {request.profile.bio && <p>{request.profile.bio}</p>}
                <span className="interests">{request.profile.interests.join(", ")}</span>
              </div>
            </div>
          ))}
        </aside>
      )}
    </div>
  );
}

export { App as default };
