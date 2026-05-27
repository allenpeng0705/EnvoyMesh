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
import { ActivityView } from "./components/views/ActivityView.js";
import { H2AChannelView } from "./components/views/H2AChannelView.js";

export type ViewName = "chat" | "assistant" | "contacts" | "library" | "activity" | "profile" | "settings";

export type ChatPanelMode = "threads" | "inbox";

export type ContactsPanelMode = "list" | "discover";

function ConnectingSplash({
  reconnectAttempts,
  lastError,
  isRelayUnreachable,
  onRetryConnect,
  autoConnect,
  wsUrl,
}: {
  reconnectAttempts: number;
  lastError: string | null;
  isRelayUnreachable: boolean;
  onRetryConnect: () => void;
  autoConnect: boolean;
  wsUrl: string;
}) {
  return (
    <div className="app">
      <div className="envoy-splash" role="status" aria-live="polite">
        <div className="envoy-splash__backdrop" aria-hidden />
        <div className="envoy-splash__card">
          <div className="envoy-splash__mesh" aria-hidden />
          <div className="loading-spinner envoy-splash__spinner" />
          <h2 className="envoy-splash__title">Connecting to EnvoyMesh</h2>
          <p className="envoy-splash__detail">
            {!autoConnect && reconnectAttempts === 0
              ? "Auto-connect is off. Use Retry when you are ready."
              : reconnectAttempts > 0
                ? `Reconnect attempt ${reconnectAttempts}\u2026`
                : `Opening node channel at ${wsUrl}`}
          </p>
          {isRelayUnreachable && (
            <p className="envoy-splash__relay-warn">Relay may be unreachable — check network or relay URL.</p>
          )}
          {(isRelayUnreachable || lastError || !autoConnect) && (
            <div className="envoy-splash__error">
              <p>
                {lastError ??
                  (!autoConnect
                    ? "Not connected to the node backend."
                    : "Unable to connect. Is the node running?")}
              </p>
              <p className="envoy-splash__hint">
                Desktop: start with <code>npm run node:dev</code> (WebSocket port 3030).
              </p>
              <button type="button" className="primary envoy-splash__retry" onClick={onRetryConnect}>
                Retry connection
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
      <div className="envoy-splash envoy-splash--compact" role="status" aria-live="polite">
        <div className="envoy-splash__backdrop" aria-hidden />
        <div className="envoy-splash__card">
          <div className="loading-spinner envoy-splash__spinner" />
          <h2 className="envoy-splash__title">Syncing node</h2>
          <p className="envoy-splash__detail">Connected to API — loading mesh status…</p>
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
    appSettings,
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
          autoConnect={appSettings.autoConnect}
          wsUrl={appSettings.wsUrl.trim() || "ws://localhost:3030/ws"}
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
                onOpenAssistant={() => setCurrentView("assistant")}
              />
            )}
            {currentView === "assistant" && (
              <H2AChannelView
                onOpenActivity={() => setCurrentView("activity")}
                onOpenInbox={() => {
                  setCurrentView("chat");
                  setChatPanelMode("inbox");
                }}
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
            {currentView === "activity" && <ActivityView />}
            {currentView === "profile" && <ProfileView />}
            {currentView === "settings" && <SettingsView />}
          </main>
        </ErrorBoundary>
      </div>
    </ToastProvider>
  );
}

export { App as default };
