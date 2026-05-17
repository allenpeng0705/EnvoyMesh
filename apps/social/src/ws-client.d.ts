type EventHandler = (data: unknown) => void;
/**
 * WebSocket client that connects to the node's WsServer and provides
 * a typed interface for NodeService operations.
 */
export declare class WsClient {
    private ws;
    private readonly handlers;
    private readonly pendingRequests;
    private reconnectTimer;
    private readonly url;
    private reconnectAttempts;
    private readonly maxReconnectDelay;
    private lastPong;
    constructor(url?: string);
    /**
     * Connect to the WebSocket server
     */
    connect(): Promise<void>;
    /**
     * Disconnect from the WebSocket server
     */
    disconnect(): void;
    /**
     * Wait for the WebSocket to be connected
     */
    waitForConnection(timeoutMs?: number): Promise<void>;
    /**
     * Send an RPC request and wait for response
     */
    rpc<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T>;
    /**
     * Subscribe to an event
     */
    on(event: string, handler: EventHandler): () => void;
    /**
     * Check if connected
     */
    isConnected(): boolean;
    /**
     * Get reconnection attempts count
     */
    getReconnectAttempts(): number;
    /**
     * Check if heartbeat is healthy (received pong recently)
     */
    isHeartbeatHealthy(): boolean;
    private handleMessage;
    private scheduleReconnect;
}
/**
 * Create a WebSocket client for the node API
 */
export declare function createWsClient(url?: string): WsClient;
export {};
//# sourceMappingURL=ws-client.d.ts.map