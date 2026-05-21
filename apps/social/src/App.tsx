import { useState } from "react";
import { useNodeState } from "./context/NodeStateContext.js";
import { useNodeService } from "./hooks/useNodeService.js";
import { useInboxActivityCount } from "./hooks/useInboxActivityCount.js";
import { ToastProvider } from "./hooks/useToast.js";
import { ErrorBoundary } from "./components/ErrorBoundary.js";
import { Header } from "./components/Header.js";
import { SetupView } from "./components/views/SetupView.js";
import { ChatView } from "./components/views/ChatView.js";
import { ContactsView } from "./components/views/ContactsView.js";
import { ProfileView } from "./components/views/ProfileView.js";
import { SettingsView } from "./components/views/SettingsView.js";
import { LibraryView } from "./components/views/LibraryView.js";

export type ViewName = "chat" | "contacts" | "library" | "profile" | "settings";

export type ChatPanelMode = "threads" | "inbox";

export type ContactsPanelMode = "list" | "discover";

function ConnectingSplash({
  reconnectAttempts,
  lastError,
  isRelayUnreachable,
  onRetryConnect,
}: {
  reconnectAttempts: number;
  lastError: string | null;
  isRelayUnreachable: boolean;
  onRetryConnect: () => void;
}) {
  return (
    <div className="app">
      <div className="loading">
        <div className="loading-content">
          <div className="loading-spinner" />
          <h2>Connecting to EnvoyMesh</h2>
          <p className="loading-attempts">
            {reconnectAttempts > 0
              ? `Reconnect attempt ${reconnectAttempts}\u2026`
              : "Waiting for node WebSocket (ws://localhost:3030/ws)\u2026"}
          </p>
          {(isRelayUnreachable || lastError) && (
            <div className="loading-error">
              <p>{lastError ?? "Unable to connect. Is the node running?"}</p>
              <p className="loading-error-hint">
                Start the node with <code>npm run node:dev</code> (WebSocket on port 3030), then retry.
              </p>
              <button type="button" className="primary" onClick={onRetryConnect}>
                Retry Connection
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function LoadingNodeSplash() {
  return (
    <div className="app">
      <div className="loading">
        <div className="loading-content">
          <div className="loading-spinner" />
          <h2>Loading node status</h2>
          <p className="loading-attempts">Connected to node API…</p>
        </div>
      </div>
    </div>
  );
}

export function App() {
  const {
    isConnected,
    nodeStatusHydrated,
    nodeStatus,
    peerId,
    nodeConfig,
    humanProfile,
    bonds,
    connectionStatus,
  } = useNodeState();

  const inboxActivityCount = useInboxActivityCount();

  const nodeService = useNodeService();
  const reconnectAttempts = nodeService.reconnectAttempts;
  const lastError = (nodeService as unknown as { getLastError?(): string | null }).getLastError?.() ?? null;
  const isRelayUnreachable =
    reconnectAttempts > 3 ||
    (lastError?.includes("Connection timed out") ||
      lastError?.includes("ECONNREFUSED") ||
      lastError?.includes("WebSocket connection closed") ||
      false);

  const handleRetryConnect = () => {
    void nodeService.reconnect();
  };

  const [currentView, setCurrentView] = useState<ViewName>("chat");
  const [chatSelectedContact, setChatSelectedContact] = useState<string | null>(null);
  const [chatPanelMode, setChatPanelMode] = useState<ChatPanelMode>("threads");
  const [contactsPanelMode, setContactsPanelMode] = useState<ContactsPanelMode>("list");

  const isPublicNetwork = (nodeConfig?.bootstrapPresets ?? []).length > 0;

  if (!isConnected) {
    return (
      <ToastProvider>
        <ConnectingSplash
          reconnectAttempts={reconnectAttempts}
          lastError={lastError}
          isRelayUnreachable={isRelayUnreachable}
          onRetryConnect={handleRetryConnect}
        />
      </ToastProvider>
    );
  }

  if (!nodeStatusHydrated) {
    return (
      <ToastProvider>
        <LoadingNodeSplash />
      </ToastProvider>
    );
  }

  if (nodeStatus === "offline") {
    return (
      <ToastProvider>
        <SetupView />
      </ToastProvider>
    );
  }

  return (
    <ToastProvider>
      <div className="app">
        <ErrorBoundary>
          <Header
            currentView={currentView}
            onNavigate={(v) => {
              setCurrentView(v);
              if (v === "chat") setChatPanelMode("threads");
              if (v === "contacts") setContactsPanelMode("list");
            }}
            inboxActivityCount={inboxActivityCount}
            bondsCount={bonds.length}
            isPublicNetwork={isPublicNetwork}
            connectionStatus={connectionStatus}
            nodeStatus={nodeStatus}
            humanProfile={humanProfile}
            peerId={peerId}
            relayUnreachable={isRelayUnreachable}
            onRetryConnect={handleRetryConnect}
          />
        </ErrorBoundary>

        <ErrorBoundary>
          <main className="main">
            {currentView === "chat" && (
              <ChatView
                selectedContact={chatSelectedContact}
                onSelectedContactChange={setChatSelectedContact}
                panelMode={chatPanelMode}
                onPanelModeChange={setChatPanelMode}
                inboxActivityCount={inboxActivityCount}
              />
            )}
            {currentView === "contacts" && (
              <ContactsView
                panelMode={contactsPanelMode}
                onPanelModeChange={setContactsPanelMode}
                onOpenChat={(peerOwnerId) => {
                  setChatSelectedContact(peerOwnerId);
                  setCurrentView("chat");
                  setChatPanelMode("threads");
                }}
              />
            )}
            {currentView === "library" && <LibraryView />}
            {currentView === "profile" && <ProfileView />}
            {currentView === "settings" && <SettingsView />}
          </main>
        </ErrorBoundary>
      </div>
    </ToastProvider>
  );
}

export { App as default };
