/**
 * WebSocket API Protocol for NodeService
 *
 * The social app connects to the node via WebSocket and sends commands
 * using this protocol. All messages are JSON.
 *
 * Message Flow:
 *
 * 1. Client -> Server: RPC request
 *    { id: "msg_123", method: "sendHello", params: { ... } }
 *
 *    Server -> Client: RPC response
 *    { id: "msg_123", result: { decision: "accept" } }
 *    or
 *    { id: "msg_123", error: { code: "NOT_IMPLEMENTED", message: "..." } }
 *
 * 2. Client -> Server: Subscribe to events
 *    { id: "sub_456", method: "on", params: { event: "hello:request" } }
 *
 *    Server -> Client: Event (no id, since it's a push)
 *    { event: "hello:request", data: { ... } }
 *
 *    Client -> Server: Unsubscribe
 *    { id: "sub_456", method: "off", params: { event: "hello:request" } }
 *
 * 3. Connection status (server pushes on connect)
 *    { event: "connected", data: { peerId: "...", multiaddrs: [...] } }
 */

// ============================================
// Message Types
// ============================================

export type JsonRpcRequest = {
  id: string;
  method: string;
  params?: Record<string, unknown>;
};

export type JsonRpcResponse = {
  id: string;
  result?: unknown;
  error?: JsonRpcError;
};

export type JsonRpcError = {
  code: string;
  message: string;
};

export type JsonRpcEvent = {
  event: string;
  data: unknown;
};

// ============================================
// Protocol Constants
// ============================================

export const WS_PROTOCOL_VERSION = "envoy/ws-api/0.1.0";

export const WS_PORT = 3030;
export const WS_PATH = "/ws";

// ============================================
// RPC Methods
// ============================================

export type RpcMethods =
  // Identity
  | "getProfile"
  | "getHumanProfile"
  | "updateHumanProfile"
  // Bond Management
  | "sendHello"
  | "acceptHello"
  | "declineHello"
  | "blockPeer"
  | "unblockPeer"
  | "revokeBond"
  | "getBonds"
  // Messaging
  | "sendChat"
  | "markRead"
  // Search
  | "searchPeers"
  // File Sharing
  | "shareFile"
  | "acceptShare"
  | "declineShare"
  // Connection Status
  | "getConnectionStatus"
  // Node Configuration
  | "getNodeConfig"
  | "updateNodeConfig"
  | "listRelays"
  | "addRelay"
  | "removeRelay"
  // Node Lifecycle
  | "initNode"
  | "getNodeStatus"
  | "startNode"
  | "stopNode"
  // Event subscription
  | "on"
  | "off";

// ============================================
// Node Configuration Types
// ============================================

export interface RelayConfig {
  relayId: string;
  addr: string;
  level?: number;
  region?: string;
  enabled: boolean;
}

export interface NodeConfig {
  profileDir: string;
  discoveryProfile: "lan-fast" | "wan-default";
  relayEnabled: boolean;
  relayServerEnabled: boolean;
  configuredRelays: RelayConfig[];
  advertiseAddrs: string[];
  bootstrapPeers: string[];
}

export type DiscoveryProfile = "lan-fast" | "wan-default";

export type NodeStatus = "offline" | "starting" | "running" | "stopping";

// ============================================
// Init Result Types
// ============================================

export interface InitNodeOptions {
  discoveryProfile?: DiscoveryProfile;
  relayEnabled?: boolean;
  relayServerEnabled?: boolean;
  advertiseAddrs?: string[];
  bootstrapPeers?: string[];
  bootstrapPresets?: string[];
}

export interface NodeInitResult {
  profileDir: string;
  peerId: string;
  ownerId: string;
  deviceId: string;
}

// ============================================
// Method Parameters (TypeScript types)
// ============================================

export interface GetProfileParams {}

export interface InitNodeParams {
  profileDir: string;
  options?: InitNodeOptions;
}

export interface GetNodeStatusParams {}

export interface StartNodeParams {}

export interface StopNodeParams {}

export interface GetHumanProfileParams {}

export interface UpdateHumanProfileParams {
  displayName?: string;
  bio?: string;
  gender?: string;
  hobbies?: string[];
  knowledge?: string[];
}

export interface SendHelloParams {
  targetOwnerId: string;
  profile: {
    displayName: string;
    bio?: string;
    interests: string[];
    whatShares: string[];
    avatarUrl?: string;
  };
  message: string;
}

export interface AcceptHelloParams {
  messageId: string;
}

export interface DeclineHelloParams {
  messageId: string;
  reason?: string;
}

export interface BlockPeerParams {
  peerOwnerId: string;
}

export interface UnblockPeerParams {
  peerOwnerId: string;
}

export interface RevokeBondParams {
  peerOwnerId: string;
}

export interface GetBondsParams {}

export interface SendChatParams {
  targetOwnerId: string;
  text: string;
}

export interface MarkReadParams {
  targetOwnerId: string;
  upToMessageId?: string;
}

export interface SearchPeersParams {
  interests?: string[];
  queryText?: string;
  maxResults?: number;
}

export interface ShareFileParams {
  targetOwnerId: string;
  path: string;
  sensitivity: "public" | "friends" | "private";
}

export interface AcceptShareParams {
  shareId: string;
  savePath: string;
}

export interface DeclineShareParams {
  shareId: string;
}

export interface GetConnectionStatusParams {}

export interface GetNodeConfigParams {}

export interface UpdateNodeConfigParams {
  discoveryProfile?: DiscoveryProfile;
  relayEnabled?: boolean;
  relayServerEnabled?: boolean;
  advertiseAddrs?: string[];
  bootstrapPeers?: string[];
}

export interface ListRelaysParams {}

export interface AddRelayParams {
  addr: string;
  level?: number;
  region?: string;
}

export interface RemoveRelayParams {
  relayId: string;
}

export interface OnParams {
  event: string;
}

export interface OffParams {
  event: string;
}

// ============================================
// Request/Response Examples
// ============================================

/*
Example: Send Hello

Client -> Server:
{
  "id": "req_abc123",
  "method": "sendHello",
  "params": {
    "targetOwnerId": "envoy:owner:xyz789",
    "profile": {
      "displayName": "Alice",
      "interests": ["blues", "jazz"],
      "whatShares": ["music"]
    },
    "message": "Hi! We share music taste."
  }
}

Server -> Client:
{
  "id": "req_abc123",
  "result": {
    "messageId": "hello_xyz",
    "inReplyTo": "req_abc123",
    "decision": "accept",
    "timestamp": "2024-01-15T10:30:00Z"
  }
}


Example: Subscribe to hello:request

Client -> Server:
{
  "id": "sub_def456",
  "method": "on",
  "params": {
    "event": "hello:request"
  }
}

Server -> Client (when hello arrives):
{
  "event": "hello:request",
  "data": {
    "messageId": "hello_xyz",
    "sender": {
      "nodeId": "QmPeerId",
      "ownerId": "envoy:owner:xyz789",
      "displayName": "Bob"
    },
    "profile": {
      "displayName": "Bob",
      "interests": ["rock"]
    },
    "message": "Hey there!",
    "timestamp": "2024-01-15T10:30:00Z"
  }
}


Example: Search Peers

Client -> Server:
{
  "id": "req_ghi789",
  "method": "searchPeers",
  "params": {
    "interests": ["blues"],
    "maxResults": 10
  }
}

Server -> Client:
{
  "id": "req_ghi789",
  "result": [
    {
      "nodeId": "QmAlice",
      "ownerId": "envoy:owner:alice123",
      "displayName": "Alice",
      "interests": ["blues", "jazz"],
      "profileVisibility": "public"
    }
  ]
}
*/