import { useState } from "react";
import { useNodeState } from "./context/NodeStateContext.js";
import { useT } from "./context/I18nContext.js";
import { useNodeService } from "./hooks/useNodeService.js";
import { useInboxActivityCount } from "./hooks/useInboxActivityCount.js";
import { ToastProvider } from "./hooks/useToast.js";
import { ErrorBoundary } from "./components/ErrorBoundary.js";
import { Header } from "./components/Header.js";
import { SwipeBack } from "./components/SwipeBack.js";
import { SetupView } from "./components/views/SetupView.js";
import { ChatView } from "./components/views/ChatView.js";
import { DiscoverView } from "./components/views/DiscoverView.js";
import { ProfileView } from "./components/views/ProfileView.js";
import { SettingsView, type SettingsTabId } from "./components/views/SettingsView.js";
import { LibraryView } from "./components/views/LibraryView.js";
import { H2AChannelView } from "./components/views/H2AChannelView.js";
import { AutoReplyPausedNotifier } from "./components/AutoReplyPausedNotifier.js";
import { isTauriShell, restartTauriNodeProcess } from "./lib/tauri-shell.js";

export type ViewName = "chat" | "assistant" | "discover" | "library" | "profile" | "settings";

export type ChatPanelMode = "threads" | "inbox" | "terminals";

function ConnectingSplash({
  reconnectAttempts,
  lastError,
  isRelayUnreachable,
  onRetryConnect,
  onRestartNode,
  restartNodeBusy,
  restartNodeError,
  tauriShell,
  autoConnect,
  wsUrl,
}: {
  reconnectAttempts: number;
  lastError: string | null;
  isRelayUnreachable: boolean;
  onRetryConnect: () => void;
  onRestartNode?: () => void;
  restartNodeBusy?: boolean;
  restartNodeError?: string | null;
  tauriShell?: boolean;
  autoConnect: boolean;
  wsUrl: string;
}) {
  const t = useT();
  return (
    <div className="app">
      <div className="envoy-splash" role="status" aria-live="polite">
        <div className="envoy-splash__backdrop" aria-hidden />
        <div className="envoy-splash__card">
          <div className="envoy-splash__mesh" aria-hidden />
          <div className="loading-spinner envoy-splash__spinner" />
          <h2 className="envoy-splash__title">{t("splash.connectingTitle")}</h2>
          <p className="envoy-splash__detail">
            {!autoConnect && reconnectAttempts === 0
              ? t("splash.autoConnectOff")
              : reconnectAttempts > 0
                ? t("splash.reconnectAttempt", { count: reconnectAttempts })
                : t("splash.openingChannel", { wsUrl })}
          </p>
          {isRelayUnreachable && (
            <p className="envoy-splash__relay-warn">{t("splash.relayWarn")}</p>
          )}
          {tauriShell && restartNodeError && (
            <p className="envoy-splash__relay-warn">{restartNodeError}</p>
          )}
          {tauriShell && (
            <div className="envoy-splash__actions">
              {onRestartNode && (
                <button
                  type="button"
                  className="primary envoy-splash__retry"
                  onClick={onRestartNode}
                  disabled={restartNodeBusy}
                >
                  {restartNodeBusy ? t("splash.restartingNode") : t("splash.restartNode")}
                </button>
              )}
            </div>
          )}
          {(isRelayUnreachable || lastError || !autoConnect) && (
            <div className="envoy-splash__error">
              <p>
                {lastError ??
                  (!autoConnect ? t("splash.notConnected") : t("splash.unableConnect"))}
              </p>
              <p className="envoy-splash__hint">
                {tauriShell ? t("splash.tauriHint") : t("splash.devHint")}
              </p>
              {restartNodeError && (
                <p className="envoy-splash__relay-warn">{restartNodeError}</p>
              )}
              <div className="envoy-splash__actions">
                <button
                  type="button"
                  className="primary envoy-splash__retry"
                  onClick={onRetryConnect}
                  disabled={restartNodeBusy}
                >
                  {t("splash.retryConnection")}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function LoadingNodeSplash() {
  const t = useT();
  return (
    <div className="app">
      <div className="envoy-splash envoy-splash--compact" role="status" aria-live="polite">
        <div className="envoy-splash__backdrop" aria-hidden />
        <div className="envoy-splash__card">
          <div className="loading-spinner envoy-splash__spinner" />
          <h2 className="envoy-splash__title">{t("splash.syncingTitle")}</h2>
          <p className="envoy-splash__detail">{t("splash.syncingDetail")}</p>
        </div>
      </div>
    </div>
  );
}

export function App() {
  const t = useT();
  const {
    isConnected,
    nodeStatusHydrated,
    nodeStatus,
    peerId,
    nodeConfig,
    humanProfile,
    connectionStatus,
    appSettings,
  } = useNodeState();

  const inboxActivityCount = useInboxActivityCount();

  const nodeService = useNodeService();
  const reconnectAttempts = nodeService.reconnectAttempts;
  const lastError = (nodeService as unknown as { getLastError?(): string | null }).getLastError?.() ?? null;
  const tauriShell = isTauriShell();
  const [restartNodeBusy, setRestartNodeBusy] = useState(false);
  const [restartNodeError, setRestartNodeError] = useState<string | null>(null);
  const isRelayUnreachable =
    reconnectAttempts > 3 ||
    (lastError?.includes("Connection timed out") ||
      lastError?.includes("ECONNREFUSED") ||
      lastError?.includes("WebSocket connection closed") ||
      false);

  const handleRetryConnect = () => {
    void nodeService.reconnect();
  };

  const handleRestartNode = async () => {
    if (!tauriShell) {
      return;
    }
    setRestartNodeBusy(true);
    setRestartNodeError(null);
    try {
      const result = await restartTauriNodeProcess();
      if (!result.ok) {
        setRestartNodeError(result.reason === "not-tauri" ? t("splash.notDesktopApp") : result.reason);
        return;
      }
      await nodeService.waitForConnection(25_000);
      await nodeService.reconnect();
    } catch (error) {
      setRestartNodeError(error instanceof Error ? error.message : String(error));
    } finally {
      setRestartNodeBusy(false);
    }
  };

  const [currentView, setCurrentView] = useState<ViewName>("chat");
  const [settingsTab, setSettingsTab] = useState<SettingsTabId>("account");
  const [chatSelectedContact, setChatSelectedContact] = useState<string | null>(null);
  const [chatPanelMode, setChatPanelMode] = useState<ChatPanelMode>("threads");

  const isPublicNetwork = (nodeConfig?.bootstrapPresets ?? []).length > 0;

  if (!isConnected) {
    return (
      <ToastProvider>
        <ConnectingSplash
          reconnectAttempts={reconnectAttempts}
          lastError={lastError}
          isRelayUnreachable={isRelayUnreachable}
          onRetryConnect={handleRetryConnect}
          onRestartNode={tauriShell ? () => void handleRestartNode() : undefined}
          restartNodeBusy={restartNodeBusy}
          restartNodeError={restartNodeError}
          tauriShell={tauriShell}
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
        <AutoReplyPausedNotifier />
        <ErrorBoundary>
          <Header
            currentView={currentView}
            onNavigate={(v) => {
              setCurrentView(v);
              if (v === "chat") setChatPanelMode("threads");
            }}
            inboxActivityCount={inboxActivityCount}
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
                onOpenDiscover={() => setCurrentView("discover")}
              />
            )}
            {currentView === "assistant" && (
              <SwipeBack onSwipeBack={() => setCurrentView("chat")}>
                <H2AChannelView
                  onBackToChats={() => setCurrentView("chat")}
                  onOpenActivity={() => {
                    setSettingsTab("activity");
                    setCurrentView("settings");
                  }}
                  onOpenInbox={() => {
                    setCurrentView("chat");
                    setChatPanelMode("inbox");
                  }}
                />
              </SwipeBack>
            )}
            {currentView === "discover" && (
              <SwipeBack onSwipeBack={() => setCurrentView("chat")}>
                <DiscoverView />
              </SwipeBack>
            )}
            {currentView === "library" && (
              <SwipeBack onSwipeBack={() => setCurrentView("chat")}>
                <LibraryView />
              </SwipeBack>
            )}
            {currentView === "profile" && (
              <SwipeBack onSwipeBack={() => setCurrentView("chat")}>
                <ProfileView />
              </SwipeBack>
            )}
            {currentView === "settings" && (
              <SwipeBack onSwipeBack={() => setCurrentView("chat")}>
                <SettingsView tab={settingsTab} onTabChange={setSettingsTab} />
              </SwipeBack>
            )}
          </main>
        </ErrorBoundary>
      </div>
    </ToastProvider>
  );
}

export { App as default };
