import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { useNodeService } from "../../hooks/useNodeService.js";
import { DEFAULT_PUBLIC_LIBP2P_BOOTSTRAP_PRESETS, DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR } from "@envoymesh/api";
export function SetupView() {
    const nodeService = useNodeService();
    const [setupProfileDir, setSetupProfileDir] = useState("./data/default");
    const [setupDiscoveryProfile, setSetupDiscoveryProfile] = useState("wan-default");
    const [setupBootstrapPeers, setSetupBootstrapPeers] = useState(DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR);
    const [isInitializing, setIsInitializing] = useState(false);
    const handleInitialize = async () => {
        if (!setupProfileDir.trim())
            return;
        setIsInitializing(true);
        try {
            const bootstrapPeers = setupBootstrapPeers
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean);
            await nodeService.initNode(setupProfileDir, {
                discoveryProfile: setupDiscoveryProfile,
                bootstrapPeers,
                bootstrapPresets: [...DEFAULT_PUBLIC_LIBP2P_BOOTSTRAP_PRESETS],
            });
            await nodeService.startNode();
            // NodeStateContext will pick up the running state via events
        }
        catch (error) {
            console.error("Failed to initialize node:", error);
        }
        finally {
            setIsInitializing(false);
        }
    };
    return (_jsx("div", { className: "app", children: _jsxs("div", { className: "setup-view", children: [_jsx("h1", { children: "Welcome to Envoy" }), _jsx("p", { className: "muted", children: "Set up your Envoy node to join the network" }), _jsxs("div", { className: "setup-form", children: [_jsxs("div", { className: "form-group", children: [_jsx("label", { children: "Profile Directory" }), _jsx("input", { type: "text", value: setupProfileDir, onChange: (e) => setSetupProfileDir(e.target.value), placeholder: "./data/default" }), _jsx("small", { children: "Where your identity and data will be stored" })] }), _jsxs("div", { className: "form-group", children: [_jsx("label", { children: "Discovery Profile" }), _jsxs("select", { value: setupDiscoveryProfile, onChange: (e) => setSetupDiscoveryProfile(e.target.value), children: [_jsx("option", { value: "lan-fast", children: "LAN Fast (local network only)" }), _jsx("option", { value: "wan-default", children: "WAN Default (connect to wider network)" })] })] }), _jsxs("div", { className: "form-group", children: [_jsx("label", { children: "Bootstrap Peers (optional)" }), _jsx("input", { type: "text", value: setupBootstrapPeers, onChange: (e) => setSetupBootstrapPeers(e.target.value), placeholder: "/ip4/1.2.3.4/tcp/4001/p2p/Qm..., /dnsaddr/example.com/..." }), _jsx("small", { children: "Comma-separated list of peer addresses to connect to" })] }), _jsx("button", { className: "primary", onClick: handleInitialize, disabled: isInitializing || !setupProfileDir.trim(), children: isInitializing ? "Initializing..." : "Initialize Node" })] })] }) }));
}
//# sourceMappingURL=SetupView.js.map