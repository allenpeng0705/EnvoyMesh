/**
 * In-process NodeServiceClient that calls NodeService methods directly.
 * No WebSocket, no JSON-RPC serialization — just JS function calls.
 *
 * Used by the Capacitor mobile app where the Social UI and node runtime
 * share a single WebView JavaScript thread.
 */
export class DirectCallClient {
    _ns;
    _connected = false;
    _ready = false;
    /** Active unsubscribers keyed by event name */
    _cleanups = new Map();
    constructor(nodeService) {
        this._ns = nodeService;
    }
    // -----------------------------------------------------------------------
    // Connection (in-process — always "connected" once the node is running)
    // -----------------------------------------------------------------------
    get isConnected() {
        return this._connected;
    }
    get isReady() {
        return this._ready;
    }
    get reconnectAttempts() {
        return 0; // No reconnection needed in-process
    }
    async connect() {
        this._connected = true;
        this._ready = true;
    }
    disconnect() {
        this._connected = false;
        this._ready = false;
        // Clean up all event subscriptions
        for (const cleanup of this._cleanups.values()) {
            cleanup();
        }
        this._cleanups.clear();
    }
    async reconnect() {
        this.disconnect();
        await this.connect();
    }
    // -----------------------------------------------------------------------
    // Identity
    // -----------------------------------------------------------------------
    async getProfile() {
        return this._ns.getProfile();
    }
    async getHumanProfile() {
        return this._ns.getHumanProfile();
    }
    async updateHumanProfile(input) {
        return this._ns.updateHumanProfile(input);
    }
    // -----------------------------------------------------------------------
    // Bond Management
    // -----------------------------------------------------------------------
    async sendHello(targetOwnerId, profile, message) {
        return this._ns.sendHello(targetOwnerId, profile, message);
    }
    async acceptHello(messageId) {
        return this._ns.acceptHello(messageId);
    }
    async declineHello(messageId, reason) {
        return this._ns.declineHello(messageId, reason);
    }
    async blockPeer(peerOwnerId) {
        return this._ns.blockPeer(peerOwnerId);
    }
    async revokeBond(peerOwnerId) {
        return this._ns.revokeBond(peerOwnerId);
    }
    async getBonds() {
        return this._ns.getBonds();
    }
    // -----------------------------------------------------------------------
    // Messaging
    // -----------------------------------------------------------------------
    async sendChat(targetOwnerId, text) {
        return this._ns.sendChat(targetOwnerId, text);
    }
    async listChatHistory(peerOwnerId, limit) {
        return this._ns.listChatHistory(peerOwnerId, limit);
    }
    // -----------------------------------------------------------------------
    // Search
    // -----------------------------------------------------------------------
    async searchPeers(query) {
        return this._ns.searchPeers(query);
    }
    async advertiseTopic(topic) {
        return this._ns.advertiseTopic(topic);
    }
    async stopAdvertiseTopic(topic) {
        return this._ns.stopAdvertiseTopic(topic);
    }
    // -----------------------------------------------------------------------
    // Connection Status
    // -----------------------------------------------------------------------
    async getConnectionStatus() {
        return this._ns.getConnectionStatus();
    }
    async getPeerConnectionInfo(peerOwnerId) {
        return this._ns.getPeerConnectionInfo(peerOwnerId);
    }
    // -----------------------------------------------------------------------
    // Agent Bridge
    // -----------------------------------------------------------------------
    async getBridgeStatus() {
        return this._ns.getBridgeStatus();
    }
    async getPairingPayload() {
        return this._ns.getPairingPayload();
    }
    // -----------------------------------------------------------------------
    // AI / Knowledge Query
    // -----------------------------------------------------------------------
    async knowledgeQuery(question) {
        return this._ns.knowledgeQuery(question);
    }
    // -----------------------------------------------------------------------
    // Node Configuration
    // -----------------------------------------------------------------------
    async getNodeConfig() {
        return this._ns.getNodeConfig();
    }
    async updateNodeConfig(config) {
        return this._ns.updateNodeConfig(config);
    }
    async listRelays() {
        return this._ns.listRelays();
    }
    async addRelay(addr, level, region) {
        return this._ns.addRelay(addr, level, region);
    }
    async removeRelay(relayId) {
        return this._ns.removeRelay(relayId);
    }
    // -----------------------------------------------------------------------
    // Node Lifecycle
    // -----------------------------------------------------------------------
    async initNode(profileDir, options) {
        return this._ns.initNode(profileDir, options);
    }
    async getNodeStatus() {
        return { status: this._ns.getNodeStatus() };
    }
    async startNode() {
        await this._ns.startNode();
    }
    async stopNode() {
        await this._ns.stopNode();
    }
    async waitForConnection(_timeoutMs) {
        // In-process — node is always available
        return;
    }
    // -----------------------------------------------------------------------
    // Events
    // -----------------------------------------------------------------------
    on(event, handler) {
        const unsub = this._ns.on(event, handler);
        // Also track in case of reconnect
        this._cleanups.set(event, unsub);
        return unsub;
    }
}
/**
 * Create a DirectCallClient bound to the given NodeService instance.
 */
export function createDirectCallClient(nodeService) {
    return new DirectCallClient(nodeService);
}
//# sourceMappingURL=direct-call-client.js.map