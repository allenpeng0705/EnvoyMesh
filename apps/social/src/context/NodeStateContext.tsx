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
import { isFamilyThreadKey, OWNER_FAMILY_PROFILE_ID } from "@envoymesh/api";
import { parseNodeStatusFromRpc } from "../lib/effective-node-status.js";
import { isStrangerInboxCandidate } from "../lib/inbox-pending-filter.js";

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

  // Paired diagnostics snapshot from the home node (debug bar in MobileApp).
  // `null` when the transport is closed or the call has not yet returned.
  pairedDiag: Record<string, unknown> | null;

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
    selfOwnerId: humanProfile?.ownerId,
    locale: appSettings.locale,
  });

  // --- Agent bridge ---
  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus | null>(null);

  // --- Paired diagnostics snapshot ---
  // Mirrors `getPairedDiagnostics()` on the node. Updated whenever transport
  // is up and `node:status` flips, so the MobileApp debug bar reflects the
  // current pairing state without polling.
  const [pairedDiag, setPairedDiag] = useState<Record<string, unknown> | null>(null);

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

  // Defined before chat/inbox effects — they refresh the Family roster when
  // Mom/Dad DMs arrive but ChatSidebar still has a stale/empty profile list.
  const refreshNodeConfig = useCallback(async () => {
    try {
      const config = await nodeService.getNodeConfig();
      // ChatSidebar Family section used to rely only on config.familyProfiles.
      // Settings already used listFamilyProfiles — if those diverged (stale
      // config, missed home:config-updated), Mom/Dad vanished from Chat and
      // their DMs looked like Inbox strangers. Always merge the store list.
      let familyProfiles = config.familyProfiles ?? [];
      try {
        const listed = await nodeService.listFamilyProfiles?.();
        if (listed?.profiles && listed.profiles.length > 0) {
          familyProfiles = listed.profiles;
        }
      } catch {
        /* keep getNodeConfig snapshot */
      }
      setNodeConfig({ ...config, familyProfiles });
    } catch (e) {
      console.error("[NodeState] refreshNodeConfig failed:", e);
    }
  }, [nodeService]);

  // -----------------------------------------------------------------------
  // Load node state once transport is up
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!wsTransportOpen) return;

    void refreshNodeConfig();

    // Connection status (may be offline until startNode completes; node:online / node:status refresh later)
    void refreshConnectionStatus();

    // Human profile — keep prior display name if reconnect returns empty (setup just finished).
    nodeService.getHumanProfile().then((profile) => {
      if (!profile) return;
      setHumanProfile((prev) => {
        if (
          prev?.displayName?.trim() &&
          prev?.username?.trim() &&
          !profile.displayName?.trim() &&
          !profile.username?.trim()
        ) {
          return prev;
        }
        return profile;
      });
    }).catch(() => {});

    // Bridge status (always store — Settings needs ext-agent fields even when disabled)
    nodeService.getBridgeStatus().then((status) => {
      setBridgeStatus(status);
    }).catch(() => {});

    // Paired diagnostics — MobileApp debug bar reads this.
    nodeService.getPairedDiagnostics?.().then((diag) => {
      setPairedDiag(diag ?? null);
    }).catch(() => {});
  }, [nodeService, wsTransportOpen, refreshConnectionStatus, refreshNodeConfig]);

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
      // Bridge status may have been set after initial load
      nodeService.getBridgeStatus().then((s) => {
        if (s) setBridgeStatus(s);
      }).catch(() => {});
      // Paired diagnostics may have changed alongside the status flip
      nodeService.getPairedDiagnostics?.().then((diag) => {
        setPairedDiag(diag ?? null);
      }).catch(() => {});
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

  /** Reconcile stale offline when mesh is up but lifecycle event was missed. */
  useEffect(() => {
    if (!wsTransportOpen) return;
    if (nodeStatus === "running") return;
    if (nodeConfig?.nodeInitialized === false) return;

    let cancelled = false;
    let ticks = 0;
    const iv = window.setInterval(() => {
      if (cancelled) return;
      ticks += 1;
      void nodeService
        .getNodeStatus()
        .then((result) => {
          if (cancelled) return;
          const status = parseNodeStatusFromRpc(result);
          if (status) setNodeStatus(status);
        })
        .catch(() => {});
      void refreshConnectionStatus();
      if (ticks >= 30) window.clearInterval(iv);
    }, 2000);

    return () => {
      cancelled = true;
      window.clearInterval(iv);
    };
  }, [nodeService, wsTransportOpen, nodeStatus, nodeConfig?.nodeInitialized, refreshConnectionStatus]);

  // Sponsor auto-bond runs once from SetupView after first-run wizard.
  // Do not re-trigger here on WS reconnect / nodeStatus / profile:updated —
  // that burned dials on Windows every session. Users retry from Discover.

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

  // peer:discovered + peer:lost — track nearby peers. Debounce removals so
  // brief disconnect / probe churn does not flash the Discover page.
  useEffect(() => {
    if (!wsTransportOpen) return;
    const selfOwnerId = humanProfile?.ownerId?.trim() ?? "";
    const pendingLost = new Map<string, ReturnType<typeof setTimeout>>();

    const cancelPendingLost = (nodeId: string) => {
      const timer = pendingLost.get(nodeId);
      if (timer) {
        clearTimeout(timer);
        pendingLost.delete(nodeId);
      }
    };

    const unsub1 = nodeService.on("peer:discovered", (data: any) => {
      if (selfOwnerId && data.ownerId === selfOwnerId) return;
      const nodeId = typeof data?.nodeId === "string" ? data.nodeId : "";
      if (!nodeId) return;
      cancelPendingLost(nodeId);
      setDiscoveredPeers((prev) => {
        const existing = prev.find((p) => p.nodeId === nodeId);
        if (existing) {
          if (
            existing.ownerId === (data.ownerId ?? "") &&
            existing.displayName === (data.displayName ?? "") &&
            existing.profileStatus === data.profileStatus &&
            existing.username === data.username &&
            existing.discoverySource === data.discoverySource
          ) {
            return prev;
          }
          return prev.map((p) => (p.nodeId === nodeId ? { ...p, ...data } : p));
        }
        // Ignore pending-only placeholders if any older node still emits them.
        if (!data.ownerId?.trim() && data.profileStatus === "pending") {
          return prev;
        }
        return [...prev, data];
      });
    });

    const unsub2 = nodeService.on("peer:lost", (data: any) => {
      const nodeId = typeof data?.nodeId === "string" ? data.nodeId : "";
      if (!nodeId) return;
      cancelPendingLost(nodeId);
      pendingLost.set(
        nodeId,
        setTimeout(() => {
          pendingLost.delete(nodeId);
          setDiscoveredPeers((prev) => {
            if (!prev.some((p) => p.nodeId === nodeId)) return prev;
            return prev.filter((p) => p.nodeId !== nodeId);
          });
        }, 2_500),
      );
    });

    return () => {
      unsub1();
      unsub2();
      for (const timer of pendingLost.values()) clearTimeout(timer);
      pendingLost.clear();
    };
  }, [nodeService, wsTransportOpen, humanProfile?.ownerId]);

  // Safety net: drop only resolved peers that still carry a raw "Peer 12D3…"
  // label. Keep pending/unreachable placeholders for diagnostics.
  useEffect(() => {
    if (!wsTransportOpen) return;
    const timer = setInterval(() => {
      setDiscoveredPeers((prev) => {
        if (prev.length === 0) return prev;
        const cleaned = prev.filter((p) => {
          if (p.profileStatus === "pending" || p.profileStatus === "unreachable") return true;
          if (!p.ownerId?.trim()) return true;
          const name = p.displayName?.trim() ?? "";
          return name.length > 0 && !/^Peer\s\w{8}$/.test(name);
        });
        return cleaned.length === prev.length ? prev : cleaned;
      });
    }, 30_000);
    return () => clearInterval(timer);
  }, [wsTransportOpen]);

  // profile:updated — refresh nearby card names after profile probe
  useEffect(() => {
    if (!wsTransportOpen) return;
    const unsub = nodeService.on("profile:updated", (data) => {
      void nodeService
        .getPeerProfile(data.ownerId)
        .then((row) => {
          if (!row) return;
          setDiscoveredPeers((prev) =>
            prev.map((p) =>
              p.ownerId === data.ownerId || p.nodeId === data.ownerId
                ? {
                    ...p,
                    ownerId: data.ownerId,
                    displayName: row.profile.displayName ?? p.displayName,
                    username: row.profile.username ?? p.username,
                    bio: row.profile.bio ?? p.bio,
                  }
                : p,
            ),
          );
        })
        .catch(() => {});
    });
    return unsub;
  }, [nodeService, wsTransportOpen]);

  // chat:message from unbonded *mesh* peers → Inbox only.
  // Family DMs still arrive on the owner WS for Family chat; they must never
  // enter pendingMessages (profile ids like mom/dad/owner are not mesh strangers).
  useEffect(() => {
    if (!wsTransportOpen) return;
    const familyProfileIds = new Set(
      (nodeConfig?.familyProfiles ?? [])
        .map((p) => p.id?.trim())
        .filter((id): id is string => Boolean(id)),
    );
    familyProfileIds.add(OWNER_FAMILY_PROFILE_ID);
    const filterCtx = {
      selfOwnerId: humanProfile?.ownerId?.trim() ?? "",
      peerId: peerId ?? undefined,
      bridgeAgentPeerId: bridgeStatus?.agentPeerId,
      familyProfileIds,
    };
    const unsub = nodeService.on("chat:message", (msg) => {
      const snd = msg.sender?.ownerId?.trim() ?? "";
      const rcv = msg.recipient?.ownerId?.trim() ?? "";
      // Family traffic for this owner → keep Family roster fresh (Mom/Dad rows).
      if (
        (rcv && isFamilyThreadKey(rcv)) ||
        (snd && !snd.startsWith("envoy:owner:") && familyProfileIds.has(snd))
      ) {
        const needsRoster =
          (nodeConfig?.familyProfiles?.length ?? 0) <= 1 ||
          (snd &&
            snd !== OWNER_FAMILY_PROFILE_ID &&
            !familyProfileIds.has(snd));
        if (needsRoster) void refreshNodeConfig();
      }
      if (!isStrangerInboxCandidate(msg, filterCtx, bonds)) return;
      setPendingMessages((prev) => {
        if (prev.some((m) => m.messageId === msg.messageId)) return prev;
        return [...prev, msg];
      });
    });
    return unsub;
  }, [
    nodeService,
    wsTransportOpen,
    bonds,
    peerId,
    humanProfile?.ownerId,
    bridgeStatus?.agentPeerId,
    nodeConfig?.familyProfiles,
    refreshNodeConfig,
  ]);

  // Drop stuck family/self rows that landed before the mesh-only filter.
  useEffect(() => {
    const familyProfileIds = new Set(
      (nodeConfig?.familyProfiles ?? [])
        .map((p) => p.id?.trim())
        .filter((id): id is string => Boolean(id)),
    );
    familyProfileIds.add(OWNER_FAMILY_PROFILE_ID);
    const filterCtx = {
      selfOwnerId: humanProfile?.ownerId?.trim() ?? "",
      peerId: peerId ?? undefined,
      bridgeAgentPeerId: bridgeStatus?.agentPeerId,
      familyProfileIds,
    };
    setPendingMessages((prev) => {
      const next = prev.filter((m) => isStrangerInboxCandidate(m, filterCtx, bonds));
      return next.length === prev.length ? prev : next;
    });
  }, [
    bonds,
    peerId,
    humanProfile?.ownerId,
    bridgeStatus?.agentPeerId,
    nodeConfig?.familyProfiles,
  ]);

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

  // After mesh is reachable, exchange profiles with all bonds (catch-up for missed thumbnail updates).
  useEffect(() => {
    if (!wsTransportOpen) return;
    const unsub = nodeService.on("node:online", () => {
      if (nodeConfig?.nodeInitialized === false) return;
    });
    return unsub;
  }, [nodeService, wsTransportOpen, nodeConfig?.nodeInitialized]);

  // -----------------------------------------------------------------------
  // Helper functions
  // -----------------------------------------------------------------------

  // Bidirectional sync — mobile / another client saved via updateNodeConfig.
  useEffect(() => {
    if (!wsTransportOpen) return;
    return nodeService.on("home:config-updated", () => {
      void refreshNodeConfig();
    });
  }, [nodeService, wsTransportOpen, refreshNodeConfig]);

  const refreshHumanProfile = useCallback(async () => {
    try {
      const profile = await nodeService.getHumanProfile();
      if (!profile) return;
      setHumanProfile((prev) => {
        if (
          prev?.displayName?.trim() &&
          prev?.username?.trim() &&
          !profile.displayName?.trim() &&
          !profile.username?.trim()
        ) {
          return prev;
        }
        return profile;
      });
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
    pairedDiag,
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
