import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { createWsClient } from "../ws-client.js";
const NodeServiceContext = createContext(null);
/** Build a NodeServiceClient that talks to a local WsServer via WebSocket (desktop). */
function createWsNodeServiceClient(connectCb, readyCb, reconnectAttemptsCb) {
    const wsClient = createWsClient();
    let connected = false;
    let readyReceived = false;
    const client = {
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
        async updateHumanProfile(input) { return wsClient.rpc("updateHumanProfile", input); },
        async sendHello(targetOwnerId, profile, message) { return wsClient.rpc("sendHello", { targetOwnerId, profile, message }); },
        async acceptHello(messageId) { return wsClient.rpc("acceptHello", { messageId }); },
        async declineHello(messageId, reason) { return wsClient.rpc("declineHello", { messageId, reason }); },
        async blockPeer(peerOwnerId) { return wsClient.rpc("blockPeer", { peerOwnerId }); },
        async revokeBond(peerOwnerId) { return wsClient.rpc("revokeBond", { peerOwnerId }); },
        async getBonds() { return wsClient.rpc("getBonds"); },
        async sendChat(targetOwnerId, text) { return wsClient.rpc("sendChat", { targetOwnerId, text }); },
        async listChatHistory(peerOwnerId, limit) { return wsClient.rpc("listChatHistory", { peerOwnerId, limit }); },
        async searchPeers(query) { return wsClient.rpc("searchPeers", query); },
        async getNodeConfig() { return wsClient.rpc("getNodeConfig"); },
        async getConnectionStatus() { return wsClient.rpc("getConnectionStatus"); },
        async getPeerConnectionInfo(peerOwnerId) { return wsClient.rpc("getPeerConnectionInfo", { peerOwnerId }); },
        async getBridgeStatus() { return wsClient.rpc("getBridgeStatus"); },
        async getPairingPayload() { return wsClient.rpc("getPairingPayload"); },
        async knowledgeQuery(question) { return wsClient.rpc("knowledgeQuery", { question }); },
        async advertiseTopic(topic) { return wsClient.rpc("advertiseTopic", { topic }); },
        async stopAdvertiseTopic(topic) { return wsClient.rpc("stopAdvertiseTopic", { topic }); },
        async updateNodeConfig(config) { return wsClient.rpc("updateNodeConfig", config); },
        async listRelays() { return wsClient.rpc("listRelays"); },
        async addRelay(addr, level, region) { return wsClient.rpc("addRelay", { addr, level, region }); },
        async removeRelay(relayId) { return wsClient.rpc("removeRelay", { relayId }); },
        async initNode(profileDir, options) { return wsClient.rpc("initNode", { profileDir, options }); },
        async getNodeStatus() { return wsClient.rpc("getNodeStatus"); },
        async startNode() { return wsClient.rpc("startNode"); },
        async stopNode() { return wsClient.rpc("stopNode"); },
        async waitForConnection(timeoutMs) { return wsClient.waitForConnection(timeoutMs); },
        // Bypass generic variance: WsClient uses string/unknown, NodeServiceClient uses K/NodeServiceEvents[K]
        on(event, handler) {
            return wsClient.on(event, handler);
        },
    };
    return { client, wsClient };
}
export function NodeServiceProvider({ children, clientFactory, }) {
    const [client, setClient] = useState(null);
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
        return _jsx("div", { className: "loading", children: "Connecting..." });
    }
    var ctx = new Proxy(client, {
        get: function (target, prop, receiver) {
            if (prop === "isConnected")
                return connected;
            if (prop === "isReady")
                return ready;
            if (prop === "reconnectAttempts")
                return reconnectAttempts;
            return Reflect.get(target, prop, receiver);
        },
    });
    return (_jsx(NodeServiceContext.Provider, { value: ctx, children: children }));
}
export function useNodeService() {
    const ctx = useContext(NodeServiceContext);
    if (!ctx) {
        throw new Error("useNodeService must be used within NodeServiceProvider");
    }
    return ctx;
}
export function useConnectionStatus() {
    const client = useNodeService();
    const [status, setStatus] = useState(null);
    useEffect(() => {
        client.on("node:online", (data) => {
            setStatus(data);
        });
    }, [client]);
    return status;
}
export function useBonds() {
    const client = useNodeService();
    const [bonds, setBonds] = useState([]);
    useEffect(() => {
        if (!client.isConnected)
            return;
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
    const [requests, setRequests] = useState([]);
    useEffect(() => {
        if (!client.isConnected)
            return;
        const unsub = client.on("hello:request", (data) => {
            setRequests((prev) => [...prev, data]);
        });
        return unsub;
    }, [client]);
    const accept = async (messageId) => {
        await client.acceptHello(messageId);
        setRequests((prev) => prev.filter((r) => r.messageId !== messageId));
    };
    const decline = async (messageId, reason) => {
        await client.declineHello(messageId, reason);
        setRequests((prev) => prev.filter((r) => r.messageId !== messageId));
    };
    return { requests, accept, decline };
}
/** Thread key = contact's owner id (bonds use `peerOwnerId`). */
function partnerOwnerIdForChat(msg, selfOwnerId, selfPeerId) {
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
    if (sndNIsSelf && !rcvNIsSelf)
        return rcvO ?? rcvN ?? null;
    if (rcvNIsSelf && !sndNIsSelf)
        return sndO ?? sndN ?? null;
    return null;
}
function messageIsOutgoing(msg, selfOwnerId, selfPeerId) {
    const selfO = selfOwnerId.trim();
    const selfP = selfPeerId.trim();
    const sndO = msg.sender.ownerId?.trim();
    const sndN = msg.sender.nodeId?.trim();
    return (sndO !== undefined && sndO === selfO) || (!!selfP && sndN === selfP);
}
function appendChatToThreads(prev, msg, self) {
    const key = partnerOwnerIdForChat(msg, self.ownerId, self.peerId);
    if (!key) {
        console.warn("[useChatMessages] could not route chat to a thread (missing owner match)", msg.messageId);
        return null;
    }
    const list = prev[key] ?? [];
    if (list.some((m) => m.messageId === msg.messageId)) {
        return prev;
    }
    const ts = (m) => {
        const raw = m.metadata?.timestamp;
        const n = typeof raw === "string" ? new Date(raw).getTime() : NaN;
        return Number.isFinite(n) ? n : 0;
    };
    const nextList = [...list, msg].sort((a, b) => ts(a) - ts(b));
    return { ...prev, [key]: nextList };
}
export function useChatMessages(selectedContactOwnerId) {
    const client = useNodeService();
    const [threads, setThreads] = useState({});
    const [selfIds, setSelfIds] = useState(null);
    const pendingUntilSelfReady = useRef([]);
    const selfIdsRef = useRef(selfIds);
    selfIdsRef.current = selfIds;
    useEffect(() => {
        if (!client.isConnected)
            return;
        let cancelled = false;
        void Promise.all([client.getProfile(), client.getConnectionStatus()])
            .then(([prof, cs]) => {
            if (cancelled)
                return;
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
        if (!client.isConnected)
            return;
        const unsub = client.on("chat:message", (data) => {
            const msg = data;
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
        if (!client.isConnected || !selectedContactOwnerId || !selfIds?.ownerId)
            return;
        let cancelled = false;
        void client
            .listChatHistory(selectedContactOwnerId)
            .then((history) => {
            if (cancelled || !Array.isArray(history) || history.length === 0)
                return;
            const self = selfIdsRef.current;
            if (!self?.ownerId)
                return;
            setThreads((prev) => {
                let next = prev;
                for (const msg of history) {
                    const n = appendChatToThreads(next, msg, self);
                    if (n)
                        next = n;
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
        if (!selfIds?.ownerId)
            return;
        const self = selfIds;
        const flushed = pendingUntilSelfReady.current.splice(0);
        if (flushed.length === 0)
            return;
        setThreads((prev) => {
            let next = prev;
            for (const m of flushed) {
                const n = appendChatToThreads(next, m, self);
                if (n)
                    next = n;
            }
            return next;
        });
    }, [selfIds]);
    const isOutgoing = (msg) => !!(selfIds?.ownerId && messageIsOutgoing(msg, selfIds.ownerId, selfIds.peerId));
    return {
        messages: selectedContactOwnerId ? threads[selectedContactOwnerId] ?? [] : [],
        isOutgoing,
    };
}
//# sourceMappingURL=useNodeService.js.map