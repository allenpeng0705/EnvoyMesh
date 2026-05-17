import { type ReactNode } from "react";
import type { BondRecord, BridgeStatus, ChatMessage, PairingPayload, ConnectionStatus, CreateHumanProfileInput, HelloProfile, HelloRequest, HelloResponse, HumanProfile, NodeProfile, NodeServiceEvents, NodeConfig, PeerSearchResult, RelayConfig, SearchQuery, NodeStatus } from "@envoymesh/api";
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
    connect(): Promise<void>;
    disconnect(): void;
    reconnect(): Promise<void>;
    isConnected: boolean;
    isReady: boolean;
    reconnectAttempts: number;
    getProfile(): Promise<NodeProfile>;
    getHumanProfile(): Promise<HumanProfile | undefined>;
    updateHumanProfile(input: CreateHumanProfileInput): Promise<HumanProfile>;
    sendHello(targetOwnerId: string, profile: HelloProfile, message: string): Promise<HelloResponse>;
    acceptHello(messageId: string): Promise<void>;
    declineHello(messageId: string, reason?: string): Promise<void>;
    blockPeer(peerOwnerId: string): Promise<void>;
    revokeBond(peerOwnerId: string): Promise<void>;
    getBonds(): Promise<BondRecord[]>;
    sendChat(targetOwnerId: string, text: string): Promise<void>;
    listChatHistory(peerOwnerId: string, limit?: number): Promise<ChatMessage[]>;
    searchPeers(query: SearchQuery): Promise<PeerSearchResult[]>;
    advertiseTopic(topic: string): Promise<void>;
    stopAdvertiseTopic(topic: string): Promise<void>;
    getConnectionStatus(): Promise<{
        online: boolean;
        peerId: string;
        multiaddrs: string[];
        connectedRelays: string[];
        bondedPeers: number;
    }>;
    getPeerConnectionInfo(peerOwnerId: string): Promise<{
        connected: boolean;
        direct: boolean;
        relayPeerId?: string;
    }>;
    getBridgeStatus(): Promise<BridgeStatus>;
    getPairingPayload(): Promise<PairingPayload>;
    knowledgeQuery(question: string): Promise<string>;
    getNodeConfig(): Promise<NodeConfig>;
    updateNodeConfig(config: Partial<NodeConfig>): Promise<void>;
    listRelays(): Promise<RelayConfig[]>;
    addRelay(addr: string, level?: number, region?: string): Promise<RelayConfig>;
    removeRelay(relayId: string): Promise<void>;
    initNode(profileDir: string, options?: InitNodeOptions): Promise<NodeInitResult>;
    getNodeStatus(): Promise<{
        status: NodeStatus;
    }>;
    startNode(): Promise<void>;
    stopNode(): Promise<void>;
    waitForConnection(timeoutMs?: number): Promise<void>;
    on<K extends keyof NodeServiceEvents>(event: K, handler: (data: NodeServiceEvents[K]) => void): () => void;
}
export declare function NodeServiceProvider({ children, clientFactory, }: {
    children: ReactNode;
    /** Provide a custom client factory for in-process/mobile usage. Defaults to WebSocket. */
    clientFactory?: () => NodeServiceClient;
}): import("react/jsx-runtime").JSX.Element;
export declare function useNodeService(): NodeServiceClient;
export declare function useConnectionStatus(): ConnectionStatus | null;
export declare function useBonds(): BondRecord[];
export declare function useHelloRequests(): {
    requests: HelloRequest[];
    accept: (messageId: string) => Promise<void>;
    decline: (messageId: string, reason?: string) => Promise<void>;
};
export declare function useChatMessages(selectedContactOwnerId: string | null): {
    messages: ChatMessage[];
    isOutgoing: (msg: ChatMessage) => boolean;
};
export {};
//# sourceMappingURL=useNodeService.d.ts.map