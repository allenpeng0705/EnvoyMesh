import { useEffect, useRef, useState } from "react";
import { useNodeState } from "./context/NodeStateContext.js";
import { useT } from "./context/I18nContext.js";
import { useContentEngageNotifications, useFeedNotifications, useNodeService } from "./hooks/useNodeService.js";
import { useInboxActivityCount } from "./hooks/useInboxActivityCount.js";
import { ToastProvider } from "./hooks/useToast.js";
import { ErrorBoundary } from "./components/ErrorBoundary.js";
import { Header } from "./components/Header.js";
import { PairingQRModal } from "./components/PairingQRModal.js";
import { EnvoyLocalAutoProvisionDialog } from "./components/EnvoyLocalAutoProvisionDialog.js";
import { SwipeBack } from "./components/SwipeBack.js";
import { SetupView } from "./components/views/SetupView.js";
import { ChatView } from "./components/views/ChatView.js";
import { DiscoverView } from "./components/views/DiscoverView.js";
import { ProfileView } from "./components/views/ProfileView.js";
import { SettingsView, type SettingsTabId } from "./components/views/SettingsView.js";
import { ContentView, type ContentTab } from "./components/views/ContentView.js";
import { H2AChannelView } from "./components/views/H2AChannelView.js";
import { ChainsView } from "./components/views/ChainsView.js";
import { AutoReplyPausedNotifier } from "./components/AutoReplyPausedNotifier.js";
import { GettingStartedGuide } from "./components/GettingStartedGuide.js";
import { CallSessionProvider } from "./context/CallSessionContext.js";
import {
  getTauriOpenclawHealStatus,
  isTauriShell,
  restartTauriNodeProcess,
  type OpenclawHealStatus,
} from "./lib/tauri-shell.js";
import {
  getEnvoyAiInflight,
  subscribeEnvoyAiInflight,
} from "./lib/envoy-ai-inflight.js";
import {
  isFirstRunSetupComplete,
  hasCompletedFirstRunSetup,
  hasSeenGettingStartedGuide,
  markGettingStartedGuideSeen,
  normalizeLoopbackWsUrl,
} from "./lib/storage.js";
import { resolveDevLoopbackWsUrlHeal } from "./lib/discover-local-node.js";
import { WS_LOOPBACK_URL, ENVOY_AI_THREAD_KEY } from "@envoymesh/api";
import type { HumanProfile, NodeConfig, NodeStatus } from "@envoymesh/api";

export type ViewName = "chat" | "assistant" | "pi" | "discover" | "content" | "chains" | "profile" | "settings";

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

/**
 * One-shot probe of the install-time OpenClaw self-reference heal
 * status. Returns null when not running inside the Tauri shell, or
 * when the IPC fails (caller renders nothing in that case — not a
 * diagnostic we want to nag about). We deliberately do not retry on
 * failure: the report is immutable for the lifetime of the app, so
 * polling would only ever log the same answer.
 */
function useOpenclawHealStatus(active: boolean): OpenclawHealStatus | null {
  const [status, setStatus] = useState<OpenclawHealStatus | null>(null);
  useEffect(() => {
    if (!active) {
      setStatus(null);
      return;
    }
    let cancelled = false;
    void getTauriOpenclawHealStatus().then((s) => {
      if (!cancelled) setStatus(s);
    });
    return () => {
      cancelled = true;
    };
  }, [active]);
  return status;
}

/**
 * Inline chip rendered in the splash when the OpenClaw self-reference
 * probe ran and the outcome is actionable (`healed` or `heal-failed`).
 * `healthy` and `no-bundle` are silent — those are normal operation.
 */
function OpenclawHealChip({
  status,
}: {
  status: OpenclawHealStatus | null;
}) {
  if (!status) return null;
  if (status.state === "healthy" || status.state === "no-bundle") return null;
  if (status.state === "healed") {
    return (
      <p className="envoy-splash__openclaw-chip envoy-splash__openclaw-chip--ok">
        ✓ OpenClaw gateway: self-reference was repaired at launch
      </p>
    );
  }
  if (status.state === "heal-failed") {
    return (
      <p className="envoy-splash__openclaw-chip envoy-splash__openclaw-chip--err">
        ⚠ OpenClaw gateway may not start: {status.message}
      </p>
    );
  }
  return null;
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
  const openclawHeal = useOpenclawHealStatus(Boolean(tauriShell && nodeBootstrapping));
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
          {tauriShell && nodeBootstrapping && reconnectAttempts === 0 ? (
            <OpenclawHealChip status={openclawHeal} />
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
    setAppSettings,
    bonds,
  } = useNodeState();

  const inboxActivityCount = useInboxActivityCount();
  const contentEngage = useContentEngageNotifications();
  const feedNotify = useFeedNotifications();
  const [currentView, setCurrentView] = useState<ViewName>("chat");
  // Keep Envoy AI mounted (hidden) while a turn is in flight so leaving the
  // page does not tear down the wait / chat:message handlers mid-reply.
  const [envoyAiInflight, setEnvoyAiInflightState] = useState(getEnvoyAiInflight);
  useEffect(() => subscribeEnvoyAiInflight(() => setEnvoyAiInflightState(getEnvoyAiInflight())), []);
  // While Content → Feed/Blog is open, don't badge Like/Comment for that surface.
  const [contentSurface, setContentSurface] = useState<ContentTab>("feed");
  const viewingContentFeed = currentView === "content" && contentSurface === "feed";
  const viewingContentBlog = currentView === "content" && contentSurface === "blog";
  const visibleEngageCount =
    contentEngage.totalCount -
    (viewingContentFeed ? contentEngage.feedCount : 0) -
    (viewingContentBlog ? contentEngage.blogCount : 0);
  // While on Feed, hide peer-post notify badges too (don't auto-mark them read).
  const visibleFeedNotifyCount = viewingContentFeed ? 0 : feedNotify.unread.length;
  const contentBadgeCount = visibleEngageCount + visibleFeedNotifyCount;
  // Engage count only for auto-dismiss while viewing (must not include feed.notify).
  const feedTabEngageCount = contentEngage.feedCount;

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

  // Vite DEV: if localStorage still points at a dead alt port (e.g. 4030) but
  // `npm run node:dev` is on 3030, auto-switch so the splash is not bricked.
  useEffect(() => {
    if (!import.meta.env.DEV || isConnected || !isLocalWs || tauriShell) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        const healed = await resolveDevLoopbackWsUrlHeal(appSettings.wsUrl);
        if (cancelled || !healed) return;
        const next = normalizeLoopbackWsUrl(healed);
        if (next === normalizeLoopbackWsUrl(appSettings.wsUrl)) return;
        console.info(`[App] Dev node discover: switching wsUrl ${appSettings.wsUrl} → ${next}`);
        setAppSettings({ ...appSettings, wsUrl: next });
      })();
    }, 800);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    appSettings,
    isConnected,
    isLocalWs,
    setAppSettings,
    tauriShell,
    reconnectAttempts,
    lastError,
  ]);

  const handleRetryConnect = () => {
    if (import.meta.env.DEV && isLocalWs && !tauriShell) {
      void (async () => {
        const healed = await resolveDevLoopbackWsUrlHeal(appSettings.wsUrl);
        if (healed) {
          const next = normalizeLoopbackWsUrl(healed);
          if (next !== normalizeLoopbackWsUrl(appSettings.wsUrl)) {
            setAppSettings({ ...appSettings, wsUrl: next });
            return;
          }
        }
        void nodeService.reconnect();
      })();
      return;
    }
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

  const [settingsTab, setSettingsTab] = useState<SettingsTabId>("account");
  const [chatSelectedContact, setChatSelectedContact] = useState<string | null>(null);
  const [chatPanelMode, setChatPanelMode] = useState<ChatPanelMode>("threads");
  const oldAssistantVisible = currentView === "assistant";
  const keepAssistantMounted = oldAssistantVisible || envoyAiInflight;

  // Navigation handler. Legacy "pi" view → Terminals (Pi TUI).
  // "assistant" now routes to ChatView with ENVOY_AI_THREAD_KEY instead of
  // the separate H2AChannelView page.
  const navigateTo = (view: ViewName) => {
    if (view === "pi") {
      setCurrentView("chat");
      setChatPanelMode("terminals");
      return;
    }
    if (view === "assistant") {
      setCurrentView("chat");
      setChatPanelMode("threads");
      setChatSelectedContact(ENVOY_AI_THREAD_KEY);
      return;
    }
    setCurrentView(view);
    if (view === "chat") {
      setChatPanelMode("threads");
      setChatSelectedContact(null);
    }
  };

  useEffect(() => {
    const onOpenBrowser = () => {
      navigateTo("content");
    };
    const onOpenInbox = () => {
      setCurrentView("chat");
      setChatPanelMode("inbox");
    };
    window.addEventListener("envoymesh:open-browser", onOpenBrowser);
    window.addEventListener("envoymesh:open-inbox", onOpenInbox);
    return () => {
      window.removeEventListener("envoymesh:open-browser", onOpenBrowser);
      window.removeEventListener("envoymesh:open-inbox", onOpenInbox);
    };
  }, []);

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
            onNavigate={navigateTo}
            inboxActivityCount={inboxActivityCount}
            contentEngageCount={contentBadgeCount}
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
                onOpenAssistant={() => navigateTo("assistant")}
                onOpenDiscover={() => navigateTo("discover")}
                onOpenActivity={() => {
                  setSettingsTab("app");
                  navigateTo("settings");
                }}
                onOpenInbox={() => {
                  setChatPanelMode("inbox");
                }}
                onOpenChains={() => navigateTo("chains")}
                onOpenSettingsAi={() => {
                  setSettingsTab("ai");
                  navigateTo("settings");
                }}
              />
            )}
            {keepAssistantMounted && (
              <div
                className="main-view-slot"
                hidden={!oldAssistantVisible}
                aria-hidden={!oldAssistantVisible}
              >
                <SwipeBack onSwipeBack={() => navigateTo("chat")}>
                  <H2AChannelView
                    onBackToChats={() => navigateTo("chat")}
                    onOpenActivity={() => {
                      setSettingsTab("app");
                      navigateTo("settings");
                    }}
                    onOpenInbox={() => {
                      navigateTo("chat");
                      setChatPanelMode("inbox");
                    }}
                    onOpenChains={() => navigateTo("chains")}
                    onOpenDiscover={() => navigateTo("discover")}
                    onOpenSettingsAi={() => {
                      setSettingsTab("ai");
                      navigateTo("settings");
                    }}
                  />
                </SwipeBack>
              </div>
            )}
            {currentView === "discover" && (
              <SwipeBack onSwipeBack={() => navigateTo("chat")}>
                <DiscoverView />
              </SwipeBack>
            )}
            {currentView === "content" && (
              <SwipeBack onSwipeBack={() => navigateTo("chat")}>
                <ContentView
                  feedEngageCount={feedTabEngageCount}
                  feedNotifyCount={visibleFeedNotifyCount}
                  blogEngageCount={contentEngage.blogCount}
                  onActiveSurfaceChange={setContentSurface}
                  onDismissEngage={async (surface, options) => {
                    await contentEngage.dismiss(surface);
                    if (
                      options?.feedNotify &&
                      (surface === "all" || surface === "feed")
                    ) {
                      await feedNotify.dismissAll();
                    }
                  }}
                />
              </SwipeBack>
            )}
            {currentView === "chains" && (
              <SwipeBack onSwipeBack={() => navigateTo("chat")}>
                <ChainsView
                  onBack={() => navigateTo("chat")}
                  onOpenDiscover={() => navigateTo("discover")}
                />
              </SwipeBack>
            )}
            {currentView === "profile" && (
              <SwipeBack onSwipeBack={() => navigateTo("chat")}>
                <ProfileView />
              </SwipeBack>
            )}
            {currentView === "settings" && (
              <SwipeBack onSwipeBack={() => navigateTo("chat")}>
                <SettingsView tab={settingsTab} onTabChange={setSettingsTab} />
              </SwipeBack>
            )}
          </main>
        </ErrorBoundary>
        {pairingOpen && <PairingQRModal onClose={() => setPairingOpen(false)} />}
        <EnvoyLocalAutoProvisionDialog
          onOpenSettingsAi={() => {
            setSettingsTab("ai");
            navigateTo("settings");
          }}
        />
        {guideOpen && (
          <GettingStartedGuide
            onClose={() => setGuideOpen(false)}
            onNavigate={navigateTo}
          />
        )}
      </div>
      </CallSessionProvider>
    </ToastProvider>
  );
}

export { App as default };
