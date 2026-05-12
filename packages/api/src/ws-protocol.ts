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
  // Agent Bridge
  | "getBridgeStatus"
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
  // P2P relay — forward a pre-signed envelope from a remote client
  | "forwardEnvelope"
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
  /**
   * AI Assistant settings — identity mode, online/offline behavior, and defaults.
   */
  aiSettings?: AiSettings;
  /**
   * Per-contact AI preferences — defines how AI behaves for each contact.
   */
  contactAiPreferences: ContactAiPreferences[];
  /** Agent bridge status — when an external agent (HomeClaw/OpenClaw) is bridged into the mesh. */
  bridgeStatus?: BridgeStatus;
}

/**
 * Domain in which the node operates autonomously on behalf of the owner.
 */
export type AutonomousDomain = "social" | "knowledge" | "home" | "research";

// ============================================
// Agent Bridge Types
// ============================================

export interface BridgeStatus {
  enabled: boolean;
  agentPeerId: string;
  agentUrl: string;
  listenPort: number;
  /** Human-readable name for the bridge agent (e.g. "HomeClaw", "OpenClaw"). */
  agentName: string;
}

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

/**
 * How the AI presents itself in responses.
 * - invisible: Responds as if it were the human owner
 * - transparent: Prefixes messages with [AI Agent]:
 * - defensive: Acts as gatekeeper when owner is unavailable
 */
export type AiIdentityMode = "invisible" | "transparent" | "defensive";

/**
 * AI Identity configuration — defines how the AI presents itself in responses.
 */
export interface AiIdentity {
  /** How the AI introduces itself. Default: "transparent" */
  mode: AiIdentityMode;
  /** Prefix to use in transparent mode. Default: "[AI Agent]" */
  transparentPrefix?: string;
}

/**
 * AI Assistant status — online/offline detection and global toggles.
 */
export interface AiAssistantStatus {
  /** When true, suggest drafts but never auto-send when online. Default: true */
  onlineAssistantEnabled: boolean;
  /** When true, allow auto-reply when detected offline. Default: false */
  offlineAgentEnabled: boolean;
  /** How to detect online/offline status. Default: "automatic" */
  statusMode: "automatic" | "manual";
  /** Current manual status override (only meaningful when statusMode is "manual"). */
  isOnlineManual?: boolean;
}

/**
 * Complete AI settings — stored in node config.
 */
export interface AiSettings {
  status: AiAssistantStatus;
  identity: AiIdentity;
  /** Default mode for new contacts (when no preference is set). Default: "manual" */
  defaultModeForNewContacts: "manual" | "assistant" | "auto";
  /** AI rules for trigger-action behavior. Default: empty */
  rules: AiRule[];
}

/**
 * AI Rule — defines trigger-action behavior for AI responses.
 */
export type AiRuleCategory = "availability" | "capability" | "catch_all";

export interface AiRuleTrigger {
  /** Keywords to match in the message (case-insensitive). */
  keywords?: string[];
  /** Match contact AI access level (only assistant_only and full can trigger rules). */
  contactAiAccessLevel?: Array<"assistant_only" | "full">;
  /** Regex pattern to match in message. */
  messageContains?: string;
  /** Match greeting messages (hi, hello, hey, etc.). */
  isGreeting?: boolean;
  /** Match complex queries (placeholder for future LLM confidence integration). */
  isComplex?: boolean;
}

export type AiRuleActionType = "draft" | "auto_send" | "gatekeep" | "defer";

export interface AiVaultQuery {
  path: string;
  /** Sensitivity ceiling for vault queries: public (anyone), friends (bonded), professional (work), personal (private) */
  maxSensitivity: "public" | "friends" | "professional" | "personal";
}

export interface AiRuleAction {
  type: AiRuleActionType;
  /** Response template with placeholders. */
  template?: string;
  /** Override AI identity mode for this rule. */
  aiIdentityOverride?: AiIdentityMode;
  /** Vault query for this action. */
  vaultQuery?: AiVaultQuery;
}

export interface AiRule {
  id: string;
  enabled: boolean;
  name: string;
  category: AiRuleCategory;
  priority: number;
  trigger: AiRuleTrigger;
  action: AiRuleAction;
}

/**
 * Per-contact AI preferences — stored in node config.
 * Defines how the AI behaves for each contact.
 */
export interface ContactAiPreferences {
  peerOwnerId: string;
  /** AI access level for this contact. Default: "none" */
  aiAccessLevel: "none" | "assistant_only" | "full";
  /** Knowledge access level for vault queries. Default: "public" */
  knowledgeAccess: "public" | "professional" | "personal";
  /** Priority — whether to alert human immediately or let AI handle. Default: "high" */
  priority: "high" | "low";
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

export interface GetBridgeStatusParams {}

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
  aiSettings?: AiSettings;
  /** Per-contact AI preferences. Update individual contacts via updateContactAiPrefs(). */
  contactAiPreferences?: ContactAiPreferences[];
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