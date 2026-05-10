import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import {
  useNodeService,
  useBonds,
  useHelloRequests,
} from "../hooks/useNodeService.js";
import {
  loadAppSettings,
  saveAppSettings,
  loadContactAiModes,
  saveContactAiModes,
  type AppSettings,
  type AssistantMode,
} from "../lib/storage.js";
import type {
  BondRecord,
  ChatMessage,
  ConnectionStatus,
  HelloProfile,
  HelloRequest,
  HumanProfile,
  NodeConfig,
  NodeStatus,
  PeerSearchResult,
  RelayConfig,
} from "@envoymesh/api";

// ---------------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------------

interface NodeStateValue {
  // Connection
  isConnected: boolean;
  nodeStatus: NodeStatus;
  peerId: string;

  // Configuration
  nodeConfig: NodeConfig | null;

  // Identity
  humanProfile: HumanProfile | null;

  // Social
  bonds: BondRecord[];
  pendingHellOs: HelloRequest[];
  connectionStatus: ConnectionStatus | null;

  // Discovery
  discoveredPeers: PeerSearchResult[];

  // Inbox
  pendingMessages: ChatMessage[];

  // App settings (persisted)
  appSettings: AppSettings;

  // Per-contact AI modes (persisted)
  contactAiModes: Record<string, AssistantMode>;

  // Mutations
  setAppSettings: (settings: AppSettings) => void;
  refreshNodeConfig: () => Promise<void>;
  acceptHello: (messageId: string) => Promise<void>;
  declineHello: (messageId: string, reason?: string) => Promise<void>;
  setContactAiModes: (modes: Record<string, AssistantMode>) => void;
  sendHello: (targetOwnerId: string, profile: HelloProfile, message: string) => Promise<void>;
  removePendingMessage: (messageId: string) => void;
  clearPendingMessages: () => void;
}

const NodeStateContext = createContext<NodeStateValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function NodeStateProvider({ children }: { children: ReactNode }) {
  const nodeService = useNodeService();
  const bonds = useBonds();
  const { requests: pendingHellOs, accept: acceptHello, decline: declineHello } = useHelloRequests();

  // --- Connection state ---
  const [isConnected, setIsConnected] = useState(false);
  const [nodeStatus, setNodeStatus] = useState<NodeStatus>("offline");
  const [peerId, setPeerId] = useState("");

  // --- Config & identity ---
  const [nodeConfig, setNodeConfig] = useState<NodeConfig | null>(null);
  const [humanProfile, setHumanProfile] = useState<HumanProfile | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus | null>(null);

  // --- Discovery & inbox ---
  const [discoveredPeers, setDiscoveredPeers] = useState<PeerSearchResult[]>([]);
  const [pendingMessages, setPendingMessages] = useState<ChatMessage[]>([]);

  // --- App settings ---
  const [appSettings, setAppSettings] = useState<AppSettings>(loadAppSettings);

  // --- Per-contact AI modes ---
  const [contactAiModes, setContactAiModesState] = useState<Record<string, AssistantMode>>(loadContactAiModes);

  // -----------------------------------------------------------------------
  // Event-driven connection tracking (replaces 100ms polling)
  // -----------------------------------------------------------------------
  useEffect(() => {
    setIsConnected(nodeService.isConnected);

    const unsubOnline = nodeService.on("node:online", () => setIsConnected(true));
    const unsubOffline = nodeService.on("node:offline", () => setIsConnected(false));
    const unsubStatus = nodeService.on("node:status", (data) => {
      if (data.status === "running") setIsConnected(true);
      if (data.status === "offline" || data.status === "stopping") setIsConnected(false);
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
    if (!isConnected) return;

    // Node status
    nodeService.getNodeStatus()
      .then((result) => {
        setNodeStatus(result.status);
        if (result.status === "running") {
          setIsConnected(true);
        }
      })
      .catch(() => { /* node may not be initialized yet */ });

    // Config + relays
    nodeService.getNodeConfig().then((config) => {
      setNodeConfig(config);
    }).catch(() => {});

    // Connection status (libp2p peer ID, multiaddrs, etc.)
    nodeService.getConnectionStatus().then((status) => {
      setConnectionStatus(status);
      if (status.peerId && !status.peerId.startsWith("envoy_")) {
        setPeerId(status.peerId);
      }
    }).catch(() => {});

    // Human profile
    nodeService.getHumanProfile().then((profile) => {
      if (profile) setHumanProfile(profile);
    }).catch(() => {});
  }, [nodeService, isConnected]);

  // -----------------------------------------------------------------------
  // Subscribe to ongoing events
  // -----------------------------------------------------------------------

  // node:status — keep track of node lifecycle
  useEffect(() => {
    if (!isConnected) return;
    const unsub = nodeService.on("node:status", (data) => {
      setNodeStatus(data.status);
      if (data.peerId) setPeerId(data.peerId);
      // If node stopped, re-fetch status to show setup screen
      if (data.status === "offline" || data.status === "stopping") {
        setIsConnected(false);
      }
    });
    return unsub;
  }, [nodeService, isConnected]);

  // node:online — update connection info
  useEffect(() => {
    if (!isConnected) return;
    const unsub = nodeService.on("node:online", (data) => {
      if (data.peerId && !data.peerId.startsWith("envoy_")) {
        setPeerId(data.peerId);
      }
    });
    return unsub;
  }, [nodeService, isConnected]);

  // config:updated — keep nodeConfig in sync
  useEffect(() => {
    if (!isConnected) return;
    const unsub = nodeService.on("config:updated", (data) => {
      setNodeConfig((prev) => {
        if (!prev) return prev;
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

  // peer:discovered — track nearby peers
  useEffect(() => {
    if (!isConnected) return;
    const unsub = nodeService.on("peer:discovered", (data) => {
      setDiscoveredPeers((prev) => {
        if (bonds.some((b) => b.peerOwnerId === data.ownerId)) return prev;
        if (prev.some((p) => p.nodeId === data.nodeId)) return prev;
        return [...prev, data];
      });
    });
    return unsub;
  }, [nodeService, isConnected, bonds]);

  // chat:message from unbonded peers → pending messages
  useEffect(() => {
    if (!isConnected) return;
    const unsub = nodeService.on("chat:message", (msg) => {
      // Skip local echo (sent receipts)
      if (msg.metadata?.deliveryReceipt === "sent") return;
      // Skip own messages
      if (peerId && msg.sender.nodeId === peerId) return;
      // Skip if bonded
      const isBonded = bonds.some(
        (b) =>
          b.peerOwnerId === msg.sender.ownerId ||
          (b.displayName && b.displayName === msg.sender.displayName),
      );
      if (isBonded) return;

      setPendingMessages((prev) => {
        if (prev.some((m) => m.messageId === msg.messageId)) return prev;
        return [...prev, msg];
      });
    });
    return unsub;
  }, [nodeService, isConnected, bonds, peerId]);

  // bond:established — remove pending messages from that peer
  useEffect(() => {
    if (!isConnected) return;
    const unsub = nodeService.on("bond:established", (data) => {
      setPendingMessages((prev) =>
        prev.filter(
          (m) =>
            m.sender.ownerId !== data.peerOwnerId &&
            m.sender.nodeId !== data.peerOwnerId,
        ),
      );
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
    } catch (e) {
      console.error("[NodeState] refreshNodeConfig failed:", e);
    }
  }, [nodeService]);

  const wrappedSetAppSettings = useCallback((settings: AppSettings) => {
    setAppSettings(settings);
    saveAppSettings(settings);
  }, []);

  const wrappedSetContactAiModes = useCallback((modes: Record<string, AssistantMode>) => {
    setContactAiModesState(modes);
    saveContactAiModes(modes);
  }, []);

  const sendHello = useCallback(
    async (targetOwnerId: string, profile: HelloProfile, message: string) => {
      await nodeService.sendHello(targetOwnerId, profile, message);
    },
    [nodeService],
  );

  const removePendingMessage = useCallback((messageId: string) => {
    setPendingMessages((prev) => prev.filter((m) => m.messageId !== messageId));
  }, []);

  const clearPendingMessages = useCallback(() => {
    setPendingMessages([]);
  }, []);

  // -----------------------------------------------------------------------
  // Context value
  // -----------------------------------------------------------------------

  const value: NodeStateValue = {
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

  return (
    <NodeStateContext.Provider value={value}>
      {children}
    </NodeStateContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useNodeState(): NodeStateValue {
  const ctx = useContext(NodeStateContext);
  if (!ctx) {
    throw new Error("useNodeState must be used within NodeStateProvider");
  }
  return ctx;
}
