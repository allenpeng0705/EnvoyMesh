import type { NodeService, NodeServiceEvents } from "@envoymesh/api";
import type { NodeServiceClient } from "../hooks/useNodeService.js";
/**
 * In-process NodeServiceClient that calls NodeService methods directly.
 * No WebSocket, no JSON-RPC serialization — just JS function calls.
 *
 * Used by the Capacitor mobile app where the Social UI and node runtime
 * share a single WebView JavaScript thread.
 */
export declare class DirectCallClient implements NodeServiceClient {
    private readonly _ns;
    private _connected;
    private _ready;
    /** Active unsubscribers keyed by event name */
    private readonly _cleanups;
    constructor(nodeService: NodeService);
    get isConnected(): boolean;
    get isReady(): boolean;
    get reconnectAttempts(): number;
    connect(): Promise<void>;
    disconnect(): void;
    reconnect(): Promise<void>;
    getProfile(): Promise<import("@envoymesh/api").NodeProfile>;
    getHumanProfile(): Promise<import("@envoymesh/api").HumanProfile | undefined>;
    updateHumanProfile(input: Parameters<NodeService["updateHumanProfile"]>[0]): Promise<import("@envoymesh/api").HumanProfile>;
    sendHello(targetOwnerId: string, profile: Parameters<NodeService["sendHello"]>[1], message: string): Promise<import("@envoymesh/api").HelloResponse>;
    acceptHello(messageId: string): Promise<void>;
    declineHello(messageId: string, reason?: string): Promise<void>;
    blockPeer(peerOwnerId: string): Promise<void>;
    revokeBond(peerOwnerId: string): Promise<void>;
    getBonds(): Promise<import("@envoymesh/api").BondRecord[]>;
    sendChat(targetOwnerId: string, text: string): Promise<void>;
    listChatHistory(peerOwnerId: string, limit?: number): Promise<import("@envoymesh/api").ChatMessage[]>;
    searchPeers(query: Parameters<NodeService["searchPeers"]>[0]): Promise<import("@envoymesh/api").PeerSearchResult[]>;
    advertiseTopic(topic: string): Promise<void>;
    stopAdvertiseTopic(topic: string): Promise<void>;
    getConnectionStatus(): Promise<import("@envoymesh/api").ConnectionStatus>;
    getPeerConnectionInfo(peerOwnerId: string): Promise<import("@envoymesh/api").PeerConnectionInfo>;
    getBridgeStatus(): Promise<import("@envoymesh/api").BridgeStatus>;
    getPairingPayload(): Promise<import("@envoymesh/api").PairingPayload>;
    knowledgeQuery(question: string): Promise<string>;
    getNodeConfig(): Promise<import("@envoymesh/api").NodeConfig>;
    updateNodeConfig(config: Parameters<NodeService["updateNodeConfig"]>[0]): Promise<void>;
    listRelays(): Promise<import("@envoymesh/api").RelayConfig[]>;
    addRelay(addr: string, level?: number, region?: string): Promise<import("@envoymesh/api").RelayConfig>;
    removeRelay(relayId: string): Promise<void>;
    initNode(profileDir: string, options?: Parameters<NodeService["initNode"]>[1]): Promise<import("@envoymesh/api").NodeInitResult>;
    getNodeStatus(): Promise<{
        status: import("@envoymesh/api").NodeStatus;
    }>;
    startNode(): Promise<void>;
    stopNode(): Promise<void>;
    waitForConnection(_timeoutMs?: number): Promise<void>;
    on<K extends keyof NodeServiceEvents>(event: K, handler: (data: NodeServiceEvents[K]) => void): () => void;
}
/**
 * Create a DirectCallClient bound to the given NodeService instance.
 */
export declare function createDirectCallClient(nodeService: NodeService): NodeServiceClient;
//# sourceMappingURL=direct-call-client.d.ts.map