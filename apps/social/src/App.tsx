import { useState } from "react";
import { useNodeState } from "./context/NodeStateContext.js";
import { useNodeService } from "./hooks/useNodeService.js";
import { ToastProvider } from "./hooks/useToast.js";
import { ErrorBoundary } from "./components/ErrorBoundary.js";
import { Header } from "./components/Header.js";
import { SetupView } from "./components/views/SetupView.js";
import { ChatView } from "./components/views/ChatView.js";
import { ContactsView } from "./components/views/ContactsView.js";
import { SearchView } from "./components/views/SearchView.js";
import { ProfileView } from "./components/views/ProfileView.js";
import { SettingsView } from "./components/views/SettingsView.js";
import { InboxView } from "./components/views/InboxView.js";
import { LibraryView } from "./components/views/LibraryView.js";

export type ViewName = "chat" | "contacts" | "search" | "library" | "profile" | "settings" | "inbox";

export function App() {
  const {
    isConnected,
    nodeStatus,
    peerId,
    nodeConfig,
    humanProfile,
    bonds,
    pendingHellOs,
    pendingIntroProposals,
    pendingMessages,
    connectionStatus,
  } = useNodeState();

  // Derive relay unreachable state from WebSocket errors or many reconnect attempts
  const nodeService = useNodeService();
  const reconnectAttempts = nodeService.reconnectAttempts;
  const lastError = (nodeService as unknown as { getLastError?(): string | null }).getLastError?.() ?? null;
  const isRelayUnreachable = reconnectAttempts > 3 || (lastError?.includes("Connection timed out") || lastError?.includes("relay") || lastError?.includes("ECONNREFUSED") || lastError?.includes("WebSocket connection closed") || false);

  const handleRetryConnect = () => {
    void nodeService.reconnect();
  };

  const [currentView, setCurrentView] = useState<ViewName>("chat");
  const [chatSelectedContact, setChatSelectedContact] = useState<string | null>(null);

  const isPublicNetwork = (nodeConfig?.bootstrapPresets ?? []).length > 0;

  // ---- Wrap return content ----
  const content = !isConnected ? (
    <div className="app">
      <div className="loading">
        <div className="loading-content">
          <div className="loading-spinner" />
          <h2>Connecting to EnvoyMesh</h2>
          {reconnectAttempts > 0 && (
            <p className="loading-attempts">Reconnect attempt {reconnectAttempts}{"\u2026"}</p>
          )}
          {reconnectAttempts > 3 && (
            <div className="loading-error">
              <p>Unable to connect. The relay may be unreachable.</p>
              <p className="loading-error-hint">Check your relay URL in Settings &gt; App, or ensure the relay server is running.</p>
              <button className="primary" onClick={handleRetryConnect}>
                Retry Connection
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  ) : nodeStatus === "offline" ? (
    <SetupView />
  ) : null;

  if (content) {
    return <ToastProvider>{content}</ToastProvider>;
  }

  // ---- Main app ----
  return (
    <ToastProvider>
      <div className="app">
        <Header
          currentView={currentView}
          onNavigate={(v) => { setCurrentView(v); }}
          inboxActivityCount={pendingHellOs.length + pendingIntroProposals.length + pendingMessages.length}
          bondsCount={bonds.length}
          isPublicNetwork={isPublicNetwork}
          connectionStatus={connectionStatus}
          nodeStatus={nodeStatus}
          humanProfile={humanProfile}
          peerId={peerId}
          relayUnreachable={isRelayUnreachable}
          onRetryConnect={handleRetryConnect}
        />

        <ErrorBoundary>
          <main className="main">
            {currentView === "chat" && (
              <ChatView
                selectedContact={chatSelectedContact}
                onSelectedContactChange={setChatSelectedContact}
                onNavigateToInbox={() => setCurrentView("inbox")}
              />
            )}
            {currentView === "contacts" && (
              <ContactsView
                onOpenChat={(peerOwnerId) => {
                  setChatSelectedContact(peerOwnerId);
                  setCurrentView("chat");
                }}
              />
            )}
            {currentView === "search" && <SearchView />}
            {currentView === "library" && <LibraryView />}
            {currentView === "profile" && <ProfileView />}
            {currentView === "settings" && <SettingsView />}
            {currentView === "inbox" && <InboxView />}
          </main>
        </ErrorBoundary>

      </div>
    </ToastProvider>
  );
}

export { App as default };
