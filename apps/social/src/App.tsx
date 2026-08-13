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
import { ProfileView } from "./components/views/ProfileView.js";
import { SettingsView, type SettingsTabId } from "./components/views/SettingsView.js";
import { SocialView, type SocialTab } from "./components/views/SocialView.js";
import { TerminalView } from "./components/views/TerminalView.js";
import { KnowledgeView, type KnowledgeHubPanel } from "./components/views/KnowledgeView.js";
import { H2AChannelView } from "./components/views/H2AChannelView.js";
import { ChainsView } from "./components/views/ChainsView.js";
import { AutoReplyPausedNotifier } from "./components/AutoReplyPausedNotifier.js";
import {
  GettingStartedGuide,
  type GuideDestination,
} from "./components/GettingStartedGuide.js";
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
  OPEN_CONTENT_KNOWLEDGE_EVENT,
  normalizeKnowledgeHubPanel,
  type OpenContentKnowledgeDetail,
} from "./lib/content-knowledge-nav.js";
import { OPEN_ENVOY_AI_EVENT } from "./lib/open-envoy-ai-nav.js";
import { OPEN_TERMINAL_EVENT } from "./lib/open-terminal-nav.js";
import { hasPendingBrowserOpen } from "./lib/browser-nav.js";
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

/** Primary top views + legacy aliases remapped by navigateTo. */
export type ViewName =
  | "social"
  | "terminal"
  | "knowledge"
  | "chains"
  | "profile"
  | "settings"
  | "chat"
  | "assistant"
  | "pi"
  | "discover"
  | "content";

export type { SocialTab, KnowledgeHubPanel };
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
  const [currentView, setCurrentView] = useState<ViewName>("social");
  const [socialTab, setSocialTab] = useState<SocialTab>(() =>
    hasPendingBrowserOpen() ? "explore" : "chats",
  );
  const [knowledgePanel, setKnowledgePanel] = useState<KnowledgeHubPanel>("browse");
  const [inboxOpen, setInboxOpen] = useState(false);
  // Keep Envoy AI mounted (hidden) while a turn is in flight so leaving the
  // page does not tear down the wait / chat:message handlers mid-reply.
  const [envoyAiInflight, setEnvoyAiInflightState] = useState(getEnvoyAiInflight);
  useEffect(() => subscribeEnvoyAiInflight(() => setEnvoyAiInflightState(getEnvoyAiInflight())), []);
  // Settings / deep-link → top Knowledge.
  useEffect(() => {
    const goKnowledge = (ev: Event) => {
      const detail = (ev as CustomEvent<OpenContentKnowledgeDetail>).detail;
      setCurrentView("knowledge");
      if (detail?.panel) setKnowledgePanel(normalizeKnowledgeHubPanel(detail.panel));
    };
    window.addEventListener(OPEN_CONTENT_KNOWLEDGE_EVENT, goKnowledge);
    return () => window.removeEventListener(OPEN_CONTENT_KNOWLEDGE_EVENT, goKnowledge);
  }, []);
  // While Social → Feed/Blog is open, don't badge Like/Comment for that surface.
  const viewingSocialFeed = currentView === "social" && socialTab === "feed";
  const viewingSocialBlog = currentView === "social" && socialTab === "blog";
  const visibleEngageCount =
    contentEngage.totalCount -
    (viewingSocialFeed ? contentEngage.feedCount : 0) -
    (viewingSocialBlog ? contentEngage.blogCount : 0);
  // While on Feed, hide peer-post notify badges too (don't auto-mark them read).
  const visibleFeedNotifyCount = viewingSocialFeed ? 0 : feedNotify.unread.length;
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
  // Legacy H2A shell only when explicitly on "assistant" (navigateTo remaps that
  // away). Inflight keep-alive while NOT on Social — ChatView already keeps
  // AIChatPanel mounted during inflight turns when Social is visible.
  const oldAssistantVisible = currentView === "assistant";
  const keepAssistantMounted =
    oldAssistantVisible ||
    (envoyAiInflight &&
      currentView !== "social" &&
      currentView !== "chat" &&
      currentView !== "discover" &&
      currentView !== "content");

  // Navigation handler. Legacy aliases map onto the new IA.
  const navigateTo = (view: ViewName) => {
    if (view === "pi") {
      setCurrentView("terminal");
      return;
    }
    if (view === "assistant") {
      setCurrentView("social");
      setSocialTab("chats");
      setChatSelectedContact(ENVOY_AI_THREAD_KEY);
      return;
    }
    if (view === "chat") {
      setCurrentView("social");
      setSocialTab("chats");
      setChatSelectedContact(null);
      return;
    }
    if (view === "discover") {
      setCurrentView("social");
      setSocialTab("discover");
      return;
    }
    if (view === "content") {
      setCurrentView("social");
      setSocialTab("feed");
      return;
    }
    // Top Social: preserve Feed/Blog/Discover/Explore when re-clicking or returning from
    // Terminal/Knowledge. Default Chats only comes from initial state / chat alias.
    setCurrentView(view);
  };

  // Knowledge Ask → EnvoyAI chat thread.
  useEffect(() => {
    const goEnvoyAi = () => {
      setCurrentView("social");
      setSocialTab("chats");
      setChatSelectedContact(ENVOY_AI_THREAD_KEY);
    };
    window.addEventListener(OPEN_ENVOY_AI_EVENT, goEnvoyAi);
    return () => window.removeEventListener(OPEN_ENVOY_AI_EVENT, goEnvoyAi);
  }, []);

  useEffect(() => {
    const goTerminal = (_ev: Event) => {
      setCurrentView("terminal");
    };
    window.addEventListener(OPEN_TERMINAL_EVENT, goTerminal);
    return () => window.removeEventListener(OPEN_TERMINAL_EVENT, goTerminal);
  }, []);

  const navigateGuide = (dest: GuideDestination) => {
    switch (dest.kind) {
      case "view":
        navigateTo(dest.view);
        return;
      case "assistant":
        navigateTo("assistant");
        return;
      case "terminals":
        setCurrentView("terminal");
        return;
      case "content":
        navigateTo("social");
        setSocialTab("feed");
        return;
      case "settings":
        setSettingsTab(dest.tab);
        navigateTo("settings");
        return;
    }
  };

  useEffect(() => {
    const onOpenBrowser = () => {
      setCurrentView("social");
      setSocialTab("explore");
    };
    const onOpenInbox = () => {
      setInboxOpen(true);
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
            inboxOpen={inboxOpen}
            onInboxOpenChange={setInboxOpen}
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
            {(currentView === "social" ||
              currentView === "chat" ||
              currentView === "discover" ||
              currentView === "content") && (
              <SocialView
                activeTab={socialTab}
                onActiveTabChange={setSocialTab}
                feedEngageCount={feedTabEngageCount}
                feedNotifyCount={visibleFeedNotifyCount}
                blogEngageCount={contentEngage.blogCount}
                onDismissEngage={async (surface, options) => {
                  await contentEngage.dismiss(surface);
                  if (
                    options?.feedNotify &&
                    (surface === "all" || surface === "feed")
                  ) {
                    await feedNotify.dismissAll();
                  }
                }}
                chatProps={{
                  selectedContact: chatSelectedContact,
                  onSelectedContactChange: setChatSelectedContact,
                  onOpenAssistant: () => navigateTo("assistant"),
                  onOpenDiscover: () => {
                    setSocialTab("discover");
                  },
                  onOpenPi: () => setCurrentView("terminal"),
                  onOpenActivity: () => {
                    setSettingsTab("app");
                    navigateTo("settings");
                  },
                  onOpenInbox: () => setInboxOpen(true),
                  onOpenChains: () => navigateTo("chains"),
                  onOpenSettingsAi: () => {
                    setSettingsTab("ai");
                    navigateTo("settings");
                  },
                }}
              />
            )}
            {keepAssistantMounted && (
              <div
                className="main-view-slot"
                hidden={!oldAssistantVisible}
                aria-hidden={!oldAssistantVisible}
              >
                <SwipeBack onSwipeBack={() => navigateTo("social")}>
                  <H2AChannelView
                    onBackToChats={() => navigateTo("social")}
                    onOpenActivity={() => {
                      setSettingsTab("app");
                      navigateTo("settings");
                    }}
                    onOpenInbox={() => setInboxOpen(true)}
                    onOpenChains={() => navigateTo("chains")}
                    onOpenDiscover={() => {
                      setCurrentView("social");
                      setSocialTab("discover");
                    }}
                    onOpenSettingsAi={() => {
                      setSettingsTab("ai");
                      navigateTo("settings");
                    }}
                  />
                </SwipeBack>
              </div>
            )}
            {(currentView === "terminal" || currentView === "pi") && (
              <SwipeBack onSwipeBack={() => navigateTo("social")}>
                <TerminalView
                  active={currentView === "terminal" || currentView === "pi"}
                  onOpenAssistant={() => navigateTo("assistant")}
                />
              </SwipeBack>
            )}
            {currentView === "knowledge" && (
              <SwipeBack onSwipeBack={() => navigateTo("social")}>
                <KnowledgeView initialPanel={knowledgePanel} />
              </SwipeBack>
            )}
            {currentView === "chains" && (
              <SwipeBack onSwipeBack={() => navigateTo("social")}>
                <ChainsView
                  onBack={() => navigateTo("social")}
                  onOpenDiscover={() => {
                    setCurrentView("social");
                    setSocialTab("discover");
                  }}
                />
              </SwipeBack>
            )}
            {currentView === "profile" && (
              <SwipeBack onSwipeBack={() => navigateTo("social")}>
                <ProfileView />
              </SwipeBack>
            )}
            {currentView === "settings" && (
              <SwipeBack onSwipeBack={() => navigateTo("social")}>
                <SettingsView tab={settingsTab} onTabChange={setSettingsTab} />
              </SwipeBack>
            )}
          </main>
        </ErrorBoundary>        {pairingOpen && <PairingQRModal onClose={() => setPairingOpen(false)} />}
        <EnvoyLocalAutoProvisionDialog
          onOpenSettingsAi={() => {
            setSettingsTab("ai");
            navigateTo("settings");
          }}
        />
        {guideOpen && (
          <GettingStartedGuide
            onClose={() => setGuideOpen(false)}
            onNavigate={navigateGuide}
          />
        )}
      </div>
      </CallSessionProvider>
    </ToastProvider>
  );
}

export { App as default };
