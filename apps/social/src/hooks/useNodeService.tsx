import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createWsClient } from "../ws-client.js";
import type {
  BondRecord,
  BridgeStatus,
  ChatMessage,
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
  NodeStatus,
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

  // Identity
  getProfile(): Promise<NodeProfile>;
  getHumanProfile(): Promise<HumanProfile | undefined>;
  updateHumanProfile(input: CreateHumanProfileInput): Promise<HumanProfile>;

  // Bond Management
  sendHello(targetOwnerId: string, profile: HelloProfile, message: string): Promise<HelloResponse>;
  acceptHello(messageId: string): Promise<void>;
  declineHello(messageId: string, reason?: string): Promise<void>;
  blockPeer(peerOwnerId: string): Promise<void>;
  revokeBond(peerOwnerId: string): Promise<void>;
  getBonds(): Promise<BondRecord[]>;

  // Messaging
  sendChat(targetOwnerId: string, text: string): Promise<void>;
  listChatHistory(peerOwnerId: string, limit?: number): Promise<ChatMessage[]>;

  // Search
  searchPeers(query: SearchQuery): Promise<PeerSearchResult[]>;
  advertiseTopic(topic: string): Promise<void>;
  stopAdvertiseTopic(topic: string): Promise<void>;

  // Connection Status
  getConnectionStatus(): Promise<{ online: boolean; peerId: string; multiaddrs: string[]; connectedRelays: string[]; bondedPeers: number }>;
  getPeerConnectionInfo(peerOwnerId: string): Promise<{ connected: boolean; direct: boolean; relayPeerId?: string }>;

  // Agent Bridge
  getBridgeStatus(): Promise<BridgeStatus>;
  getPairingPayload(): Promise<PairingPayload>;

  // AI / Knowledge Query
  knowledgeQuery(question: string): Promise<string>;

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

type WsClientType = ReturnType<typeof createWsClient>;

/** Build a NodeServiceClient that talks to a local WsServer via WebSocket (desktop). */
function createWsNodeServiceClient(
  connectCb: (connected: boolean) => void,
  readyCb: (ready: boolean) => void,
  reconnectAttemptsCb: (n: number) => void,
): { client: NodeServiceClient; wsClient: WsClientType } {
  const wsClient = createWsClient();
  let connected = false;
  let readyReceived = false;

  const client: NodeServiceClient = {
    get isConnected() { return connected; },
    get isReady() { return readyReceived; },
    get reconnectAttempts() { return wsClient.getReconnectAttempts(); },

    async connect() {
      await wsClient.connect();
      connected = true;
      connectCb(true);
    },

    disconnect() {
      wsClient.disconnect();
      connected = false;
      readyReceived = false;
      connectCb(false);
      readyCb(false);
    },

    async reconnect() {
      wsClient.disconnect();
      connected = false;
      readyReceived = false;
      connectCb(false);
      readyCb(false);
      await wsClient.connect();
      connected = true;
      connectCb(true);
    },

    async getProfile() { return wsClient.rpc("getProfile"); },
    async getHumanProfile() { return wsClient.rpc("getHumanProfile"); },
    async updateHumanProfile(input: CreateHumanProfileInput) { return wsClient.rpc("updateHumanProfile", input as unknown as Record<string, unknown>); },
    async sendHello(targetOwnerId: string, profile: HelloProfile, message: string) { return wsClient.rpc("sendHello", { targetOwnerId, profile, message }); },
    async acceptHello(messageId: string) { return wsClient.rpc("acceptHello", { messageId }); },
    async declineHello(messageId: string, reason?: string) { return wsClient.rpc("declineHello", { messageId, reason }); },
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
}: {
  children: ReactNode;
  /** Provide a custom client factory for in-process/mobile usage. Defaults to WebSocket. */
  clientFactory?: () => NodeServiceClient;
}) {
  const [client, setClient] = useState<NodeServiceClient | null>(null);
  const [connected, setConnected] = useState(false);
  const [ready, setReady] = useState(false);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);

  useEffect(() => {
    if (clientFactory) {
      // Mobile / in-process: use the provided factory
      const nodeService = clientFactory();
      setClient(nodeService);
      nodeService.connect().then(() => {
        setConnected(true);
        setReady(true);
      }).catch(console.error);
      return () => { nodeService.disconnect(); };
    }

    // Desktop: use WebSocket client
    const { client: nodeService, wsClient } = createWsNodeServiceClient(setConnected, setReady, setReconnectAttempts);

    // Auto-connect on mount
    nodeService.connect().catch(console.error);

    // Subscribe to node:ready event
    wsClient.on("node:ready", () => {
      setReady(true);
    });

    // Update reconnect attempts periodically
    const reconnectInterval = setInterval(() => {
      setReconnectAttempts(wsClient.getReconnectAttempts());
    }, 1000);

    setClient(nodeService);

    return () => {
      clearInterval(reconnectInterval);
      nodeService.disconnect();
    };
  }, [clientFactory]);

  if (!client) {
    return <div className="loading">Connecting...</div>;
  }

  return (
    <NodeServiceContext.Provider value={{ ...client, isConnected: connected, isReady: ready, reconnectAttempts }}>
      {children}
    </NodeServiceContext.Provider>
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
  const [bonds, setBonds] = useState<BondRecord[]>([]);

  useEffect(() => {
    if (!client.isConnected) return;

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
  }, [client]);

  return bonds;
}

export function useHelloRequests() {
  const client = useNodeService();
  const [requests, setRequests] = useState<HelloRequest[]>([]);

  useEffect(() => {
    if (!client.isConnected) return;

    const unsub = client.on("hello:request", (data) => {
      setRequests((prev) => [...prev, data as HelloRequest]);
    });

    return unsub;
  }, [client]);

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