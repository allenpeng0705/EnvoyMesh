import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { createWsClient, type WsClient } from "../ws-client.js";
import type {
  BondRecord,
  ChatMessage,
  ConnectionStatus,
  CreateHumanProfileInput,
  HelloProfile,
  HelloRequest,
  HelloResponse,
  HumanProfile,
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

interface NodeServiceClient {
  // Connection
  connect(): Promise<void>;
  disconnect(): void;
  isConnected: boolean;

  // Identity
  getProfile(): Promise<{ owner: any; device: any; deviceCertificate: any }>;
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

  // Search
  searchPeers(query: SearchQuery): Promise<PeerSearchResult[]>;

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

  // Events
  on<K extends keyof NodeServiceEvents>(event: K, handler: (data: NodeServiceEvents[K]) => void): () => void;
}

const NodeServiceContext = createContext<NodeServiceClient | null>(null);

export function NodeServiceProvider({ children }: { children: ReactNode }) {
  const [client, setClient] = useState<NodeServiceClient | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let connected = false;

    const wsClient = createWsClient();
    const nodeService: NodeServiceClient = {
      get isConnected() {
        return connected;
      },

      async connect() {
        await wsClient.connect();
        connected = true;
        setConnected(true);
      },

      disconnect() {
        wsClient.disconnect();
        connected = false;
        setConnected(false);
      },

      async getProfile() {
        return wsClient.rpc("getProfile");
      },

      async getHumanProfile() {
        return wsClient.rpc("getHumanProfile");
      },

      async updateHumanProfile(input) {
        return wsClient.rpc("updateHumanProfile", input as unknown as Record<string, unknown>);
      },

      async sendHello(targetOwnerId, profile, message) {
        return wsClient.rpc("sendHello", { targetOwnerId, profile, message });
      },

      async acceptHello(messageId) {
        return wsClient.rpc("acceptHello", { messageId });
      },

      async declineHello(messageId, reason) {
        return wsClient.rpc("declineHello", { messageId, reason });
      },

      async blockPeer(peerOwnerId) {
        return wsClient.rpc("blockPeer", { peerOwnerId });
      },

      async revokeBond(peerOwnerId) {
        return wsClient.rpc("revokeBond", { peerOwnerId });
      },

      async getBonds() {
        return wsClient.rpc("getBonds");
      },

      async sendChat(targetOwnerId, text) {
        return wsClient.rpc("sendChat", { targetOwnerId, text });
      },

      async searchPeers(query) {
        return wsClient.rpc("searchPeers", query as unknown as Record<string, unknown>);
      },

      async getNodeConfig() {
        return wsClient.rpc("getNodeConfig");
      },

      async updateNodeConfig(config) {
        return wsClient.rpc("updateNodeConfig", config);
      },

      async listRelays() {
        return wsClient.rpc("listRelays");
      },

      async addRelay(addr, level, region) {
        return wsClient.rpc("addRelay", { addr, level, region });
      },

      async removeRelay(relayId) {
        return wsClient.rpc("removeRelay", { relayId });
      },

      async initNode(profileDir, options) {
        return wsClient.rpc("initNode", { profileDir, options });
      },

      async getNodeStatus() {
        return wsClient.rpc("getNodeStatus");
      },

      async startNode() {
        return wsClient.rpc("startNode");
      },

      async stopNode() {
        return wsClient.rpc("stopNode");
      },

      on(event, handler) {
        return wsClient.on(event, handler as (data: unknown) => void);
      },
    };

    // Auto-connect on mount
    nodeService.connect().catch(console.error);

    setClient(nodeService);

    return () => {
      nodeService.disconnect();
    };
  }, []);

  if (!client) {
    return <div className="loading">Connecting...</div>;
  }

  return (
    <NodeServiceContext.Provider value={{ ...client, isConnected: connected }}>
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

export function useChatMessages(peerOwnerId: string | null) {
  const client = useNodeService();
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  useEffect(() => {
    if (!peerOwnerId || !client.isConnected) return;

    const unsub = client.on("chat:message", (data) => {
      const msg = data as ChatMessage;
      // Filter messages for this peer
      if (msg.sender.nodeId === peerOwnerId || msg.recipient.nodeId === peerOwnerId) {
        setMessages((prev) => [...prev, msg]);
      }
    });

    return unsub;
  }, [client, peerOwnerId]);

  return messages;
}