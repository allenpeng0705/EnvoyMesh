import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useContext, useState, useEffect, useCallback, } from "react";
import { useNodeService, useBonds, useHelloRequests, } from "../hooks/useNodeService.js";
import { loadAppSettings, saveAppSettings, loadContactAiModes, saveContactAiModes, } from "../lib/storage.js";
const NodeStateContext = createContext(null);
// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------
export function NodeStateProvider({ children }) {
    const nodeService = useNodeService();
    const bonds = useBonds();
    const { requests: pendingHellOs, accept: acceptHello, decline: declineHello } = useHelloRequests();
    // --- Connection state ---
    const [isConnected, setIsConnected] = useState(false);
    const [nodeStatus, setNodeStatus] = useState("offline");
    const [peerId, setPeerId] = useState("");
    // --- Config & identity ---
    const [nodeConfig, setNodeConfig] = useState(null);
    const [humanProfile, setHumanProfile] = useState(null);
    const [connectionStatus, setConnectionStatus] = useState(null);
    // --- Discovery & inbox ---
    const [discoveredPeers, setDiscoveredPeers] = useState([]);
    const [pendingMessages, setPendingMessages] = useState([]);
    // --- App settings ---
    const [appSettings, setAppSettings] = useState(loadAppSettings);
    // --- Per-contact AI modes ---
    const [contactAiModes, setContactAiModesState] = useState(loadContactAiModes);
    // --- Agent bridge ---
    const [bridgeStatus, setBridgeStatus] = useState(null);
    // -----------------------------------------------------------------------
    // Event-driven connection tracking (replaces 100ms polling)
    // -----------------------------------------------------------------------
    useEffect(() => {
        setIsConnected(nodeService.isConnected);
        const unsubOnline = nodeService.on("node:online", () => setIsConnected(true));
        const unsubOffline = nodeService.on("node:offline", () => setIsConnected(false));
        const unsubStatus = nodeService.on("node:status", (data) => {
            if (data.status === "running")
                setIsConnected(true);
            if (data.status === "offline" || data.status === "stopping")
                setIsConnected(false);
        });
        return () => {
            unsubOnline();
            unsubOffline();
            unsubStatus();
        };
    }, [nodeService]);
    // -----------------------------------------------------------------------
    // Load node state on connect
    // -----------------------------------------------------------------------
    useEffect(() => {
        if (!isConnected)
            return;
        // Node status
        nodeService.getNodeStatus()
            .then((result) => {
            setNodeStatus(result.status);
            if (result.status === "running") {
                setIsConnected(true);
            }
        })
            .catch(() => { });
        // Config + relays
        nodeService.getNodeConfig().then((config) => {
            setNodeConfig(config);
        }).catch(() => { });
        // Connection status (libp2p peer ID, multiaddrs, etc.)
        nodeService.getConnectionStatus().then((status) => {
            setConnectionStatus(status);
            if (status.peerId && !status.peerId.startsWith("envoy_")) {
                setPeerId(status.peerId);
            }
        }).catch(() => { });
        // Human profile
        nodeService.getHumanProfile().then((profile) => {
            if (profile)
                setHumanProfile(profile);
        }).catch(() => { });
        // Bridge status
        nodeService.getBridgeStatus().then((status) => {
            if (status.enabled)
                setBridgeStatus(status);
        }).catch(() => { });
    }, [nodeService, isConnected]);
    // -----------------------------------------------------------------------
    // Subscribe to ongoing events
    // -----------------------------------------------------------------------
    // node:status — keep track of node lifecycle
    useEffect(() => {
        if (!isConnected)
            return;
        const unsub = nodeService.on("node:status", (data) => {
            setNodeStatus(data.status);
            if (data.peerId)
                setPeerId(data.peerId);
            // If node stopped, re-fetch status to show setup screen
            if (data.status === "offline" || data.status === "stopping") {
                setIsConnected(false);
            }
        });
        return unsub;
    }, [nodeService, isConnected]);
    // node:online — update connection info
    useEffect(() => {
        if (!isConnected)
            return;
        const unsub = nodeService.on("node:online", (data) => {
            if (data.peerId && !data.peerId.startsWith("envoy_")) {
                setPeerId(data.peerId);
            }
        });
        return unsub;
    }, [nodeService, isConnected]);
    // config:updated — keep nodeConfig in sync
    useEffect(() => {
        if (!isConnected)
            return;
        const unsub = nodeService.on("config:updated", (data) => {
            setNodeConfig((prev) => {
                if (!prev)
                    return prev;
                return {
                    ...prev,
                    autonomousKillSwitch: data.autonomousKillSwitch,
                    autonomousPolicies: [...data.autonomousPolicies],
                    chatAssistEnabled: data.chatAssistEnabled,
                    modelProviders: { ...data.modelProviders },
                    aiSettings: data.aiSettings,
                    contactAiPreferences: [...data.contactAiPreferences],
                };
            });
        });
        return unsub;
    }, [nodeService, isConnected]);
    // bridge:status — keep bridge state in sync
    useEffect(() => {
        if (!isConnected)
            return;
        const unsub = nodeService.on("bridge:status", (data) => {
            setBridgeStatus(data);
        });
        return unsub;
    }, [nodeService, isConnected]);
    // peer:discovered — track nearby peers
    useEffect(() => {
        if (!isConnected)
            return;
        const unsub = nodeService.on("peer:discovered", (data) => {
            setDiscoveredPeers((prev) => {
                if (bonds.some((b) => b.peerOwnerId === data.ownerId))
                    return prev;
                if (prev.some((p) => p.nodeId === data.nodeId))
                    return prev;
                return [...prev, data];
            });
        });
        return unsub;
    }, [nodeService, isConnected, bonds]);
    // chat:message from unbonded peers → pending messages
    useEffect(() => {
        if (!isConnected)
            return;
        const unsub = nodeService.on("chat:message", (msg) => {
            // Skip local echo (sent receipts)
            if (msg.metadata?.deliveryReceipt === "sent")
                return;
            // Skip own messages
            if (peerId && msg.sender.nodeId === peerId)
                return;
            // Skip if bonded
            const isBonded = bonds.some((b) => b.peerOwnerId === msg.sender.ownerId ||
                (b.displayName && b.displayName === msg.sender.displayName));
            if (isBonded)
                return;
            setPendingMessages((prev) => {
                if (prev.some((m) => m.messageId === msg.messageId))
                    return prev;
                return [...prev, msg];
            });
        });
        return unsub;
    }, [nodeService, isConnected, bonds, peerId]);
    // bond:established — remove pending messages from that peer
    useEffect(() => {
        if (!isConnected)
            return;
        const unsub = nodeService.on("bond:established", (data) => {
            setPendingMessages((prev) => prev.filter((m) => m.sender.ownerId !== data.peerOwnerId &&
                m.sender.nodeId !== data.peerOwnerId));
        });
        return unsub;
    }, [nodeService, isConnected]);
    // -----------------------------------------------------------------------
    // Helper functions
    // -----------------------------------------------------------------------
    const refreshNodeConfig = useCallback(async () => {
        try {
            const config = await nodeService.getNodeConfig();
            setNodeConfig(config);
        }
        catch (e) {
            console.error("[NodeState] refreshNodeConfig failed:", e);
        }
    }, [nodeService]);
    const wrappedSetAppSettings = useCallback((settings) => {
        setAppSettings(settings);
        saveAppSettings(settings);
    }, []);
    const wrappedSetContactAiModes = useCallback((modes) => {
        setContactAiModesState(modes);
        saveContactAiModes(modes);
    }, []);
    const sendHello = useCallback(async (targetOwnerId, profile, message) => {
        await nodeService.sendHello(targetOwnerId, profile, message);
    }, [nodeService]);
    const removePendingMessage = useCallback((messageId) => {
        setPendingMessages((prev) => prev.filter((m) => m.messageId !== messageId));
    }, []);
    const clearPendingMessages = useCallback(() => {
        setPendingMessages([]);
    }, []);
    // -----------------------------------------------------------------------
    // Context value
    // -----------------------------------------------------------------------
    const value = {
        isConnected,
        nodeStatus,
        peerId,
        nodeConfig,
        humanProfile,
        bonds,
        pendingHellOs,
        connectionStatus,
        discoveredPeers,
        pendingMessages,
        appSettings,
        bridgeStatus,
        contactAiModes,
        setAppSettings: wrappedSetAppSettings,
        refreshNodeConfig,
        acceptHello,
        declineHello,
        setContactAiModes: wrappedSetContactAiModes,
        sendHello,
        removePendingMessage,
        clearPendingMessages,
    };
    return (_jsx(NodeStateContext.Provider, { value: value, children: children }));
}
// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
export function useNodeState() {
    const ctx = useContext(NodeStateContext);
    if (!ctx) {
        throw new Error("useNodeState must be used within NodeStateProvider");
    }
    return ctx;
}
//# sourceMappingURL=NodeStateContext.js.map