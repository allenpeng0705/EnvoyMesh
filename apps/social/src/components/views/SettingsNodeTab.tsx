import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useNodeState } from "../../context/NodeStateContext.js";
import {
  useIsInProcessMobileNode,
  useModelProviderUiScope,
  useNodeService,
  useShareOffers,
  useAgentShareProposals,
} from "../../hooks/useNodeService.js";
import QRCode from "qrcode";
import { useOptimisticToggle } from "../../hooks/useOptimisticToggle.js";
import {
  DEFAULT_CLIENT_MAX_CONNECTIONS,
  DEFAULT_PUBLIC_LIBP2P_BOOTSTRAP_PRESETS,
  defaultBootstrapPresetsForDiscoveryProfile,
  formatWanSignOffEvidenceReport,
  formatWanTwoNatOperatorChecklist,
  WAN_TWO_NAT_CHECKLIST_STEPS,
} from "@envoymesh/api";
import type {
  DiscoveryProfile,
  ModelProviderMode,
  NodeConfig,
  RelayConfig,
  AutonomousDomain,
  AutonomousPolicy,
  IpfsEngineStatus,
  ExternalPublishConfig,
  ChatDiagnostics,
  ConnectivityDiagnostics,
  AuthorizedDeviceSummary,
  AgentNotifyMode,
  A2aChatNotificationMode,
  AgentActivityDomain,
  AgentInteractionMode,
} from "@envoymesh/api";

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
  const modelProviderUiScope = useModelProviderUiScope();
  const cloudOnlyMobile = modelProviderUiScope === "cloud-only";
  const isMobileNode = useIsInProcessMobileNode();
  const nodeService = useNodeService();
  const { nodeConfig, nodeStatus, peerId, bridgeStatus, refreshNodeConfig, connectionStatus, refreshConnectionStatus, bonds } =
    useNodeState();

  // Local state mirrors nodeConfig fields for debounced editing
  const [newRelayAddr, setNewRelayAddr] = useState("");
  const [modelEndpoint, setModelEndpoint] = useState(nodeConfig?.modelProviders?.endpoint ?? "");
  const [modelName, setModelName] = useState(nodeConfig?.modelProviders?.modelName ?? "");
  const [modelApiKey, setModelApiKey] = useState(nodeConfig?.modelProviders?.apiKey ?? "");
  const [settingsSaveStatus, setSettingsSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [bootstrapPresets, setBootstrapPresets] = useState<string[]>(
    nodeConfig?.bootstrapPresets ?? [...DEFAULT_PUBLIC_LIBP2P_BOOTSTRAP_PRESETS],
  );
  const bootstrapPresetsSavingRef = useRef(0);
  const modelProviderFieldsDirtyRef = useRef(false);
  const [bootstrapPresetSyncNonce, setBootstrapPresetSyncNonce] = useState(0);

  const [friendMatchingDraft, setFriendMatchingDraft] = useState("");
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

  const toggleTwoNatStep = useCallback((stepId: string, checked: boolean) => {
    setTwoNatChecklistDone((prev) => {
      const next = { ...prev, [stepId]: checked };
      localStorage.setItem(WAN_TWO_NAT_CHECKLIST_STORAGE, JSON.stringify(next));
      return next;
    });
  }, []);

  // Sync local state when nodeConfig loads/changes (async load after mount)
  useEffect(() => {
    if (settingsSaveStatus === "saving" || modelProviderFieldsDirtyRef.current) return;
    const mp = nodeConfig?.modelProviders;
    if (!mp) return;
    setModelEndpoint(mp.endpoint ?? "");
    setModelName(mp.modelName ?? "");
    setModelApiKey(mp.apiKey ?? "");
  }, [nodeConfig?.modelProviders, settingsSaveStatus]);

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
          errorHint: "Could not read IPFS engine status",
        }),
      );
  }, [nodeService, nodeConfig?.externalPublish?.allowIpfs, isMobileNode]);

  useEffect(() => {
    void refreshConnectionStatus();
  }, [refreshConnectionStatus]);

  useEffect(() => {
    if (chatDiagContact || bonds.length === 0) return;
    setChatDiagContact(bonds[0]!.peerOwnerId);
  }, [bonds, chatDiagContact]);

  const discoveryProfile: DiscoveryProfile = nodeConfig?.discoveryProfile ?? "wan-default";
  const isPublicLibp2pDiscovery = discoveryProfile === "wan-default";
  const isPublicNetwork = bootstrapPresets.length > 0;
  const relays = (nodeConfig?.configuredRelays ?? []) as RelayConfig[];

  const modelMode = nodeConfig?.modelProviders?.mode ?? "mock";
  const modelProviderHints = useMemo(() => {
    switch (modelMode) {
      case "ollama":
        return {
          endpointPlaceholder: "http://127.0.0.1:11434/v1",
          hint: "Use Ollama’s OpenAI-compatible base URL (must end with /v1). On a phone, use your computer’s LAN IP instead of 127.0.0.1. EnvoyMesh normalizes bare http://host:11434 to …/v1 automatically.",
          apiKeyHint: "Leave empty for typical local Ollama.",
        };
      case "litellm":
        return {
          endpointPlaceholder: "http://127.0.0.1:4000/v1",
          hint: "Point at LiteLLM’s HTTP API (OpenAI-compatible), usually ending with /v1. Mobile: prefer http://<home-LAN-ip>:4000/v1 so the device can reach your proxy.",
          apiKeyHint: "Optional: LiteLLM master key if configured.",
        };
      case "openai-compatible":
        return {
          endpointPlaceholder: "https://api.minimaxi.com/v1",
          hint: "Any Chat Completions–compatible API; base URL should include /v1. MiniMax China: https://api.minimaxi.com/v1 (not api.minimax.com). International: https://api.minimax.io/v1.",
          apiKeyHint: "Usually required unless your gateway injects auth.",
        };
      case "anthropic-compatible":
        return {
          endpointPlaceholder: "https://api.anthropic.com",
          hint: "Anthropic Messages API host only — do not add /v1 here (the client appends /v1/messages).",
          apiKeyHint: "Anthropic API key.",
        };
      default:
        return {
          endpointPlaceholder: "",
          hint: "",
          apiKeyHint: "",
        };
    }
  }, [modelMode]);

  // QR pairing state
  const [pairingQR, setPairingQR] = useState<string | null>(null); // data URL
  const [pairingUri, setPairingUri] = useState<string>("");
  const [pairingLoading, setPairingLoading] = useState(false);
  const [wanJoinQr, setWanJoinQr] = useState<string | null>(null);
  const [wanJoinUri, setWanJoinUri] = useState<string>("");
  const [wanJoinLoading, setWanJoinLoading] = useState(false);
  const [wanInvitePaste, setWanInvitePaste] = useState("");
  const [wanInviteApplyBusy, setWanInviteApplyBusy] = useState(false);
  const [wanInviteApplyMsg, setWanInviteApplyMsg] = useState<string | null>(null);
  const [authorizedDevices, setAuthorizedDevices] = useState<AuthorizedDeviceSummary[]>([]);
  const [authorizedDevicesLoading, setAuthorizedDevicesLoading] = useState(false);
  const [authorizedDevicesError, setAuthorizedDevicesError] = useState<string | null>(null);
  const [revokingDeviceId, setRevokingDeviceId] = useState<string | null>(null);

  const refreshAuthorizedDevices = useCallback(async () => {
    if (isMobileNode) return;
    setAuthorizedDevicesLoading(true);
    setAuthorizedDevicesError(null);
    try {
      const result = await nodeService.listAuthorizedDevices();
      setAuthorizedDevices(result.devices);
    } catch (e) {
      setAuthorizedDevicesError(e instanceof Error ? e.message : String(e));
    } finally {
      setAuthorizedDevicesLoading(false);
    }
  }, [isMobileNode, nodeService]);

  useEffect(() => {
    if (isMobileNode) return;
    void refreshAuthorizedDevices();
  }, [isMobileNode, refreshAuthorizedDevices]);

  const handleRevokeDevice = useCallback(async (deviceId: string) => {
    if (isMobileNode) return;
    const label = authorizedDevices.find((d) => d.deviceId === deviceId)?.displayName ?? deviceId;
    if (!window.confirm(`Revoke device "${label}"? It will no longer be able to send chat as your owner identity.`)) {
      return;
    }
    setRevokingDeviceId(deviceId);
    try {
      await nodeService.revokeAuthorizedDevice({ deviceId, reason: "retired" });
      await refreshAuthorizedDevices();
    } catch (e) {
      setAuthorizedDevicesError(e instanceof Error ? e.message : String(e));
    } finally {
      setRevokingDeviceId(null);
    }
  }, [authorizedDevices, isMobileNode, nodeService, refreshAuthorizedDevices]);

  const handleShowPairingQR = useCallback(async () => {
    setPairingLoading(true);
    try {
      const payload = await nodeService.getPairingPayload();
      // Build envoy://pair URI
      const params = new URLSearchParams({ wsUrl: payload.wsUrl });
      if (payload.relayPeerId) params.set("relayPeerId", payload.relayPeerId);
      if (payload.relayWsUrl) params.set("relayWsUrl", payload.relayWsUrl);
      if (payload.agentPeerId) params.set("agentPeerId", payload.agentPeerId);
      if (payload.agentPubKey) params.set("agentPubKey", payload.agentPubKey);
      if (payload.agentName) params.set("agentName", payload.agentName);
      if (payload.token) params.set("token", payload.token);
      if (payload.ownerPublicKey) params.set("ownerPublicKey", payload.ownerPublicKey);
      if (payload.ownerId) params.set("ownerId", payload.ownerId);
      if (payload.homeNodePeerId) params.set("homeNodePeerId", payload.homeNodePeerId);
      const uri = `envoy://pair?${params.toString()}`;
      setPairingUri(uri);
      const dataUrl = await QRCode.toDataURL(uri, { width: 256, margin: 1 });
      setPairingQR(dataUrl);
    } catch (e) {
      console.error("Failed to generate pairing QR:", e);
    } finally {
      setPairingLoading(false);
    }
  }, [nodeService]);

  const handleShowWanJoinInvite = useCallback(async () => {
    setWanJoinLoading(true);
    setWanInviteApplyMsg(null);
    try {
      const result = await nodeService.createWanJoinInvite({ expiresInHours: 168 });
      setWanJoinUri(result.uri);
      const dataUrl = await QRCode.toDataURL(result.uri, { width: 256, margin: 1 });
      setWanJoinQr(dataUrl);
    } catch (e) {
      console.error("Failed to generate WAN join invite:", e);
      setWanInviteApplyMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setWanJoinLoading(false);
    }
  }, [nodeService]);

  const handleApplyWanJoinInvite = useCallback(async () => {
    setWanInviteApplyBusy(true);
    setWanInviteApplyMsg(null);
    try {
      const result = await nodeService.applyWanJoinInvite(wanInvitePaste);
      setWanInviteApplyMsg(
        `Applied invite — ${result.bootstrapPeersAdded} bootstrap peer(s), ${result.bootstrapPresetsAdded} preset(s), ${result.seedsPersisted} seed(s). Restart node if already running.`,
      );
      setWanInvitePaste("");
      await refreshNodeConfig();
    } catch (e) {
      setWanInviteApplyMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setWanInviteApplyBusy(false);
    }
  }, [nodeService, wanInvitePaste, refreshNodeConfig]);

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
    bootstrapPresetsSavingRef.current += 1;
    setBootstrapPresetSyncNonce((n) => n + 1);
    try {
      setBootstrapPresets(bootstrapPresets);
      await nodeService.updateNodeConfig({ discoveryProfile: nextProfile, bootstrapPresets });
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
      bootstrapPresetsSavingRef.current += 1;
      setBootstrapPresetSyncNonce((n) => n + 1);
      try {
        setBootstrapPresets(presets);
        await nodeService.updateNodeConfig({ discoveryProfile: nextProfile, bootstrapPresets: presets });
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

  return (
    <>
      {(pendingShareOffers.length > 0 || agentShareProposals.length > 0) && (
        <section className="settings-section">
          <h3>File sharing</h3>
          <p className="section-desc">
            {pendingShareOffers.length > 0
              ? `${pendingShareOffers.length} incoming file share${pendingShareOffers.length === 1 ? "" : "s"}. `
              : ""}
            {agentShareProposals.length > 0
              ? `${agentShareProposals.length} agent share suggestion${agentShareProposals.length === 1 ? "" : "s"}. `
              : ""}
            Open Chat → Inbox to accept, send, or dismiss.
          </p>
        </section>
      )}

      <section className="settings-section">
        <h3>Node Control</h3>
        <dl className="settings-list">
          <dt>Status</dt>
          <dd className={`status-${nodeStatus}`}>
            <span className={`status-dot ${nodeStatus === "running" ? "online" : nodeStatus === "starting" ? "starting" : "offline"}`} />
            {nodeStatus.charAt(0).toUpperCase() + nodeStatus.slice(1)}
          </dd>
          <dt>Profile Directory</dt>
          <dd>{nodeConfig?.profileDir ?? "Loading..."}</dd>
          <dt>Network peer ID (libp2p)</dt>
          <dd>
            <code>
              {peerId && !peerId.startsWith("envoy_") ? peerId : "Not connected"}
            </code>
          </dd>
          {connectionStatus?.lastError && (
            <>
              <dt>Last node error</dt>
              <dd className="settings-diagnostics-error">
                <span className="settings-diagnostics-time">{connectionStatus.lastErrorAt ?? ""}</span>
                <code>{connectionStatus.lastError}</code>
              </dd>
            </>
          )}
        </dl>
        <div className="node-controls">
          {nodeStatus === "running" ? (
            <button onClick={handleStopNode}>Stop Node</button>
          ) : (
            <button onClick={handleStartNode}>Start Node</button>
          )}
        </div>
      </section>

      <section className="settings-section">
        <h3>Chat connectivity diagnostics</h3>
        <p className="section-desc">
          Check relay registration, circuit dial hints, and likely causes when cross-NAT chat fails.
        </p>
        <dl className="settings-list">
          <dt>Contact (optional)</dt>
          <dd>
            <select
              className="settings-input"
              value={chatDiagContact}
              onChange={(e) => setChatDiagContact(e.target.value)}
            >
              <option value="">Node only (no contact dial hints)</option>
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
          {chatDiagLoading ? "Running…" : "Run chat diagnostics"}
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
              <dt>Relay control targets</dt>
              <dd>{chatDiagnostics.relayControlTargets.length}</dd>
              <dt>Last relay.checkin</dt>
              <dd>
                {chatDiagnostics.lastRelayCheckin
                  ? `${chatDiagnostics.lastRelayCheckin.results.filter((r) => r.ok).length}/${chatDiagnostics.lastRelayCheckin.results.length} ok (${chatDiagnostics.lastRelayCheckin.source})`
                  : "none yet"}
              </dd>
              <dt>Last relay.lookup</dt>
              <dd>
                {chatDiagnostics.lastRelayLookup
                  ? chatDiagnostics.lastRelayLookup.ok
                    ? `${chatDiagnostics.lastRelayLookup.peerCount} peers, ${chatDiagnostics.lastRelayLookup.circuitAddrsStored} circuit addr(s)`
                    : `failed: ${chatDiagnostics.lastRelayLookup.error ?? "unknown"}`
                  : "none yet"}
              </dd>
              <dt>Connections</dt>
              <dd>
                total={chatDiagnostics.connectionStats.totalPeers}/{chatDiagnostics.connectionStats.totalConnections},
                circuit={chatDiagnostics.connectionStats.circuitPeers}/{chatDiagnostics.connectionStats.circuitConnections}
              </dd>
              <dt>Discovery seeds</dt>
              <dd>
                {chatDiagnostics.discoverySeedCount} total, {chatDiagnostics.circuitSeedCount} circuit
              </dd>
              {chatDiagnostics.contact && (
                <>
                  <dt>Contact dial hints</dt>
                  <dd>
                    {chatDiagnostics.contact.dialHintCount}
                    {chatDiagnostics.contact.badPublicBootstrapHints > 0
                      ? ` (${chatDiagnostics.contact.badPublicBootstrapHints} bad public bootstrap)`
                      : ""}
                  </dd>
                  {chatDiagnostics.contact.sampleDialHints.length > 0 && (
                    <>
                      <dt>Sample hints</dt>
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
        <h3>WAN connectivity diagnostics</h3>
        <p className="section-desc">
          Classifies bootstrap reachability, relay availability, hole punch (DCUtR), and discovery policy blocks.
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
          {connectivityDiagLoading ? "Running…" : "Run WAN diagnostics"}
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
              <dt>Stage D badge</dt>
              <dd>
                {connectivityDiagnostics.stageD.badge} — {connectivityDiagnostics.stageD.badgeExplanation}
              </dd>
              <dt>Bootstrap</dt>
              <dd>
                {connectivityDiagnostics.axes.bootstrapReachability.state}:{" "}
                {connectivityDiagnostics.axes.bootstrapReachability.explanation}
              </dd>
              <dt>Relay</dt>
              <dd>
                {connectivityDiagnostics.axes.relayAvailability.state}:{" "}
                {connectivityDiagnostics.axes.relayAvailability.explanation}
              </dd>
              <dt>Hole punch (DCUtR)</dt>
              <dd>
                {connectivityDiagnostics.axes.holePunch.state}: {connectivityDiagnostics.axes.holePunch.explanation}
              </dd>
              <dt>Policy block</dt>
              <dd>
                {connectivityDiagnostics.axes.policyBlock.state}:{" "}
                {connectivityDiagnostics.axes.policyBlock.explanation}
              </dd>
              <dt>QUIC</dt>
              <dd>{connectivityDiagnostics.quicEnabled ? "enabled" : "disabled or not in profile trace"}</dd>
            </dl>
            {connectivityDiagnostics.signOffChecklist.length > 0 && (
              <details style={{ marginTop: "12px" }}>
                <summary>Live multi-machine sign-off checklist</summary>
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
              Copy physical two-NAT sign-off evidence
            </button>
          </div>
        )}
      </section>

      <section className="settings-section">
        <h3>Physical two-NAT sign-off</h3>
        <p className="section-desc">
          Operator checklist for §4 WAN sign-off when two home routers are available. Progress is saved locally.
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
            Relay multiaddr
            <input
              type="text"
              className="settings-input"
              placeholder="/ip4/…/tcp/4001/p2p/…"
              value={twoNatRelayAddr}
              onChange={(e) => setTwoNatRelayAddr(e.target.value)}
            />
          </label>
        </div>
        <div className="settings-form-row">
          <label>
            NAT A peerId
            <input
              type="text"
              className="settings-input"
              value={twoNatNatAPeer}
              onChange={(e) => setTwoNatNatAPeer(e.target.value)}
            />
          </label>
          <label>
            NAT B peerId
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
            Automated baseline passed (wan-relay-signoff-e2e)
          </label>
        </div>
        <div className="settings-toggle-row">
          <label style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <input
              type="checkbox"
              checked={twoNatChatVerified}
              onChange={(e) => setTwoNatChatVerified(e.target.checked)}
            />
            Manual two-NAT signed chat verified
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
          Copy operator checklist
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
          Copy completed ledger row
        </button>
      </section>

      <section className="settings-section">
        <h3>Discovery Settings</h3>
        <p className="section-desc">
          Configure how your node discovers other peers on the network.
        </p>
        <div className="settings-toggle-row">
          <div className="toggle-info">
            <strong>mDNS Discovery</strong>
            <span className="toggle-desc">Discover peers on local network via multicast DNS</span>
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
        <h3>Discovery profile</h3>
        <p className="section-desc">
          Controls how much background mesh work your node does. Restart the node after changing.
        </p>
        <label className="settings-field">
          <span className="settings-field-label">Profile</span>
          <select
            className="settings-select"
            value={discoveryProfile}
            onChange={(e) => void setDiscoveryProfile(e.target.value as DiscoveryProfile)}
          >
            <option value="wan-default">Full WAN — DHT + public libp2p bootstrap</option>
            <option value="relay-only">Relay-only WAN — no DHT (lower CPU/RAM)</option>
            <option value="contacts-only">Contacts only — relay + bonded peers</option>
          </select>
        </label>
        <p className="section-desc muted">
          {discoveryProfile === "wan-default"
            ? "Global peer discovery via public libp2p bootstrap and DHT. Lazy find skips background DHT queries until you open Search."
            : discoveryProfile === "relay-only"
              ? "Reach peers through Envoy relay without Kad-DHT. Good middle ground for always-on home nodes."
              : "No public swarm discovery — chat with existing contacts via relay."}
        </p>
      </section>

      <section className="settings-section">
        <h3>Resource tuning</h3>
        <p className="section-desc">
          Reduce CPU and memory while staying on WAN. Takes effect after node restart.
        </p>
        <label className="settings-field">
          <span className="settings-field-label">Max connections</span>
          <input
            type="number"
            min={10}
            max={500}
            className="settings-input-narrow"
            defaultValue={nodeConfig?.maxConnections ?? DEFAULT_CLIENT_MAX_CONNECTIONS}
            key={`maxConn-${nodeConfig?.maxConnections ?? DEFAULT_CLIENT_MAX_CONNECTIONS}`}
            onBlur={async (e) => {
              const v = Number(e.target.value);
              if (!Number.isFinite(v)) return;
              await nodeService.updateNodeConfig({ maxConnections: v });
              await refreshNodeConfig();
            }}
          />
        </label>
        <label className="settings-field">
          <span className="settings-field-label">Capability cycle (seconds)</span>
          <input
            type="number"
            min={30}
            max={600}
            className="settings-input-narrow"
            defaultValue={Math.round((nodeConfig?.capabilityDiscoveryIntervalMs ?? 90_000) / 1000)}
            key={`capInt-${nodeConfig?.capabilityDiscoveryIntervalMs ?? 90_000}`}
            onBlur={async (e) => {
              const sec = Number(e.target.value);
              if (!Number.isFinite(sec)) return;
              await nodeService.updateNodeConfig({ capabilityDiscoveryIntervalMs: sec * 1000 });
              await refreshNodeConfig();
            }}
          />
        </label>
        <div className="settings-toggle-row">
          <div className="toggle-info">
            <strong>Lazy DHT find</strong>
            <span className="toggle-desc">Skip background DHT queries; run when Search is open</span>
          </div>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={nodeConfig?.lazyCapabilityDiscovery ?? discoveryProfile === "wan-default"}
              onChange={async (e) => {
                await nodeService.updateNodeConfig({ lazyCapabilityDiscovery: e.target.checked });
                await refreshNodeConfig();
              }}
            />
            <span className="slider" />
          </label>
        </div>
        <div className="settings-toggle-row">
          <div className="toggle-info">
            <strong>Idle timer stretch</strong>
            <span className="toggle-desc">Slow relay/capability timers when no recent chat activity</span>
          </div>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={nodeConfig?.idleTimerStretch ?? true}
              onChange={async (e) => {
                await nodeService.updateNodeConfig({ idleTimerStretch: e.target.checked });
                await refreshNodeConfig();
              }}
            />
            <span className="slider" />
          </label>
        </div>
      </section>

      <section className="settings-section">
        <h3>Public network discovery</h3>
        <p className="section-desc">
          Quick toggle for full public libp2p vs contacts-only. Use the profile selector above for relay-only WAN.
        </p>
        <div className="settings-toggle-row">
          <div className="toggle-info">
            <strong>Public libp2p discovery</strong>
            <span className="toggle-desc">
              {isPublicLibp2pDiscovery
                ? `Profile: wan-default (${bootstrapPresets.length} bootstrap preset(s))`
                : "Profile: contacts-only (cn-relay + your configured relays)"}
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
            Stranger / global mesh discovery is reduced. Chat with existing contacts still works via relay.
            On desktop, fully quit and reopen the app if connectivity does not change after toggling.
          </p>
        ) : null}
      </section>

      <section className="settings-section">
        <h3>Bootstrap presets (advanced)</h3>
        <p className="section-desc">
          {isPublicLibp2pDiscovery
            ? "Fine-tune which public bootstrap sets are used when public libp2p discovery is on."
            : "Turn on public libp2p discovery above to edit public bootstrap presets."}
        </p>
        <div className="bootstrap-presets">
          {[
            { id: "public-libp2p", label: "public-libp2p", desc: "4 bootstrap servers" },
            { id: "public-libp2p-am6", label: "public-libp2p-am6", desc: "1 server (AM6)" },
            { id: "public-libp2p-am7", label: "public-libp2p-am7", desc: "1 server (AM7)" },
            { id: "cn-relay", label: "CN Relay (47.93.11.212)", desc: "China relay server" },
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
        <h3>Configured Relays</h3>
        {relays.length === 0 ? (
          <p className="empty">No relays configured</p>
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
                    {relay.level !== undefined && <span className="relay-level">Level {relay.level}</span>}
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
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="add-relay-form">
          <h4>Add Relay</h4>
          <input
            type="text"
            placeholder="Relay address (e.g., /ip4/1.2.3.4/tcp/4001)"
            value={newRelayAddr}
            onChange={(e) => setNewRelayAddr(e.target.value)}
          />
          <button
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
            Add
          </button>
        </div>
      </section>

      <section className="settings-section">
        <h3>AI / Model Provider</h3>
        <p className="section-desc">
          {cloudOnlyMobile
            ? "On this device, configure a cloud API (OpenAI-compatible or Anthropic). Local engines such as Ollama or LiteLLM are not exposed in the mobile UI — use your desktop node for those."
            : "Configure the AI model provider for knowledge queries and chat assistance. For local Ollama/LiteLLM URLs and LAN HTTP notes, see docs/mobile-local-models.md."}
        </p>
        <dl className="settings-list">
          <dt>Provider Mode</dt>
          <dd>
            <select
              className="settings-select"
              value={nodeConfig?.modelProviders?.mode ?? "mock"}
              onChange={async (e) => {
                const mode = e.target.value as ModelProviderMode;
                await updateNodeConfig({
                  modelProviders: { ...nodeConfig?.modelProviders, mode },
                });
              }}
            >
              <option value="mock">Mock (testing only)</option>
              <option value="openai-compatible">OpenAI-Compatible</option>
              <option value="anthropic-compatible">Anthropic-Compatible</option>
              {!cloudOnlyMobile && (
                <>
                  <option value="ollama">Ollama (local)</option>
                  <option value="litellm">LiteLLM (local/cloud)</option>
                </>
              )}
              <option value="disabled">Disabled</option>
            </select>
          </dd>
          <dt>Endpoint URL</dt>
          <dd>
            <input
              type="text"
              className="settings-input"
              placeholder={modelProviderHints.endpointPlaceholder || "https://api.example.com/v1"}
              value={modelEndpoint}
              onChange={(e) => {
                modelProviderFieldsDirtyRef.current = true;
                setModelEndpoint(e.target.value);
              }}
            />
            {modelProviderHints.hint ? (
              <p className="settings-hint" style={{ marginTop: "6px" }}>
                {modelProviderHints.hint}
              </p>
            ) : null}
          </dd>
          <dt>Model Name</dt>
          <dd>
            <input type="text" className="settings-input" placeholder="MiniMax-M2.7"
              value={modelName} onChange={(e) => {
                modelProviderFieldsDirtyRef.current = true;
                setModelName(e.target.value);
              }} />
          </dd>
          <dt>API Key</dt>
          <dd>
            <input type="password" className="settings-input" placeholder="sk-..."
              value={modelApiKey} onChange={(e) => {
                modelProviderFieldsDirtyRef.current = true;
                setModelApiKey(e.target.value);
              }} />
            {modelProviderHints.apiKeyHint ? (
              <p className="settings-hint" style={{ marginTop: "6px" }}>
                {modelProviderHints.apiKeyHint}
              </p>
            ) : null}
          </dd>
        </dl>
      </section>

      <section className="settings-section">
        <h3>AI Chat Behavior</h3>
        <p className="section-desc">Control how AI interacts in conversations.</p>

        <div className="settings-toggle-row">
          <div className="toggle-info">
            <strong>Chat Assist</strong>
            <span className="toggle-desc">AI suggests message drafts while typing</span>
          </div>
          <label className="toggle-switch">
            <input type="checkbox" checked={chatAssistToggle.checked}
              onChange={chatAssistToggle.onCheckboxChange} />
            <span className="slider" />
          </label>
        </div>

        <div className="settings-toggle-row">
          <div className="toggle-info">
            <strong>Auto AI Response</strong>
            <span className="toggle-desc">AI responds automatically to messages in chat</span>
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
            <strong>Autonomous Kill Switch</strong>
            <span className="toggle-desc">Master toggle - pause all autonomous AI actions</span>
          </div>
          <label className="toggle-switch">
            <input type="checkbox" checked={killSwitchToggle.checked}
              onChange={killSwitchToggle.onCheckboxChange} />
            <span className="slider" />
          </label>
        </div>

        <div className="form-group">
          <label>Chat activity notifications</label>
          <select
            value={nodeConfig?.a2aChatNotifications ?? "off"}
            onChange={(e) => {
              void updateNodeConfig({
                a2aChatNotifications: e.target.value as A2aChatNotificationMode,
              });
            }}
          >
            <option value="off">Off</option>
            <option value="milestones_only">Milestones only (tasks, reports, approvals)</option>
            <option value="all_reports">All agent activity</option>
          </select>
          <p className="field-desc">
            Optional local system lines in chat threads when your agent completes work (never sent on the wire).
          </p>
        </div>

        <div className="form-group">
          <label>Agent interaction mode</label>
          <select
            value={nodeConfig?.agentInteractionMode ?? "structured_preferred"}
            onChange={(e) => {
              void updateNodeConfig({
                agentInteractionMode: e.target.value as AgentInteractionMode,
              });
            }}
          >
            <option value="structured_preferred">Structured preferred — skip chat-assist for verified peer agents</option>
            <option value="chat_ok">Chat OK — allow free-form agent chat assist</option>
          </select>
          <p className="field-desc">
            When structured preferred, inbound chat from verified peer agents does not trigger LLM auto-replies; use task and knowledge intents instead.
          </p>
        </div>

        <div className="form-group">
          <label>Agent visibility by domain</label>
          <p className="field-desc">
            Controls Activity feed push and WS notifications. Rows are always stored locally.
          </p>
          {(["social", "knowledge", "home", "research"] as AgentActivityDomain[]).map((domain) => (
            <div className="form-row" key={domain}>
              <div className="form-group">
                <label>{domain}</label>
                <select
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
                  <option value="instant">Instant — show all activity</option>
                  <option value="brief">Brief — milestones only</option>
                  <option value="silent">Silent — store only</option>
                  <option value="approval">Approval — reports and approvals only</option>
                </select>
              </div>
            </div>
          ))}
        </div>

        <div className="settings-buttons">
          <button type="button" className="settings-save-btn"
            disabled={settingsSaveStatus === "saving"}
            onClick={async () => {
              setSettingsSaveStatus("saving");
              try {
                await updateNodeConfig({
                  modelProviders: {
                    ...(nodeConfig?.modelProviders ?? { mode: "mock" as ModelProviderMode }),
                    endpoint: modelEndpoint,
                    modelName,
                    apiKey: modelApiKey,
                  },
                });
                modelProviderFieldsDirtyRef.current = false;
                setSettingsSaveStatus("saved");
                setTimeout(() => setSettingsSaveStatus("idle"), 2000);
              } catch {
                setSettingsSaveStatus("error");
                setTimeout(() => setSettingsSaveStatus("idle"), 2000);
              }
            }}>
            {settingsSaveStatus === "saving" ? "Saving..." : settingsSaveStatus === "saved" ? "Saved!" : "Save"}
          </button>
          <button type="button" className="settings-cancel-btn"
            onClick={() => {
              modelProviderFieldsDirtyRef.current = false;
              setModelEndpoint(nodeConfig?.modelProviders?.endpoint ?? "");
              setModelName(nodeConfig?.modelProviders?.modelName ?? "");
              setModelApiKey(nodeConfig?.modelProviders?.apiKey ?? "");
              setSettingsSaveStatus("idle");
            }}>
            Cancel
          </button>
          {settingsSaveStatus === "error" && <span className="settings-save-error">Save failed</span>}
        </div>
      </section>

      {isMobileNode ? (
        <section className="settings-section">
          <h3>External distribution (IPFS)</h3>
          <p className="section-desc">
            On mobile, Library export uses in-process Helia (no Kubo). Gateway verify still requires your home desktop node.
          </p>
          <dl className="settings-list">
            <dt>IPFS engine</dt>
            <dd>
              {ipfsEngineStatus == null ? (
                <span className="settings-hint">Checking…</span>
              ) : ipfsEngineStatus.helia?.available ? (
                <span className="settings-hint">
                  Helia in-process
                  {ipfsEngineStatus.helia.heliaVersion ? ` (${ipfsEngineStatus.helia.heliaVersion})` : ""}
                </span>
              ) : (
                <span className="settings-hint" role="alert">
                  {ipfsEngineStatus.helia?.errorHint ?? "Helia engine unavailable"}
                </span>
              )}
            </dd>
            <dt>Export engine</dt>
            <dd>
              <span className="settings-hint">Helia (mobile only)</span>
            </dd>
          </dl>
          <div className="settings-toggle-row">
            <div className="toggle-info">
              <strong>Allow IPFS export</strong>
              <span className="toggle-desc">Gate explicit vault → IPFS export in Library (default off)</span>
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
          <h3>External distribution (IPFS)</h3>
          <p className="section-desc">
            When enabled, Library can export vault files to IPFS and persist the root CID locally.
            EnvoyMesh starts the bundled IPFS engine automatically on first export — no separate install or terminal commands.
          </p>
          <dl className="settings-list">
            <dt>IPFS engine</dt>
            <dd>
              {currentExternalPublish.ipfsExportEngine === "helia" ? (
                <>
                  {ipfsEngineStatus == null ? (
                    <span className="settings-hint">Checking…</span>
                  ) : ipfsEngineStatus.helia?.available ? (
                    <span className="settings-hint">
                      Helia in-process (primary)
                      {ipfsEngineStatus.helia.heliaVersion ? ` (${ipfsEngineStatus.helia.heliaVersion})` : ""}
                    </span>
                  ) : (
                    <span className="settings-hint" role="alert">
                      {ipfsEngineStatus.helia?.errorHint ?? "Helia engine unavailable"}
                    </span>
                  )}
                  <span className="settings-hint" style={{ display: "block", marginTop: "4px" }}>
                    {ipfsEngineStatus?.kubo?.available
                      ? `Kubo also available${ipfsEngineStatus.kubo.kuboVersion ? ` (${ipfsEngineStatus.kubo.kuboVersion})` : ""} — switch engine to use it`
                      : ipfsEngineStatus?.kubo?.errorHint ?? "Kubo not required for Helia export"}
                  </span>
                </>
              ) : (
                <>
                  {ipfsEngineStatus == null ? (
                    <span className="settings-hint">Checking…</span>
                  ) : ipfsEngineStatus.available ? (
                    <span className="settings-hint">
                      {ipfsEngineStatus.running
                        ? `Kubo ready${ipfsEngineStatus.kuboVersion ? ` (${ipfsEngineStatus.kuboVersion})` : ""}${
                            ipfsEngineStatus.managed ? " — managed by EnvoyMesh" : ""
                          }`
                        : "Kubo available — starts automatically when you export"}
                    </span>
                  ) : (
                    <span className="settings-hint" role="alert">
                      {ipfsEngineStatus.errorHint ?? "Kubo engine unavailable"}
                    </span>
                  )}
                  {ipfsEngineStatus?.helia != null && (
                    <span className="settings-hint" style={{ display: "block", marginTop: "4px" }}>
                      {ipfsEngineStatus.helia.available
                        ? `Helia in-process${ipfsEngineStatus.helia.heliaVersion ? ` (${ipfsEngineStatus.helia.heliaVersion})` : ""}`
                        : ipfsEngineStatus.helia.errorHint ?? "Helia unavailable"}
                    </span>
                  )}
                </>
              )}
            </dd>
            <dt>Export engine</dt>
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
                <option value="kubo">Kubo (default)</option>
                <option value="kubo-with-helia-shadow">Kubo + Helia shadow</option>
                <option value="helia">Helia (in-process)</option>
              </select>
              <p className="settings-hint" style={{ marginTop: "6px" }}>
                {currentExternalPublish.ipfsExportEngine === "helia"
                  ? "Helia produces the canonical CID in-process — no Kubo sidecar required. CIDs match Kubo when both use the interop recipe (CI parity gate)."
                  : currentExternalPublish.ipfsExportEngine === "kubo-with-helia-shadow"
                    ? "Shadow mode runs Helia in-process after Kubo export and records parity in audit logs. Canonical CID stays Kubo."
                    : "Kubo uses the bundled sidecar or ipfs on PATH; starts automatically on first export."}
              </p>
            </dd>
          </dl>
          <div className="settings-toggle-row">
            <div className="toggle-info">
              <strong>Allow IPFS export</strong>
              <span className="toggle-desc">Gate explicit vault → IPFS export actions (default off)</span>
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
                <strong>Allow external pinning</strong>
                <span className="toggle-desc">
                  Enable Library “Pin to provider” after IPFS export (JWT/token env required)
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
              <dt>Pinning provider</dt>
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
                  <option value="pinata">Pinata (ENVOYMESH_PINATA_JWT)</option>
                  <option value="web3storage">web3.storage (ENVOYMESH_WEB3_STORAGE_TOKEN)</option>
                </select>
              </dd>
            </dl>
          ) : null}
          <dl className="settings-list">
            <dt>Gateway allowlist</dt>
            <dd>
              <textarea
                className="settings-input"
                rows={3}
                placeholder={"https://ipfs.io\nhttps://dweb.link"}
                value={gatewayAllowlistDraft}
                onChange={(e) => setGatewayAllowlistDraft(e.target.value)}
              />
              <p className="settings-hint" style={{ marginTop: "6px" }}>
                One HTTPS gateway base per line. Required for Library “Verify on gateway” (automated fetch compares bytes to vault hash).
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
                Save gateway allowlist
              </button>
            </dd>
          </dl>
        </section>
      )}

      <section className="settings-section">
        <h3>Trust mode & matching</h3>
        <p className="section-desc">
          Allow agent-mediated intros (<code>social.intro.*</code>). Use preferences below so your agent can align discovery with what you say you&apos;re looking for — never invented biography.
        </p>
        <div className="settings-toggle-row">
          <div className="toggle-info">
            <strong>Trust mode</strong>
            <span className="toggle-desc">Enable inbound/outbound Trust-mode intro intents</span>
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
            <strong>Friend autopilot</strong>
            <span className="toggle-desc">
              Allow agent tool <code>mesh.intro.run_autopilot</code> (requires Trust mode + owner approval)
            </span>
          </div>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={friendAutopilotToggle.checked}
              onChange={friendAutopilotToggle.onCheckboxChange}
              disabled={!trustModeToggle.checked}
            />
            <span className="slider" />
          </label>
        </div>
        {friendAutopilotToggle.checked ? (
          <dl className="settings-list">
            <dt>Autopilot schedule</dt>
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
                <option value="0">Manual only (agent tool)</option>
                <option value="24">Daily scheduled pass</option>
                <option value="168">Weekly scheduled pass</option>
              </select>
              <p className="settings-hint" style={{ marginTop: "6px" }}>
                Scheduled passes run without per-pass approval when autopilot is enabled. Activity rows and digest include pass counts.
              </p>
            </dd>
          </dl>
        ) : null}
        <dl className="settings-list">
          <dt>Knowledge syndication ceiling</dt>
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
              <option value="">Bond policy only (no extra cap)</option>
              <option value="public">Public snippets only</option>
              <option value="friends">Friends tier</option>
              <option value="private">Private (trusted peers only)</option>
            </select>
            <p className="settings-hint" style={{ marginTop: "6px" }}>
              Caps vault bytes returned to bonded peers on inbound <code>knowledge.query</code>.
            </p>
          </dd>
          {bonds.length > 0 ? (
            <>
              <dt>Per-contact syndication caps</dt>
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
                          <option value="">Use global ceiling</option>
                          <option value="public">Public only</option>
                          <option value="friends">Friends tier</option>
                          <option value="private">Private tier</option>
                        </select>
                      </li>
                    );
                  })}
                </ul>
              </dd>
            </>
          ) : null}
          <dt>Friend matching preferences</dt>
          <dd>
            <textarea
              className="settings-input"
              rows={5}
              placeholder="Topics, traits, boundaries — plain language for your agent (max 4096 chars)."
              value={friendMatchingDraft}
              onChange={(e) => setFriendMatchingDraft(e.target.value)}
            />
            <p className="settings-hint" style={{ marginTop: "6px" }}>
              Saved separately from provider keys — edit and tap Save preferences when ready.
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
            Save preferences
          </button>
          <button
            type="button"
            className="settings-cancel-btn"
            onClick={() =>
              setFriendMatchingDraft(nodeConfig?.friendMatchingPreferencesText ?? "")}
          >
            Reset
          </button>
        </div>
      </section>

      {/* Relay Public WS URL */}
      <section className="settings-section">
        <h3>Relay WebSocket URL</h3>
        <p className="section-desc">
          Public WebSocket URL of the EnvoyMesh relay for mobile pairing.
          When set, the pairing QR directs mobile clients through the relay, enabling pairing from any network.
          Leave empty to auto-discover from configured relays.
        </p>
        <dl className="settings-list">
          <dt>Relay WS URL</dt>
          <dd>
            <input
              type="text"
              className="settings-input"
              placeholder="ws://relay.example.com:15432/ws (leave empty for auto-discovery)"
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

      {/* Agent Bridge */}
      <section className="settings-section">
        <h3>Agent Bridge</h3>
        <dl className="settings-list">
          <dt>Status</dt>
          <dd>
            <span className={`status-dot ${bridgeStatus?.enabled ? "online" : "offline"}`} />
            {bridgeStatus?.enabled ? "Running" : nodeConfig?.bridgeEnabled ? "Stopped (needs restart)" : "Disabled"}
          </dd>
          {bridgeStatus?.enabled && (
            <>
              <dt>Agent Name</dt>
              <dd>{bridgeStatus.agentName ?? "My Agent"}</dd>
              <dt>Agent Peer ID</dt>
              <dd><code>{bridgeStatus.agentPeerId}</code></dd>
              <dt>Agent URL</dt>
              <dd><code>{bridgeStatus.agentUrl}</code></dd>
              <dt>Listen Port</dt>
              <dd>{bridgeStatus.listenPort}</dd>
            </>
          )}
        </dl>
        {(!bridgeStatus?.enabled) && (
          nodeConfig?.bridgeEnabled ? (
            <p className="settings-hint">Bridge will be enabled on next node restart.</p>
          ) : (
            <p className="settings-hint">Enable the bridge in your node's bridge-config.json to connect an external agent (HomeClaw, OpenClaw).</p>
          )
        )}

        {/* Bridge enable/disable toggle — takes effect on next node restart */}
        <div className="settings-toggle-row" style={{ marginTop: "12px" }}>
          <div className="toggle-info">
            <strong>Enable Bridge</strong>
            <span className="toggle-desc">Turn the agent bridge on/off (requires node restart)</span>
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

        {/* Pairing QR for mobile app */}
        <div style={{ marginTop: "12px" }}>
          {!pairingQR ? (
            <button
              className="settings-button"
              onClick={handleShowPairingQR}
              disabled={pairingLoading}
            >
              {pairingLoading ? "Generating…" : "Show Pairing QR"}
            </button>
          ) : (
            <div style={{ textAlign: "center" }}>
              <img
                src={pairingQR}
                alt="Pairing QR Code"
                style={{ width: 256, height: 256, border: "2px solid var(--border-color)", borderRadius: 8 }}
              />
              <p className="settings-hint" style={{ marginTop: 8, wordBreak: "break-all", fontSize: "0.75rem" }}>
                Scan with HomeClaw mobile app to pair.
                <br />
                <code style={{ fontSize: "0.65rem" }}>{pairingUri}</code>
              </p>
              <button
                className="settings-button"
                onClick={() => { void navigator.clipboard.writeText(pairingUri); }}
                style={{ marginTop: 4 }}
              >
                Copy URI
              </button>
              <button
                className="settings-button"
                onClick={() => setPairingQR(null)}
                style={{ marginTop: 4, marginLeft: 4 }}
              >
                Hide QR
              </button>
            </div>
          )}
        </div>

        {/* WAN join invite (Phase 15B) — bootstrap cold-start across NAT */}
        {!isMobileNode ? (
          <div style={{ marginTop: "16px" }}>
            <strong>Invite to mesh (WAN)</strong>
            <p className="settings-hint" style={{ marginTop: 4 }}>
              Share bootstrap peers + this node&apos;s dial hints for first contact over the internet.
              Tokens are unsigned — treat like a join URL (short-lived, trusted channel).
            </p>
            {!wanJoinQr ? (
              <button
                type="button"
                className="settings-button"
                onClick={() => { void handleShowWanJoinInvite(); }}
                disabled={wanJoinLoading}
              >
                {wanJoinLoading ? "Generating…" : "Show WAN invite QR"}
              </button>
            ) : (
              <div style={{ textAlign: "center" }}>
                <img
                  src={wanJoinQr}
                  alt="WAN join invite QR"
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
                  Copy link
                </button>
                <button
                  type="button"
                  className="settings-button"
                  onClick={() => setWanJoinQr(null)}
                  style={{ marginTop: 4, marginLeft: 4 }}
                >
                  Hide QR
                </button>
              </div>
            )}
            <dl className="settings-list" style={{ marginTop: 12 }}>
              <dt>Accept WAN invite</dt>
              <dd>
                <textarea
                  className="settings-input"
                  rows={3}
                  placeholder="Paste envoy://join?token=… or raw token"
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
                  {wanInviteApplyBusy ? "Applying…" : "Apply invite"}
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

        {!isMobileNode && (
          <div style={{ marginTop: "16px" }}>
            <strong>Authorized devices</strong>
            <p className="settings-hint" style={{ marginTop: 4 }}>
              Shared-identity satellites paired via QR. Revoking blocks their device certificate on this node.
            </p>
            {authorizedDevicesLoading ? (
              <p className="settings-hint">Loading devices…</p>
            ) : authorizedDevicesError ? (
              <p className="settings-hint" style={{ color: "var(--danger-color, #c0392b)" }}>
                {authorizedDevicesError}
              </p>
            ) : authorizedDevices.length === 0 ? (
              <p className="settings-hint">No paired satellite devices yet.</p>
            ) : (
              <ul className="settings-list" style={{ marginTop: 8 }}>
                {authorizedDevices.map((device) => (
                  <li
                    key={device.deviceId}
                    className="settings-list-item"
                    style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between" }}
                  >
                    <div>
                      <div>{device.displayName ?? device.deviceProfile}</div>
                      <div className="settings-hint" style={{ fontSize: "0.75rem" }}>
                        {device.deviceProfile}
                        {device.revoked ? " · revoked" : ""}
                        <br />
                        <code style={{ fontSize: "0.65rem" }}>{device.deviceId}</code>
                      </div>
                    </div>
                    {!device.revoked && (
                      <button
                        type="button"
                        className="settings-button"
                        disabled={revokingDeviceId === device.deviceId}
                        onClick={() => { void handleRevokeDevice(device.deviceId); }}
                      >
                        {revokingDeviceId === device.deviceId ? "Revoking…" : "Revoke"}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              className="settings-button"
              style={{ marginTop: 8 }}
              disabled={authorizedDevicesLoading}
              onClick={() => { void refreshAuthorizedDevices(); }}
            >
              Refresh devices
            </button>
          </div>
        )}
      </section>
    </>
  );
}
