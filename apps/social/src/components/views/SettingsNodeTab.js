import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useCallback, useEffect } from "react";
import { useNodeState } from "../../context/NodeStateContext.js";
import { useNodeService } from "../../hooks/useNodeService.js";
import QRCode from "qrcode";
import { DEFAULT_PUBLIC_LIBP2P_BOOTSTRAP_PRESETS, } from "@envoymesh/api";
export function SettingsNodeTab() {
    const nodeService = useNodeService();
    const { nodeConfig, nodeStatus, peerId, bridgeStatus, refreshNodeConfig } = useNodeState();
    // Local state mirrors nodeConfig fields for debounced editing
    const [newRelayAddr, setNewRelayAddr] = useState("");
    const [modelEndpoint, setModelEndpoint] = useState(nodeConfig?.modelProviders?.endpoint ?? "");
    const [modelName, setModelName] = useState(nodeConfig?.modelProviders?.modelName ?? "");
    const [modelApiKey, setModelApiKey] = useState(nodeConfig?.modelProviders?.apiKey ?? "");
    const [settingsSaveStatus, setSettingsSaveStatus] = useState("idle");
    const [bootstrapPresets, setBootstrapPresets] = useState(nodeConfig?.bootstrapPresets ?? [...DEFAULT_PUBLIC_LIBP2P_BOOTSTRAP_PRESETS]);
    // Sync local state when nodeConfig loads/changes (async load after mount)
    useEffect(() => {
        if (nodeConfig?.bootstrapPresets) {
            setBootstrapPresets(nodeConfig.bootstrapPresets);
        }
    }, [nodeConfig?.bootstrapPresets]);
    const isPublicNetwork = bootstrapPresets.length > 0;
    const relays = (nodeConfig?.configuredRelays ?? []);
    // QR pairing state
    const [pairingQR, setPairingQR] = useState(null); // data URL
    const [pairingUri, setPairingUri] = useState("");
    const [pairingLoading, setPairingLoading] = useState(false);
    const handleShowPairingQR = useCallback(async () => {
        setPairingLoading(true);
        try {
            const payload = await nodeService.getPairingPayload();
            // Build envoy://pair URI
            const params = new URLSearchParams({ wsUrl: payload.wsUrl });
            if (payload.relayPeerId)
                params.set("relayPeerId", payload.relayPeerId);
            if (payload.relayWsUrl)
                params.set("relayWsUrl", payload.relayWsUrl);
            if (payload.agentPeerId)
                params.set("agentPeerId", payload.agentPeerId);
            if (payload.agentPubKey)
                params.set("agentPubKey", payload.agentPubKey);
            if (payload.token)
                params.set("token", payload.token);
            if (payload.ownerPublicKey)
                params.set("ownerPublicKey", payload.ownerPublicKey);
            if (payload.ownerId)
                params.set("ownerId", payload.ownerId);
            const uri = `envoy://pair?${params.toString()}`;
            setPairingUri(uri);
            const dataUrl = await QRCode.toDataURL(uri, { width: 256, margin: 1 });
            setPairingQR(dataUrl);
        }
        catch (e) {
            console.error("Failed to generate pairing QR:", e);
        }
        finally {
            setPairingLoading(false);
        }
    }, [nodeService]);
    const handleStartNode = async () => {
        try {
            await nodeService.startNode();
        }
        catch (e) {
            console.error(e);
        }
    };
    const handleStopNode = async () => {
        try {
            await nodeService.stopNode();
        }
        catch (e) {
            console.error(e);
        }
    };
    const updateNodeConfig = async (partial) => {
        await nodeService.updateNodeConfig(partial);
        await refreshNodeConfig();
    };
    return (_jsxs(_Fragment, { children: [_jsxs("section", { className: "settings-section", children: [_jsx("h3", { children: "Node Control" }), _jsxs("dl", { className: "settings-list", children: [_jsx("dt", { children: "Status" }), _jsxs("dd", { className: `status-${nodeStatus}`, children: [_jsx("span", { className: `status-dot ${nodeStatus === "running" ? "online" : nodeStatus === "starting" ? "starting" : "offline"}` }), nodeStatus.charAt(0).toUpperCase() + nodeStatus.slice(1)] }), _jsx("dt", { children: "Profile Directory" }), _jsx("dd", { children: nodeConfig?.profileDir ?? "Loading..." }), _jsx("dt", { children: "Network peer ID (libp2p)" }), _jsx("dd", { children: _jsx("code", { children: peerId && !peerId.startsWith("envoy_") ? peerId : "Not connected" }) })] }), _jsx("div", { className: "node-controls", children: nodeStatus === "running" ? (_jsx("button", { onClick: handleStopNode, children: "Stop Node" })) : (_jsx("button", { onClick: handleStartNode, children: "Start Node" })) })] }), _jsxs("section", { className: "settings-section", children: [_jsx("h3", { children: "Discovery Settings" }), _jsx("p", { className: "section-desc", children: "Configure how your node discovers other peers on the network." }), _jsxs("div", { className: "settings-toggle-row", children: [_jsxs("div", { className: "toggle-info", children: [_jsx("strong", { children: "mDNS Discovery" }), _jsx("span", { className: "toggle-desc", children: "Discover peers on local network via multicast DNS" })] }), _jsxs("label", { className: "toggle-switch", children: [_jsx("input", { type: "checkbox", checked: nodeConfig?.enableMdns ?? true, onChange: async (e) => {
                                            const newValue = e.target.checked;
                                            await nodeService.updateNodeConfig({ enableMdns: newValue });
                                            try {
                                                await nodeService.stopNode();
                                            }
                                            catch { }
                                            try {
                                                await nodeService.waitForConnection(15000);
                                            }
                                            catch { }
                                            try {
                                                await nodeService.startNode();
                                            }
                                            catch { }
                                            await refreshNodeConfig();
                                        } }), _jsx("span", { className: "toggle-slider" })] })] })] }), _jsxs("section", { className: "settings-section", children: [_jsx("h3", { children: "Public Network (libp2p)" }), _jsx("p", { className: "section-desc", children: "Enable to connect to the public libp2p network and discover peers globally." }), _jsx("div", { className: "bootstrap-presets", children: [
                            { id: "public-libp2p", label: "public-libp2p", desc: "4 bootstrap servers" },
                            { id: "public-libp2p-am6", label: "public-libp2p-am6", desc: "1 server (AM6)" },
                            { id: "public-libp2p-am7", label: "public-libp2p-am7", desc: "1 server (AM7)" },
                            { id: "cn-relay", label: "CN Relay (47.93.11.212)", desc: "China relay server" },
                        ].map((preset) => (_jsxs("label", { className: "preset-checkbox", children: [_jsx("input", { type: "checkbox", checked: bootstrapPresets.includes(preset.id), onChange: async () => {
                                        const updated = bootstrapPresets.includes(preset.id)
                                            ? bootstrapPresets.filter(p => p !== preset.id)
                                            : [...bootstrapPresets, preset.id];
                                        setBootstrapPresets(updated);
                                        await nodeService.updateNodeConfig({ bootstrapPresets: updated });
                                        try {
                                            await nodeService.stopNode();
                                            await nodeService.startNode();
                                            await new Promise((resolve, reject) => {
                                                const timeout = setTimeout(() => reject(new Error("Node restart timeout")), 15000);
                                                const unsub = nodeService.on("node:status", (data) => {
                                                    if (data.status === "running") {
                                                        clearTimeout(timeout);
                                                        unsub();
                                                        resolve();
                                                    }
                                                });
                                            });
                                        }
                                        catch { }
                                        await refreshNodeConfig();
                                    } }), _jsxs("span", { className: "preset-info", children: [_jsx("strong", { children: preset.label }), _jsx("span", { className: "preset-desc", children: preset.desc })] })] }, preset.id))) })] }), _jsxs("section", { className: "settings-section", children: [_jsx("h3", { children: "Configured Relays" }), relays.length === 0 ? (_jsx("p", { className: "empty", children: "No relays configured" })) : (_jsx("ul", { className: "relay-list", children: relays.map((relay) => (_jsxs("li", { className: "relay-item", children: [_jsxs("label", { className: "relay-toggle", children: [_jsx("input", { type: "checkbox", checked: relay.enabled, onChange: async () => {
                                                const updatedRelays = relays.map(r => r.relayId === relay.relayId ? { ...r, enabled: !r.enabled } : r);
                                                await nodeService.updateNodeConfig({ configuredRelays: updatedRelays });
                                                await refreshNodeConfig();
                                            } }), _jsxs("span", { className: "relay-info", children: [_jsx("strong", { children: relay.addr }), relay.level !== undefined && _jsxs("span", { className: "relay-level", children: ["Level ", relay.level] }), relay.region && _jsx("span", { className: "relay-region", children: relay.region })] })] }), _jsx("button", { className: "remove-relay", onClick: async () => {
                                        await nodeService.removeRelay(relay.relayId);
                                        await refreshNodeConfig();
                                    }, children: "Remove" })] }, relay.relayId))) })), _jsxs("div", { className: "add-relay-form", children: [_jsx("h4", { children: "Add Relay" }), _jsx("input", { type: "text", placeholder: "Relay address (e.g., /ip4/1.2.3.4/tcp/4001)", value: newRelayAddr, onChange: (e) => setNewRelayAddr(e.target.value) }), _jsx("button", { onClick: async () => {
                                    if (!newRelayAddr.trim())
                                        return;
                                    try {
                                        await nodeService.addRelay(newRelayAddr);
                                        setNewRelayAddr("");
                                        await refreshNodeConfig();
                                    }
                                    catch (error) {
                                        console.error("Failed to add relay:", error);
                                    }
                                }, children: "Add" })] })] }), _jsxs("section", { className: "settings-section", children: [_jsx("h3", { children: "AI / Model Provider" }), _jsx("p", { className: "section-desc", children: "Configure the AI model provider for knowledge queries and chat assistance." }), _jsxs("dl", { className: "settings-list", children: [_jsx("dt", { children: "Provider Mode" }), _jsx("dd", { children: _jsxs("select", { className: "settings-select", value: nodeConfig?.modelProviders?.mode ?? "mock", onChange: async (e) => {
                                        const mode = e.target.value;
                                        await updateNodeConfig({
                                            modelProviders: { ...nodeConfig?.modelProviders, mode },
                                        });
                                    }, children: [_jsx("option", { value: "mock", children: "Mock (testing only)" }), _jsx("option", { value: "openai-compatible", children: "OpenAI-Compatible" }), _jsx("option", { value: "anthropic-compatible", children: "Anthropic-Compatible" }), _jsx("option", { value: "ollama", children: "Ollama (local)" }), _jsx("option", { value: "litellm", children: "LiteLLM (local/cloud)" }), _jsx("option", { value: "disabled", children: "Disabled" })] }) }), _jsx("dt", { children: "Endpoint URL" }), _jsx("dd", { children: _jsx("input", { type: "text", className: "settings-input", placeholder: "https://api.minimaxi.com/v1", value: modelEndpoint, onChange: (e) => setModelEndpoint(e.target.value) }) }), _jsx("dt", { children: "Model Name" }), _jsx("dd", { children: _jsx("input", { type: "text", className: "settings-input", placeholder: "MiniMax-M2.7", value: modelName, onChange: (e) => setModelName(e.target.value) }) }), _jsx("dt", { children: "API Key" }), _jsx("dd", { children: _jsx("input", { type: "password", className: "settings-input", placeholder: "sk-...", value: modelApiKey, onChange: (e) => setModelApiKey(e.target.value) }) })] })] }), _jsxs("section", { className: "settings-section", children: [_jsx("h3", { children: "AI Chat Behavior" }), _jsx("p", { className: "section-desc", children: "Control how AI interacts in conversations." }), _jsxs("div", { className: "settings-toggle-row", children: [_jsxs("div", { className: "toggle-info", children: [_jsx("strong", { children: "Chat Assist" }), _jsx("span", { className: "toggle-desc", children: "AI suggests message drafts while typing" })] }), _jsxs("label", { className: "toggle-switch", children: [_jsx("input", { type: "checkbox", checked: nodeConfig?.chatAssistEnabled ?? false, onChange: async (e) => {
                                            await updateNodeConfig({ chatAssistEnabled: e.target.checked });
                                        } }), _jsx("span", { className: "toggle-slider" })] })] }), _jsxs("div", { className: "settings-toggle-row", children: [_jsxs("div", { className: "toggle-info", children: [_jsx("strong", { children: "Auto AI Response" }), _jsx("span", { className: "toggle-desc", children: "AI responds automatically to messages in chat" })] }), _jsxs("label", { className: "toggle-switch", children: [_jsx("input", { type: "checkbox", checked: (nodeConfig?.autonomousPolicies ?? []).find(p => p.domain === "social")?.autoSendChat ?? false, onChange: async (e) => {
                                            const currentPolicies = nodeConfig?.autonomousPolicies ?? [];
                                            const existingSocial = currentPolicies.find(p => p.domain === "social");
                                            let updatedPolicies;
                                            if (existingSocial) {
                                                updatedPolicies = currentPolicies.map(p => p.domain === "social" ? { ...p, autoSendChat: e.target.checked } : p);
                                            }
                                            else {
                                                updatedPolicies = [
                                                    ...currentPolicies,
                                                    { domain: "social", maxSensitivity: "friends", autoAnswer: e.target.checked, autoSendChat: e.target.checked },
                                                ];
                                            }
                                            await updateNodeConfig({ autonomousPolicies: updatedPolicies });
                                        } }), _jsx("span", { className: "toggle-slider" })] })] }), _jsxs("div", { className: "settings-toggle-row", children: [_jsxs("div", { className: "toggle-info", children: [_jsx("strong", { children: "Autonomous Kill Switch" }), _jsx("span", { className: "toggle-desc", children: "Master toggle - pause all autonomous AI actions" })] }), _jsxs("label", { className: "toggle-switch", children: [_jsx("input", { type: "checkbox", checked: nodeConfig?.autonomousKillSwitch ?? false, onChange: async (e) => {
                                            await updateNodeConfig({ autonomousKillSwitch: e.target.checked });
                                        } }), _jsx("span", { className: "toggle-slider" })] })] }), _jsxs("div", { className: "settings-buttons", children: [_jsx("button", { type: "button", className: "settings-save-btn", disabled: settingsSaveStatus === "saving", onClick: async () => {
                                    setSettingsSaveStatus("saving");
                                    try {
                                        await updateNodeConfig({
                                            modelProviders: {
                                                ...(nodeConfig?.modelProviders ?? { mode: "mock" }),
                                                endpoint: modelEndpoint,
                                                modelName,
                                                apiKey: modelApiKey,
                                            },
                                        });
                                        setSettingsSaveStatus("saved");
                                        setTimeout(() => setSettingsSaveStatus("idle"), 2000);
                                    }
                                    catch {
                                        setSettingsSaveStatus("error");
                                        setTimeout(() => setSettingsSaveStatus("idle"), 2000);
                                    }
                                }, children: settingsSaveStatus === "saving" ? "Saving..." : settingsSaveStatus === "saved" ? "Saved!" : "Save" }), _jsx("button", { type: "button", className: "settings-cancel-btn", onClick: () => {
                                    setModelEndpoint(nodeConfig?.modelProviders?.endpoint ?? "");
                                    setModelName(nodeConfig?.modelProviders?.modelName ?? "");
                                    setModelApiKey(nodeConfig?.modelProviders?.apiKey ?? "");
                                    setSettingsSaveStatus("idle");
                                }, children: "Cancel" }), settingsSaveStatus === "error" && _jsx("span", { className: "settings-save-error", children: "Save failed" })] })] }), _jsxs("section", { className: "settings-section", children: [_jsx("h3", { children: "Relay WebSocket URL" }), _jsx("p", { className: "section-desc", children: "Public WebSocket URL of the EnvoyMesh relay for mobile pairing. When set, the pairing QR directs mobile clients through the relay, enabling pairing from any network. Leave empty to auto-discover from configured relays." }), _jsxs("dl", { className: "settings-list", children: [_jsx("dt", { children: "Relay WS URL" }), _jsx("dd", { children: _jsx("input", { type: "text", className: "settings-input", placeholder: "ws://relay.example.com:15432/ws (leave empty for auto-discovery)", value: nodeConfig?.relayPublicWsUrl ?? "", onChange: async (e) => {
                                        const value = e.target.value.trim();
                                        await nodeService.updateNodeConfig({ relayPublicWsUrl: value || "" });
                                        await refreshNodeConfig();
                                    } }) })] })] }), _jsxs("section", { className: "settings-section", children: [_jsx("h3", { children: "Agent Bridge" }), _jsxs("dl", { className: "settings-list", children: [_jsx("dt", { children: "Status" }), _jsxs("dd", { children: [_jsx("span", { className: `status-dot ${bridgeStatus?.enabled ? "online" : "offline"}` }), bridgeStatus?.enabled ? "Running" : nodeConfig?.bridgeEnabled ? "Stopped (needs restart)" : "Disabled"] }), bridgeStatus?.enabled && (_jsxs(_Fragment, { children: [_jsx("dt", { children: "Agent Name" }), _jsx("dd", { children: bridgeStatus.agentName ?? "My Agent" }), _jsx("dt", { children: "Agent Peer ID" }), _jsx("dd", { children: _jsx("code", { children: bridgeStatus.agentPeerId }) }), _jsx("dt", { children: "Agent URL" }), _jsx("dd", { children: _jsx("code", { children: bridgeStatus.agentUrl }) }), _jsx("dt", { children: "Listen Port" }), _jsx("dd", { children: bridgeStatus.listenPort })] }))] }), (!bridgeStatus?.enabled) && (nodeConfig?.bridgeEnabled ? (_jsx("p", { className: "settings-hint", children: "Bridge will be enabled on next node restart." })) : (_jsx("p", { className: "settings-hint", children: "Enable the bridge in your node's bridge-config.json to connect an external agent (HomeClaw, OpenClaw)." }))), _jsxs("div", { className: "settings-toggle-row", style: { marginTop: "12px" }, children: [_jsxs("div", { className: "toggle-info", children: [_jsx("strong", { children: "Enable Bridge" }), _jsx("span", { className: "toggle-desc", children: "Turn the agent bridge on/off (requires node restart)" })] }), _jsxs("label", { className: "toggle-switch", children: [_jsx("input", { type: "checkbox", checked: nodeConfig?.bridgeEnabled ?? false, onChange: async (e) => {
                                            await nodeService.updateNodeConfig({ bridgeEnabled: e.target.checked });
                                            await refreshNodeConfig();
                                        } }), _jsx("span", { className: "toggle-slider" })] })] }), _jsx("div", { style: { marginTop: "12px" }, children: !pairingQR ? (_jsx("button", { className: "settings-button", onClick: handleShowPairingQR, disabled: pairingLoading, children: pairingLoading ? "Generating…" : "Show Pairing QR" })) : (_jsxs("div", { style: { textAlign: "center" }, children: [_jsx("img", { src: pairingQR, alt: "Pairing QR Code", style: { width: 256, height: 256, border: "2px solid var(--border-color)", borderRadius: 8 } }), _jsxs("p", { className: "settings-hint", style: { marginTop: 8, wordBreak: "break-all", fontSize: "0.75rem" }, children: ["Scan with HomeClaw mobile app to pair.", _jsx("br", {}), _jsx("code", { style: { fontSize: "0.65rem" }, children: pairingUri })] }), _jsx("button", { className: "settings-button", onClick: () => { void navigator.clipboard.writeText(pairingUri); }, style: { marginTop: 4 }, children: "Copy URI" }), _jsx("button", { className: "settings-button", onClick: () => setPairingQR(null), style: { marginTop: 4, marginLeft: 4 }, children: "Hide QR" })] })) })] })] }));
}
//# sourceMappingURL=SettingsNodeTab.js.map