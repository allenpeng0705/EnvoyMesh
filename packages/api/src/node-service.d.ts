import type { DeviceCertificate, HumanProfilePayload, CapabilityUnion, TaskResultPayload } from "@envoymesh/protocol";
import type { DeviceIdentity, OwnerIdentity } from "@envoymesh/identity";
import type { DocumentAgentTurnResult } from "./document-agent-loop.js";
import type { DocumentAcquisitionJob } from "./document-acquisition.js";
import type { SocialProxySession } from "./social-proxy-session.js";
import type { OwnerDidPresentation } from "./owner-did-presentation.js";
import type { ResolveDidImportResult, ResolvedDidImport } from "./did-import.js";
import type { CommerceReceiptRecord, ListCommerceReceiptsParams, RecordCommerceReceiptParams } from "./commerce-receipt.js";
export type { ResolveDidImportResult, ResolvedDidImport };
export type { CommerceReceiptRecord, ListCommerceReceiptsParams, RecordCommerceReceiptParams };
import type { RagIndexProgress, RagIndexStatus } from "./rag-index-status.js";
import type { TransferStatus } from "./transfer-status.js";
import type { BridgeStatus, NodeConfig, RelayConfig, NodeStatus, InitNodeOptions, NodeInitResult, ChatDraft, CapabilityManifest, UpdateCapabilityManifestParams, AutonomousPolicy, ModelProviderConfig, AiSettings, ContactAiPreferences, PairingPayload, HomeClawCoreProxyParams, HomeClawCoreProxyResult, PairDeviceParams, PairDeviceResult, PairSharedIdentityParams, PairSharedIdentityResult, PairWithHomeNodeParams, PairWithHomeNodeResult, ListAuthorizedDevicesResult, RevokeAuthorizedDeviceParams, RevokeAuthorizedDeviceResult, MergeAuthorizedDevicesParams, MergeAuthorizedDevicesResult, PruneRevokedDevicesResult, ListDeviceRevocationsResult } from "./ws-protocol.js";
export interface NodeProfile {
    owner: OwnerIdentity;
    device: DeviceIdentity;
    deviceCertificate: DeviceCertificate;
}
export interface HumanProfile extends HumanProfilePayload {
}
/** Cached bonded-peer profile (thumbnail bytes when received via profile.sync). */
export interface PeerProfileView {
    ownerId: string;
    profile: HumanProfile;
    cachedAt: string;
    thumbnailContentBase64?: string;
    thumbnailMimeType?: "image/jpeg" | "image/png" | "image/webp";
}
export interface CreateHumanProfileInput {
    displayName: string;
    username: string;
    bio?: string;
    gender?: string;
    hobbies?: string[];
    knowledge?: string[];
    profileVisibility?: "public" | "private";
    capabilities?: CapabilityUnion[];
}
export interface SetPublicProfileThumbnailParams {
    contentBase64: string;
    mimeType: import("./profile-media.js").ProfilePhotoMime;
}
export interface UpsertProfileGalleryPhotoParams {
    contentBase64: string;
    mimeType: import("./profile-media.js").ProfilePhotoMime;
    visibility: import("./profile-media.js").ProfileGalleryPhotoVisibility;
    label?: string;
    photoId?: string;
}
export interface UpdateProfileGalleryPhotoVisibilityParams {
    vaultRelativePath: string;
    visibility: import("./profile-media.js").ProfileGalleryPhotoVisibility;
}
export interface AgentIdentityDocument {
    content: string;
    updatedAt: string;
}
export interface HelloProfile {
    displayName: string;
    bio?: string;
    interests: string[];
    whatShares: string[];
    avatarUrl?: string;
}
export interface HelloRequest {
    messageId: string;
    sender: {
        nodeId: string;
        ownerId: string;
        displayName: string;
    };
    profile: HelloProfile;
    message: string;
    timestamp: string;
}
export interface HelloResponse {
    messageId: string;
    inReplyTo: string;
    decision: "accept" | "decline" | "block";
    declineReason?: string;
    timestamp: string;
}
/** Inbound Trust-mode row + WS payload (`social.intro:propose`). */
export interface SocialIntroProposal {
    messageId: string;
    introCorrelationId: string;
    candidateOwnerId: string;
    candidatePeerId: string;
    agentPeerId: string;
    agentOwnerId: string;
    rationale?: string;
    receivedAt: string;
    /** True after {@link NodeService.approveSocialIntroCommitment}; opaque ref stays server-side until hello send. */
    commitmentApproved?: boolean;
}
/** Optional flags for {@link NodeService.sendHello} (Trust-mode bond linkage). */
export interface SendHelloOptions {
    /** Matches {@link SocialIntroProposal.messageId}; requires prior approveSocialIntroCommitment. */
    introProposalMessageId?: string;
}
import type { BondLevel } from "./bond-trust-rank.js";
export type { BondLevel } from "./bond-trust-rank.js";
export interface BondRecord {
    peerOwnerId: string;
    displayName?: string;
    /** Libp2p dial id from peer directory when known (e.g. `12D3Koo…`), for UI fallback when `displayName` is empty. */
    libp2pPeerId?: string;
    level: BondLevel;
    createdAt: string;
    note?: string;
}
export interface ChatAttachment {
    id: string;
    filename: string;
    mimeType: string;
    sizeBytes: number;
    sensitivity: "public" | "friends" | "private";
    /** Local vault-relative path — used to open or reveal the file in Library / chat. */
    vaultRelativePath?: string;
}
export interface ChatMessage {
    messageId: string;
    inReplyTo?: string;
    sender: {
        nodeId: string;
        displayName: string;
        /** Envoy owner id (`envoy:owner:…`); `nodeId` remains the libp2p transport id when applicable. */
        ownerId?: string;
        /** Wire role persisted for Phase 13 actor disclosure (defaults to human when absent). */
        actorRole?: "human" | "agent" | "system";
        agentId?: string;
        agentVerified?: boolean;
    };
    recipient: {
        nodeId: string;
        displayName?: string;
        ownerId?: string;
    };
    content: {
        text: string;
        attachments?: ChatAttachment[];
    };
    metadata: {
        timestamp: string;
        deliveryReceipt?: "pending" | "sent" | "delivered" | "read" | "failed";
        deliveryChannel?: "ai" | "inbox" | "chat" | "agent";
        deliverySource?: "bridge";
    };
    signature: string;
}
/** Result of an outbound chat send (transport accepted the envelope). */
export interface SendChatResult {
    messageId: string;
    deliveryReceipt?: "sent" | "delivered";
    deliveredAt?: string;
}
export type AgentActivityDomain = "social" | "knowledge" | "home" | "research";
export type AgentActivityKind = "task_started" | "task_progress" | "task_completed" | "task_failed" | "knowledge_answered" | "intro_sync" | "friend_autopilot_pass" | "social_proxy_transition" | "document_acq_stage" | "share_proposed" | "approval_needed" | "report_received" | "commerce_receipt";
export interface AgentActivityEvidence {
    type: string;
    ref: string;
}
export interface AgentActivityRecord {
    activityId: string;
    correlationId?: string;
    taskId?: string;
    domain: AgentActivityDomain;
    kind: AgentActivityKind;
    summary: string;
    remoteOwnerId?: string;
    remoteAgentId?: string;
    remoteActorRole?: "agent" | "human";
    evidence?: AgentActivityEvidence[];
    requiresOwnerAction?: boolean;
    createdAt: string;
}
export interface ListAgentActivityParams {
    since?: string;
    until?: string;
    limit?: number;
    correlationId?: string;
    domain?: AgentActivityDomain;
    remoteOwnerId?: string;
}
/** Summary of a pending approval queue item (Phase 9H / 13). */
export interface PendingApprovalSummary {
    id: string;
    actionType: string;
    title: string;
    description: string;
    draftContent: string;
    contactOwnerId?: string;
    contactDisplayName?: string;
    priority: string;
    requestedAt: string;
}
export interface ApprovePendingApprovalResult {
    ok: boolean;
    error?: string;
    messageId?: string;
}
export type AgentInteractionMode = "chat_ok" | "structured_preferred";
export interface CachedAgentCardSummary {
    ownerId: string;
    displayName: string;
    capabilities: string[];
    cachedAt: string;
    sourceAgentPeerId?: string;
    nodeProfile?: import("@envoymesh/protocol").DeviceProfile;
    publicTopics?: string[];
    trustPolicySummary?: {
        acceptsDirectBondRequests?: boolean;
        acceptsReferralRequests?: boolean;
        requiresHumanApprovalForRawFiles?: boolean;
    };
    supportedProtocolVersions?: string[];
}
export interface AuditEventSummary {
    eventId: string;
    type: string;
    createdAt: string;
    intent?: string;
    taskId?: string;
    correlationId?: string;
    remotePeerId?: string;
    direction?: string;
    outcome: string;
    summary: string;
}
export interface ListAuditEventsParams {
    correlationId?: string;
    taskId?: string;
    since?: string;
    until?: string;
    limit?: number;
}
export interface TaskJournalSummary {
    eventId: string;
    taskId: string;
    eventType: string;
    summary: string;
    createdAt: string;
    mandateId?: string;
}
export interface ListTaskJournalParams {
    taskId?: string;
    limit?: number;
}
export type ProfileVisibility = "public" | "contacts" | "private";
export interface PeerSearchResult {
    nodeId: string;
    ownerId: string;
    displayName: string;
    username?: string;
    bio?: string;
    interests: string[];
    profileVisibility: ProfileVisibility;
    /** Portable did:key when owner public key is known */
    did?: string;
    /** Where this hit came from (local bond, DHT topic, rendezvous, …) */
    discoverySource?: "local" | "dht-capability-topic" | "dht-peer-routing" | "rendezvous" | "did-lookup";
    trustLevel?: string;
    signedRecordValid?: boolean;
}
export interface SearchQuery {
    /** Bonded-contact DID or envoy:owner id lookup */
    did?: string;
    /** Direct peer ID lookup (e.g., "12D3KooWSHXmS7N94yFj1fqoH4anmbNXW6rZBcsGWrW95vEVjZ3Q") */
    peerId?: string;
    /** DHT topic-based discovery - peers advertising this topic will be found */
    topic?: string;
    /** Text search in display name/bio/interests (not used when peerId or topic is set) */
    queryText?: string;
    /** Username search - when query matches username pattern */
    username?: string;
    interests?: string[];
    maxResults?: number;
}
export interface ReputationAttestationSummary {
    attestationId: string;
    anchorId: string;
    anchorName: string;
    subjectOwnerId: string;
    claim: string;
    issuedAt: string;
    expiresAt?: string;
    anchorRef?: string;
}
export interface PeerReputationSummary {
    peerOwnerId: string;
    local?: {
        successfulTasks: number;
        failedTasks: number;
        avgLatencyMs: number;
        abuseFlags: string[];
        lastUpdated: string;
    };
    attestations: ReputationAttestationSummary[];
}
export interface ShareOffer {
    shareId: string;
    senderNodeId: string;
    /** Owner id when known — routes post-transfer chat log to the bonded contact thread. */
    senderOwnerId?: string;
    senderDisplayName: string;
    filename: string;
    mimeType: string;
    sizeBytes: number;
    sensitivity: "public" | "friends" | "private";
    preview?: string;
    timestamp: string;
    /**
     * Sender vault-relative path for this file (push offers). Used with {@link NodeService.acceptShare}
     * when remapping the local save path (must match the voucher’s `relativePath` on receive).
     */
    senderVaultRelativePath?: string;
}
/** Query for {@link NodeService.listLibraryItems} */
export interface ListLibraryItemsParams {
    /** Case-insensitive substring match on title or relative path */
    query?: string;
}
/** One file in the local shared vault (all regular files listed; binary files have integrity hashes but no text chunks). */
export interface LibraryItem {
    documentId: string;
    relativePath: string;
    title: string;
    extension: string;
    byteLength: number;
    contentHash: string;
    updatedAt: string;
    /** True when the document is included in the published discovery manifest (see `setLibraryItemPublished`). */
    published: boolean;
    /** Latest Kubo-aligned IPFS export for this document, when present. */
    publishedExternal?: PublishedExternalRecord;
}
export type LocalFileSource = "vault" | "workspace";
export interface LocalFileItem {
    source: LocalFileSource;
    relativePath: string;
    title: string;
    extension: string;
    byteLength: number;
    updatedAt: string;
    documentId?: string;
    contentHash?: string;
    published?: boolean;
    publishedExternal?: PublishedExternalRecord;
}
export interface ListAllLocalFilesParams {
    query?: string;
}
export interface ListAllLocalFilesResult {
    items: LocalFileItem[];
    vaultCount: number;
    workspaceCount: number;
}
export interface ReadLocalFileContentParams {
    source: LocalFileSource;
    relativePath: string;
    documentId?: string;
    maxBytes?: number;
}
export interface OpenLocalFileParams {
    source: LocalFileSource;
    relativePath: string;
}
/** Persisted metadata from an explicit owner-approved IPFS export (canonical root CID). */
export interface PublishedExternalRecord {
    exportRevision: number;
    exportedAt: string;
    cid: string;
    ipfsInteropRecipe: string;
    kuboVersion: string;
    contentHash: string;
    /** Helia shadow export CID when engine runs in compare mode (H4). */
    cidHelia?: string;
    heliaVersion?: string;
}
export interface ExportLibraryItemToIpfsResult extends PublishedExternalRecord {
    documentId: string;
    relativePath: string;
}
export type PinLibraryItemExternalResult = {
    ok: true;
    cid: string;
    provider: import("./ipfs-pinning.js").IpfsPinningProvider;
    pinId?: string;
} | {
    ok: false;
    error: string;
};
export interface CreateWanJoinInviteParams {
    /** Hours until invite expires (default 168 = 7 days). */
    expiresInHours?: number;
    note?: string;
}
export interface CreateWanJoinInviteResult {
    token: string;
    uri: string;
    invite: import("./wan-join-invite.js").WanJoinInviteV1;
}
export interface ApplyWanJoinInviteResult {
    ok: true;
    bootstrapPeersAdded: number;
    bootstrapPresetsAdded: number;
    seedsPersisted: number;
}
/** Managed/bundled Kubo sidecar status (desktop). */
export interface IpfsEngineStatus {
    /** Primary export engine availability (Kubo or Helia depending on selection). */
    available: boolean;
    running: boolean;
    managed: boolean;
    kuboVersion?: string;
    errorHint?: string;
    /** In-process Helia engine (shadow mode / dual status). */
    helia?: {
        available: boolean;
        heliaVersion?: string;
        errorHint?: string;
    };
    /** Kubo sidecar / CLI when Helia is primary (secondary status). */
    kubo?: {
        available: boolean;
        kuboVersion?: string;
        errorHint?: string;
    };
}
export interface VerifyLibraryItemIpfsGatewayParams {
    documentId: string;
    /** Optional gateway base URL; must be in `externalPublish.gatewayAllowlist`. */
    gatewayUrl?: string;
}
export interface VerifyLibraryItemIpfsGatewayResult {
    documentId: string;
    relativePath: string;
    cid: string;
    gatewayUrl: string;
    contentHashMatches: boolean;
    fetchedBytes: number;
    expectedContentHash: string;
    fetchedContentHash: string;
}
/** Import a file into the local shared vault (desktop folder or mobile filesystem vault). */
export interface ImportToLibraryParams {
    /** Vault-relative path (e.g. `imports/photo.jpg`). */
    relativePath: string;
    /** Raw file bytes, base64-encoded. */
    contentBase64: string;
    mimeType?: string;
}
export interface ImportToLibraryResult {
    documentId: string;
    relativePath: string;
    sizeBytes: number;
}
/** Max raw bytes for a chat attachment send (25 MiB). */
export declare const MAX_CHAT_ATTACHMENT_BYTES: number;
/** Max bytes returned by {@link NodeService.readLibraryItemContent} for inline previews (5 MiB). */
export declare const MAX_LIBRARY_ITEM_PREVIEW_BYTES: number;
export interface SendChatAttachmentParams {
    targetOwnerId: string;
    filename: string;
    contentBase64: string;
    mimeType?: string;
    caption?: string;
    sensitivity?: ChatAttachment["sensitivity"];
    chatText?: string;
    recordInChat?: boolean;
}
export interface SendChatAttachmentResult {
    attachmentId: string;
    vaultRelativePath: string;
    shareRequestMessageId: string;
    messageId?: string;
}
export interface ReadLibraryItemContentParams {
    relativePath: string;
    maxBytes?: number;
}
export interface ReadLibraryItemContentResult {
    contentBase64: string;
    mimeType: string;
    sizeBytes: number;
    truncated: boolean;
}
export interface DiscoverPublishedLibraryParams {
    /** Substring match on published title or vault path (evaluated by the responder). */
    fileTitleQuery?: string;
    /** Prefix match on base64url content hash (optional). */
    contentHashPrefix?: string;
    maxResultsPerPeer?: number;
    timeoutMsPerPeer?: number;
    /** When set, only these bonded peers are queried. */
    targetOwnerIds?: string[];
}
export interface PublishedLibraryFileHit {
    documentId: string;
    title: string;
    relativePath: string;
    contentHash: string;
    byteLength?: number;
    /** Kubo root CID when the peer included it in discovery metadata. */
    cid?: string;
}
export interface DiscoverPublishedLibraryPeerResult {
    peerOwnerId: string;
    displayName?: string;
    libp2pPeerId: string;
    bondLevel: BondLevel;
    bondRank: number;
    files: PublishedLibraryFileHit[];
    latencyMs: number;
    error?: string;
}
export interface AgentShareProposal {
    proposalId: string;
    createdAt: string;
    targetOwnerId: string;
    vaultRelativePath: string;
    sensitivity: "public" | "friends" | "private";
    summary?: string;
}
/** Parameters for {@link NodeService.submitAgentShareProposal} (persisted record adds id + timestamp). */
export interface SubmitAgentShareProposalParams {
    targetOwnerId: string;
    vaultRelativePath: string;
    sensitivity: "public" | "friends" | "private";
    summary?: string;
}
export interface ConnectionStatus {
    online: boolean;
    peerId: string;
    multiaddrs: string[];
    connectedRelays: string[];
    bondedPeers: number;
    /** Last transport / routing failure (best-effort; cleared on successful `startNode()`). */
    lastError?: string;
    /** ISO timestamp for {@link lastError}. */
    lastErrorAt?: string;
    /** True when this node can spawn local PTY sessions (desktop home node). */
    terminalsAvailable?: boolean;
    /** Paired mobile → home remote capabilities (Slice 2). */
    homeRemote?: import("./home-remote.js").HomeRemoteStatus;
}
/**
 * Connection info for a specific peer (direct P2P vs relay-mediated).
 */
export interface PeerConnectionInfo {
    connected: boolean;
    direct: boolean;
    /** If relay connection, the relay's peer ID */
    relayPeerId?: string;
    /** When connected, true if path was verified within the freshness window (~45s). */
    pathVerified?: boolean;
}
export interface ChatDiagnosticsContact {
    peerOwnerId: string;
    peerFound: boolean;
    transportPeerId?: string;
    storedListenAddrs: number;
    dialHintCount: number;
    sampleDialHints: string[];
    badPublicBootstrapHints: number;
    connection?: PeerConnectionInfo;
}
export interface ChatDiagnostics {
    checkedAt: string;
    nodeOnline: boolean;
    localPeerId: string;
    relayEnabled: boolean;
    relayClientSchedulerActive: boolean;
    relayControlTargets: string[];
    lastRelayCheckin?: {
        at: string;
        source: "node-service" | "cli";
        results: Array<{
            target: string;
            ok: boolean;
            error?: string;
        }>;
    };
    lastRelayLookup?: {
        at: string;
        source: "node-service" | "cli";
        ok: boolean;
        peerCount: number;
        circuitAddrsStored: number;
        error?: string;
    };
    connectionStats: {
        totalPeers: number;
        totalConnections: number;
        circuitPeers: number;
        circuitConnections: number;
    };
    discoverySeedCount: number;
    circuitSeedCount: number;
    contact?: ChatDiagnosticsContact;
    hints: string[];
}
export type WanConnectivityAxisState = "ok" | "degraded" | "fail" | "unknown" | "disabled";
export interface WanConnectivityAxis {
    state: WanConnectivityAxisState;
    explanation: string;
}
export interface ConnectivityStageDSnapshot {
    discoveryProfile: "lan-fast" | "wan-default" | "unknown";
    bootstrapPeerCount: number;
    discoveredPeerCount: number;
    relayDiscoveryCount: number;
    bootstrapProbeSuccessCount: number;
    bootstrapProbeFailureCount: number;
    reprobeOkCount: number;
    reprobeFailCount: number;
    warningCount: number;
    badge: "ok" | "warn" | "starting" | "unknown";
    badgeExplanation: string;
}
export interface ConnectivityDiagnostics {
    checkedAt: string;
    nodeOnline: boolean;
    stageD: ConnectivityStageDSnapshot;
    axes: {
        bootstrapReachability: WanConnectivityAxis;
        relayAvailability: WanConnectivityAxis;
        holePunch: WanConnectivityAxis;
        policyBlock: WanConnectivityAxis;
        features: {
            relay?: boolean;
            dcutr?: boolean;
            dht?: boolean;
            quic?: boolean;
        };
    };
    quicEnabled: boolean;
    hints: string[];
    /** Operator steps for live multi-machine sign-off (Phase 15B). */
    signOffChecklist: string[];
}
export interface MorningReportEntry {
    ownerId: string;
    peerId?: string;
    trustLevel: string;
    score: number;
    reason: string;
    lastSeenAt?: string;
    discoveryMatchCount: number;
    hopDistance?: number;
}
export interface DiscoverCapabilityTopicParams {
    topic: string;
    maxResults?: number;
    /** When true, send policy-gated discovery.request to bonded providers only. */
    followUpDiscovery?: boolean;
    requestedCapabilities?: string[];
    /** Story D: max hops for follow-up discovery.request (default 2). */
    maxHops?: number;
}
export interface RequestMultiHopDiscoveryParams {
    requestedCapabilities?: string[];
    requestedTagHashes?: string[];
    fileTitleQuery?: string;
    maxHops?: number;
    maxBonds?: number;
}
export interface MultiHopDiscoveryMatch {
    ownerId: string;
    peerId: string;
    hopDistance: number;
    matchedCapabilities: string[];
    matchedTagHashes: string[];
    /** Direct bond used for hop-1 query, or referral for hop-2+. */
    viaOwnerId?: string;
    viaDisplayName?: string;
    referralOwnerId?: string;
    trustPath?: string;
}
export interface RequestMultiHopDiscoveryResult {
    matches: MultiHopDiscoveryMatch[];
    bondsQueried: number;
    correlationId: string;
    pendingForwardApprovals: number;
    aggregatedMatchCount: number;
}
export interface MultiHopDiscoverySessionView {
    correlationId: string;
    createdAt: string;
    updatedAt: string;
    bondsQueried: number;
    pendingForwardApprovals: number;
    awaitingHop2ViaBonds?: string[];
    matches: MultiHopDiscoveryMatch[];
}
export interface CapabilityTopicProviderHit {
    peerId: string;
    multiaddrs: string[];
    ownerId?: string;
    displayName?: string;
    trustLevel?: string;
    signedRecordValid?: boolean;
    followUpMatchCount?: number;
    followUpError?: string;
    discoverySource: "dht-capability-topic";
}
export interface DiscoverCapabilityTopicResult {
    topic: string;
    providers: CapabilityTopicProviderHit[];
}
export interface NodeServiceEvents {
    "hello:request": HelloRequest;
    "hello:response": HelloResponse;
    /** Agent-mediated intro propose surfaced to owner inbox (Trust mode). */
    "social.intro:propose": SocialIntroProposal;
    "bond:established": {
        peerOwnerId: string;
        displayName?: string;
    };
    "bond:revoked": {
        peerOwnerId: string;
    };
    "bond:blocked": {
        peerOwnerId: string;
    };
    /** Bonded peer profile cache updated (profile.sync / profile.response). */
    "profile:updated": {
        ownerId: string;
    };
    "chat:message": ChatMessage;
    "chat:draft": {
        threadPeerOwnerId: string;
        draft: ChatDraft;
    };
    /** Owner Activity feed row (Phase 13D — local, not wire). */
    "agent:activity": AgentActivityRecord;
    "chat:delivered": {
        messageId: string;
        timestamp: string;
    };
    "chat:read": {
        messageId: string;
        timestamp: string;
    };
    /**
     * Emitted when an outbound chat message has given up trying to reach a
     * specific recipient (e.g. peer unreachable after max retries). UI can
     * surface this so the user knows which contacts are offline.
     */
    "chat:delivery-failed": {
        threadKey: string;
        messageId: string;
        recipientOwnerId: string;
        reason: string;
    };
    "share:offered": ShareOffer;
    /** Agent suggested sharing a vault file — owner confirms via share or dismisses (FS-E). */
    "share:agent-proposed": AgentShareProposal;
    /** File transfer progress for UI and agent visibility (ADB-D). */
    "share:progress": TransferStatus;
    /** Vault vector indexing progress for Settings AI tab. */
    "rag:reindex": RagIndexProgress;
    "share:accepted": {
        shareId: string;
        savePath: string;
    };
    "share:declined": {
        shareId: string;
    };
    "peer:discovered": PeerSearchResult;
    "peer:lost": {
        nodeId: string;
    };
    "discovery:advertising-complete": {
        topics: string[];
        success: boolean;
    };
    /** Multi-hop discovery aggregation updated (hop-2 forward responses merged). */
    "discovery:multihop-update": MultiHopDiscoverySessionView;
    /** yjs / CRDT delta from paired owner device (sync.state). */
    "crdt:sync": {
        scope: string;
        updateBase64: string;
        senderOwnerId: string;
        remotePeerId: string;
    };
    "node:online": {
        peerId: string;
        multiaddrs: string[];
    };
    "node:offline": {
        peerId: string;
    };
    "node:status": {
        status: NodeStatus;
        peerId?: string;
    };
    "config:updated": {
        autonomousKillSwitch: boolean;
        autonomousPolicies: readonly AutonomousPolicy[];
        chatAssistEnabled: boolean;
        modelProviders: ModelProviderConfig;
        aiSettings?: AiSettings;
        contactAiPreferences: ContactAiPreferences[];
    };
    /** Paired-mode bootstrap events (mobile only, but harmless for the desktop) —
     * emitted by the bootstrap that runs after a successful home pairing, refreshing
     * the UI to show the home's actual state. */
    "home:config-updated": {
        config: import("./ws-protocol.js").NodeConfig;
    };
    "home:bonds-updated": {
        bonds: BondRecord[];
    };
    "home:bootstrap-ok": {};
    "home:bootstrap-failed": {
        error: string;
    };
    "home:agent-cards-updated": {
        cards: CachedAgentCardSummary[];
    };
    "bridge:status": BridgeStatus;
    "p2p:envelope": {
        envelope: Record<string, unknown>;
        remotePeerId: string;
    };
    /** Phase 25A — mesh-awareness insight surfaced to UI. */
    "agent:awareness": {
        kind: string;
        summary: string;
        matchedTopic: string;
        peerCount: number;
        createdAt: string;
    };
}
export interface NodeService {
    /**
     * Get current node's identity and profile
     */
    getProfile(): NodeProfile;
    /**
     * Portable W3C did:key presentation for the owner (read-only; envoy:owner id remains canonical).
     */
    getOwnerDidPresentation(): OwnerDidPresentation;
    /**
     * Resolve external `did:key` or JSON DID document to envoy owner id + PEM (no WAN gateway).
     */
    resolveDidImport(input: string): Promise<ResolveDidImportResult>;
    /**
     * Store a contact owner public key for bonded DID search lookup.
     */
    cacheDidContactKey(params: {
        ownerId: string;
        publicKeyPem: string;
    }): Promise<{
        ok: boolean;
        reason?: string;
    }>;
    /**
     * Local reputation score + opt-in anchor attestations for a bonded peer.
     */
    getPeerReputationSummary(peerOwnerId: string): Promise<PeerReputationSummary>;
    /**
     * Get current node's human profile
     */
    getHumanProfile(): Promise<HumanProfile | undefined>;
    /**
     * Update human profile (signs with owner key)
     */
    updateHumanProfile(profile: CreateHumanProfileInput): Promise<HumanProfile>;
    /** Set the always-public profile thumbnail (stored in vault, referenced on signed profile). */
    setPublicProfileThumbnail(params: SetPublicProfileThumbnailParams): Promise<HumanProfile>;
    /** Add or replace a gallery photo with per-photo visibility. */
    upsertProfileGalleryPhoto(params: UpsertProfileGalleryPhotoParams): Promise<HumanProfile>;
    /** Remove a gallery photo from profile and vault index. */
    removeProfileGalleryPhoto(params: {
        vaultRelativePath: string;
    }): Promise<HumanProfile>;
    /** Update visibility on an existing gallery photo. */
    updateProfileGalleryPhotoVisibility(params: UpdateProfileGalleryPhotoVisibilityParams): Promise<HumanProfile>;
    /** Cached signed profile for a bonded peer (includes inline thumbnail when synced). */
    getPeerProfile(ownerId: string): Promise<PeerProfileView | undefined>;
    /** List all cached peer profiles. */
    listPeerProfiles(): Promise<PeerProfileView[]>;
    /** Ask a bonded peer to send profile.sync (e.g. after bond established). */
    requestPeerProfile(ownerId: string): Promise<{
        ok: boolean;
        reason?: string;
    }>;
    /** Push local signed profile (and thumbnail bytes) to all bonded peers. */
    syncProfileToBonds(): Promise<void>;
    /** Re-sync local profile to bonds and request fresh profiles from each bond (e.g. after mesh online). */
    refreshBondPeerProfiles(): Promise<{
        requested: number;
        failed: number;
    }>;
    /**
     * Get owner-editable agent operating instructions (`agent-identity.md` in profile dir).
     */
    getAgentIdentity(): Promise<AgentIdentityDocument>;
    /**
     * Save agent operating instructions.
     */
    updateAgentIdentity(content: string): Promise<AgentIdentityDocument>;
    /**
     * Send a hello request to establish connection
     */
    sendHello(targetOwnerId: string, profile: HelloProfile, message: string, options?: SendHelloOptions): Promise<HelloResponse>;
    /**
     * Accept a pending hello request
     */
    acceptHello(messageId: string): Promise<void>;
    /**
     * Trust mode — persist inbound {@link SocialIntroProposal} and notify listeners / WS clients.
     */
    storePendingSocialIntroProposal(proposal: SocialIntroProposal): void;
    /**
     * Pending intro proposes awaiting owner review (memory-only; survives until approve/decline/send).
     */
    listPendingSocialIntroProposals(): Promise<SocialIntroProposal[]>;
    /**
     * Owner approved bonding after reviewing an intro; generates opaque {@link ownerCommitmentRef} for the next hello.
     */
    approveSocialIntroCommitment(messageId: string): Promise<{
        ownerCommitmentRef: string;
    }>;
    declineSocialIntroProposal(messageId: string): Promise<void>;
    /**
     * Store pending hello request from inbound bond.inbound.
     * Called by index.ts to enable acceptHello to find the pending request later.
     */
    storePendingHelloRequest(data: {
        messageId: string;
        sender: {
            nodeId: string;
            ownerId: string;
            displayName: string;
        };
        message: string;
        timestamp: string;
    }): void;
    /**
     * Decline a pending hello request
     */
    declineHello(messageId: string, reason?: string): Promise<void>;
    /**
     * Block a peer (permanent - they cannot send hello requests)
     */
    blockPeer(peerOwnerId: string): Promise<void>;
    /**
     * Unblock a peer
     */
    unblockPeer(peerOwnerId: string): Promise<void>;
    /**
     * Revoke (remove) a bond
     */
    revokeBond(peerOwnerId: string): Promise<void>;
    /**
     * Get all bonds (trusted contacts)
     */
    getBonds(): Promise<BondRecord[]>;
    /**
     * Send a chat message to a bonded peer
     */
    sendChat(targetOwnerId: string, text: string, attachments?: SendChatParams["attachments"]): Promise<SendChatResult>;
    /**
     * Send AI/agent chat with honest wire role (`senderRole=agent` + `agentCredential`).
     */
    sendAgentChat(targetOwnerId: string, text: string): Promise<SendChatResult>;
    /**
     * Send an image or file directly in a chat thread (P2P transfer, auto-accepted for direct bonds).
     */
    sendChatAttachment(params: SendChatAttachmentParams): Promise<SendChatAttachmentResult>;
    /**
     * Read vault file bytes for inline previews (images in chat). Size-capped.
     */
    readLibraryItemContent(params: ReadLibraryItemContentParams): Promise<ReadLibraryItemContentResult>;
    readLocalFileContent(params: ReadLocalFileContentParams): Promise<ReadLibraryItemContentResult>;
    listAllLocalFiles(params?: ListAllLocalFilesParams): Promise<ListAllLocalFilesResult>;
    openLocalFile(params: OpenLocalFileParams): Promise<void>;
    /**
     * Forward a pre-signed EnvoyEnvelope from a remote client (e.g. mobile app)
     * into the P2P mesh. The envelope must already be signed by the sender's key.
     * The node validates the envelope schema but does NOT re-sign or inspect payloads.
     *
     * Used by remote P2P clients that have their own Ed25519 identity but no
     * direct libp2p connection — the node acts as a P2P proxy.
     *
     * @param envelopeJson The signed EnvoyEnvelope JSON object
     * @param dialHints Optional multiaddrs to try when dialing the recipient
     */
    forwardEnvelope(envelopeJson: Record<string, unknown>, dialHints?: string[]): Promise<void>;
    /**
     * Forward a single HomeClaw Core HTTP request from the Companion app to Core on the home LAN.
     * Path must match an allowlisted prefix (SSR-safe); URLs are not accepted.
     */
    homeclawCoreProxy(params: HomeClawCoreProxyParams): Promise<HomeClawCoreProxyResult>;
    /**
     * Human chat transcripts persisted under the profile (`chat-messages.jsonl`).
     */
    listChatHistory(peerOwnerId: string, limit?: number): Promise<ChatMessage[]>;
    /**
     * Owner Activity timeline (`agent-activity.jsonl`).
     */
    listAgentActivity(params?: ListAgentActivityParams): Promise<AgentActivityRecord[]>;
    /** Story E receipt-only ledger (local JSON — no payment rail). */
    listCommerceReceipts(params?: ListCommerceReceiptsParams): Promise<CommerceReceiptRecord[]>;
    /** Record outbound delivery receipt for a vault document (links task + contentHash/CID). */
    recordCommerceReceipt(params: RecordCommerceReceiptParams): Promise<CommerceReceiptRecord>;
    /** Filtered audit trail for Activity drill-down (summaries only). */
    listAuditEvents(params?: ListAuditEventsParams): Promise<AuditEventSummary[]>;
    /** Task journal rows for Activity drill-down. */
    listTaskJournalEntries(params?: ListTaskJournalParams): Promise<TaskJournalSummary[]>;
    /** Cached peer agent cards (Phase 13C). */
    listAgentCards(): Promise<CachedAgentCardSummary[]>;
    getAgentCard(ownerId: string): Promise<CachedAgentCardSummary | undefined>;
    /** Send agent.card.request to a bonded peer (response cached on reply). */
    requestAgentCard(targetOwnerId: string): Promise<{
        ok: boolean;
        error?: string;
    }>;
    /** Phase 34: latest cached `task.result` (typed Artifacts) for the taskId. */
    getTaskResult(taskId: string): Promise<TaskResultPayload | undefined>;
    /** Pending AI actions awaiting owner approval. */
    listPendingApprovals(): Promise<PendingApprovalSummary[]>;
    /** Approve and execute a pending action (e.g. send_chat → sendAgentChat). */
    approvePendingApproval(itemId: string, notes?: string): Promise<ApprovePendingApprovalResult>;
    rejectPendingApproval(itemId: string, notes?: string): Promise<{
        ok: boolean;
        error?: string;
    }>;
    /** Delete one persisted chat message from a thread (local only). */
    deleteChatMessage(peerOwnerId: string, messageId: string): Promise<{
        ok: boolean;
    }>;
    /** Delete all persisted chat messages in a thread (local only). */
    clearChatHistory(peerOwnerId: string): Promise<{
        deletedCount: number;
    }>;
    /**
     * Mark messages as read
     */
    markRead(targetOwnerId: string, upToMessageId?: string): Promise<void>;
    /**
     * AI-generated draft replies awaiting human review (not sent until approved).
     */
    getChatDrafts(threadPeerOwnerId?: string): Promise<ChatDraft[]>;
    deleteChatDraft(draftId: string): Promise<void>;
    /**
     * Search for peers by interests or text
     */
    searchPeers(query: SearchQuery): Promise<PeerSearchResult[]>;
    /**
     * Run DHT capability discovery on demand (used when lazy mode skips periodic find).
     */
    runCapabilityDiscovery(params?: {
        find?: boolean;
    }): Promise<void>;
    /**
     * Query DHT capability topics and optionally follow up with policy-gated discovery.request.
     */
    discoverCapabilityTopic(params: DiscoverCapabilityTopicParams): Promise<DiscoverCapabilityTopicResult>;
    /**
     * Ranked discovery digest (morning report) from trust store + discovery events.
     */
    getMorningReport(params?: {
        limit?: number;
    }): Promise<MorningReportEntry[]>;
    /** Story D (US-MH1): query direct bonds with hop-limited discovery.request. */
    requestMultiHopDiscovery(params: RequestMultiHopDiscoveryParams): Promise<RequestMultiHopDiscoveryResult>;
    /** Fetch aggregated hop-1/2 matches for a multi-hop session. */
    getMultiHopDiscoverySession(correlationId: string): Promise<MultiHopDiscoverySessionView | undefined>;
    /** Merge async hop-2 discovery.response into an active multi-hop session (originator only). */
    ingestInboundMultiHopDiscoveryResponse(params: {
        correlationId: string;
        responderOwnerId: string;
        matches: Array<{
            ownerId: string;
            peerId: string;
            hopDistance?: number;
            matchedCapabilities: string[];
            matchedTagHashes: string[];
        }>;
        forwardPendingAck?: boolean;
    }): Promise<void>;
    /** Push yjs CRDT delta to paired owner devices (sync.state). */
    sendSyncStateUpdate(params: import("./sync-state.js").SendSyncStateUpdateParams): Promise<import("./sync-state.js").SendSyncStateUpdateResult>;
    /**
     * WAN connectivity axis diagnostics (bootstrap / relay / punch / policy).
     */
    getConnectivityDiagnostics(): Promise<ConnectivityDiagnostics>;
    /**
     * Advertise a topic on the DHT so other peers can discover you
     * @param topic The topic string to advertise (e.g., "music", "tech")
     */
    advertiseTopic(topic: string): Promise<void>;
    /**
     * Stop advertising a topic on the DHT
     * @param topic The topic string to stop advertising
     */
    stopAdvertiseTopic(topic: string): Promise<void>;
    /**
     * Get the current capability manifest.
     * Returns undefined if no manifest has been created yet.
     */
    getCapabilityManifest(): Promise<CapabilityManifest | undefined>;
    /**
     * Update the capability manifest.
     * Creates a default manifest if none exists.
     */
    updateCapabilityManifest(params: UpdateCapabilityManifestParams): Promise<CapabilityManifest>;
    /**
     * Pending inbound file share offers (preview message id = {@link ShareOffer.shareId}).
     */
    listPendingShareOffers(): Promise<ShareOffer[]>;
    /**
     * Offer a file to a peer
     */
    shareFile(targetOwnerId: string, file: {
        path: string;
        sensitivity: ChatAttachment["sensitivity"];
        deliveryChannel?: "inbox" | "chat" | "agent";
    }): Promise<void>;
    /**
     * Accept incoming file share
     */
    acceptShare(shareId: string, savePath: string): Promise<void>;
    /**
     * Decline incoming file share
     */
    declineShare(shareId: string): Promise<void>;
    /**
     * List documents in the local shared vault (same files used for vault RAG indexing).
     */
    listLibraryItems(params?: ListLibraryItemsParams): Promise<LibraryItem[]>;
    /**
     * Mark a vault document as published for metadata-only `discovery.request` matches (no file bytes).
     */
    setLibraryItemPublished(documentId: string, published: boolean): Promise<void>;
    /**
     * Export a vault document to IPFS via Kubo `ipfs add` (interop recipe v1).
     * Requires `externalPublish.allowIpfs` in node config. Desktop only.
     */
    exportLibraryItemToIpfs(documentId: string): Promise<ExportLibraryItemToIpfsResult>;
    /**
     * Pin an already-exported library CID via an external provider (Pinata JWT env).
     * Requires `externalPublish.allowIpfs` and `externalPublish.pinningEnabled`.
     */
    pinLibraryItemExternal(documentId: string): Promise<PinLibraryItemExternalResult>;
    /** Kubo sidecar / managed daemon status (desktop IPFS export). */
    getIpfsEngineStatus(): Promise<IpfsEngineStatus>;
    /** Vector RAG vault indexing status (incremental reindex progress). */
    getRagIndexStatus(): Promise<RagIndexStatus>;
    /**
     * Fetch exported content from an allowlisted IPFS gateway and verify bytes match vault contentHash.
     * Requires `externalPublish.allowIpfs` and a non-empty gateway allowlist (desktop Kubo or mobile Helia).
     */
    verifyLibraryItemIpfsGateway(params: VerifyLibraryItemIpfsGatewayParams): Promise<VerifyLibraryItemIpfsGatewayResult>;
    /**
     * Write bytes into the local shared vault at a relative path (import from file picker).
     */
    importToLibrary(params: ImportToLibraryParams): Promise<ImportToLibraryResult>;
    /** Resolve a vault-relative path to an absolute path on this device (path safety enforced). */
    resolveLibraryItemPath(relativePath: string): Promise<{
        vaultRelativePath: string;
        absolutePath: string;
    }>;
    /** Open a vault file with the OS default application. Desktop node only. */
    openLibraryItem(relativePath: string): Promise<void>;
    /** Reveal a vault file in Finder / Explorer / file manager. Desktop node only. */
    revealLibraryItemInFileManager(relativePath: string): Promise<void>;
    /**
     * Query bonded contacts for published library metadata (`libraryMatches` in `discovery.response`).
     * Peers are queried in trust order (direct first). Requires an online mesh route to each peer.
     */
    discoverPublishedLibrary(params?: DiscoverPublishedLibraryParams): Promise<DiscoverPublishedLibraryPeerResult[]>;
    /**
     * Pending agent-proposed file shares awaiting owner action (FS-E — empty until wired to agent runtime).
     */
    listAgentShareProposals(): Promise<AgentShareProposal[]>;
    dismissAgentShareProposal(proposalId: string): Promise<void>;
    /**
     * Record an agent-proposed file share for owner review (bridge HTTP or future agent runtime).
     * Persists and emits `share:agent-proposed`.
     */
    submitAgentShareProposal(params: SubmitAgentShareProposalParams): Promise<AgentShareProposal>;
    /**
     * Active file transfers (negotiating or transferring). Completed transfers remain queryable by correlation id.
     */
    listActiveTransfers(): Promise<TransferStatus[]>;
    /** Lookup transfer status by correlation id from share / data-transfer flows. */
    getTransferStatus(correlationId: string): Promise<TransferStatus | undefined>;
    /**
     * Get current node configuration
     */
    getNodeConfig(): Promise<NodeConfig>;
    /**
     * Update node configuration
     */
    updateNodeConfig(config: Partial<NodeConfig>): Promise<void>;
    /**
     * List configured relays
     */
    listRelays(): Promise<RelayConfig[]>;
    /**
     * Add a relay
     */
    addRelay(addr: string, level?: number, region?: string): Promise<RelayConfig>;
    /**
     * Remove a relay
     */
    removeRelay(relayId: string): Promise<void>;
    /**
     * Initialize a new node (first-run setup)
     */
    initNode(profileDir: string, options?: InitNodeOptions): Promise<NodeInitResult>;
    /**
     * Get current node status
     */
    getNodeStatus(): NodeStatus;
    /**
     * Start the node with saved configuration
     */
    startNode(): Promise<void>;
    /**
     * Stop the running node
     */
    stopNode(): Promise<void>;
    /**
     * Subscribe to events. Returns unsubscribe function.
     */
    on<K extends keyof NodeServiceEvents>(event: K, handler: (data: NodeServiceEvents[K]) => void): () => void;
    /**
     * Check if any listeners for a given event
     */
    hasListeners(event: keyof NodeServiceEvents): boolean;
    /**
     * Get agent bridge status (external agent like HomeClaw/OpenClaw).
     * Returns default disabled status when bridge is not configured.
     */
    getBridgeStatus(): Promise<BridgeStatus>;
    /**
     * Get pairing payload for mobile-app QR pairing (Phase 10A).
     *
     * Returns the data needed to construct the `envoy://pair` URI:
     *   wsUrl, relayPeerId, agentPeerId, agentPubKey
     *
     * Used by the Social UI to display a pairing QR code that the
     * HomeClaw mobile app can scan.
     */
    getPairingPayload(): Promise<PairingPayload>;
    /**
     * Create a WAN join-invite token + `envoy://join?token=…` URI (Phase 15B).
     * Encodes current bootstrap config and this node's dial hints for cold-start peers.
     */
    createWanJoinInvite(params?: CreateWanJoinInviteParams): Promise<CreateWanJoinInviteResult>;
    /**
     * Apply a WAN join-invite on a running node — merges bootstrap config and discovery seeds.
     */
    applyWanJoinInvite(token: string): Promise<ApplyWanJoinInviteResult>;
    /**
     * Validate a QR pairing token and create a persistent session token.
     *
     * Called by the mobile app after scanning the QR code. On success, the mobile
     * app saves the returned sessionToken and uses it for future reconnections
     * without re-scanning.
     *
     * Also creates a trust record at "direct" level for the requester.
     */
    pairDevice(params: PairDeviceParams): Promise<PairDeviceResult>;
    /**
     * Shared-identity pairing (Phase 11).
     *
     * Like pairDevice but also:
     * - Signs a DeviceCertificate authorizing the mobile device
     * - ECDH-encrypts the owner private key for secure transfer
     *
     * Called by the Capacitor mobile app when pairing in shared-identity mode
     * (same ownerId as the home node).
     */
    pairSharedIdentity(params: PairSharedIdentityParams): Promise<PairSharedIdentityResult>;
    /**
     * Mobile-only: scan/paste `envoy://pair` URI and import shared owner identity from home node.
     * Desktop nodes reject this call.
     */
    pairWithHomeNode(params: PairWithHomeNodeParams): Promise<PairWithHomeNodeResult>;
    /** List owner-authorized satellite devices (shared-identity pairing). */
    listAuthorizedDevices(): Promise<ListAuthorizedDevicesResult>;
    /** Revoke a previously authorized device certificate. */
    revokeAuthorizedDevice(params: RevokeAuthorizedDeviceParams): Promise<RevokeAuthorizedDeviceResult>;
    /**
     * Merge duplicate authorized-device records: keep one as canonical and
     * revoke the rest. Used to clean up historical duplicates created
     * before the mobile app reused a stable device keypair.
     */
    mergeAuthorizedDevices(params: MergeAuthorizedDevicesParams): Promise<MergeAuthorizedDevicesResult>;
    /**
     * Drop every authorized-device entry that has a matching revocation
     * record. The revocation records are kept for audit history; only
     * the entries in the authorized list are removed.
     */
    pruneRevokedDevices(): Promise<PruneRevokedDevicesResult>;
    /** List signed device revocation records for this owner. */
    listDeviceRevocations(): Promise<ListDeviceRevocationsResult>;
    /**
     * Get current connection status
     */
    getConnectionStatus(): ConnectionStatus;
    /**
     * Get connection info for a specific peer (direct P2P vs relay-mediated).
     * Use this to show connection type indicator in UI.
     * @param peerOwnerId The owner's peer ID (e.g., envoy:owner:...)
     */
    getPeerConnectionInfo(peerOwnerId: string): Promise<PeerConnectionInfo>;
    /**
     * Pre-dial a bonded contact so relay/P2P paths are warm before chat or file share.
     */
    warmContactConnection(peerOwnerId: string): Promise<PeerConnectionInfo>;
    /**
     * Operator diagnostics for cross-NAT chat: relay cycles, dial hints, and human-readable hints.
     * @param peerOwnerId Optional bonded contact owner id to inspect dial hints for.
     */
    getChatDiagnostics(peerOwnerId?: string): Promise<ChatDiagnostics>;
    /**
     * Query the AI model with a knowledge question.
     * Returns the AI's response text.
     */
    knowledgeQuery(question: string): Promise<string>;
    /**
     * Native Envoy AI turn: routes document intents to tools, falls back to vault knowledgeQuery.
     */
    runDocumentAgentTurn(message: string): Promise<DocumentAgentTurnResult>;
    listSocialProxySessions(): Promise<SocialProxySession[]>;
    runSocialProxyPass(): Promise<{
        ok: boolean;
        error?: string;
        correlationId?: string;
    }>;
    cancelSocialProxySession(sessionId: string): Promise<void>;
    startDocumentAcquisitionJob(params: {
        query: string;
        fileTitleHint?: string;
        pathHint?: string;
    }): Promise<{
        jobId: string;
        correlationId: string;
    }>;
    getDocumentAcquisitionJob(jobId: string): Promise<DocumentAcquisitionJob | undefined>;
    listDocumentAcquisitionJobs(activeOnly?: boolean): Promise<DocumentAcquisitionJob[]>;
    cancelDocumentAcquisitionJob(jobId: string): Promise<void>;
    /**
     * Record owner activity (call when owner sends any message via WebSocket).
     * Used for online/offline detection.
     */
    recordOwnerActivity(): void;
    /**
     * Check if the owner is currently online based on:
     * - Manual mode: returns the manual isOnline setting
     * - Automatic mode: returns true if activity within timeout (5 min)
     */
    isOwnerOnline(): Promise<boolean>;
}
//# sourceMappingURL=node-service.d.ts.map