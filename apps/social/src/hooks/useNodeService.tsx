import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createWsClient } from "../ws-client.js";
import { loadAppSettings } from "../lib/storage.js";
import type {
  AgentShareProposal,
  BondRecord,
  BridgeStatus,
  ChatMessage,
  DiscoverPublishedLibraryParams,
  DiscoverPublishedLibraryPeerResult,
  PairingPayload,
  ConnectionStatus,
  CreateHumanProfileInput,
  HelloProfile,
  HelloRequest,
  HelloResponse,
  HumanProfile,
  NodeProfile,
  NodeServiceEvents,
  NodeConfig,
  PeerSearchResult,
  RelayConfig,
  SearchQuery,
  SendHelloOptions,
  ShareOffer,
  SocialIntroProposal,
  SubmitAgentShareProposalParams,
  NodeStatus,
  LibraryItem,
  ListLibraryItemsParams,
  ExportLibraryItemToIpfsResult,
  VerifyLibraryItemIpfsGatewayParams,
  VerifyLibraryItemIpfsGatewayResult,
  ImportToLibraryParams,
  ImportToLibraryResult,
  IpfsEngineStatus,
} from "@envoymesh/api";

type InitNodeOptions = {
  discoveryProfile?: "lan-fast" | "wan-default";
  relayEnabled?: boolean;
  relayServerEnabled?: boolean;
  advertiseAddrs?: string[];
  bootstrapPeers?: string[];
  bootstrapPresets?: string[];
};

type NodeInitResult = {
  profileDir: string;
  peerId: string;
  ownerId: string;
  deviceId: string;
};

export interface NodeServiceClient {
  // Connection
  connect(): Promise<void>;
  disconnect(): void;
  reconnect(): Promise<void>;
  isConnected: boolean;
  isReady: boolean;
  reconnectAttempts: number;
  getLastError?(): string | null;

  // Identity
  getProfile(): Promise<NodeProfile>;
  getHumanProfile(): Promise<HumanProfile | undefined>;
  updateHumanProfile(input: CreateHumanProfileInput): Promise<HumanProfile>;

  // Bond Management
  sendHello(
    targetOwnerId: string,
    profile: HelloProfile,
    message: string,
    options?: SendHelloOptions,
  ): Promise<HelloResponse>;
  acceptHello(messageId: string): Promise<void>;
  declineHello(messageId: string, reason?: string): Promise<void>;
  blockPeer(peerOwnerId: string): Promise<void>;
  revokeBond(peerOwnerId: string): Promise<void>;
  getBonds(): Promise<BondRecord[]>;
  listPendingSocialIntroProposals(): Promise<SocialIntroProposal[]>;
  approveSocialIntroCommitment(messageId: string): Promise<{ ownerCommitmentRef: string }>;
  declineSocialIntroProposal(messageId: string): Promise<void>;

  // Messaging
  sendChat(targetOwnerId: string, text: string): Promise<void>;
  listChatHistory(peerOwnerId: string, limit?: number): Promise<ChatMessage[]>;

  // Search
  searchPeers(query: SearchQuery): Promise<PeerSearchResult[]>;
  advertiseTopic(topic: string): Promise<void>;
  stopAdvertiseTopic(topic: string): Promise<void>;

  // Connection Status
  getConnectionStatus(): Promise<ConnectionStatus>;
  getPeerConnectionInfo(peerOwnerId: string): Promise<{ connected: boolean; direct: boolean; relayPeerId?: string }>;

  // Agent Bridge
  getBridgeStatus(): Promise<BridgeStatus>;
  getPairingPayload(): Promise<PairingPayload>;

  // AI / Knowledge Query
  knowledgeQuery(question: string): Promise<string>;
  runDocumentAgentTurn(message: string): Promise<import("@envoymesh/api").DocumentAgentTurnResult>;

  // Shared vault library
  listLibraryItems(params?: ListLibraryItemsParams): Promise<LibraryItem[]>;
  setLibraryItemPublished(documentId: string, published: boolean): Promise<void>;
  exportLibraryItemToIpfs(documentId: string): Promise<ExportLibraryItemToIpfsResult>;
  getIpfsEngineStatus(): Promise<IpfsEngineStatus>;
  verifyLibraryItemIpfsGateway(
    params: VerifyLibraryItemIpfsGatewayParams,
  ): Promise<VerifyLibraryItemIpfsGatewayResult>;
  importToLibrary(params: ImportToLibraryParams): Promise<ImportToLibraryResult>;
  discoverPublishedLibrary(params?: DiscoverPublishedLibraryParams): Promise<DiscoverPublishedLibraryPeerResult[]>;
  listAgentShareProposals(): Promise<AgentShareProposal[]>;
  dismissAgentShareProposal(proposalId: string): Promise<void>;
  submitAgentShareProposal(
    params: SubmitAgentShareProposalParams,
  ): Promise<AgentShareProposal>;
  listPendingShareOffers(): Promise<ShareOffer[]>;
  shareFile(
    targetOwnerId: string,
    file: { path: string; sensitivity: "public" | "friends" | "private" },
  ): Promise<void>;
  acceptShare(shareId: string, savePath: string): Promise<void>;
  declineShare(shareId: string): Promise<void>;

  // Node Configuration
  getNodeConfig(): Promise<NodeConfig>;
  updateNodeConfig(config: Partial<NodeConfig>): Promise<void>;
  listRelays(): Promise<RelayConfig[]>;
  addRelay(addr: string, level?: number, region?: string): Promise<RelayConfig>;
  removeRelay(relayId: string): Promise<void>;

  // Node Lifecycle
  initNode(profileDir: string, options?: InitNodeOptions): Promise<NodeInitResult>;
  getNodeStatus(): Promise<{ status: NodeStatus }>;
  startNode(): Promise<void>;
  stopNode(): Promise<void>;
  waitForConnection(timeoutMs?: number): Promise<void>;

  // Events
  on<K extends keyof NodeServiceEvents>(event: K, handler: (data: NodeServiceEvents[K]) => void): () => void;
}

const NodeServiceContext = createContext<NodeServiceClient | null>(null);

/** True when WebSocket/mobile transport is up (daemon may still be stopped). Separate from mesh "online". */
const TransportWsContext = createContext(false);

export function useTransportWsOpen(): boolean {
  return useContext(TransportWsContext);
}

/** Mobile shell only exposes cloud-friendly provider modes in Settings; desktop uses full. */
export type ModelProviderUiScope = "full" | "cloud-only";

/** How Social talks to NodeService — WebSocket desktop vs in-process Capacitor DirectCallClient. */
export type NodeClientTransport = "websocket" | "direct-call";

const ModelProviderUiScopeContext = createContext<ModelProviderUiScope>("full");
const NodeClientTransportContext = createContext<NodeClientTransport>("websocket");

export function useModelProviderUiScope(): ModelProviderUiScope {
  return useContext(ModelProviderUiScopeContext);
}

export function useNodeClientTransport(): NodeClientTransport {
  return useContext(NodeClientTransportContext);
}

/** True when running the Capacitor mobile app (DirectCallClient → MobileNode). */
export function useIsInProcessMobileNode(): boolean {
  return useNodeClientTransport() === "direct-call";
}

type WsClientType = ReturnType<typeof createWsClient>;

/** Build a NodeServiceClient that talks to a local WsServer via WebSocket (desktop). */
function createWsNodeServiceClient(
  wsUrl: string,
  connectCb: (connected: boolean) => void,
  readyCb: (ready: boolean) => void,
): { client: NodeServiceClient; wsClient: WsClientType } {
  const wsClient = createWsClient(wsUrl);
  let connected = false;
  let readyReceived = false;

  // Subscribe to persistent connection status changes (handles reconnects)
  wsClient.onStatusChange((status) => {
    const isConnected = status === 'connected';
    connected = isConnected;
    connectCb(isConnected);
    if (!isConnected) {
      readyReceived = false;
      readyCb(false);
    }
  });

  const client: NodeServiceClient = {
    get isConnected() { return connected; },
    get isReady() { return readyReceived; },
    get reconnectAttempts() { return wsClient.getReconnectAttempts(); },

    async connect() {
      await wsClient.connect();
      connectCb(wsClient.isConnected());
    },

    disconnect() {
      wsClient.disconnect();
      // Status callback handles connectCb/readyCb via onStatusChange
    },

    async reconnect() {
      wsClient.disconnect();
      // Status callback handles connectCb/readyCb via onStatusChange
      await wsClient.connect();
      // Status callback handles connectCb via onStatusChange on open
    },

    async getProfile() { return wsClient.rpc("getProfile"); },
    async getHumanProfile() { return wsClient.rpc("getHumanProfile"); },
    async updateHumanProfile(input: CreateHumanProfileInput) { return wsClient.rpc("updateHumanProfile", input as unknown as Record<string, unknown>); },
    async sendHello(targetOwnerId: string, profile: HelloProfile, message: string, options?: SendHelloOptions) {
      return wsClient.rpc("sendHello", {
        targetOwnerId,
        profile,
        message,
        ...(options?.introProposalMessageId
          ? { introProposalMessageId: options.introProposalMessageId }
          : {}),
      });
    },
    async acceptHello(messageId: string) { return wsClient.rpc("acceptHello", { messageId }); },
    async declineHello(messageId: string, reason?: string) { return wsClient.rpc("declineHello", { messageId, reason }); },
    async listPendingSocialIntroProposals() {
      return wsClient.rpc("listPendingSocialIntroProposals") as Promise<SocialIntroProposal[]>;
    },
    async approveSocialIntroCommitment(messageId: string) {
      return wsClient.rpc("approveSocialIntroCommitment", { messageId }) as Promise<{ ownerCommitmentRef: string }>;
    },
    async declineSocialIntroProposal(messageId: string) {
      return wsClient.rpc("declineSocialIntroProposal", { messageId });
    },
    async blockPeer(peerOwnerId: string) { return wsClient.rpc("blockPeer", { peerOwnerId }); },
    async revokeBond(peerOwnerId: string) { return wsClient.rpc("revokeBond", { peerOwnerId }); },
    async getBonds() { return wsClient.rpc("getBonds"); },
    async sendChat(targetOwnerId: string, text: string) { return wsClient.rpc("sendChat", { targetOwnerId, text }); },
    async listChatHistory(peerOwnerId: string, limit?: number) { return wsClient.rpc("listChatHistory", { peerOwnerId, limit }) as Promise<ChatMessage[]>; },
    async searchPeers(query: SearchQuery) { return wsClient.rpc("searchPeers", query as unknown as Record<string, unknown>); },
    async getNodeConfig() { return wsClient.rpc("getNodeConfig"); },
    async getConnectionStatus() { return wsClient.rpc("getConnectionStatus"); },
    async getPeerConnectionInfo(peerOwnerId: string) { return wsClient.rpc("getPeerConnectionInfo", { peerOwnerId }); },
    async getBridgeStatus() { return wsClient.rpc("getBridgeStatus"); },
    async getPairingPayload() { return wsClient.rpc("getPairingPayload"); },
    async knowledgeQuery(question: string) { return wsClient.rpc("knowledgeQuery", { question }) as Promise<string>; },
    async runDocumentAgentTurn(message: string) {
      return wsClient.rpc("runDocumentAgentTurn", { message }) as Promise<import("@envoymesh/api").DocumentAgentTurnResult>;
    },
    async listLibraryItems(params?: ListLibraryItemsParams) {
      return wsClient.rpc("listLibraryItems", (params ?? {}) as Record<string, unknown>) as Promise<LibraryItem[]>;
    },
    async setLibraryItemPublished(documentId: string, published: boolean) {
      return wsClient.rpc("setLibraryItemPublished", { documentId, published });
    },
    async exportLibraryItemToIpfs(documentId: string) {
      return wsClient.rpc("exportLibraryItemToIpfs", { documentId }) as Promise<ExportLibraryItemToIpfsResult>;
    },
    async getIpfsEngineStatus() {
      return wsClient.rpc("getIpfsEngineStatus", {}) as Promise<IpfsEngineStatus>;
    },
    async verifyLibraryItemIpfsGateway(params: VerifyLibraryItemIpfsGatewayParams) {
      return wsClient.rpc("verifyLibraryItemIpfsGateway", params as unknown as Record<string, unknown>) as Promise<
        VerifyLibraryItemIpfsGatewayResult
      >;
    },
    async importToLibrary(params: ImportToLibraryParams) {
      return wsClient.rpc("importToLibrary", params as unknown as Record<string, unknown>) as Promise<
        ImportToLibraryResult
      >;
    },
    async discoverPublishedLibrary(params?: DiscoverPublishedLibraryParams) {
      return wsClient.rpc(
        "discoverPublishedLibrary",
        (params ?? {}) as Record<string, unknown>,
      ) as Promise<DiscoverPublishedLibraryPeerResult[]>;
    },
    async listAgentShareProposals() {
      return wsClient.rpc("listAgentShareProposals") as Promise<AgentShareProposal[]>;
    },
    async dismissAgentShareProposal(proposalId: string) {
      return wsClient.rpc("dismissAgentShareProposal", { proposalId });
    },
    async submitAgentShareProposal(params: SubmitAgentShareProposalParams) {
      return wsClient.rpc("submitAgentShareProposal", params as unknown as Record<string, unknown>) as Promise<
        AgentShareProposal
      >;
    },
    async listPendingShareOffers() {
      return wsClient.rpc("listPendingShareOffers") as Promise<ShareOffer[]>;
    },
    async shareFile(targetOwnerId: string, file: { path: string; sensitivity: "public" | "friends" | "private" }) {
      return wsClient.rpc("shareFile", { targetOwnerId, file } as Record<string, unknown>);
    },
    async acceptShare(shareId: string, savePath: string) {
      return wsClient.rpc("acceptShare", { shareId, savePath });
    },
    async declineShare(shareId: string) {
      return wsClient.rpc("declineShare", { shareId });
    },
    async advertiseTopic(topic: string) { return wsClient.rpc("advertiseTopic", { topic }); },
    async stopAdvertiseTopic(topic: string) { return wsClient.rpc("stopAdvertiseTopic", { topic }); },
    async updateNodeConfig(config: Partial<NodeConfig>) { return wsClient.rpc("updateNodeConfig", config); },
    async listRelays() { return wsClient.rpc("listRelays"); },
    async addRelay(addr: string, level?: number, region?: string) { return wsClient.rpc("addRelay", { addr, level, region }); },
    async removeRelay(relayId: string) { return wsClient.rpc("removeRelay", { relayId }); },
    async initNode(profileDir: string, options?: InitNodeOptions) { return wsClient.rpc("initNode", { profileDir, options }); },
    async getNodeStatus() { return wsClient.rpc("getNodeStatus"); },
    async startNode() { return wsClient.rpc("startNode"); },
    async stopNode() { return wsClient.rpc("stopNode"); },
    async waitForConnection(timeoutMs?: number) { return wsClient.waitForConnection(timeoutMs); },

    // Bypass generic variance: WsClient uses string/unknown, NodeServiceClient uses K/NodeServiceEvents[K]
    on(event: any, handler: any): any {
      return wsClient.on(event, handler);
    },
  };

  return { client, wsClient };
}

export function NodeServiceProvider({
  children,
  clientFactory,
  modelProviderUiScope = "full",
}: {
  children: ReactNode;
  /** Provide a custom client factory for in-process/mobile usage. Defaults to WebSocket. */
  clientFactory?: () => NodeServiceClient;
  /** Capacitor/mobile: hide local engines (Ollama/LiteLLM) in Settings — cloud APIs only. */
  modelProviderUiScope?: ModelProviderUiScope;
}) {
  const [client, setClient] = useState<NodeServiceClient | null>(null);
  const [connected, setConnected] = useState(false);
  const [ready, setReady] = useState(false);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [lastError, setLastError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    if (clientFactory) {
      const nodeService = clientFactory();
      setClient(nodeService);
      void nodeService
        .connect()
        .then(() => {
          if (!active) return;
          setConnected(true);
          setReady(true);
        })
        .catch((err) => {
          if (!active) return;
          console.error("[NodeServiceProvider] connect failed:", err);
          setConnected(false);
        });
      return () => {
        active = false;
        nodeService.disconnect();
      };
    }

    const wsUrl = loadAppSettings().wsUrl.trim() || "ws://localhost:3030/ws";
    const { client: nodeService, wsClient } = createWsNodeServiceClient(
      wsUrl,
      (open) => {
        if (active) setConnected(open);
      },
      (isReady) => {
        if (active) setReady(isReady);
      },
    );

    const unsubStatus = wsClient.onStatusChange(() => {
      if (!active) return;
      setLastError(wsClient.getLastError());
      setConnected(wsClient.isConnected());
    });

    void nodeService
      .connect()
      .then(() => {
        if (!active) return;
        setConnected(wsClient.isConnected());
        setLastError(wsClient.getLastError());
      })
      .catch((err) => {
        if (!active) return;
        console.error("[NodeServiceProvider] WebSocket connect failed:", err);
        setConnected(false);
        setLastError(err instanceof Error ? err.message : String(err));
      });

    const unsubReady = wsClient.on("node:ready", () => {
      if (active) setReady(true);
    });

    const reconnectInterval = setInterval(() => {
      if (!active) return;
      setReconnectAttempts(wsClient.getReconnectAttempts());
      setLastError(wsClient.getLastError());
      setConnected(wsClient.isConnected());
    }, 1000);

    setClient(nodeService);

    return () => {
      active = false;
      clearInterval(reconnectInterval);
      unsubStatus();
      unsubReady();
      nodeService.disconnect();
      setConnected(false);
      setReady(false);
    };
  }, [clientFactory]);

  if (!client) {
    return (
      <div className="app">
        <div className="loading">
          <div className="loading-content">
            <div className="loading-spinner" />
            <h2>Starting Envoy Social</h2>
          </div>
        </div>
      </div>
    );
  }

  // Proxy delegates all calls to the real client while overriding connection-tracked
  // getters. Necessary because class instances (DirectCallClient) store methods on
  // the prototype — { ...client } would lose them.
  const ctx = new Proxy(client, {
    get(target, prop, receiver) {
      if (prop === "isConnected") return connected;
      if (prop === "isReady") return ready;
      if (prop === "reconnectAttempts") return reconnectAttempts;
      if (prop === "getLastError") return () => lastError;
      return Reflect.get(target, prop, receiver);
    },
  }) as NodeServiceClient;

  const nodeClientTransport: NodeClientTransport = clientFactory ? "direct-call" : "websocket";

  return (
    <TransportWsContext.Provider value={connected}>
      <NodeClientTransportContext.Provider value={nodeClientTransport}>
        <ModelProviderUiScopeContext.Provider value={modelProviderUiScope}>
          <NodeServiceContext.Provider value={ctx}>
            {children}
          </NodeServiceContext.Provider>
        </ModelProviderUiScopeContext.Provider>
      </NodeClientTransportContext.Provider>
    </TransportWsContext.Provider>
  );
}

export function useNodeService(): NodeServiceClient {
  const ctx = useContext(NodeServiceContext);
  if (!ctx) {
    throw new Error("useNodeService must be used within NodeServiceProvider");
  }
  return ctx;
}

export function useConnectionStatus() {
  const client = useNodeService();
  const [status, setStatus] = useState<ConnectionStatus | null>(null);

  useEffect(() => {
    client.on("node:online", (data) => {
      setStatus(data as ConnectionStatus);
    });
  }, [client]);

  return status;
}

export function useBonds() {
  const client = useNodeService();
  const wsOpen = useTransportWsOpen();
  const [bonds, setBonds] = useState<BondRecord[]>([]);

  useEffect(() => {
    if (!wsOpen || !client.isConnected) return;

    // Initial load
    client.getBonds().then(setBonds).catch(console.error);

    // Listen for changes
    const unsubEstablished = client.on("bond:established", () => {
      client.getBonds().then(setBonds).catch(console.error);
    });
    const unsubRevoked = client.on("bond:revoked", () => {
      client.getBonds().then(setBonds).catch(console.error);
    });

    return () => {
      unsubEstablished();
      unsubRevoked();
    };
  }, [client, wsOpen]);

  return bonds;
}

export function useSocialIntroProposals() {
  const client = useNodeService();
  const wsOpen = useTransportWsOpen();
  const [proposals, setProposals] = useState<SocialIntroProposal[]>([]);

  useEffect(() => {
    if (!wsOpen || !client.isConnected) return;

    void client.listPendingSocialIntroProposals().then(setProposals).catch(console.error);

    const unsub = client.on("social.intro:propose", (data) => {
      setProposals((prev) => {
        if (prev.some((p) => p.messageId === data.messageId)) return prev;
        return [...prev, data];
      });
    });

    return unsub;
  }, [client, wsOpen]);

  const approveCommitment = async (messageId: string) => {
    await client.approveSocialIntroCommitment(messageId);
    const fresh = await client.listPendingSocialIntroProposals();
    setProposals(fresh);
  };

  const decline = async (messageId: string) => {
    await client.declineSocialIntroProposal(messageId);
    setProposals((prev) => prev.filter((p) => p.messageId !== messageId));
  };

  return { proposals, approveCommitment, decline };
}

export function useHelloRequests() {
  const client = useNodeService();
  const wsOpen = useTransportWsOpen();
  const [requests, setRequests] = useState<HelloRequest[]>([]);

  useEffect(() => {
    if (!wsOpen || !client.isConnected) return;

    const unsub = client.on("hello:request", (data) => {
      setRequests((prev) => [...prev, data as HelloRequest]);
    });

    return unsub;
  }, [client, wsOpen]);

  const accept = async (messageId: string) => {
    await client.acceptHello(messageId);
    setRequests((prev) => prev.filter((r) => r.messageId !== messageId));
  };

  const decline = async (messageId: string, reason?: string) => {
    await client.declineHello(messageId, reason);
    setRequests((prev) => prev.filter((r) => r.messageId !== messageId));
  };

  return { requests, accept, decline };
}

export function useShareOffers() {
  const client = useNodeService();
  const [offers, setOffers] = useState<ShareOffer[]>([]);

  useEffect(() => {
    if (!client.isConnected) return;

    void client.listPendingShareOffers().then(setOffers).catch(console.error);

    const unsubOffered = client.on("share:offered", () => {
      void client.listPendingShareOffers().then(setOffers).catch(console.error);
    });
    const unsubAccepted = client.on("share:accepted", () => {
      void client.listPendingShareOffers().then(setOffers).catch(console.error);
    });
    const unsubDeclined = client.on("share:declined", () => {
      void client.listPendingShareOffers().then(setOffers).catch(console.error);
    });

    return () => {
      unsubOffered();
      unsubAccepted();
      unsubDeclined();
    };
  }, [client]);

  const accept = async (shareId: string, savePath = "") => {
    await client.acceptShare(shareId, savePath);
    const fresh = await client.listPendingShareOffers();
    setOffers(fresh);
  };

  const decline = async (shareId: string) => {
    await client.declineShare(shareId);
    const fresh = await client.listPendingShareOffers();
    setOffers(fresh);
  };

  return { offers, accept, decline };
}

export function useAgentShareProposals() {
  const client = useNodeService();
  const [proposals, setProposals] = useState<AgentShareProposal[]>([]);

  useEffect(() => {
    if (!client.isConnected) return;

    void client.listAgentShareProposals().then(setProposals).catch(console.error);

    const unsub = client.on("share:agent-proposed", (data) => {
      setProposals((prev) => {
        const p = data as AgentShareProposal;
        if (prev.some((x) => x.proposalId === p.proposalId)) return prev;
        return [...prev, p];
      });
    });

    return unsub;
  }, [client]);

  const dismiss = async (proposalId: string) => {
    await client.dismissAgentShareProposal(proposalId);
    setProposals((prev) => prev.filter((p) => p.proposalId !== proposalId));
  };

  return { proposals, dismiss };
}

/** Thread key = contact's owner id (bonds use `peerOwnerId`). */
function partnerOwnerIdForChat(
  msg: ChatMessage,
  selfOwnerId: string,
  selfPeerId: string,
): string | null {
  const selfO = selfOwnerId.trim();
  const selfP = selfPeerId.trim();
  const sndO = msg.sender.ownerId?.trim();
  const sndN = msg.sender.nodeId?.trim();
  const rcvO = msg.recipient.ownerId?.trim();
  const rcvN = msg.recipient.nodeId?.trim();

  // Use ownerId as primary routing key (ownerIds are distinct even when
  // both peers share the same node, e.g. bridge agent running on same node).
  if (sndO && sndO === selfO && rcvO && rcvO !== selfO) {
    return rcvO;
  }
  if (rcvO && rcvO === selfO && sndO && sndO !== selfO) {
    return sndO;
  }
  // Fallback: nodeId-based routing when ownerId is unavailable or matches both sides
  const sndNIsSelf = !!selfP && sndN === selfP;
  const rcvNIsSelf = !!selfP && rcvN === selfP;
  if (sndNIsSelf && !rcvNIsSelf) return rcvO ?? rcvN ?? null;
  if (rcvNIsSelf && !sndNIsSelf) return sndO ?? sndN ?? null;
  return null;
}

function messageIsOutgoing(msg: ChatMessage, selfOwnerId: string, selfPeerId: string): boolean {
  const selfO = selfOwnerId.trim();
  const selfP = selfPeerId.trim();
  const sndO = msg.sender.ownerId?.trim();
  const sndN = msg.sender.nodeId?.trim();
  return (sndO !== undefined && sndO === selfO) || (!!selfP && sndN === selfP);
}

function appendChatToThreads(
  prev: Record<string, ChatMessage[]>,
  msg: ChatMessage,
  self: { ownerId: string; peerId: string },
): Record<string, ChatMessage[]> | null {
  const key = partnerOwnerIdForChat(msg, self.ownerId, self.peerId);
  if (!key) {
    console.warn("[useChatMessages] could not route chat to a thread (missing owner match)", msg.messageId);
    return null;
  }
  const list = prev[key] ?? [];
  if (list.some((m) => m.messageId === msg.messageId)) {
    return prev;
  }
  const ts = (m: ChatMessage) => {
    const raw = m.metadata?.timestamp;
    const n = typeof raw === "string" ? new Date(raw).getTime() : NaN;
    return Number.isFinite(n) ? n : 0;
  };
  const nextList = [...list, msg].sort((a, b) => ts(a) - ts(b));
  return { ...prev, [key]: nextList };
}

export function useChatMessages(selectedContactOwnerId: string | null) {
  const client = useNodeService();
  const [threads, setThreads] = useState<Record<string, ChatMessage[]>>({});
  const [selfIds, setSelfIds] = useState<{ ownerId: string; peerId: string } | null>(null);
  const pendingUntilSelfReady = useRef<ChatMessage[]>([]);
  const selfIdsRef = useRef(selfIds);

  selfIdsRef.current = selfIds;

  useEffect(() => {
    if (!client.isConnected) return;
    let cancelled = false;
    void Promise.all([client.getProfile(), client.getConnectionStatus()])
      .then(([prof, cs]) => {
        if (cancelled) return;
        setSelfIds({
          ownerId: prof?.owner?.ownerId ?? "",
          peerId: cs?.peerId ?? "",
        });
      })
      .catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [client, client.isConnected]);

  useEffect(() => {
    if (!client.isConnected) return;

    const unsub = client.on("chat:message", (data) => {
      const msg = data as ChatMessage;
      const self = selfIdsRef.current;
      if (!self?.ownerId) {
        pendingUntilSelfReady.current.push(msg);
        return;
      }
      setThreads((prev) => appendChatToThreads(prev, msg, self) ?? prev);
    });

    return unsub;
  }, [client, client.isConnected]);

  useEffect(() => {
    if (!client.isConnected || !selectedContactOwnerId || !selfIds?.ownerId) return;
    let cancelled = false;
    void client
      .listChatHistory(selectedContactOwnerId)
      .then((history) => {
        if (cancelled || !Array.isArray(history) || history.length === 0) return;
        const self = selfIdsRef.current;
        if (!self?.ownerId) return;
        setThreads((prev) => {
          let next = prev;
          for (const msg of history) {
            const n = appendChatToThreads(next, msg, self);
            if (n) next = n;
          }
          return next;
        });
      })
      .catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [client, client.isConnected, selectedContactOwnerId, selfIds?.ownerId]);

  useEffect(() => {
    if (!selfIds?.ownerId) return;
    const self = selfIds;
    const flushed = pendingUntilSelfReady.current.splice(0);
    if (flushed.length === 0) return;
    setThreads((prev) => {
      let next = prev;
      for (const m of flushed) {
        const n = appendChatToThreads(next, m, self);
        if (n) next = n;
      }
      return next;
    });
  }, [selfIds]);

  const isOutgoing = (msg: ChatMessage) =>
    !!(selfIds?.ownerId && messageIsOutgoing(msg, selfIds.ownerId, selfIds.peerId));

  return {
    messages: selectedContactOwnerId ? threads[selectedContactOwnerId] ?? [] : [],
    isOutgoing,
  };
}