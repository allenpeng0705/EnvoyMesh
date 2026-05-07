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
  | "listChatHistory"
  | "markRead"
  | "getChatDrafts"
  | "deleteChatDraft"
  // Search
  | "searchPeers"
  | "advertiseTopic"
  | "stopAdvertiseTopic"
  // Capability Manifest
  | "getCapabilityManifest"
  | "updateCapabilityManifest"
  // File Sharing
  | "shareFile"
  | "acceptShare"
  | "declineShare"
  // Connection Status
  | "getConnectionStatus"
  | "getPeerConnectionInfo"
  // AI / Knowledge Query
  | "knowledgeQuery"
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
  enableMdns?: boolean; // mDNS for local discovery (default true)
  relayEnabled: boolean;
  relayServerEnabled: boolean;
  configuredRelays: RelayConfig[];
  advertiseAddrs: string[];
  bootstrapPeers: string[];
  bootstrapPresets: string[];
  /** Model provider configuration. Default: mock provider only. */
  modelProviders: ModelProviderConfig;
  /** Enable LLM-assisted chat drafts. Default: false (disabled). */
  chatAssistEnabled: boolean;
  /**
   * Anonymous discovery mode — controls how the node responds to unknown/public peers.
   * Default: "off" (anonymous discovery disabled).
   */
  anonymousDiscoveryMode: AnonymousDiscoveryMode;
  /**
   * EMP intent allowlist for anonymous/public requests.
   * If undefined, only discovery.request is allowed anonymously.
   */
  anonymousIntentAllowlist?: readonly string[];
  /**
   * Sensitivity ceiling for anonymous auto-answer (public-auto-answer mode).
   * Default: "public".
   */
  anonymousSensitivityCeiling: "public" | "friends";
  /**
   * Trusted anchor public keys for verifying official credentials.
   * Maps anchorId → PEM-encoded public key.
   */
  trustAnchorPublicKeys: Record<string, string>;
  /**
   * Master kill switch: when true, all autonomous actions are paused.
   * The node will require explicit approval for any action it would otherwise take autonomously.
   */
  autonomousKillSwitch: boolean;
  /**
   * Per-domain autonomous policies defining what the node may do without prompting the owner.
   * Each policy applies to a domain and defines sensitivity ceilings for autonomous responses.
   */
  autonomousPolicies: AutonomousPolicy[];
}

/**
 * Domain in which the node operates autonomously on behalf of the owner.
 */
export type AutonomousDomain = "social" | "knowledge" | "home" | "research";

/**
 * Defines what the node may do autonomously in a given domain without prompting the owner.
 */
export interface AutonomousPolicy {
  domain: AutonomousDomain;
  /** Maximum sensitivity of vault content the node may respond with autonomously. */
  maxSensitivity: "public" | "friends";
  /** Whether the node may autonomously answer queries in this domain. */
  autoAnswer: boolean;
  /** Whether the node may autonomously send chat messages in this domain. */
  autoSendChat: boolean;
}

/** Model provider mode: mock (no external calls), ollama (local), litellm (local/cloud), openai-compatible (OpenAI Chat Completions API format), anthropic-compatible (Anthropic Messages API format), or disabled. */
export type ModelProviderMode = "mock" | "ollama" | "litellm" | "openai-compatible" | "anthropic-compatible" | "disabled";

export interface ModelProviderConfig {
  /** Provider mode. When "disabled", no model calls are made. Default: "mock". */
  mode: ModelProviderMode;
  /** Endpoint for ollama/litellm providers (e.g. "http://127.0.0.1:11434"). */
  endpoint?: string;
  /** Model name for ollama (e.g. "llama3.1") or litellm (e.g. "gpt-4o-mini"). */
  modelName?: string;
  /** Optional API key for litellm, openai, and anthropic providers. */
  apiKey?: string;
  /** If true, cloud providers require explicit owner approval per request. Default: true. */
  requireApprovalForCloud?: boolean;
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
  profileVisibility?: "public" | "private";
  capabilities?: Array<{ tag: string } | { type: string; params?: Record<string, unknown>; confidence?: number } | { descriptor: string }>;
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

export interface ChatDraft {
  draftId: string;
  threadPeerOwnerId: string;
  inReplyToMessageId: string;
  text: string;
  createdAt: string;
}

export interface GetChatDraftsParams {
  threadPeerOwnerId?: string;
}

export interface DeleteChatDraftParams {
  draftId: string;
}

// ====================================
// Capability Manifest Types
// ====================================

/**
 * Visibility level for the capability manifest:
 * - "contacts-only" — respond only to referred/direct trust peers
 * - "public-preview" — respond to public peers with safe preview only (no LLM)
 * - "public-auto-answer" — respond to public peers with auto-answer (requires LLM)
 */
export type ManifestVisibility = "contacts-only" | "public-preview" | "public-auto-answer";

/**
 * Anonymous discovery mode — controls how the node responds to unknown/public peers.
 * - "off" — anonymous discovery is disabled; public strangers are ignored
 * - "contacts-only" — only bonded contacts (referred/direct) can discover this node
 * - "public-preview" — public peers get safe preview responses only (no LLM call)
 * - "public-auto-answer" — public peers can trigger LLM-powered auto-answer within sensitivity ceiling
 *
 * This is a node-level override independent of the capability manifest visibility.
 */
export type AnonymousDiscoveryMode = "off" | "contacts-only" | "public-preview" | "public-auto-answer";

/**
 * Owner-approved capability manifest describing what the node is willing to do
 * for contact-scoped discovery matching.
 */
export interface CapabilityManifest {
  version: "0.1";
  /** Unique identifier for this manifest (changes when manifest is updated). */
  id: string;
  /** Semantic version string. */
  versionTag: string;
  /** Who can receive matches from this manifest. */
  visibility: ManifestVisibility;
  /**
   * Sensitivity ceiling for this manifest.
   * Requests above this ceiling are not answered even if capabilities match.
   */
  sensitivityCeiling: "public" | "friends" | "private";
  /**
   * Freeform keywords describing this node's capabilities.
   * Matched against keyword hashes in discovery requests.
   */
  keywords: string[];
  /**
   * Specific EMP capabilities this node exposes.
   * Used for discovery matching instead of device certificate capabilities.
   */
  capabilities: string[];
  /**
   * Owner-provided description of this node (shown in discovery).
   */
  description?: string;
  /**
   * Timestamp when the owner approved this manifest.
   */
  approvedAt: string;
  /** Timestamp of last update. */
  updatedAt: string;
}

export interface GetCapabilityManifestParams {}

export interface UpdateCapabilityManifestParams {
  visibility?: ManifestVisibility;
  sensitivityCeiling?: CapabilityManifest["sensitivityCeiling"];
  keywords?: string[];
  capabilities?: string[];
  description?: string;
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

export interface GetPeerConnectionInfoParams {
  peerOwnerId: string;
}

export interface GetNodeConfigParams {}

export interface UpdateNodeConfigParams {
  discoveryProfile?: DiscoveryProfile;
  relayEnabled?: boolean;
  relayServerEnabled?: boolean;
  advertiseAddrs?: string[];
  bootstrapPeers?: string[];
  enableMdns?: boolean;
  chatAssistEnabled?: boolean;
  anonymousDiscoveryMode?: AnonymousDiscoveryMode;
  anonymousIntentAllowlist?: readonly string[];
  anonymousSensitivityCeiling?: "public" | "friends";
  trustAnchorPublicKeys?: Record<string, string>;
  autonomousKillSwitch?: boolean;
  autonomousPolicies?: AutonomousPolicy[];
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