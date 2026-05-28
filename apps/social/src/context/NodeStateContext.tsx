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
  useSocialIntroProposals,
  useTransportWsOpen,
  useDesktopConnectionPrefsSync,
} from "../hooks/useNodeService.js";
import { useChatNotifications } from "../hooks/useChatNotifications.js";
import {
  DEFAULT_APP_SETTINGS,
  loadAppSettings,
  saveAppSettings,
  loadContactAiModes,
  saveContactAiModes,
  type AppSettings,
  type AssistantMode,
} from "../lib/storage.js";
import type {
  BondRecord,
  BridgeStatus,
  ChatMessage,
  ConnectionStatus,
  HelloProfile,
  HelloRequest,
  HumanProfile,
  NodeConfig,
  NodeStatus,
  PeerSearchResult,
  RelayConfig,
  SendHelloOptions,
  SocialIntroProposal,
} from "@envoymesh/api";

// ---------------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------------

function parseNodeStatusFromRpc(result: unknown): NodeStatus | null {
  if (typeof result === "string") {
    return result as NodeStatus;
  }
  if (result && typeof result === "object" && "status" in result) {
    const status = (result as { status?: unknown }).status;
    if (typeof status === "string") {
      return status as NodeStatus;
    }
  }
  return null;
}

interface NodeStateValue {
  // Connection
  /** WebSocket/mobile transport connected to node's API (daemon may still be stopped). */
  isConnected: boolean;
  /** False until the first getNodeStatus completes after transport is up. */
  nodeStatusHydrated: boolean;
  nodeStatus: NodeStatus;
  peerId: string;

  // Configuration
  nodeConfig: NodeConfig | null;

  // Identity
  humanProfile: HumanProfile | null;

  // Social
  bonds: BondRecord[];
  pendingHellOs: HelloRequest[];
  pendingIntroProposals: SocialIntroProposal[];
  connectionStatus: ConnectionStatus | null;

  // Discovery
  discoveredPeers: PeerSearchResult[];

  // Inbox
  pendingMessages: ChatMessage[];

  // App settings (persisted)
  appSettings: AppSettings;

  // Agent bridge
  bridgeStatus: BridgeStatus | null;

  // Per-contact AI modes (persisted)
  contactAiModes: Record<string, AssistantMode>;

  // Mutations
  setAppSettings: (settings: AppSettings) => void;
  refreshNodeConfig: () => Promise<void>;
  refreshHumanProfile: () => Promise<void>;
  refreshConnectionStatus: () => Promise<void>;
  acceptHello: (messageId: string) => Promise<void>;
  declineHello: (messageId: string, reason?: string) => Promise<void>;
  approveIntroCommitment: (messageId: string) => Promise<void>;
  declineIntroProposal: (messageId: string) => Promise<void>;
  setContactAiModes: (modes: Record<string, AssistantMode>) => void;
  sendHello: (
    targetOwnerId: string,
    profile: HelloProfile,
    message: string,
    opts?: SendHelloOptions,
  ) => Promise<void>;
  removePendingMessage: (messageId: string) => void;
  clearPendingMessages: () => void;
}

const NodeStateContext = createContext<NodeStateValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function NodeStateProvider({ children }: { children: ReactNode }) {
  const nodeService = useNodeService();
  const connectionPrefsSync = useDesktopConnectionPrefsSync();
  const bonds = useBonds();
  const { requests: pendingHellOs, accept: acceptHello, decline: declineHello } = useHelloRequests();
  const {
    proposals: pendingIntroProposals,
    approveCommitment: approveIntroCommitmentHook,
    decline: declineIntroProposalHook,
  } = useSocialIntroProposals();

  // --- Connection state ---
  /** Transport (WS) connected — used for splash vs setup vs main app gates. */
  const wsTransportOpen = useTransportWsOpen();
  const [nodeStatus, setNodeStatus] = useState<NodeStatus>("offline");
  const [nodeStatusHydrated, setNodeStatusHydrated] = useState(false);
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

  useChatNotifications({
    enabled: appSettings.notificationsEnabled,
    nodeService,
    wsOpen: wsTransportOpen,
    bonds,
    peerId,
  });

  // --- Agent bridge ---
  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus | null>(null);

  useEffect(() => {
    if (!wsTransportOpen) {
      setNodeStatusHydrated(false);
      return;
    }

    let cancelled = false;
    void nodeService
      .getNodeStatus()
      .then((result) => {
        if (cancelled) return;
        const status = parseNodeStatusFromRpc(result);
        if (status) setNodeStatus(status);
      })
      .catch(() => { /* node may not be initialized yet */ })
      .finally(() => {
        if (!cancelled) setNodeStatusHydrated(true);
      });

    return () => {
      cancelled = true;
    };
  }, [nodeService, wsTransportOpen]);

  const refreshConnectionStatus = useCallback(async () => {
    try {
      const status = await nodeService.getConnectionStatus();
      setConnectionStatus(status);
      if (status.peerId && (status.peerId.startsWith("envoy_agent_") || !status.peerId.startsWith("envoy_"))) {
        setPeerId(status.peerId);
      }
    } catch (e) {
      console.error("[NodeState] refreshConnectionStatus failed:", e);
    }
  }, [nodeService]);

  // -----------------------------------------------------------------------
  // Load node state once transport is up
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!wsTransportOpen) return;

    // Config + relays
    nodeService.getNodeConfig().then((config) => {
      setNodeConfig(config);
    }).catch(() => {});

    // Connection status (may be offline until startNode completes; node:online / node:status refresh later)
    void refreshConnectionStatus();

    // Human profile
    nodeService.getHumanProfile().then((profile) => {
      if (profile) setHumanProfile(profile);
    }).catch(() => {});

    // Bridge status
    nodeService.getBridgeStatus().then((status) => {
      if (status.enabled) setBridgeStatus(status);
    }).catch(() => {});
  }, [nodeService, wsTransportOpen, refreshConnectionStatus]);

  // -----------------------------------------------------------------------
  // Subscribe to ongoing events (require transport — handler registration uses RPC `on`)
  // -----------------------------------------------------------------------

  // node:status — keep track of node lifecycle
  useEffect(() => {
    if (!wsTransportOpen) return;
    const unsub = nodeService.on("node:status", (data) => {
      setNodeStatus(data.status);
      setNodeStatusHydrated(true);
      if (data.peerId) setPeerId(data.peerId);
      if (data.status === "running" || data.status === "offline") {
        void refreshConnectionStatus();
      }
    });
    return unsub;
  }, [nodeService, wsTransportOpen, refreshConnectionStatus]);

  // node:online — mesh is up (sync RPC snapshot; avoids stale offline from pre-start fetch)
  useEffect(() => {
    if (!wsTransportOpen) return;
    const unsub = nodeService.on("node:online", (data) => {
      if (data.peerId && (data.peerId.startsWith("envoy_agent_") || !data.peerId.startsWith("envoy_"))) {
        setPeerId(data.peerId);
      }
      void refreshConnectionStatus();
    });
    return unsub;
  }, [nodeService, wsTransportOpen, refreshConnectionStatus]);

  // node:offline — mesh torn down
  useEffect(() => {
    if (!wsTransportOpen) return;
    const unsub = nodeService.on("node:offline", () => {
      void refreshConnectionStatus();
    });
    return unsub;
  }, [nodeService, wsTransportOpen, refreshConnectionStatus]);

  /** Relay + bootstrap can delay snapshots; reconcile while RPC says offline but lifecycle says mesh is running. */
  useEffect(() => {
    if (!wsTransportOpen) return;
    if (nodeStatus !== "running") return;
    if (connectionStatus?.online === true) return;

    let cancelled = false;
    let ticks = 0;
    const maxTicks = 20;
    const iv = window.setInterval(() => {
      if (cancelled) return;
      ticks += 1;
      void refreshConnectionStatus();
      if (ticks >= maxTicks) window.clearInterval(iv);
    }, 2500);

    return () => {
      cancelled = true;
      window.clearInterval(iv);
    };
  }, [wsTransportOpen, nodeStatus, connectionStatus?.online, refreshConnectionStatus]);

  // config:updated — keep nodeConfig in sync
  useEffect(() => {
    if (!wsTransportOpen) return;
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
  }, [nodeService, wsTransportOpen]);

  // bridge:status — keep bridge state in sync
  useEffect(() => {
    if (!wsTransportOpen) return;
    const unsub = nodeService.on("bridge:status", (data) => {
      setBridgeStatus(data);
    });
    return unsub;
  }, [nodeService, wsTransportOpen]);

  // peer:discovered — track nearby peers
  useEffect(() => {
    if (!wsTransportOpen) return;
    const unsub = nodeService.on("peer:discovered", (data) => {
      setDiscoveredPeers((prev) => {
        if (bonds.some((b) => b.peerOwnerId === data.ownerId)) return prev;
        if (prev.some((p) => p.nodeId === data.nodeId)) return prev;
        return [...prev, data];
      });
    });
    return unsub;
  }, [nodeService, wsTransportOpen, bonds]);

  // chat:message from unbonded peers → pending messages
  useEffect(() => {
    if (!wsTransportOpen) return;
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
  }, [nodeService, wsTransportOpen, bonds, peerId]);

  // bond:established — remove pending messages from that peer
  useEffect(() => {
    if (!wsTransportOpen) return;
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
  }, [nodeService, wsTransportOpen]);

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

  const refreshHumanProfile = useCallback(async () => {
    try {
      const profile = await nodeService.getHumanProfile();
      if (profile) setHumanProfile(profile);
    } catch (e) {
      console.error("[NodeState] refreshHumanProfile failed:", e);
    }
  }, [nodeService]);

  const wrappedSetAppSettings = useCallback((settings: AppSettings) => {
    setAppSettings(settings);
    saveAppSettings(settings);
    connectionPrefsSync?.updatePrefs({
      wsUrl: settings.wsUrl.trim() || DEFAULT_APP_SETTINGS.wsUrl,
      autoConnect: settings.autoConnect,
    });
  }, [connectionPrefsSync]);

  const wrappedSetContactAiModes = useCallback((modes: Record<string, AssistantMode>) => {
    setContactAiModesState(modes);
    saveContactAiModes(modes);
  }, []);

  const sendHello = useCallback(
    async (
      targetOwnerId: string,
      profile: HelloProfile,
      message: string,
      opts?: SendHelloOptions,
    ) => {
      await nodeService.sendHello(targetOwnerId, profile, message, opts);
      void nodeService.requestPeerProfile(targetOwnerId).catch(() => {});
    },
    [nodeService],
  );

  const approveIntroCommitment = useCallback(
    async (messageId: string) => {
      await approveIntroCommitmentHook(messageId);
    },
    [approveIntroCommitmentHook],
  );

  const declineIntroProposal = useCallback(
    async (messageId: string) => {
      await declineIntroProposalHook(messageId);
    },
    [declineIntroProposalHook],
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
    isConnected: wsTransportOpen,
    nodeStatusHydrated,
    nodeStatus,
    peerId,
    nodeConfig,
    humanProfile,
    bonds,
    pendingHellOs,
    pendingIntroProposals,
    connectionStatus,
    discoveredPeers,
    pendingMessages,
    appSettings,
    bridgeStatus,
    contactAiModes,
    setAppSettings: wrappedSetAppSettings,
    refreshNodeConfig,
    refreshHumanProfile,
    refreshConnectionStatus,
    acceptHello,
    declineHello,
    approveIntroCommitment,
    declineIntroProposal,
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
