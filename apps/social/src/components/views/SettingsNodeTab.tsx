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
  DEFAULT_PUBLIC_LIBP2P_BOOTSTRAP_PRESETS,
  defaultBootstrapPresetsForDiscoveryProfile,
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
} from "@envoymesh/api";

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

  const isPublicLibp2pDiscovery =
    (nodeConfig?.discoveryProfile ?? "wan-default") !== "contacts-only";
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
          endpointPlaceholder: "https://api.openai.com/v1",
          hint: "Any Chat Completions–compatible API; base URL should include /v1.",
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
      if (payload.token) params.set("token", payload.token);
      if (payload.ownerPublicKey) params.set("ownerPublicKey", payload.ownerPublicKey);
      if (payload.ownerId) params.set("ownerId", payload.ownerId);
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
    const discoveryProfile: DiscoveryProfile = enabled ? "wan-default" : "contacts-only";
    const bootstrapPresets = [...defaultBootstrapPresetsForDiscoveryProfile(discoveryProfile)];
    bootstrapPresetsSavingRef.current += 1;
    setBootstrapPresetSyncNonce((n) => n + 1);
    try {
      setBootstrapPresets(bootstrapPresets);
      await nodeService.updateNodeConfig({ discoveryProfile, bootstrapPresets });
      await restartNodeAfterConnectivityChange();
    } finally {
      bootstrapPresetsSavingRef.current -= 1;
      setBootstrapPresetSyncNonce((n) => n + 1);
      await refreshNodeConfig();
    }
  });

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

  const currentExternalPublish = useMemo(
    () => ({
      allowIpfs: nodeConfig?.externalPublish?.allowIpfs ?? false,
      gatewayAllowlist: nodeConfig?.externalPublish?.gatewayAllowlist ?? [],
      ipfsExportEngine: isMobileNode
        ? ("helia" as const)
        : (nodeConfig?.externalPublish?.ipfsExportEngine ?? "kubo"),
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
        <h3>Public network discovery</h3>
        <p className="section-desc">
          When enabled, your node joins the public libp2p bootstrap network to discover new peers globally.
          Turn off to use relay and bonded contacts only (lower CPU and memory on Windows).
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
        <dl className="settings-list">
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
      </section>
    </>
  );
}
