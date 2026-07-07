import { useEffect, useRef, useState } from "react";
import { useNodeState } from "./context/NodeStateContext.js";
import { useT } from "./context/I18nContext.js";
import { useNodeService } from "./hooks/useNodeService.js";
import { useInboxActivityCount } from "./hooks/useInboxActivityCount.js";
import { ToastProvider } from "./hooks/useToast.js";
import { ErrorBoundary } from "./components/ErrorBoundary.js";
import { Header } from "./components/Header.js";
import { PairingQRModal } from "./components/PairingQRModal.js";
import { SwipeBack } from "./components/SwipeBack.js";
import { SetupView } from "./components/views/SetupView.js";
import { ChatView } from "./components/views/ChatView.js";
import { DiscoverView } from "./components/views/DiscoverView.js";
import { ProfileView } from "./components/views/ProfileView.js";
import { SettingsView, type SettingsTabId } from "./components/views/SettingsView.js";
import { LibraryView } from "./components/views/LibraryView.js";
import { H2AChannelView } from "./components/views/H2AChannelView.js";
import { ChainsView } from "./components/views/ChainsView.js";
import { AutoReplyPausedNotifier } from "./components/AutoReplyPausedNotifier.js";
import { GettingStartedGuide } from "./components/GettingStartedGuide.js";
import { CallSessionProvider } from "./context/CallSessionContext.js";
import { isTauriShell, restartTauriNodeProcess } from "./lib/tauri-shell.js";
import {
  isFirstRunSetupComplete,
  hasCompletedFirstRunSetup,
  hasSeenGettingStartedGuide,
  markGettingStartedGuideSeen,
} from "./lib/storage.js";
import { WS_LOOPBACK_URL } from "@envoymesh/api";
import type { HumanProfile, NodeConfig, NodeStatus } from "@envoymesh/api";

export type ViewName = "chat" | "assistant" | "discover" | "library" | "chains" | "profile" | "settings";

export type ChatPanelMode = "threads" | "inbox" | "terminals";

type TauriBootstrapPhase = "node" | "gateway" | "slow";

function useTauriBootstrapPhase(active: boolean): TauriBootstrapPhase {
  const [phase, setPhase] = useState<TauriBootstrapPhase>("node");
  useEffect(() => {
    if (!active) {
      setPhase("node");
      return;
    }
    setPhase("node");
    const gatewayTimer = window.setTimeout(() => setPhase("gateway"), 12_000);
    const slowTimer = window.setTimeout(() => setPhase("slow"), 45_000);
    return () => {
      window.clearTimeout(gatewayTimer);
      window.clearTimeout(slowTimer);
    };
  }, [active]);
  return phase;
}

function needsFirstRunSetup(
  _nodeStatus: NodeStatus,
  humanProfile: HumanProfile | null,
  nodeConfig: NodeConfig | null,
): boolean {
  if (nodeConfig?.nodeInitialized === false) return true;
  const displayName = humanProfile?.displayName?.trim();
  const username = humanProfile?.username?.trim();
  if (displayName && username) return false;
  // node-config.json exists but profile RPC is still loading after reconnect — avoid wizard flash.
  if (nodeConfig?.nodeInitialized === true && isFirstRunSetupComplete(humanProfile?.ownerId)) {
    return false;
  }
  return !displayName || !username;
}

/** First-run desktop: show the setup wizard while the home node is still starting. */
function shouldShowSetupWhileConnecting(
  tauriShell: boolean,
  isConnected: boolean,
  nodeConfig: NodeConfig | null,
  humanProfile: HumanProfile | null,
): boolean {
  if (!tauriShell || isConnected) return false;
  if (nodeConfig?.nodeInitialized === false) return true;
  if (nodeConfig?.nodeInitialized === true) return false;
  const displayName = humanProfile?.displayName?.trim();
  const username = humanProfile?.username?.trim();
  if (displayName && username) return false;
  return !hasCompletedFirstRunSetup();
}

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
  nodeBootstrapping,
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
  nodeBootstrapping?: boolean;
}) {
  const t = useT();
  const bootstrapPhase = useTauriBootstrapPhase(Boolean(tauriShell && nodeBootstrapping));
  const bootstrapDetail =
    bootstrapPhase === "slow"
      ? t("splash.startingNodeSlow")
      : bootstrapPhase === "gateway"
        ? t("splash.startingGateway")
        : t("splash.startingNode");
  return (
    <div className="app">
      <div className="envoy-splash" role="status" aria-live="polite">
        <div className="envoy-splash__backdrop" aria-hidden />
        <div className="envoy-splash__card">
          <div className="envoy-splash__mesh" aria-hidden />
          <div className="loading-spinner envoy-splash__spinner" />
          <h2 className="envoy-splash__title">{t("splash.connectingTitle")}</h2>
          <p className="envoy-splash__detail">
            {tauriShell && nodeBootstrapping && reconnectAttempts === 0
              ? bootstrapDetail
              : !autoConnect && reconnectAttempts === 0
                ? t("splash.autoConnectOff")
                : reconnectAttempts > 0
                  ? t("splash.reconnectAttempt", { count: reconnectAttempts })
                  : t("splash.openingChannel", { wsUrl })}
          </p>
          {tauriShell && nodeBootstrapping && reconnectAttempts === 0 ? (
            <p className="envoy-splash__hint">{t("splash.firstLaunchHint")}</p>
          ) : null}
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
          {(isRelayUnreachable || lastError || !autoConnect) &&
          !(tauriShell && nodeBootstrapping && reconnectAttempts < 3) ? (
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
          ) : null}
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
    bonds,
  } = useNodeState();

  const inboxActivityCount = useInboxActivityCount();

  const nodeService = useNodeService();
  const reconnectAttempts = nodeService.reconnectAttempts;
  const lastError = (nodeService as unknown as { getLastError?(): string | null }).getLastError?.() ?? null;
  const tauriShell = isTauriShell();
  const [restartNodeBusy, setRestartNodeBusy] = useState(false);
  const [restartNodeError, setRestartNodeError] = useState<string | null>(null);
  const [nodeBootstrapping, setNodeBootstrapping] = useState(() => isTauriShell());
  const tauriBootstrapStarted = useRef(false);

  useEffect(() => {
    if (!tauriShell || isConnected) {
      setNodeBootstrapping(false);
      return;
    }
    if (tauriBootstrapStarted.current) {
      return;
    }
    tauriBootstrapStarted.current = true;
    let cancelled = false;
    void (async () => {
      try {
        await nodeService.waitForConnection(120_000);
        if (!cancelled) {
          await nodeService.reconnect();
        }
      } catch {
        if (cancelled) return;
        try {
          const result = await restartTauriNodeProcess();
          if (result.ok) {
            await nodeService.waitForConnection(120_000);
            await nodeService.reconnect();
          }
        } catch (error) {
          console.error("[App] Tauri home node bootstrap failed:", error);
        }
      } finally {
        if (!cancelled) {
          setNodeBootstrapping(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tauriShell, isConnected, nodeService]);
  const isLocalWs = /^ws:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//i.test(
    appSettings.wsUrl.trim() || WS_LOOPBACK_URL,
  );
  const isRelayUnreachable =
    !isLocalWs &&
    (reconnectAttempts > 3 ||
      (lastError?.includes("Connection timed out") ||
        lastError?.includes("ECONNREFUSED") ||
        lastError?.includes("WebSocket connection closed") ||
        false));

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
  const didInitialNav = useRef(false);

  // Cold-start: land 0-bond users on Discover (not Chat) so they SEE the
  // auto-search results + auto-hello. Only fires once per session — after
  // this the user's manual navigation is respected.
  useEffect(() => {
    if (didInitialNav.current) return;
    if (!nodeStatusHydrated) return;
    // Only redirect when the user truly has zero contacts. Once they have
    // even one bond (including the sponsor friend), respect the "chat" default.
    if (bonds.length === 0) {
      setCurrentView("discover");
    }
    didInitialNav.current = true;
  }, [nodeStatusHydrated, bonds.length]);
  const [chatSelectedContact, setChatSelectedContact] = useState<string | null>(null);
  const [chatPanelMode, setChatPanelMode] = useState<ChatPanelMode>("threads");
  const [pairingOpen, setPairingOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);

  // Capture whether setup was already complete WHEN THE APP LOADED — before
  // the setup wizard runs. This distinguishes "first launch" (setup not yet
  // complete at boot) from "return visit" (setup was already done). Used to
  // suppress the guide modal on the very first launch.
  const setupWasCompleteAtBoot = useRef(hasCompletedFirstRunSetup());

  // Auto-open the getting-started guide on the SECOND launch (not the first).
  // On first launch the user just finished setup + lands on Discover — stacking
  // a modal on top would be overwhelming. The guide opens on their next session,
  // and is re-openable any time via the Header Help (?) button.
  useEffect(() => {
    const ownerId = humanProfile?.ownerId;
    if (!ownerId) return;
    if (hasSeenGettingStartedGuide(ownerId)) return;
    // Only auto-open if setup was already completed before this app session
    // started (i.e. this is a return visit, not the first run just finished).
    if (setupWasCompleteAtBoot.current) {
      setGuideOpen(true);
      markGettingStartedGuideSeen(ownerId);
    }
  }, [humanProfile?.ownerId]);

  const isPublicNetwork = (nodeConfig?.bootstrapPresets ?? []).length > 0;

  if (!isConnected && shouldShowSetupWhileConnecting(tauriShell, isConnected, nodeConfig, humanProfile)) {
    return (
      <ToastProvider>
        <SetupView waitingForNode />
      </ToastProvider>
    );
  }

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
          wsUrl={appSettings.wsUrl.trim() || WS_LOOPBACK_URL}
          nodeBootstrapping={nodeBootstrapping}
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

  if (needsFirstRunSetup(nodeStatus, humanProfile, nodeConfig)) {
    return (
      <ToastProvider>
        <SetupView />
      </ToastProvider>
    );
  }

  return (
    <ToastProvider>
      <CallSessionProvider>
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
            onOpenPairing={() => setPairingOpen(true)}
            onOpenGuide={() => setGuideOpen(true)}
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
                    setSettingsTab("app");
                    setCurrentView("settings");
                  }}
                  onOpenInbox={() => {
                    setCurrentView("chat");
                    setChatPanelMode("inbox");
                  }}
                  onOpenChains={() => setCurrentView("chains")}
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
            {currentView === "chains" && (
              <SwipeBack onSwipeBack={() => setCurrentView("chat")}>
                <ChainsView onBack={() => setCurrentView("chat")} />
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
        {pairingOpen && <PairingQRModal onClose={() => setPairingOpen(false)} />}
        {guideOpen && (
          <GettingStartedGuide
            onClose={() => setGuideOpen(false)}
            onNavigate={(v) => {
              setCurrentView(v);
              if (v === "chat") setChatPanelMode("threads");
            }}
          />
        )}
      </div>
      </CallSessionProvider>
    </ToastProvider>
  );
}

export { App as default };
