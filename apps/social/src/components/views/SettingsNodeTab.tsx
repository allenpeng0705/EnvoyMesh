import { useState, useCallback, useEffect } from "react";
import { useNodeState } from "../../context/NodeStateContext.js";
import { useNodeService } from "../../hooks/useNodeService.js";
import QRCode from "qrcode";
import {
  DEFAULT_PUBLIC_LIBP2P_BOOTSTRAP_PRESETS,
} from "@envoymesh/api";
import type {
  ModelProviderMode,
  NodeConfig,
  RelayConfig,
  AutonomousDomain,
  AutonomousPolicy,
} from "@envoymesh/api";

export function SettingsNodeTab() {
  const nodeService = useNodeService();
  const { nodeConfig, nodeStatus, peerId, bridgeStatus, refreshNodeConfig } = useNodeState();

  // Local state mirrors nodeConfig fields for debounced editing
  const [newRelayAddr, setNewRelayAddr] = useState("");
  const [modelEndpoint, setModelEndpoint] = useState(nodeConfig?.modelProviders?.endpoint ?? "");
  const [modelName, setModelName] = useState(nodeConfig?.modelProviders?.modelName ?? "");
  const [modelApiKey, setModelApiKey] = useState(nodeConfig?.modelProviders?.apiKey ?? "");
  const [settingsSaveStatus, setSettingsSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [bootstrapPresets, setBootstrapPresets] = useState<string[]>(
    nodeConfig?.bootstrapPresets ?? [...DEFAULT_PUBLIC_LIBP2P_BOOTSTRAP_PRESETS],
  );

  // Sync local state when nodeConfig loads/changes (async load after mount)
  useEffect(() => {
    if (nodeConfig?.bootstrapPresets) {
      setBootstrapPresets(nodeConfig.bootstrapPresets);
    }
  }, [nodeConfig?.bootstrapPresets]);

  const isPublicNetwork = bootstrapPresets.length > 0;
  const relays = (nodeConfig?.configuredRelays ?? []) as RelayConfig[];

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

  return (
    <>
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
              checked={nodeConfig?.enableMdns ?? true}
              onChange={async (e) => {
                const newValue = e.target.checked;
                await nodeService.updateNodeConfig({ enableMdns: newValue });
                try { await nodeService.stopNode(); } catch {}
                try { await nodeService.waitForConnection(15000); } catch {}
                try { await nodeService.startNode(); } catch {}
                await refreshNodeConfig();
              }}
            />
            <span className="toggle-slider" />
          </label>
        </div>
      </section>

      <section className="settings-section">
        <h3>Public Network (libp2p)</h3>
        <p className="section-desc">
          Enable to connect to the public libp2p network and discover peers globally.
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
                checked={bootstrapPresets.includes(preset.id)}
                onChange={async () => {
                  const updated = bootstrapPresets.includes(preset.id)
                    ? bootstrapPresets.filter(p => p !== preset.id)
                    : [...bootstrapPresets, preset.id];
                  setBootstrapPresets(updated);
                  await nodeService.updateNodeConfig({ bootstrapPresets: updated });
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
                  } catch {}
                  await refreshNodeConfig();
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
          Configure the AI model provider for knowledge queries and chat assistance.
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
              <option value="ollama">Ollama (local)</option>
              <option value="litellm">LiteLLM (local/cloud)</option>
              <option value="disabled">Disabled</option>
            </select>
          </dd>
          <dt>Endpoint URL</dt>
          <dd>
            <input type="text" className="settings-input" placeholder="https://api.minimaxi.com/v1"
              value={modelEndpoint} onChange={(e) => setModelEndpoint(e.target.value)} />
          </dd>
          <dt>Model Name</dt>
          <dd>
            <input type="text" className="settings-input" placeholder="MiniMax-M2.7"
              value={modelName} onChange={(e) => setModelName(e.target.value)} />
          </dd>
          <dt>API Key</dt>
          <dd>
            <input type="password" className="settings-input" placeholder="sk-..."
              value={modelApiKey} onChange={(e) => setModelApiKey(e.target.value)} />
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
            <input type="checkbox" checked={nodeConfig?.chatAssistEnabled ?? false}
              onChange={async (e) => {
                await updateNodeConfig({ chatAssistEnabled: e.target.checked });
              }} />
            <span className="toggle-slider" />
          </label>
        </div>

        <div className="settings-toggle-row">
          <div className="toggle-info">
            <strong>Auto AI Response</strong>
            <span className="toggle-desc">AI responds automatically to messages in chat</span>
          </div>
          <label className="toggle-switch">
            <input type="checkbox"
              checked={(nodeConfig?.autonomousPolicies ?? []).find(p => p.domain === "social")?.autoSendChat ?? false}
              onChange={async (e) => {
                const currentPolicies = nodeConfig?.autonomousPolicies ?? [];
                const existingSocial = currentPolicies.find(p => p.domain === "social");
                let updatedPolicies: AutonomousPolicy[];
                if (existingSocial) {
                  updatedPolicies = currentPolicies.map(p =>
                    p.domain === "social" ? { ...p, autoSendChat: e.target.checked } : p
                  );
                } else {
                  updatedPolicies = [
                    ...currentPolicies,
                    { domain: "social" as AutonomousDomain, maxSensitivity: "friends", autoAnswer: e.target.checked, autoSendChat: e.target.checked },
                  ];
                }
                await updateNodeConfig({ autonomousPolicies: updatedPolicies });
              }} />
            <span className="toggle-slider" />
          </label>
        </div>

        <div className="settings-toggle-row">
          <div className="toggle-info">
            <strong>Autonomous Kill Switch</strong>
            <span className="toggle-desc">Master toggle - pause all autonomous AI actions</span>
          </div>
          <label className="toggle-switch">
            <input type="checkbox" checked={nodeConfig?.autonomousKillSwitch ?? false}
              onChange={async (e) => {
                await updateNodeConfig({ autonomousKillSwitch: e.target.checked });
              }} />
            <span className="toggle-slider" />
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
              checked={nodeConfig?.bridgeEnabled ?? false}
              onChange={async (e) => {
                await nodeService.updateNodeConfig({ bridgeEnabled: e.target.checked });
                await refreshNodeConfig();
              }}
            />
            <span className="toggle-slider" />
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
