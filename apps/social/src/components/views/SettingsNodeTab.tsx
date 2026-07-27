import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useNodeState } from "../../context/NodeStateContext.js";
import { useT } from "../../context/I18nContext.js";
import {
  useIsInProcessMobileNode,
  useNodeService,
  useShareOffers,
  useAgentShareProposals,
} from "../../hooks/useNodeService.js";
import QRCode from "qrcode";
import { useOptimisticToggle } from "../../hooks/useOptimisticToggle.js";
import { useCircuitReservationStatus } from "../../hooks/useCircuitReservationStatus.js";
import { DEFAULT_APP_SETTINGS } from "../../lib/storage.js";
import {
  DEFAULT_PUBLIC_LIBP2P_BOOTSTRAP_PRESETS,
  defaultBootstrapPresetsForDiscoveryProfile,
  formatConnectivityPresetSummary,
  formatWanSignOffEvidenceReport,
  formatWanTwoNatOperatorChecklist,
  resolveConnectivityPreset,
  WAN_TWO_NAT_CHECKLIST_STEPS,
} from "@envoymesh/api";
import {
  extractTurnServers,
  isTurnUrl,
  makeTurnId,
  mergeTurnServers,
  presetById,
  TURN_PRESETS,
  validateTurnDraft,
  type TurnDraft,
} from "../../lib/turn-credentials.js";
import type {
  DiscoveryProfile,
  NodeConfig,
  RelayConfig,
  AutonomousDomain,
  AutonomousPolicy,
  IpfsEngineStatus,
  ExternalPublishConfig,
  ChatDiagnostics,
  ConnectivityDiagnostics,
  AgentNotifyMode,
  A2aChatNotificationMode,
  AgentActivityDomain,
  AgentInteractionMode,
  PeerConnectionInfo,
  WanJoinInviteExpiryPresetId,
} from "@envoymesh/api";
import {
  WanJoinInviteExpirySelect,
  expiresInHoursForPreset,
} from "../common/WanJoinInviteExpirySelect.js";
import { WanCircuitReservationSoftGate } from "../settings/WanCircuitReservationSoftGate.js";

const WAN_TWO_NAT_CHECKLIST_STORAGE = "envoymesh:wan-two-nat-checklist:v1";

function loadWanTwoNatChecklistDone(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(WAN_TWO_NAT_CHECKLIST_STORAGE);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Record<string, boolean>;
  } catch {
    return {};
  }
}

export function SettingsNodeTab() {
  const t = useT();
  const isMobileNode = useIsInProcessMobileNode();
  const nodeService = useNodeService();
  const { nodeConfig, nodeStatus, peerId, bridgeStatus, refreshNodeConfig, connectionStatus, refreshConnectionStatus, bonds, appSettings, setAppSettings } =
    useNodeState();

  // Local state mirrors nodeConfig fields for debounced editing
  const [newRelayAddr, setNewRelayAddr] = useState("");
  const [bootstrapPresets, setBootstrapPresets] = useState<string[]>(
    nodeConfig?.bootstrapPresets ?? [...DEFAULT_PUBLIC_LIBP2P_BOOTSTRAP_PRESETS],
  );
  const bootstrapPresetsSavingRef = useRef(0);
  const [bootstrapPresetSyncNonce, setBootstrapPresetSyncNonce] = useState(0);

  const [friendMatchingDraft, setFriendMatchingDraft] = useState("");
  // Phase 38 — WebRTC ICE servers
  const [iceServersText, setIceServersText] = useState(
    JSON.stringify(nodeConfig?.iceServers ?? [], null, 2),
  );
  const [iceServersSaved, setIceServersSaved] = useState(false);
  useEffect(() => {
    setIceServersText(JSON.stringify(nodeConfig?.iceServers ?? [], null, 2));
  }, [nodeConfig?.iceServers]);
  const [gatewayAllowlistDraft, setGatewayAllowlistDraft] = useState("");
  const [ipfsEngineStatus, setIpfsEngineStatus] = useState<IpfsEngineStatus | null>(null);
  const [chatDiagContact, setChatDiagContact] = useState("");
  const [chatDiagnostics, setChatDiagnostics] = useState<ChatDiagnostics | null>(null);
  const [chatDiagLoading, setChatDiagLoading] = useState(false);
  const [chatDiagError, setChatDiagError] = useState<string | null>(null);
  const [connectivityDiagnostics, setConnectivityDiagnostics] = useState<ConnectivityDiagnostics | null>(null);
  const [connectivityDiagLoading, setConnectivityDiagLoading] = useState(false);
  const [connectivityDiagError, setConnectivityDiagError] = useState<string | null>(null);
  const [twoNatChecklistDone, setTwoNatChecklistDone] = useState<Record<string, boolean>>(() =>
    loadWanTwoNatChecklistDone(),
  );
  const [twoNatNatAPeer, setTwoNatNatAPeer] = useState("");
  const [twoNatNatBPeer, setTwoNatNatBPeer] = useState("");
  const [twoNatRelayAddr, setTwoNatRelayAddr] = useState("");
  const [twoNatChatVerified, setTwoNatChatVerified] = useState(false);
  const [twoNatAutomatedOk, setTwoNatAutomatedOk] = useState(false);

  // Bond connection info for network status display
  const [bondConnectionInfo, setBondConnectionInfo] = useState<Map<string, PeerConnectionInfo>>(new Map());
  const [bondConnectionLoading, setBondConnectionLoading] = useState(false);

  const refreshBondConnectionInfo = useCallback(async () => {
    if (bonds.length === 0) {
      setBondConnectionInfo(new Map());
      return;
    }
    setBondConnectionLoading(true);
    try {
      const entries = await Promise.all(
        bonds.map(async (bond) => {
          try {
            const info = await nodeService.getPeerConnectionInfo(bond.peerOwnerId);
            return [bond.peerOwnerId, info] as const;
          } catch {
            return [bond.peerOwnerId, { connected: false, direct: false }] as const;
          }
        }),
      );
      setBondConnectionInfo(new Map(entries));
    } finally {
      setBondConnectionLoading(false);
    }
  }, [bonds, nodeService]);

  const toggleTwoNatStep = useCallback((stepId: string, checked: boolean) => {
    setTwoNatChecklistDone((prev) => {
      const next = { ...prev, [stepId]: checked };
      localStorage.setItem(WAN_TWO_NAT_CHECKLIST_STORAGE, JSON.stringify(next));
      return next;
    });
  }, []);

  // Sync local state when nodeConfig loads/changes (async load after mount)
  useEffect(() => {
    if (bootstrapPresetsSavingRef.current > 0) return;
    const fromServer = nodeConfig?.bootstrapPresets;
    if (fromServer === undefined) return;
    setBootstrapPresets((prev) => {
      if (prev.length === fromServer.length && prev.every((p, i) => p === fromServer[i])) {
        return prev;
      }
      return [...fromServer];
    });
  }, [nodeConfig?.bootstrapPresets, bootstrapPresetSyncNonce]);

  useEffect(() => {
    if (nodeConfig?.friendMatchingPreferencesText !== undefined) {
      setFriendMatchingDraft(nodeConfig.friendMatchingPreferencesText ?? "");
    }
  }, [nodeConfig?.friendMatchingPreferencesText]);

  useEffect(() => {
    setGatewayAllowlistDraft((nodeConfig?.externalPublish?.gatewayAllowlist ?? []).join("\n"));
  }, [nodeConfig?.externalPublish?.gatewayAllowlist]);

  useEffect(() => {
    void nodeService
      .getIpfsEngineStatus()
      .then(setIpfsEngineStatus)
      .catch(() =>
        setIpfsEngineStatus({
          available: false,
          running: false,
          managed: false,
          errorHint: t("settings.network.ipfs.statusReadError"),
        }),
      );
  }, [nodeService, nodeConfig?.externalPublish?.allowIpfs, isMobileNode, t]);

  useEffect(() => {
    void refreshConnectionStatus();
  }, [refreshConnectionStatus]);

  // Refresh bond connection info whenever bonds change (new bond / unpair).
  useEffect(() => {
    void refreshBondConnectionInfo();
  }, [refreshBondConnectionInfo]);

  useEffect(() => {
    if (chatDiagContact || bonds.length === 0) return;
    setChatDiagContact(bonds[0]!.peerOwnerId);
  }, [bonds, chatDiagContact]);

  // Connection (WS URL) — moved here from the App tab so all
  // network-shape settings live in one place.
  const [wsUrlDraft, setWsUrlDraft] = useState(appSettings.wsUrl);
  useEffect(() => {
    setWsUrlDraft(appSettings.wsUrl);
  }, [appSettings.wsUrl]);

  // Behavior (notifications + connection-status visibility) — moved
  // here from the App tab because both behaviors affect how the
  // network status is surfaced in the UI.
  const [notificationHint, setNotificationHint] = useState<string | null>(() => {
    if (!appSettings.notificationsEnabled) return null;
    if (typeof Notification === "undefined") return t("settings.behavior.notifyUnavailable");
    if (Notification.permission === "denied") return t("settings.behavior.notifyBlocked");
    return null;
  });
  useEffect(() => {
    if (!appSettings.notificationsEnabled) {
      setNotificationHint(null);
      return;
    }
    if (typeof Notification === "undefined") {
      setNotificationHint(t("settings.behavior.notifyUnavailable"));
      return;
    }
    if (Notification.permission === "denied") {
      setNotificationHint(t("settings.behavior.notifyBlocked"));
      return;
    }
    setNotificationHint(null);
  }, [appSettings.notificationsEnabled, t]);

  const discoveryProfile: DiscoveryProfile = nodeConfig?.discoveryProfile ?? "wan-default";
  const isPublicLibp2pDiscovery = discoveryProfile === "wan-default";
  const isPublicNetwork = bootstrapPresets.length > 0;
  const relays = (nodeConfig?.configuredRelays ?? []) as RelayConfig[];

  // QR pairing has moved to the top-bar QR icon (PairingQRModal); no in-tab state.
  const [wanJoinQr, setWanJoinQr] = useState<string | null>(null);
  const [wanJoinUri, setWanJoinUri] = useState<string>("");
  const [wanJoinLoading, setWanJoinLoading] = useState(false);
  const [wanInvitePaste, setWanInvitePaste] = useState("");
  const [wanInviteApplyBusy, setWanInviteApplyBusy] = useState(false);
  const [wanInviteApplyMsg, setWanInviteApplyMsg] = useState<string | null>(null);
  const [wanInviteExpiryPreset, setWanInviteExpiryPreset] =
    useState<WanJoinInviteExpiryPresetId>("days7");
  const [wanForceWithoutReservation, setWanForceWithoutReservation] = useState(false);
  const { chip: circuitReservationChip, ready: reservationReady } = useCircuitReservationStatus({
    enabled: nodeStatus === "running" && !isMobileNode,
  });
  const canMintWanInvite = reservationReady || wanForceWithoutReservation;

  const handleShowWanJoinInvite = useCallback(async () => {
    setWanJoinLoading(true);
    setWanInviteApplyMsg(null);
    try {
      const result = await nodeService.createWanJoinInvite({
        expiresInHours: expiresInHoursForPreset(wanInviteExpiryPreset),
        forceWithoutReservation: wanForceWithoutReservation || undefined,
      });
      setWanJoinUri(result.uri);
      const dataUrl = await QRCode.toDataURL(result.uri, { width: 256, margin: 1 });
      setWanJoinQr(dataUrl);
    } catch (e) {
      console.error("Failed to generate WAN join invite:", e);
      setWanInviteApplyMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setWanJoinLoading(false);
    }
  }, [nodeService, wanInviteExpiryPreset, wanForceWithoutReservation]);

  const handleApplyWanJoinInvite = useCallback(async () => {
    setWanInviteApplyBusy(true);
    setWanInviteApplyMsg(null);
    try {
      const result = await nodeService.applyWanJoinInvite(wanInvitePaste);
      setWanInviteApplyMsg(
        t("settings.network.agentBridge.wanInviteApplied", {
          bootstrapPeersAdded: result.bootstrapPeersAdded,
          bootstrapPresetsAdded: result.bootstrapPresetsAdded,
          seedsPersisted: result.seedsPersisted,
        }),
      );
      setWanInvitePaste("");
      await refreshNodeConfig();
    } catch (e) {
      setWanInviteApplyMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setWanInviteApplyBusy(false);
    }
  }, [nodeService, wanInvitePaste, refreshNodeConfig, t]);

  const handleStartNode = async () => {
    try { await nodeService.startNode(); } catch (e) { console.error(e); }
  };
  const handleStopNode = async () => {
    try { await nodeService.stopNode(); } catch (e) { console.error(e); }
  };

  const updateNodeConfig = async (partial: Partial<NodeConfig>) => {
    await nodeService.updateNodeConfig(partial);
    await refreshNodeConfig();
  };

  const restartNodeAfterConnectivityChange = useCallback(async () => {
    try {
      await nodeService.stopNode();
      await nodeService.startNode();
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("Node restart timeout")), 15000);
        const unsub = nodeService.on("node:status", (data) => {
          if (data.status === "running") {
            clearTimeout(timeout);
            unsub();
            resolve();
          }
        });
      });
    } catch {
      /* desktop may need a full app restart when libp2p is owned by the CLI shell */
    }
    await refreshNodeConfig();
    await refreshConnectionStatus();
  }, [nodeService, refreshNodeConfig, refreshConnectionStatus]);

  const publicLibp2pToggle = useOptimisticToggle(isPublicLibp2pDiscovery, async (enabled) => {
    const nextProfile: DiscoveryProfile = enabled ? "wan-default" : "contacts-only";
    const bootstrapPresets = [...defaultBootstrapPresetsForDiscoveryProfile(nextProfile)];
    // Keep mDNS on for wan-default (LAN + WAN); off for contacts-only.
    const mdnsForProfile = nextProfile === "wan-default";
    bootstrapPresetsSavingRef.current += 1;
    setBootstrapPresetSyncNonce((n) => n + 1);
    try {
      setBootstrapPresets(bootstrapPresets);
      await nodeService.updateNodeConfig({ discoveryProfile: nextProfile, bootstrapPresets, enableMdns: mdnsForProfile });
      await restartNodeAfterConnectivityChange();
    } finally {
      bootstrapPresetsSavingRef.current -= 1;
      setBootstrapPresetSyncNonce((n) => n + 1);
      await refreshNodeConfig();
    }
  });

  const setDiscoveryProfile = useCallback(
    async (nextProfile: DiscoveryProfile) => {
      const presets = [...defaultBootstrapPresetsForDiscoveryProfile(nextProfile)];
      // Sync mDNS with profile: LAN-capable profiles need mDNS on;
      // contacts-only/relay-only don't use mDNS so turn it off.
      const mdnsForProfile = nextProfile === "lan-fast" || nextProfile === "wan-default";
      bootstrapPresetsSavingRef.current += 1;
      setBootstrapPresetSyncNonce((n) => n + 1);
      try {
        setBootstrapPresets(presets);
        await nodeService.updateNodeConfig({ discoveryProfile: nextProfile, bootstrapPresets: presets, enableMdns: mdnsForProfile });
        await restartNodeAfterConnectivityChange();
      } finally {
        bootstrapPresetsSavingRef.current -= 1;
        setBootstrapPresetSyncNonce((n) => n + 1);
        await refreshNodeConfig();
      }
    },
    [nodeService, restartNodeAfterConnectivityChange, refreshNodeConfig],
  );

  const enableMdns = nodeConfig?.enableMdns ?? true;
  const mdnsToggle = useOptimisticToggle(enableMdns, async (enableMdnsNext) => {
    await nodeService.updateNodeConfig({ enableMdns: enableMdnsNext });
    try { await nodeService.stopNode(); } catch {}
    try { await nodeService.waitForConnection(15000); } catch {}
    try { await nodeService.startNode(); } catch {}
    await refreshNodeConfig();
  });

  const chatAssistToggle = useOptimisticToggle(
    nodeConfig?.chatAssistEnabled ?? false,
    async (chatAssistEnabled) => {
      await updateNodeConfig({ chatAssistEnabled });
    },
  );

  const socialAutoSend = !!(nodeConfig?.autonomousPolicies ?? []).find((p) => p.domain === "social")?.autoSendChat;

  const autoSendChatToggle = useOptimisticToggle(socialAutoSend, async (next) => {
    const currentPolicies = nodeConfig?.autonomousPolicies ?? [];
    const existingSocial = currentPolicies.find((p) => p.domain === "social");
    let updatedPolicies: AutonomousPolicy[];
    if (existingSocial) {
      updatedPolicies = currentPolicies.map((p) =>
        p.domain === "social" ? { ...p, autoSendChat: next } : p
      );
    } else {
      updatedPolicies = [
        ...currentPolicies,
        {
          domain: "social" as AutonomousDomain,
          maxSensitivity: "friends",
          autoAnswer: next,
          autoSendChat: next,
        },
      ];
    }
    await updateNodeConfig({ autonomousPolicies: updatedPolicies });
  });

  const killSwitchToggle = useOptimisticToggle(
    nodeConfig?.autonomousKillSwitch ?? false,
    async (autonomousKillSwitch) => {
      await updateNodeConfig({ autonomousKillSwitch });
    },
  );

  const trustModeToggle = useOptimisticToggle(
    nodeConfig?.trustModeEnabled ?? false,
    async (trustModeEnabled) => {
      await updateNodeConfig({ trustModeEnabled });
    },
  );

  const friendAutopilotToggle = useOptimisticToggle(
    nodeConfig?.friendAutopilotEnabled ?? false,
    async (friendAutopilotEnabled) => {
      await updateNodeConfig({ friendAutopilotEnabled });
    },
  );

  const currentExternalPublish = useMemo(
    () => ({
      allowIpfs: nodeConfig?.externalPublish?.allowIpfs ?? false,
      gatewayAllowlist: nodeConfig?.externalPublish?.gatewayAllowlist ?? [],
      ipfsExportEngine: isMobileNode
        ? ("helia" as const)
        : (nodeConfig?.externalPublish?.ipfsExportEngine ?? "kubo"),
      pinningEnabled: nodeConfig?.externalPublish?.pinningEnabled ?? false,
      pinningProvider: nodeConfig?.externalPublish?.pinningProvider ?? "pinata",
    }),
    [nodeConfig?.externalPublish, isMobileNode],
  );

  const ipfsExportToggle = useOptimisticToggle(
    currentExternalPublish.allowIpfs,
    async (allowIpfs) => {
      await updateNodeConfig({
        externalPublish: {
          ...currentExternalPublish,
          allowIpfs,
        },
      });
    },
  );

  const bridgeEnabledToggle = useOptimisticToggle(
    nodeConfig?.bridgeEnabled ?? true,
    async (bridgeEnabled) => {
      await nodeService.updateNodeConfig({ bridgeEnabled });
      await refreshNodeConfig();
    },
  );

  const { offers: pendingShareOffers } = useShareOffers();
  const { proposals: agentShareProposals } = useAgentShareProposals();

  const nodeStatusLabel = (status: string) => {
    switch (status) {
      case "running":
        return t("settings.network.nodeControl.statusRunning");
      case "starting":
        return t("settings.network.nodeControl.statusStarting");
      case "stopped":
        return t("settings.network.nodeControl.statusStopped");
      case "stopping":
        return t("settings.network.nodeControl.statusStopping");
      case "error":
        return t("settings.network.nodeControl.statusError");
      default:
        return status.charAt(0).toUpperCase() + status.slice(1);
    }
  };

  return (
    <>
      {/* ============================================================
       * Section order is "frequent first, defaults last, diagnostics
       * at the very back":
       *  1. File sharing inbox banner    — frequent, only when present
       *  2. Node control (start/stop)    — daily driver
       *  3. Network status (relays/bonds)— daily driver
       *  4. Connection (WS URL)          — daily driver
       *  5. Behavior (auto-connect, …)   — daily driver
       *  6. Discovery profile            — set once
       *  7. Discovery (mDNS)             — default true
       *  8. Public discovery (toggle)    — default on
       *  9. Bootstrap presets            — set once, advanced
       * 10. Configured relays            — set once, advanced
       * 11. Trust mode & matching        — set once, advanced
       * 12. IPFS (mobile / desktop)      — advanced, set once
       * 13. Agent bridge                 — set once, advanced
       * 14. Relay public WS URL          — set once, advanced
       * 15. Resource tuning              — defaults, advanced
       * 16. AI chat behavior             — set once, network-shaped
       * --------- Diagnostics (troubleshooting) ----------
       * 17. Chat connectivity diagnostics
       * 18. WAN connectivity diagnostics
       * 19. Physical two-NAT sign-off
       * ============================================================ */}

      {(pendingShareOffers.length > 0 || agentShareProposals.length > 0) && (
        <section className="settings-section">
          <h3>{t("settings.network.fileSharing.title")}</h3>
          <p className="section-desc">
            {pendingShareOffers.length > 0
              ? t(
                  pendingShareOffers.length === 1
                    ? "settings.network.fileSharing.incomingOne"
                    : "settings.network.fileSharing.incomingMany",
                  { count: pendingShareOffers.length },
                )
              : ""}
            {agentShareProposals.length > 0
              ? t(
                  agentShareProposals.length === 1
                    ? "settings.network.fileSharing.suggestionsOne"
                    : "settings.network.fileSharing.suggestionsMany",
                  { count: agentShareProposals.length },
                )
              : ""}
            {t("settings.network.fileSharing.inboxHint")}
          </p>
        </section>
      )}

      <section className="settings-section">
        <h3>{t("settings.network.nodeControl.title")}</h3>
        <dl className="settings-list">
          <dt>{t("settings.network.nodeControl.status")}</dt>
          <dd className={`status-${nodeStatus}`}>
            <span className={`status-dot ${nodeStatus === "running" ? "online" : nodeStatus === "starting" ? "starting" : "offline"}`} />
            {nodeStatusLabel(nodeStatus)}
          </dd>
          <dt>{t("settings.network.nodeControl.profileDir")}</dt>
          <dd>{nodeConfig?.profileDir ?? t("settings.network.nodeControl.loading")}</dd>
          <dt>{t("settings.network.nodeControl.networkPeerId")}</dt>
          <dd>
            <code>
              {peerId && !peerId.startsWith("envoy_") ? peerId : t("settings.network.nodeControl.notConnected")}
            </code>
          </dd>
          {connectionStatus?.lastError && (
            <>
              <dt>{t("settings.network.nodeControl.lastNodeError")}</dt>
              <dd className="settings-diagnostics-error">
                <span className="settings-diagnostics-time">{connectionStatus.lastErrorAt ?? ""}</span>
                <code>{connectionStatus.lastError}</code>
              </dd>
            </>
          )}
        </dl>
        <div className="node-controls">
          {nodeStatus === "running" ? (
            <button type="button" className="settings-button" onClick={handleStopNode}>{t("settings.network.nodeControl.stopNode")}</button>
          ) : (
            <button type="button" className="settings-button" onClick={handleStartNode}>{t("settings.network.nodeControl.startNode")}</button>
          )}
        </div>
      </section>

      <section className="settings-section">
        <h3>{t("settings.network.networkStatus.title")}</h3>
        <dl className="settings-list">
          <dt>{t("settings.network.networkStatus.connectedRelays")}</dt>
          <dd>
            {connectionStatus?.connectedRelays?.length
              ? connectionStatus.connectedRelays.map((r) => (
                  <span
                    key={r}
                    className="settings-hint"
                    style={{ display: "flex", alignItems: "center", gap: 6 }}
                  >
                    <span className="status-dot online" aria-hidden />
                    {r}
                  </span>
                ))
              : (
                <span className="settings-hint" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span className="status-dot offline" aria-hidden />
                  {t("settings.network.networkStatus.offline")}
                </span>
              )}
          </dd>
          <dt>{t("settings.network.networkStatus.bondedPeers")}</dt>
          <dd>
            {bondConnectionLoading ? (
              <span className="settings-hint">{t("settings.network.nodeControl.loading")}</span>
            ) : bonds.length === 0 ? (
              <span className="settings-hint">{t("settings.network.networkStatus.noBonds")}</span>
            ) : (
              <ul className="settings-list" style={{ margin: 0, padding: 0, listStyle: "none" }}>
                {bonds.map((bond) => {
                  const connInfo = bondConnectionInfo.get(bond.peerOwnerId);
                  const isConnected = connInfo?.connected ?? false;
                  const isDirect = connInfo?.direct ?? false;
                  const relayLabel = connInfo?.relayPeerId
                    ? `${t("settings.network.networkStatus.via")} ${connInfo.relayPeerId!.slice(0, 12)}…`
                    : null;
                  return (
                    <li key={bond.peerOwnerId} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <span
                        className={`status-dot ${isConnected ? (isDirect ? "online" : "starting") : "offline"}`}
                      />
                      <span style={{ flex: 1 }}>
                        {bond.displayName ?? bond.peerOwnerId.slice(0, 12)}…
                      </span>
                      <span className="settings-hint">
                        {isConnected
                          ? isDirect
                            ? t("settings.network.networkStatus.direct")
                            : relayLabel ?? t("settings.network.networkStatus.p2p")
                          : t("settings.network.networkStatus.offline")}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </dd>
        </dl>
        <button
          type="button"
          className="settings-button"
          style={{ marginTop: 8 }}
          disabled={bondConnectionLoading}
          onClick={() => { void refreshBondConnectionInfo(); }}
        >
          {t("settings.network.networkStatus.refresh")}
        </button>
      </section>

      {/* Connection — moved from the App tab so all network-shape
          settings (WebSocket URL, auto-connect, etc.) live together. */}
      <section className="settings-section">
        <h3>{t("settings.connection.title")}</h3>
        <div className="settings-row">
          <div>
            <div className="settings-row-label">{t("settings.connection.wsUrl")}</div>
            <div className="settings-row-hint">{t("settings.connection.wsHint")}</div>
          </div>
        </div>
        <input
          type="text"
          className="settings-input"
          value={wsUrlDraft}
          onChange={(e) => setWsUrlDraft(e.target.value)}
        />
        <div className="settings-buttons" style={{ marginTop: "8px" }}>
          <button
            type="button"
            className="settings-save-btn"
            onClick={() => {
              setAppSettings({
                ...appSettings,
                wsUrl: wsUrlDraft.trim() || DEFAULT_APP_SETTINGS.wsUrl,
              });
            }}
          >
            {t("settings.connection.applyUrl")}
          </button>
          <button type="button" className="settings-cancel-btn" onClick={() => setWsUrlDraft(appSettings.wsUrl)}>
            {t("common.reset")}
          </button>
        </div>
        <p className="settings-hint" style={{ marginTop: "6px" }}>
          {t("settings.connection.applyNote")}
        </p>
      </section>

      {/* Behavior — moved from the App tab. Auto-connect, notifications,
          and the in-chat P2P/Relay indicator all shape how the network
          status is surfaced. */}
      <section className="settings-section">
        <h3>{t("settings.behavior.title")}</h3>
        <div className="settings-row">
          <div>
            <div className="settings-row-label">{t("settings.behavior.autoConnect")}</div>
            <div className="settings-row-hint">{t("settings.behavior.autoConnectHint")}</div>
          </div>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={appSettings.autoConnect}
              onChange={(e) => setAppSettings({ ...appSettings, autoConnect: e.target.checked })}
            />
            <span className="slider" />
          </label>
        </div>
        <div className="settings-row">
          <div>
            <div className="settings-row-label">{t("settings.behavior.notifications")}</div>
            <div className="settings-row-hint">{t("settings.behavior.notificationsHint")}</div>
          </div>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={appSettings.notificationsEnabled}
              onChange={(e) => {
                void (async () => {
                  const enabled = e.target.checked;
                  if (
                    enabled &&
                    typeof Notification !== "undefined" &&
                    Notification.permission === "default"
                  ) {
                    await Notification.requestPermission();
                  }
                  setAppSettings({ ...appSettings, notificationsEnabled: enabled });
                })();
              }}
            />
            <span className="slider" />
          </label>
        </div>
        {notificationHint ? (
          <p className="settings-hint" role="alert" style={{ marginTop: "6px" }}>
            {notificationHint}
          </p>
        ) : null}
        <div className="settings-row">
          <div>
            <div className="settings-row-label">{t("settings.behavior.connectionStatus")}</div>
            <div className="settings-row-hint">{t("settings.behavior.connectionStatusHint")}</div>
          </div>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={appSettings.showConnectionStatus}
              onChange={(e) => setAppSettings({ ...appSettings, showConnectionStatus: e.target.checked })}
            />
            <span className="slider" />
          </label>
        </div>
      </section>

      <section className="settings-section">
        <h3>{t("settings.network.discoveryProfile.title")}</h3>
        <p className="section-desc">
          {t("settings.network.discoveryProfile.desc")}
        </p>
        <label className="settings-field">
          <span className="settings-field-label">{t("settings.network.discoveryProfile.label")}</span>
          <select
            className="settings-select"
            value={discoveryProfile}
            onChange={(e) => void setDiscoveryProfile(e.target.value as DiscoveryProfile)}
          >
            <option value="wan-default">{t("settings.network.discoveryProfile.wanDefault")}</option>
            <option value="relay-only">{t("settings.network.discoveryProfile.relayOnly")}</option>
            <option value="contacts-only">{t("settings.network.discoveryProfile.contactsOnly")}</option>
          </select>
        </label>
        <p className="section-desc muted">
          {discoveryProfile === "wan-default"
            ? t("settings.network.discoveryProfile.wanDefaultHint")
            : discoveryProfile === "relay-only"
              ? t("settings.network.discoveryProfile.relayOnlyHint")
              : t("settings.network.discoveryProfile.contactsOnlyHint")}
        </p>
      </section>

      <section className="settings-section">
        <h3>{t("settings.network.discovery.title")}</h3>
        <p className="section-desc">
          {t("settings.network.discovery.desc")}
        </p>
        <div className="settings-toggle-row">
          <div className="toggle-info">
            <strong>{t("settings.network.discovery.mdns")}</strong>
            <span className="toggle-desc">{t("settings.network.discovery.mdnsDesc")}</span>
          </div>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={mdnsToggle.checked}
              onChange={mdnsToggle.onCheckboxChange}
            />
            <span className="slider" />
          </label>
        </div>
      </section>

      <section className="settings-section">
        <h3>{t("settings.network.publicDiscovery.title")}</h3>
        <p className="section-desc">
          {t("settings.network.publicDiscovery.desc")}
        </p>
        <div className="settings-toggle-row">
          <div className="toggle-info">
            <strong>{t("settings.network.publicDiscovery.toggle")}</strong>
            <span className="toggle-desc">
              {isPublicLibp2pDiscovery
                ? t("settings.network.publicDiscovery.profileWanDefault", { count: bootstrapPresets.length })
                : t("settings.network.publicDiscovery.profileContactsOnly")}
            </span>
          </div>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={publicLibp2pToggle.checked}
              onChange={publicLibp2pToggle.onCheckboxChange}
            />
            <span className="slider" />
          </label>
        </div>
        {!isPublicLibp2pDiscovery ? (
          <p className="section-desc muted">
            {t("settings.network.publicDiscovery.contactsOnlyHint")}
          </p>
        ) : null}
      </section>

      <section className="settings-section">
        <h3>{t("settings.network.bootstrapPresets.title")}</h3>
        <p className="section-desc">
          {isPublicLibp2pDiscovery
            ? t("settings.network.bootstrapPresets.descPublic")
            : t("settings.network.bootstrapPresets.descPrivate")}
        </p>
        <div className="bootstrap-presets">
          {[
            { id: "public-libp2p", label: t("settings.network.bootstrapPresets.publicLibp2p"), desc: t("settings.network.bootstrapPresets.publicLibp2pDesc") },
            { id: "public-libp2p-am6", label: t("settings.network.bootstrapPresets.publicLibp2pAm6"), desc: t("settings.network.bootstrapPresets.publicLibp2pAm6Desc") },
            { id: "public-libp2p-am7", label: t("settings.network.bootstrapPresets.publicLibp2pAm7"), desc: t("settings.network.bootstrapPresets.publicLibp2pAm7Desc") },
            { id: "cn-relay", label: t("settings.network.bootstrapPresets.cnRelay"), desc: t("settings.network.bootstrapPresets.cnRelayDesc") },
          ].map((preset) => (
            <label key={preset.id} className="preset-checkbox">
              <input
                type="checkbox"
                disabled={!isPublicLibp2pDiscovery}
                checked={bootstrapPresets.includes(preset.id)}
                onChange={async (e) => {
                  if (!isPublicLibp2pDiscovery) return;
                  bootstrapPresetsSavingRef.current += 1;
                  setBootstrapPresetSyncNonce((n) => n + 1);
                  try {
                    const checked = e.target.checked;
                    const updated = checked
                      ? [...new Set([...bootstrapPresets, preset.id])]
                      : bootstrapPresets.filter((p) => p !== preset.id);
                    setBootstrapPresets(updated);
                    await nodeService.updateNodeConfig({
                      discoveryProfile: "wan-default",
                      bootstrapPresets: updated,
                    });
                    await restartNodeAfterConnectivityChange();
                  } finally {
                    bootstrapPresetsSavingRef.current -= 1;
                    setBootstrapPresetSyncNonce((n) => n + 1);
                  }
                }}
              />
              <span className="preset-info">
                <strong>{preset.label}</strong>
                <span className="preset-desc">{preset.desc}</span>
              </span>
            </label>
          ))}
        </div>
      </section>

      <section className="settings-section">
        <h3>{t("settings.network.relays.title")}</h3>
        {relays.length === 0 ? (
          <p className="empty">{t("settings.network.relays.empty")}</p>
        ) : (
          <ul className="relay-list">
            {relays.map((relay) => (
              <li key={relay.relayId} className="relay-item">
                <label className="relay-toggle">
                  <input
                    type="checkbox"
                    checked={relay.enabled}
                    onChange={async () => {
                      const updatedRelays = relays.map(r =>
                        r.relayId === relay.relayId ? { ...r, enabled: !r.enabled } : r
                      );
                      await nodeService.updateNodeConfig({ configuredRelays: updatedRelays });
                      await refreshNodeConfig();
                    }}
                  />
                  <span className="relay-info">
                    <strong>{relay.addr}</strong>
                    {relay.level !== undefined && <span className="relay-level">{t("settings.network.relays.level", { level: relay.level })}</span>}
                    {relay.region && <span className="relay-region">{relay.region}</span>}
                  </span>
                </label>
                <button
                  className="remove-relay"
                  onClick={async () => {
                    await nodeService.removeRelay(relay.relayId);
                    await refreshNodeConfig();
                  }}
                >
                  {t("settings.network.relays.remove")}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="add-relay-form">
          <h4>{t("settings.network.relays.addTitle")}</h4>
          <input
            type="text"
            className="settings-input"
            placeholder={t("settings.network.relays.addPlaceholder")}
            value={newRelayAddr}
            onChange={(e) => setNewRelayAddr(e.target.value)}
          />
          <button
            type="button"
            className="settings-button"
            onClick={async () => {
              if (!newRelayAddr.trim()) return;
              try {
                await nodeService.addRelay(newRelayAddr);
                setNewRelayAddr("");
                await refreshNodeConfig();
              } catch (error) {
                console.error("Failed to add relay:", error);
              }
            }}
          >
            {t("settings.network.relays.add")}
          </button>
        </div>
      </section>

      <section className="settings-section">
        <h3>{t("settings.network.trustMatching.title")}</h3>
        <p className="section-desc">
          {t("settings.network.trustMatching.desc")}
        </p>
        <div className="settings-toggle-row">
          <div className="toggle-info">
            <strong>{t("settings.network.trustMatching.trustMode")}</strong>
            <span className="toggle-desc">{t("settings.network.trustMatching.trustModeDesc")}</span>
          </div>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={trustModeToggle.checked}
              onChange={trustModeToggle.onCheckboxChange}
            />
            <span className="slider" />
          </label>
        </div>
        <div className="settings-toggle-row">
          <div className="toggle-info">
            <strong>{t("settings.network.trustMatching.friendAutopilot")}</strong>
            <span className="toggle-desc">
              {nodeConfig?.socialProxyEnabled
                ? t("settings.network.trustMatching.friendAutopilotSuperseded")
                : t("settings.network.trustMatching.friendAutopilotDesc")}
            </span>
          </div>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={friendAutopilotToggle.checked}
              onChange={friendAutopilotToggle.onCheckboxChange}
              disabled={!trustModeToggle.checked || nodeConfig?.socialProxyEnabled === true}
            />
            <span className="slider" />
          </label>
        </div>
        {friendAutopilotToggle.checked ? (
          <dl className="settings-list">
            <dt>{t("settings.network.trustMatching.autopilotSchedule")}</dt>
            <dd>
              <select
                className="settings-input"
                value={String(nodeConfig?.friendAutopilotIntervalHours ?? 0)}
                onChange={async (e) => {
                  await updateNodeConfig({
                    friendAutopilotIntervalHours: Number(e.target.value) as 0 | 24 | 168,
                  });
                }}
                disabled={!trustModeToggle.checked}
              >
                <option value="0">{t("settings.network.trustMatching.scheduleManual")}</option>
                <option value="24">{t("settings.network.trustMatching.scheduleDaily")}</option>
                <option value="168">{t("settings.network.trustMatching.scheduleWeekly")}</option>
              </select>
              <p className="settings-hint" style={{ marginTop: "6px" }}>
                {t("settings.network.trustMatching.autopilotScheduleHint")}
              </p>
            </dd>
          </dl>
        ) : null}
        <dl className="settings-list">
          <dt>{t("settings.network.trustMatching.syndicationCeiling")}</dt>
          <dd>
            <select
              className="settings-input"
              value={nodeConfig?.knowledgeSyndicationMaxSensitivity ?? ""}
              onChange={async (e) => {
                const value = e.target.value;
                await nodeService.updateNodeConfig({
                  knowledgeSyndicationMaxSensitivity:
                    value === "" ? null : (value as "public" | "friends" | "private"),
                } as Parameters<typeof nodeService.updateNodeConfig>[0]);
              }}
            >
              <option value="">{t("settings.network.trustMatching.syndicationBondOnly")}</option>
              <option value="public">{t("settings.network.trustMatching.syndicationPublic")}</option>
              <option value="friends">{t("settings.network.trustMatching.syndicationFriends")}</option>
              <option value="private">{t("settings.network.trustMatching.syndicationPrivate")}</option>
            </select>
            <p className="settings-hint" style={{ marginTop: "6px" }}>
              {t("settings.network.trustMatching.syndicationHint")}
            </p>
          </dd>
          {bonds.length > 0 ? (
            <>
              <dt>{t("settings.network.trustMatching.perContactCaps")}</dt>
              <dd>
                <ul className="settings-contact-syndication-list">
                  {bonds.map((bond) => {
                    const pref = nodeConfig?.contactAiPreferences?.find(
                      (p) => p.peerOwnerId === bond.peerOwnerId,
                    );
                    return (
                      <li key={bond.peerOwnerId} className="settings-contact-syndication-row">
                        <span>{bond.displayName || bond.peerOwnerId.slice(0, 20)}</span>
                        <select
                          className="settings-input"
                          value={pref?.syndicationMaxSensitivity ?? ""}
                          onChange={async (e) => {
                            const value = e.target.value;
                            const currentPrefs = nodeConfig?.contactAiPreferences ?? [];
                            const other = currentPrefs.filter((p) => p.peerOwnerId !== bond.peerOwnerId);
                            const existing = currentPrefs.find((p) => p.peerOwnerId === bond.peerOwnerId);
                            await updateNodeConfig({
                              contactAiPreferences: [
                                ...other,
                                {
                                  peerOwnerId: bond.peerOwnerId,
                                  aiAccessLevel: existing?.aiAccessLevel ?? "none",
                                  knowledgeAccess: existing?.knowledgeAccess ?? "public",
                                  priority: existing?.priority ?? "high",
                                  ...(value !== ""
                                    ? {
                                        syndicationMaxSensitivity: value as
                                          | "public"
                                          | "friends"
                                          | "private",
                                      }
                                    : {}),
                                },
                              ],
                            });
                          }}
                        >
                          <option value="">{t("settings.network.trustMatching.useGlobalCeiling")}</option>
                          <option value="public">{t("settings.network.trustMatching.publicOnly")}</option>
                          <option value="friends">{t("settings.network.trustMatching.syndicationFriends")}</option>
                          <option value="private">{t("settings.network.trustMatching.privateTier")}</option>
                        </select>
                      </li>
                    );
                  })}
                </ul>
              </dd>
            </>
          ) : null}
          <dt>{t("settings.network.trustMatching.friendMatchingPreferences")}</dt>
          <dd>
            <textarea
              className="settings-input"
              rows={5}
              placeholder={t("settings.network.trustMatching.friendMatchingPlaceholder")}
              value={friendMatchingDraft}
              onChange={(e) => setFriendMatchingDraft(e.target.value)}
            />
            <p className="settings-hint" style={{ marginTop: "6px" }}>
              {t("settings.network.trustMatching.friendMatchingHint")}
            </p>
          </dd>
        </dl>
        <div className="settings-buttons">
          <button
            type="button"
            className="settings-save-btn"
            onClick={async () => {
              await updateNodeConfig({ friendMatchingPreferencesText: friendMatchingDraft });
            }}
          >
            {t("settings.network.trustMatching.savePreferences")}
          </button>
          <button
            type="button"
            className="settings-cancel-btn"
            onClick={() =>
              setFriendMatchingDraft(nodeConfig?.friendMatchingPreferencesText ?? "")}
          >
            {t("settings.network.trustMatching.reset")}
          </button>
        </div>
      </section>

      {isMobileNode ? (
        <section className="settings-section">
          <h3>{t("settings.network.ipfs.title")}</h3>
          <p className="section-desc">
            {t("settings.network.ipfs.descMobile")}
          </p>
          <dl className="settings-list">
            <dt>{t("settings.network.ipfs.engine")}</dt>
            <dd>
              {ipfsEngineStatus == null ? (
                <span className="settings-hint">{t("settings.network.ipfs.checking")}</span>
              ) : ipfsEngineStatus.helia?.available ? (
                <span className="settings-hint">
                  {t("settings.network.ipfs.heliaInProcess")}
                  {ipfsEngineStatus.helia.heliaVersion ? ` (${ipfsEngineStatus.helia.heliaVersion})` : ""}
                </span>
              ) : (
                <span className="settings-hint" role="alert">
                  {ipfsEngineStatus.helia?.errorHint ?? t("settings.network.ipfs.heliaUnavailable")}
                </span>
              )}
            </dd>
            <dt>{t("settings.network.ipfs.exportEngine")}</dt>
            <dd>
              <span className="settings-hint">{t("settings.network.ipfs.heliaMobileOnly")}</span>
            </dd>
          </dl>
          <div className="settings-toggle-row">
            <div className="toggle-info">
              <strong>{t("settings.network.ipfs.allowExport")}</strong>
              <span className="toggle-desc">{t("settings.network.ipfs.allowExportDescMobile")}</span>
            </div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={ipfsExportToggle.checked}
                onChange={ipfsExportToggle.onCheckboxChange}
              />
              <span className="slider" />
            </label>
          </div>
        </section>
      ) : (
        <section className="settings-section">
          <h3>{t("settings.network.ipfs.title")}</h3>
          <p className="section-desc">
            {t("settings.network.ipfs.descDesktop")}
          </p>
          <dl className="settings-list">
            <dt>{t("settings.network.ipfs.engine")}</dt>
            <dd>
              {currentExternalPublish.ipfsExportEngine === "helia" ? (
                <>
                  {ipfsEngineStatus == null ? (
                    <span className="settings-hint">{t("settings.network.ipfs.checking")}</span>
                  ) : ipfsEngineStatus.helia?.available ? (
                    <span className="settings-hint">
                      {t("settings.network.ipfs.heliaInProcessPrimary")}
                      {ipfsEngineStatus.helia.heliaVersion ? ` (${ipfsEngineStatus.helia.heliaVersion})` : ""}
                    </span>
                  ) : (
                    <span className="settings-hint" role="alert">
                      {ipfsEngineStatus.helia?.errorHint ?? t("settings.network.ipfs.heliaUnavailable")}
                    </span>
                  )}
                  <span className="settings-hint" style={{ display: "block", marginTop: "4px" }}>
                    {ipfsEngineStatus?.kubo?.available
                      ? t("settings.network.ipfs.kuboAlsoAvailable", {
                          version: ipfsEngineStatus.kubo.kuboVersion ? ` (${ipfsEngineStatus.kubo.kuboVersion})` : "",
                        })
                      : ipfsEngineStatus?.kubo?.errorHint ?? t("settings.network.ipfs.kuboNotRequired")}
                  </span>
                </>
              ) : (
                <>
                  {ipfsEngineStatus == null ? (
                    <span className="settings-hint">{t("settings.network.ipfs.checking")}</span>
                  ) : ipfsEngineStatus.available ? (
                    <span className="settings-hint">
                      {ipfsEngineStatus.running
                        ? `${t("settings.network.ipfs.kuboReady", {
                            version: ipfsEngineStatus.kuboVersion ? ` (${ipfsEngineStatus.kuboVersion})` : "",
                            managed: ipfsEngineStatus.managed ? t("settings.network.ipfs.kuboManaged") : "",
                          })}`
                        : t("settings.network.ipfs.kuboAvailableStarts")}
                    </span>
                  ) : (
                    <span className="settings-hint" role="alert">
                      {ipfsEngineStatus.errorHint ?? t("settings.network.ipfs.kuboUnavailable")}
                    </span>
                  )}
                  {ipfsEngineStatus?.helia != null && (
                    <span className="settings-hint" style={{ display: "block", marginTop: "4px" }}>
                      {ipfsEngineStatus.helia.available
                        ? `${t("settings.network.ipfs.heliaInProcess")}${ipfsEngineStatus.helia.heliaVersion ? ` (${ipfsEngineStatus.helia.heliaVersion})` : ""}`
                        : ipfsEngineStatus.helia.errorHint ?? t("settings.network.ipfs.heliaUnavailableShort")}
                    </span>
                  )}
                </>
              )}
            </dd>
            <dt>{t("settings.network.ipfs.exportEngine")}</dt>
            <dd>
              <select
                className="settings-input"
                value={currentExternalPublish.ipfsExportEngine}
                onChange={(e) => {
                  const ipfsExportEngine = e.target.value as NonNullable<
                    ExternalPublishConfig["ipfsExportEngine"]
                  >;
                  void updateNodeConfig({
                    externalPublish: {
                      ...currentExternalPublish,
                      ipfsExportEngine,
                    },
                  });
                }}
              >
                <option value="kubo">{t("settings.network.ipfs.engineKubo")}</option>
                <option value="kubo-with-helia-shadow">{t("settings.network.ipfs.engineKuboHeliaShadow")}</option>
                <option value="helia">{t("settings.network.ipfs.engineHelia")}</option>
              </select>
              <p className="settings-hint" style={{ marginTop: "6px" }}>
                {currentExternalPublish.ipfsExportEngine === "helia"
                  ? t("settings.network.ipfs.hintHelia")
                  : currentExternalPublish.ipfsExportEngine === "kubo-with-helia-shadow"
                    ? t("settings.network.ipfs.hintKuboHeliaShadow")
                    : t("settings.network.ipfs.hintKubo")}
              </p>
            </dd>
          </dl>
          <div className="settings-toggle-row">
            <div className="toggle-info">
              <strong>{t("settings.network.ipfs.allowExport")}</strong>
              <span className="toggle-desc">{t("settings.network.ipfs.allowExportDescDesktop")}</span>
            </div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={ipfsExportToggle.checked}
                onChange={ipfsExportToggle.onCheckboxChange}
              />
              <span className="slider" />
            </label>
          </div>
          {ipfsExportToggle.checked ? (
            <div className="settings-toggle-row">
              <div className="toggle-info">
                <strong>{t("settings.network.ipfs.allowPinning")}</strong>
                <span className="toggle-desc">
                  {t("settings.network.ipfs.allowPinningDesc")}
                </span>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={currentExternalPublish.pinningEnabled}
                  onChange={async (e) => {
                    await updateNodeConfig({
                      externalPublish: {
                        ...currentExternalPublish,
                        pinningEnabled: e.target.checked,
                      },
                    });
                  }}
                />
                <span className="slider" />
              </label>
            </div>
          ) : null}
          {ipfsExportToggle.checked && currentExternalPublish.pinningEnabled ? (
            <dl className="settings-list">
              <dt>{t("settings.network.ipfs.pinningProvider")}</dt>
              <dd>
                <select
                  className="settings-input"
                  value={currentExternalPublish.pinningProvider ?? "pinata"}
                  onChange={async (e) => {
                    await updateNodeConfig({
                      externalPublish: {
                        ...currentExternalPublish,
                        pinningProvider: e.target.value as "pinata" | "web3storage",
                      },
                    });
                  }}
                >
                  <option value="pinata">{t("settings.network.ipfs.pinata")}</option>
                  <option value="web3storage">{t("settings.network.ipfs.web3storage")}</option>
                </select>
              </dd>
            </dl>
          ) : null}
          <dl className="settings-list">
            <dt>{t("settings.network.ipfs.gatewayAllowlist")}</dt>
            <dd>
              <textarea
                className="settings-input"
                rows={3}
                placeholder={t("settings.network.ipfs.gatewayPlaceholder")}
                value={gatewayAllowlistDraft}
                onChange={(e) => setGatewayAllowlistDraft(e.target.value)}
              />
              <p className="settings-hint" style={{ marginTop: "6px" }}>
                {t("settings.network.ipfs.gatewayHint")}
              </p>
              <button
                type="button"
                className="settings-button"
                style={{ marginTop: "8px" }}
                onClick={() => {
                  void (async () => {
                    const gatewayAllowlist = gatewayAllowlistDraft
                      .split(/\r?\n/)
                      .map((line) => line.trim())
                      .filter(Boolean);
                    await updateNodeConfig({
                      externalPublish: {
                        ...currentExternalPublish,
                        gatewayAllowlist,
                      },
                    });
                  })();
                }}
              >
                {t("settings.network.ipfs.saveGatewayAllowlist")}
              </button>
            </dd>
          </dl>
        </section>
      )}

      <section className="settings-section">
        <h3>{t("settings.network.agentBridge.title")}</h3>
        <dl className="settings-list">
          <dt>{t("settings.network.agentBridge.status")}</dt>
          <dd>
            <span className={`status-dot ${bridgeStatus?.enabled ? "online" : "offline"}`} />
            {bridgeStatus?.enabled ? t("settings.network.agentBridge.running") : nodeConfig?.bridgeEnabled ? t("settings.network.agentBridge.stoppedNeedsRestart") : t("settings.network.agentBridge.disabled")}
          </dd>
          {bridgeStatus?.enabled && (
            <>
              <dt>{t("settings.network.agentBridge.agentName")}</dt>
              <dd>{bridgeStatus.agentName ?? t("settings.network.agentBridge.defaultAgentName")}</dd>
              <dt>{t("settings.network.agentBridge.agentPeerId")}</dt>
              <dd><code>{bridgeStatus.agentPeerId}</code></dd>
              <dt>{t("settings.network.agentBridge.agentUrl")}</dt>
              <dd><code>{bridgeStatus.agentUrl}</code></dd>
              <dt>{t("settings.network.agentBridge.listenPort")}</dt>
              <dd>{bridgeStatus.listenPort}</dd>
            </>
          )}
        </dl>
        {(!bridgeStatus?.enabled) && (
          nodeConfig?.bridgeEnabled ? (
            <p className="settings-hint">{t("settings.network.agentBridge.enabledOnRestart")}</p>
          ) : (
            <p className="settings-hint">{t("settings.network.agentBridge.enableHint")}</p>
          )
        )}

        {/* Bridge enable/disable toggle — takes effect on next node restart */}
        <div className="settings-toggle-row" style={{ marginTop: "12px" }}>
          <div className="toggle-info">
            <strong>{t("settings.network.agentBridge.enableBridge")}</strong>
            <span className="toggle-desc">{t("settings.network.agentBridge.enableBridgeDesc")}</span>
          </div>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={bridgeEnabledToggle.checked}
              onChange={bridgeEnabledToggle.onCheckboxChange}
            />
            <span className="slider" />
          </label>
        </div>

        {/* Pairing QR for mobile app lives in the top-bar QR icon (PairingQRModal) */}

        {/* WAN join invite (Phase 15B) — bootstrap cold-start across NAT */}
        {!isMobileNode ? (
          <div style={{ marginTop: "16px" }}>
            <strong>{t("settings.network.agentBridge.wanInviteTitle")}</strong>
            <p className="settings-hint" style={{ marginTop: 4 }}>
              {t("settings.network.agentBridge.wanInviteDesc")}
            </p>
            <WanCircuitReservationSoftGate
              chip={circuitReservationChip}
              ready={reservationReady}
              forceWithoutReservation={wanForceWithoutReservation}
              onForceChange={setWanForceWithoutReservation}
              showForceCheckbox={!wanJoinQr}
              reservationLabel={t("settings.network.agentBridge.circuitReservationLabel")}
              waitHint={t("settings.network.agentBridge.wanInviteWaitReservation")}
              forceLabel={t("settings.network.agentBridge.wanInviteForceAdvanced")}
              liveLabel={t("settings.network.wanDiagnostics.circuitReservationLive")}
            />
            {!wanJoinQr ? (
              <>
                <WanJoinInviteExpirySelect
                  id="wan-invite-expiry"
                  value={wanInviteExpiryPreset}
                  onChange={setWanInviteExpiryPreset}
                  disabled={wanJoinLoading}
                  messageScope="settings"
                />
                <button
                  type="button"
                  className="settings-button"
                  data-testid="show-wan-invite-qr"
                  onClick={() => { void handleShowWanJoinInvite(); }}
                  disabled={wanJoinLoading || !canMintWanInvite || nodeStatus !== "running"}
                >
                  {wanJoinLoading ? t("settings.network.agentBridge.generating") : t("settings.network.agentBridge.showWanInviteQr")}
                </button>
              </>
            ) : (
              <div style={{ textAlign: "center" }}>
                <img
                  src={wanJoinQr}
                  alt={t("settings.network.agentBridge.wanInviteQrAlt")}
                  style={{ width: 256, height: 256, border: "2px solid var(--border-color)", borderRadius: 8 }}
                />
                <p className="settings-hint" style={{ marginTop: 8, wordBreak: "break-all", fontSize: "0.75rem" }}>
                  <code style={{ fontSize: "0.65rem" }}>{wanJoinUri}</code>
                </p>
                <button
                  type="button"
                  className="settings-button"
                  onClick={() => { void navigator.clipboard.writeText(wanJoinUri); }}
                  style={{ marginTop: 4 }}
                >
                  {t("settings.network.agentBridge.copyLink")}
                </button>
                <button
                  type="button"
                  className="settings-button"
                  onClick={() => setWanJoinQr(null)}
                  style={{ marginTop: 4, marginLeft: 4 }}
                >
                  {t("settings.network.agentBridge.hideQr")}
                </button>
              </div>
            )}
            <dl className="settings-list" style={{ marginTop: 12 }}>
              <dt>{t("settings.network.agentBridge.acceptWanInvite")}</dt>
              <dd>
                <textarea
                  className="settings-input"
                  rows={3}
                  placeholder={t("settings.network.agentBridge.wanInvitePlaceholder")}
                  value={wanInvitePaste}
                  onChange={(e) => setWanInvitePaste(e.target.value)}
                />
                <button
                  type="button"
                  className="settings-button"
                  disabled={wanInviteApplyBusy || !wanInvitePaste.trim()}
                  onClick={() => { void handleApplyWanJoinInvite(); }}
                  style={{ marginTop: 8 }}
                >
                  {wanInviteApplyBusy ? t("settings.network.agentBridge.applying") : t("settings.network.agentBridge.applyInvite")}
                </button>
                {wanInviteApplyMsg ? (
                  <p className="settings-hint" style={{ marginTop: 8 }} role="status">
                    {wanInviteApplyMsg}
                  </p>
                ) : null}
              </dd>
            </dl>
          </div>
        ) : null}
        {/* Authorized devices live in the Account tab now (single source of truth). */}
      </section>

      {/* Relay Public WS URL */}
      <section className="settings-section">
        <h3>{t("settings.network.relayWs.title")}</h3>
        <p className="section-desc">
          {t("settings.network.relayWs.desc")}
        </p>
        <dl className="settings-list">
          <dt>{t("settings.network.relayWs.label")}</dt>
          <dd>
            <input
              type="text"
              className="settings-input"
              placeholder={t("settings.network.relayWs.placeholder")}
              value={nodeConfig?.relayPublicWsUrl ?? ""}
              onChange={async (e) => {
                const value = e.target.value.trim();
                await nodeService.updateNodeConfig({ relayPublicWsUrl: value || "" });
                await refreshNodeConfig();
              }}
            />
          </dd>
        </dl>
      </section>

      <section className="settings-section">
        <h3>{t("settings.network.resourceTuning.title")}</h3>
        <p className="section-desc">
          {t("settings.network.resourceTuning.desc")}
        </p>
        <label className="settings-field">
          <span className="settings-field-label">{t("settings.network.resourceTuning.mode")}</span>
          <select
            className="settings-input"
            value={nodeConfig?.connectivityMode ?? "optimized"}
            onChange={async (e) => {
              const mode = e.target.value as
                | "normal"
                | "optimized"
                | "smart"
                | "aggressive";
              await nodeService.updateNodeConfig({ connectivityMode: mode });
              await refreshNodeConfig();
            }}
          >
            <option value="normal">{t("settings.network.resourceTuning.modeNormal")}</option>
            <option value="optimized">{t("settings.network.resourceTuning.modeOptimized")}</option>
            <option value="smart">{t("settings.network.resourceTuning.modeSmart")}</option>
            <option value="aggressive">{t("settings.network.resourceTuning.modeAggressive")}</option>
          </select>
        </label>
        <p className="section-desc" data-testid="connectivity-mode-summary">
          {formatConnectivityPresetSummary(
            resolveConnectivityPreset(nodeConfig?.connectivityMode ?? "optimized"),
          )}
        </p>
        <p className="section-desc">{t("settings.network.resourceTuning.restartHint")}</p>
      </section>

      <section className="settings-section">
        <h3>{t("settings.network.aiChatBehavior.title")}</h3>
        <p className="section-desc">{t("settings.network.aiChatBehavior.desc")}</p>

        <div className="settings-toggle-row">
          <div className="toggle-info">
            <strong>{t("settings.network.aiChatBehavior.chatAssist")}</strong>
            <span className="toggle-desc">{t("settings.network.aiChatBehavior.chatAssistDesc")}</span>
          </div>
          <label className="toggle-switch">
            <input type="checkbox" checked={chatAssistToggle.checked}
              onChange={chatAssistToggle.onCheckboxChange} />
            <span className="slider" />
          </label>
        </div>

        <div className="settings-toggle-row">
          <div className="toggle-info">
            <strong>{t("settings.network.aiChatBehavior.autoAiResponse")}</strong>
            <span className="toggle-desc">{t("settings.network.aiChatBehavior.autoAiResponseDesc")}</span>
          </div>
          <label className="toggle-switch">
            <input type="checkbox"
              checked={autoSendChatToggle.checked}
              onChange={autoSendChatToggle.onCheckboxChange} />
            <span className="slider" />
          </label>
        </div>

        <div className="settings-toggle-row">
          <div className="toggle-info">
            <strong>{t("settings.network.aiChatBehavior.killSwitch")}</strong>
            <span className="toggle-desc">{t("settings.network.aiChatBehavior.killSwitchDesc")}</span>
          </div>
          <label className="toggle-switch">
            <input type="checkbox" checked={killSwitchToggle.checked}
              onChange={killSwitchToggle.onCheckboxChange} />
            <span className="slider" />
          </label>
        </div>

        <div className="form-group">
          <label>{t("settings.network.aiChatBehavior.chatNotifications")}</label>
          <select
            className="settings-input"
            value={nodeConfig?.a2aChatNotifications ?? "off"}
            onChange={(e) => {
              void updateNodeConfig({
                a2aChatNotifications: e.target.value as A2aChatNotificationMode,
              });
            }}
          >
            <option value="off">{t("settings.network.aiChatBehavior.chatNotificationsOff")}</option>
            <option value="milestones_only">{t("settings.network.aiChatBehavior.chatNotificationsMilestones")}</option>
            <option value="all_reports">{t("settings.network.aiChatBehavior.chatNotificationsAll")}</option>
          </select>
          <p className="field-desc">
            {t("settings.network.aiChatBehavior.chatNotificationsHint")}
          </p>
        </div>

        <div className="form-group">
          <label>{t("settings.network.aiChatBehavior.agentInteractionMode")}</label>
          <select
            className="settings-input"
            value={nodeConfig?.agentInteractionMode ?? "structured_preferred"}
            onChange={(e) => {
              void updateNodeConfig({
                agentInteractionMode: e.target.value as AgentInteractionMode,
              });
            }}
          >
            <option value="structured_preferred">{t("settings.network.aiChatBehavior.agentInteractionStructured")}</option>
            <option value="chat_ok">{t("settings.network.aiChatBehavior.agentInteractionChatOk")}</option>
          </select>
          <p className="field-desc">
            {t("settings.network.aiChatBehavior.agentInteractionHint")}
          </p>
        </div>

        <div className="form-group">
          <label>{t("settings.network.aiChatBehavior.agentVisibility")}</label>
          <p className="field-desc">
            {t("settings.network.aiChatBehavior.agentVisibilityHint")}
          </p>
          {(["social", "knowledge", "home", "research"] as AgentActivityDomain[]).map((domain) => (
            <div className="form-row" key={domain}>
              <div className="form-group">
                <label>{domain}</label>
                <select
                  className="settings-input"
                  value={nodeConfig?.agentVisibility?.[domain] ?? "instant"}
                  onChange={(e) => {
                    void updateNodeConfig({
                      agentVisibility: {
                        ...(nodeConfig?.agentVisibility ?? {}),
                        [domain]: e.target.value as AgentNotifyMode,
                      },
                    });
                  }}
                >
                  <option value="instant">{t("settings.network.aiChatBehavior.visibilityInstant")}</option>
                  <option value="brief">{t("settings.network.aiChatBehavior.visibilityBrief")}</option>
                  <option value="silent">{t("settings.network.aiChatBehavior.visibilitySilent")}</option>
                  <option value="approval">{t("settings.network.aiChatBehavior.visibilityApproval")}</option>
                </select>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="settings-section">
        <h3>{t("settings.network.chatDiagnostics.title")}</h3>
        <p className="section-desc">
          {t("settings.network.chatDiagnostics.desc")}
        </p>
        <dl className="settings-list">
          <dt>{t("settings.network.chatDiagnostics.contactOptional")}</dt>
          <dd>
            <select
              className="settings-input"
              value={chatDiagContact}
              onChange={(e) => setChatDiagContact(e.target.value)}
            >
              <option value="">{t("settings.network.chatDiagnostics.nodeOnly")}</option>
              {bonds.map((bond) => (
                <option key={bond.peerOwnerId} value={bond.peerOwnerId}>
                  {bond.displayName ?? bond.peerOwnerId}
                </option>
              ))}
            </select>
          </dd>
        </dl>
        <button
          type="button"
          className="settings-button"
          disabled={chatDiagLoading || nodeStatus !== "running"}
          onClick={() => {
            setChatDiagLoading(true);
            setChatDiagError(null);
            void nodeService
              .getChatDiagnostics(chatDiagContact || undefined)
              .then(setChatDiagnostics)
              .catch((err) => {
                setChatDiagnostics(null);
                setChatDiagError(err instanceof Error ? err.message : String(err));
              })
              .finally(() => setChatDiagLoading(false));
          }}
        >
          {chatDiagLoading ? t("settings.network.chatDiagnostics.running") : t("settings.network.chatDiagnostics.run")}
        </button>
        {chatDiagError && (
          <p className="settings-diagnostics-error" style={{ marginTop: "8px" }}>
            {chatDiagError}
          </p>
        )}
        {chatDiagnostics && (
          <div className="settings-diagnostics-panel" style={{ marginTop: "12px" }}>
            <ul className="settings-diagnostics-hints">
              {chatDiagnostics.hints.map((hint) => (
                <li key={hint}>{hint}</li>
              ))}
            </ul>
            <dl className="settings-list" style={{ marginTop: "12px" }}>
              <dt>{t("settings.network.chatDiagnostics.relayControlTargets")}</dt>
              <dd>{chatDiagnostics.relayControlTargets.length}</dd>
              <dt>{t("settings.network.chatDiagnostics.lastRelayCheckin")}</dt>
              <dd>
                {chatDiagnostics.lastRelayCheckin
                  ? t("settings.network.chatDiagnostics.relayCheckinOk", {
                      ok: chatDiagnostics.lastRelayCheckin.results.filter((r) => r.ok).length,
                      total: chatDiagnostics.lastRelayCheckin.results.length,
                      source: chatDiagnostics.lastRelayCheckin.source,
                    })
                  : t("settings.network.chatDiagnostics.noneYet")}
              </dd>
              <dt>{t("settings.network.chatDiagnostics.lastRelayLookup")}</dt>
              <dd>
                {chatDiagnostics.lastRelayLookup
                  ? chatDiagnostics.lastRelayLookup.ok
                    ? t("settings.network.chatDiagnostics.relayLookupOk", {
                        peerCount: chatDiagnostics.lastRelayLookup.peerCount,
                        circuitAddrs: chatDiagnostics.lastRelayLookup.circuitAddrsStored,
                      })
                    : t("settings.network.chatDiagnostics.relayLookupFailed", {
                        error: chatDiagnostics.lastRelayLookup.error ?? "unknown",
                      })
                  : t("settings.network.chatDiagnostics.noneYet")}
              </dd>
              <dt>{t("settings.network.chatDiagnostics.connections")}</dt>
              <dd>
                {t("settings.network.chatDiagnostics.connectionsDetail", {
                  totalPeers: chatDiagnostics.connectionStats.totalPeers,
                  totalConnections: chatDiagnostics.connectionStats.totalConnections,
                  circuitPeers: chatDiagnostics.connectionStats.circuitPeers,
                  circuitConnections: chatDiagnostics.connectionStats.circuitConnections,
                })}
              </dd>
              <dt>{t("settings.network.chatDiagnostics.discoverySeeds")}</dt>
              <dd>
                {t("settings.network.chatDiagnostics.discoverySeedsDetail", {
                  total: chatDiagnostics.discoverySeedCount,
                  circuit: chatDiagnostics.circuitSeedCount,
                })}
              </dd>
              {chatDiagnostics.contact && (
                <>
                  <dt>{t("settings.network.chatDiagnostics.contactDialHints")}</dt>
                  <dd>
                    {chatDiagnostics.contact.dialHintCount}
                    {chatDiagnostics.contact.badPublicBootstrapHints > 0
                      ? t("settings.network.chatDiagnostics.badPublicBootstrap", {
                          count: chatDiagnostics.contact.badPublicBootstrapHints,
                        })
                      : ""}
                  </dd>
                  {chatDiagnostics.contact.sampleDialHints.length > 0 && (
                    <>
                      <dt>{t("settings.network.chatDiagnostics.sampleHints")}</dt>
                      <dd>
                        {chatDiagnostics.contact.sampleDialHints.map((hint) => (
                          <code key={hint} style={{ display: "block", marginBottom: "4px", wordBreak: "break-all" }}>
                            {hint}
                          </code>
                        ))}
                      </dd>
                    </>
                  )}
                </>
              )}
            </dl>
          </div>
        )}
      </section>

      <section className="settings-section">
        <h3>{t("settings.network.wanDiagnostics.title")}</h3>
        <p className="section-desc">
          {t("settings.network.wanDiagnostics.desc")}
        </p>
        <button
          type="button"
          className="settings-button"
          disabled={connectivityDiagLoading || nodeStatus !== "running"}
          onClick={() => {
            setConnectivityDiagLoading(true);
            setConnectivityDiagError(null);
            void nodeService
              .getConnectivityDiagnostics()
              .then(setConnectivityDiagnostics)
              .catch((err) => {
                setConnectivityDiagnostics(null);
                setConnectivityDiagError(err instanceof Error ? err.message : String(err));
              })
              .finally(() => setConnectivityDiagLoading(false));
          }}
        >
          {connectivityDiagLoading ? t("settings.network.wanDiagnostics.running") : t("settings.network.wanDiagnostics.run")}
        </button>
        {connectivityDiagError && (
          <p className="settings-diagnostics-error" style={{ marginTop: "8px" }}>
            {connectivityDiagError}
          </p>
        )}
        {connectivityDiagnostics && (
          <div className="settings-diagnostics-panel" style={{ marginTop: "12px" }}>
            <ul className="settings-diagnostics-hints">
              {connectivityDiagnostics.hints.map((hint) => (
                <li key={hint}>{hint}</li>
              ))}
            </ul>
            <dl className="settings-list" style={{ marginTop: "12px" }}>
              <dt>{t("settings.network.wanDiagnostics.stageDBadge")}</dt>
              <dd>
                {connectivityDiagnostics.stageD.badge} — {connectivityDiagnostics.stageD.badgeExplanation}
              </dd>
              <dt>{t("settings.network.wanDiagnostics.bootstrap")}</dt>
              <dd>
                {connectivityDiagnostics.axes.bootstrapReachability.state}:{" "}
                {connectivityDiagnostics.axes.bootstrapReachability.explanation}
              </dd>
              <dt>{t("settings.network.wanDiagnostics.relay")}</dt>
              <dd>
                {connectivityDiagnostics.axes.relayAvailability.state}:{" "}
                {connectivityDiagnostics.axes.relayAvailability.explanation}
              </dd>
              <dt>{t("settings.network.wanDiagnostics.circuitReservation")}</dt>
              <dd>
                <span
                  style={{
                    fontWeight: 600,
                    color:
                      connectivityDiagnostics.circuitReservation?.state === "reserved"
                        ? "var(--ok, #1a7f37)"
                        : connectivityDiagnostics.circuitReservation?.state === "failed"
                          ? "var(--danger, #cf222e)"
                          : undefined,
                  }}
                >
                  {(connectivityDiagnostics.circuitReservation?.state ?? "off").toUpperCase()}
                </span>
                {connectivityDiagnostics.circuitReservation?.live
                  ? ` — ${t("settings.network.wanDiagnostics.circuitReservationLive")}`
                  : ""}
                {connectivityDiagnostics.circuitReservation?.lastError
                  ? ` — ${connectivityDiagnostics.circuitReservation.lastError}`
                  : ""}
              </dd>
              <dt>{t("settings.network.wanDiagnostics.holePunch")}</dt>
              <dd>
                {connectivityDiagnostics.axes.holePunch.state}: {connectivityDiagnostics.axes.holePunch.explanation}
              </dd>
              <dt>{t("settings.network.wanDiagnostics.policyBlock")}</dt>
              <dd>
                {connectivityDiagnostics.axes.policyBlock.state}:{" "}
                {connectivityDiagnostics.axes.policyBlock.explanation}
              </dd>
              <dt>{t("settings.network.wanDiagnostics.quic")}</dt>
              <dd>{connectivityDiagnostics.quicEnabled ? t("settings.network.wanDiagnostics.quicEnabled") : t("settings.network.wanDiagnostics.quicDisabled")}</dd>
            </dl>
            {connectivityDiagnostics.signOffChecklist.length > 0 && (
              <details style={{ marginTop: "12px" }}>
                <summary>{t("settings.network.wanDiagnostics.signOffChecklist")}</summary>
                <ol style={{ marginTop: "8px", paddingLeft: "1.25rem" }}>
                  {connectivityDiagnostics.signOffChecklist.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              </details>
            )}
            <button
              type="button"
              className="settings-button"
              style={{ marginTop: "12px" }}
              onClick={() => {
                const report = formatWanSignOffEvidenceReport({
                  physicalTwoNat: true,
                  relaySignOff: "pending",
                  diagnostics: {
                    nodeOnline: connectivityDiagnostics.nodeOnline,
                    stageD: connectivityDiagnostics.stageD,
                    axes: connectivityDiagnostics.axes,
                  },
                });
                void navigator.clipboard.writeText(report);
              }}
            >
              {t("settings.network.wanDiagnostics.copyEvidence")}
            </button>
          </div>
        )}
      </section>

      <section className="settings-section">
        <h3>{t("settings.network.twoNatSignOff.title")}</h3>
        <p className="section-desc">
          {t("settings.network.twoNatSignOff.desc")}
        </p>
        <ol className="settings-list" style={{ paddingLeft: "1.25rem", marginTop: "8px" }}>
          {WAN_TWO_NAT_CHECKLIST_STEPS.map((step) => (
            <li key={step.id} style={{ marginBottom: "10px" }}>
              <label style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
                <input
                  type="checkbox"
                  checked={twoNatChecklistDone[step.id] === true}
                  onChange={(e) => toggleTwoNatStep(step.id, e.target.checked)}
                />
                <span>
                  <strong>{step.title}</strong>
                  <br />
                  <span className="toggle-desc">{step.detail}</span>
                </span>
              </label>
            </li>
          ))}
        </ol>
        <div className="settings-form-row" style={{ marginTop: "12px" }}>
          <label>
            {t("settings.network.twoNatSignOff.relayMultiaddr")}
            <input
              type="text"
              className="settings-input"
              placeholder={t("settings.network.twoNatSignOff.relayPlaceholder")}
              value={twoNatRelayAddr}
              onChange={(e) => setTwoNatRelayAddr(e.target.value)}
            />
          </label>
        </div>
        <div className="settings-form-row">
          <label>
            {t("settings.network.twoNatSignOff.natAPeerId")}
            <input
              type="text"
              className="settings-input"
              value={twoNatNatAPeer}
              onChange={(e) => setTwoNatNatAPeer(e.target.value)}
            />
          </label>
          <label>
            {t("settings.network.twoNatSignOff.natBPeerId")}
            <input
              type="text"
              className="settings-input"
              value={twoNatNatBPeer}
              onChange={(e) => setTwoNatNatBPeer(e.target.value)}
            />
          </label>
        </div>
        <div className="settings-toggle-row" style={{ marginTop: "8px" }}>
          <label style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <input
              type="checkbox"
              checked={twoNatAutomatedOk}
              onChange={(e) => setTwoNatAutomatedOk(e.target.checked)}
            />
            {t("settings.network.twoNatSignOff.automatedBaseline")}
          </label>
        </div>
        <div className="settings-toggle-row">
          <label style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <input
              type="checkbox"
              checked={twoNatChatVerified}
              onChange={(e) => setTwoNatChatVerified(e.target.checked)}
            />
            {t("settings.network.twoNatSignOff.manualChatVerified")}
          </label>
        </div>
        <button
          type="button"
          className="settings-button"
          style={{ marginTop: "12px" }}
          onClick={() => {
            const text = formatWanTwoNatOperatorChecklist({
              relayAddr: twoNatRelayAddr.trim() || undefined,
              natAPeerId: twoNatNatAPeer.trim() || undefined,
              natBPeerId: twoNatNatBPeer.trim() || undefined,
              automatedBaselineOk: twoNatAutomatedOk,
              chatVerified: twoNatChatVerified,
            });
            void navigator.clipboard.writeText(text);
          }}
        >
          {t("settings.network.twoNatSignOff.copyChecklist")}
        </button>
        <button
          type="button"
          className="settings-button"
          style={{ marginTop: "8px", marginLeft: "8px" }}
          disabled={!twoNatChatVerified || !twoNatAutomatedOk}
          onClick={() => {
            const report = formatWanSignOffEvidenceReport({
              physicalTwoNat: true,
              relaySignOff: twoNatChatVerified ? "ok" : "pending",
              relayAddr: twoNatRelayAddr.trim() || undefined,
              peerId:
                twoNatNatAPeer.trim() && twoNatNatBPeer.trim()
                  ? `${twoNatNatAPeer.trim()}↔${twoNatNatBPeer.trim()}`
                  : twoNatNatAPeer.trim() || undefined,
              notes: [
                twoNatRelayAddr.trim() ? `relay=${twoNatRelayAddr.trim()}` : null,
                twoNatNatAPeer.trim() ? `natA=${twoNatNatAPeer.trim()}` : null,
                twoNatNatBPeer.trim() ? `natB=${twoNatNatBPeer.trim()}` : null,
                twoNatAutomatedOk ? "wan-relay-signoff-e2e green" : null,
                twoNatChatVerified ? "manual two-NAT signed chat verified" : null,
              ]
                .filter(Boolean)
                .join("; "),
              diagnostics: connectivityDiagnostics
                ? {
                    nodeOnline: connectivityDiagnostics.nodeOnline,
                    stageD: connectivityDiagnostics.stageD,
                    axes: connectivityDiagnostics.axes,
                  }
                : undefined,
            });
            void navigator.clipboard.writeText(report);
          }}
        >
          {t("settings.network.twoNatSignOff.copyLedgerRow")}
        </button>
      </section>

      {/* Phase 38 — WebRTC ICE servers (STUN/TURN) */}
      <section className="settings-section">
        <h3>{t("settings.network.iceServers.title")}</h3>
        <p className="section-desc">
          {t("settings.network.iceServers.desc")}
        </p>
        <textarea
          className="settings-textarea"
          rows={4}
          placeholder={t("settings.network.iceServers.placeholder")}
          value={iceServersText}
          onChange={(e) => setIceServersText(e.target.value)}
        />
        <p className="section-desc muted">
          {t("settings.network.iceServers.hint")}
        </p>
        <button
          type="button"
          className="settings-button"
          style={{ marginTop: "8px" }}
          onClick={async () => {
            try {
              const trimmed = iceServersText.trim();
              const parsed = trimmed ? JSON.parse(trimmed) : [];
              await nodeService.updateNodeConfig({ iceServers: parsed });
              setIceServersSaved(true);
              await refreshNodeConfig();
              setTimeout(() => setIceServersSaved(false), 3000);
            } catch {
              // Invalid JSON — user is still editing
            }
          }}
        >
          {iceServersSaved
            ? t("settings.network.iceServers.saved")
            : t("settings.network.iceServers.save")}
        </button>
      </section>

      {/* Phase 42H — structured TURN credential editor. Most calls work
          with the STUN defaults above; this section is for operators
          behind symmetric NAT who need a relay. */}
      <TurnServersSection
        nodeConfig={nodeConfig}
        nodeService={nodeService}
        refreshNodeConfig={refreshNodeConfig}
      />
    </>
  );
}

/**
 * Phase 42H — structured TURN credential editor.
 *
 * Renders one editable row per TURN entry (URL / username / credential /
 * TTL) and persists the array as the home's `node-config.iceServers`
 * list — keeping the existing JSON editor above as the source of truth
 * for raw STUN-only entries.
 */
/** Phase 42H — exported for direct unit-testing without going through
 *  the full `SettingsNodeTab` + `NodeStateProvider` context. */
export function TurnServersSection({
  nodeConfig,
  nodeService,
  refreshNodeConfig,
}: {
  nodeConfig: NodeConfig | null;
  nodeService: ReturnType<typeof useNodeService>;
  refreshNodeConfig: () => Promise<void>;
}) {
  const t = useT();
  const initialTurn = useMemo(
    () => extractTurnServers(nodeConfig?.iceServers),
    [nodeConfig?.iceServers],
  );
  const [draft, setDraft] = useState<TurnDraft[]>(initialTurn);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<string>("");

  // Re-sync when nodeConfig changes from outside (load, restart, etc).
  useEffect(() => {
    setDraft(extractTurnServers(nodeConfig?.iceServers));
  }, [nodeConfig?.iceServers]);

  const addRow = () => {
    const preset = TURN_PRESETS[0];
    const blank: TurnDraft = {
      id: makeTurnId(),
      urls: preset?.urls ?? "",
      username: "",
      credential: "",
    };
    setDraft((prev) => [...prev, blank]);
    // Auto-select the preset so the selector matches the pre-filled URL.
    setSelectedPreset(preset?.id ?? "");
  };

  const applyPresetToLastRow = (presetId: string) => {
    setSelectedPreset(presetId);
    const preset = presetById(presetId);
    if (!preset) return;
    setDraft((prev) => {
      if (prev.length === 0) return prev;
      const next = [...prev];
      const last = { ...next[next.length - 1]!, urls: preset.urls };
      next[next.length - 1] = last;
      return next;
    });
  };

  const removeRow = (id: string) => {
    setDraft((prev) => prev.filter((row) => row.id !== id));
  };

  const updateRow = (id: string, patch: Partial<TurnDraft>) => {
    setDraft((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const resetToDefaults = () => {
    // Clear the TURN draft — the home's 3-STUN default takes over for
    // non-symmetric-NAT. Users can re-add TURN rows if they still
    // need relay.
    setDraft([]);
    setSelectedPreset("");
    setError(null);
  };

  const save = async () => {
    setError(null);
    const validation = validateTurnDraft(draft, {
      invalidUrl: t("settings.network.turnServers.invalidUrl"),
      missingCredentials: t("settings.network.turnServers.missingCredentials"),
    });
    if (validation) {
      setError(validation.message);
      return;
    }
    setBusy(true);
    try {
      const merged = mergeTurnServers(nodeConfig?.iceServers, draft);
      await nodeService.updateNodeConfig({ iceServers: merged });
      await refreshNodeConfig();
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="settings-section" data-testid="turn-servers-section">
      <h3>{t("settings.network.turnServers.title")}</h3>
      <p className="section-desc">{t("settings.network.turnServers.desc")}</p>

      {/* Preset selector — pre-fills the last row's URL with a known
          provider template so the user only has to paste credentials. */}
      <div className="turn-preset-row">
        <label className="settings-field-label" htmlFor="turn-preset">
          {t("settings.network.turnServers.presetLabel")}
        </label>
        <select
          id="turn-preset"
          className="settings-input"
          value={selectedPreset}
          onChange={(e) => applyPresetToLastRow(e.target.value)}
          disabled={draft.length === 0}
          data-testid="turn-preset"
        >
          <option value="">{t("settings.network.turnServers.presetCustom")}</option>
          {TURN_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      {draft.length === 0 ? (
        <p className="settings-hint" style={{ marginTop: "6px" }}>
          {t("settings.network.turnServers.empty")}
        </p>
      ) : (
        <div className="turn-rows">
          {draft.map((row) => (
            <div key={row.id} className="turn-row" data-testid={`turn-row-${row.id}`}>
              <label className="turn-field turn-field-wide">
                <span className="settings-field-label">
                  {t("settings.network.turnServers.urlLabel")}
                </span>
                <input
                  type="text"
                  className="settings-input"
                  placeholder={t("settings.network.turnServers.urlPlaceholder")}
                  value={row.urls}
                  onChange={(e) => updateRow(row.id, { urls: e.target.value })}
                />
              </label>
              <label className="turn-field">
                <span className="settings-field-label">
                  {t("settings.network.turnServers.usernameLabel")}
                </span>
                <input
                  type="text"
                  className="settings-input"
                  value={row.username}
                  onChange={(e) => updateRow(row.id, { username: e.target.value })}
                />
              </label>
              <label className="turn-field">
                <span className="settings-field-label">
                  {t("settings.network.turnServers.credentialLabel")}
                </span>
                <input
                  type="password"
                  className="settings-input"
                  value={row.credential}
                  onChange={(e) => updateRow(row.id, { credential: e.target.value })}
                />
              </label>
              <button
                type="button"
                className="settings-button turn-remove"
                onClick={() => removeRow(row.id)}
                aria-label={t("settings.network.turnServers.remove")}
              >
                {t("settings.network.turnServers.remove")}
              </button>
            </div>
          ))}
        </div>
      )}

      <p className="settings-hint" style={{ marginTop: "4px" }}>
        {t("settings.network.turnServers.rotationNote")}
      </p>

      {error ? (
        <p className="settings-diagnostics-error" style={{ marginTop: "8px" }} role="alert">
          {error}
        </p>
      ) : null}

      <div className="settings-buttons" style={{ marginTop: "10px" }}>
        <button
          type="button"
          className="settings-button"
          onClick={addRow}
          data-testid="turn-add-row"
        >
          {t("settings.network.turnServers.addRow")}
        </button>
        <button
          type="button"
          className="settings-button"
          onClick={resetToDefaults}
          disabled={draft.length === 0}
          data-testid="turn-reset"
        >
          {t("settings.network.turnServers.reset")}
        </button>
        <button
          type="button"
          className="settings-save-btn"
          disabled={busy}
          onClick={save}
          data-testid="turn-save"
        >
          {saved
            ? t("settings.network.turnServers.saved")
            : t("settings.network.turnServers.save")}
        </button>
      </div>
    </section>
  );
}

