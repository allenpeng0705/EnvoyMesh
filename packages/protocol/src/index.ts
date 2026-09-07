import { z } from "zod";
import { AgentNetworkProfileSchema } from "./agent-network-profile.js";
const randomUUID = () => crypto.randomUUID();

export const EnvoyIntentSchema = z.enum([
  "system.ping",
  "system.signal",
  "agent.card.request",
  "agent.card.response",
  "auth.challenge",
  "auth.challenge.response",
  "bond.request",
  "bond.accept",
  "bond.challenge",
  "bond.challenge.response",
  "discovery.request",
  "discovery.response",
  "relay.peers.request",
  "relay.peers.response",
  "relay.checkin",
  "relay.lookup",
  "relay.lookup.response",
  "relay.hints.request",
  "relay.hints.response",
  "relay.join.request",
  "relay.join.response",
  "relay.register",
  "relay.register.response",
  "relay.summary",
  "chat.message",
  "chat.delivered",
  "chat.room.sync",
  "chat.room.message",
  "knowledge.query",
  "knowledge.response",
  "task.mandate",
  "task.propose",
  "task.negotiate",
  "task.accept",
  "task.reject",
  "task.cancel",
  "task.heartbeat",
  "task.result",
  "report.create",
  "sync.state",
  "device.pair.request",
  "device.pair.approve",
  "device.pair.deferred",
  "device.revoke",
  "device.merge",
  "rendezvous.register",
  "rendezvous.query",
  "rendezvous.response",
  "share.preview",
  "share.request",
  "share.accept",
  "social.intro.owner-ready",
  "social.intro.propose",
  "social.intro.sync",
  "broadcast.request",
  "broadcast.response",
  "broadcast.cancel",
  "task.feedback",
  "official.credential",
  "profile.sync",
  "profile.request",
  "profile.response",
  // Phase 38 — Real-time voice/video calls
  "call.invite",
  "call.reinvite",
  "call.accept",
  "call.reject",
  "call.hangup",
  "call.ice-candidate",
  "call.mute",
  // Phase 40 — Agent Network Collaboration Layer
  // Wire namespace for multi-agent chains. All agent↔agent except task.chain.report
  // (orchestrator → owner, recipientRole: "human").
  "task.chain.mandate",
  "task.chain.propose",
  "task.chain.bid",
  "task.chain.accept",
  "task.chain.partial",
  "task.chain.merge",
  "task.chain.cancel",
  "task.chain.heartbeat",
  /** Orchestrator → workers: read-only job progress snapshot (no manage/cancel). */
  "task.chain.status",
  "task.chain.report",
  // Phase 40E — Cross-orchestrator + cross-home chains
  "task.chain.handoff",
  "task.chain.delegate",
  "task.chain.relay",
  "task.chain.arbitration",
  /** Assigner → worker peer: AN engine readiness hello (worker answers for its engine). */
  "task.chain.ready.request",
  /** Worker → assigner: ready yes/no for THAT node's configured AN engine (OpenClaw XOR Ext). */
  "task.chain.ready.response",
  // Phase 60D — restart reconciliation (attempt receipts).
  "task.chain.reconcile.request",
  "task.chain.reconcile.response",
  // Phase 64A — Assigner → creator ownership status (restart / stranded).
  "task.chain.ownership",
  // Phase 60B — signed short-lived worker leases (availability).
  "agent.worker.lease",
  "agent.worker.lease.revoke",
  "agent.worker.lease.request",
  // v2.2 — direct MAP-over-libp2p sub-agent submit (RemoteSubmitterTransport).
  /** Parent agent → worker agent: execute a SubagentInput (as ExecuteInput). */
  "task.harness.submit.request",
  /** Worker agent → parent agent: the signed AgentResult (or a wire error). */
  "task.harness.submit.response",
  // Phase 45 — Web Content Browsing. Pull-based content serving over the mesh.
  // See docs/web-content-browsing-design.md.
  "library.read",
  "library.read.response",
  // Phase 45E — bonded fan-out notify on publish (no GossipSub).
  "feed.notify",
  // Feed/Blog star + comments (bonded human↔human).
  "feed.engage",
  // Phase 63 — Envoy Market: bonds announce (B) + public search (C).
  "market.announce",
  "market.search",
  "market.search.result",
  // MAP — periodic owner-signed capability manifest broadcast (Sprint 3).
  // Payload: SignedCapabilityManifest. agent→agent.
  "adapter.manifest",
  // MAP §9.2 — federated scoreboard rule broadcast (opt-in pull).
  // Payload: FederatedRule (owner-signed ruleset + aggregate stats). agent→agent.
  "scoreboard.rule",
]);

export const SensitivitySchema = z.enum(["public", "friends", "trusted", "private"]);

export const DeviceProfileSchema = z.enum(["primary", "satellite", "full", "relay"]);
export const EnvoyActorRoleSchema = z.enum(["human", "agent", "system"]);

export const CapabilitySchema = z.enum([
  "mesh.listen",
  "mesh.discovery",
  "mesh.relay",
  "ui.channel",
  "approval.prompt",
  "message.send",
  "message.store_encrypted",
  "vault.index",
  "vault.retrieve",
  "model.local",
  "model.cloud.request",
  "task.execute",
  "device.sync",
  // Phase 40 — Agent Network Collaboration Layer.
  // Required for any node that mints sub-mandates or publishes chain reports.
  // Workers do not need this capability.
  "chain.orchestrate",
]);

/** Standing delegation postures (EnvoyAI — part of emp/0.1). */
export const EmpPostureSchema = z.enum(["social_proxy", "document_acquisition", "capability_provider", "bond_autonomy"]);

/** Advertised on Agent Card / system.signal when node supports EnvoyAI features. */
export const EmpCapabilitySchema = z.enum([
  "standing-delegation",
  "social-proxy",
  "document-acquisition",
  "agent-network-worker",
  "bond-autonomy",
]);

/**
 * Phase 60 — protocol feature negotiation tags on Agent Card (design §12.2).
 * Optional so older cards remain valid; assigners treat absence as legacy.
 */
export const AgentCardProtocolFeatureSchema = z.enum([
  "worker-lease-v1",
  "chain-attempt-v1",
  "chain-reconcile-v1",
  "chain-provenance-v1",
]);

export type AgentCardProtocolFeature = z.infer<typeof AgentCardProtocolFeatureSchema>;

/** Features this build advertises when Join Agent Network is on. */
export const LOCAL_AGENT_CARD_PROTOCOL_FEATURES: AgentCardProtocolFeature[] = [
  "worker-lease-v1",
  "chain-attempt-v1",
  "chain-reconcile-v1",
  "chain-provenance-v1",
];

/** Agent credential scope values for posture-gated intents. */
export const EMP_AGENT_SCOPE_SOCIAL_PROXY = "emp.social_proxy" as const;
export const EMP_AGENT_SCOPE_DOCUMENT_ACQUISITION = "emp.document_acquisition" as const;
export const EMP_AGENT_SCOPE_CAPABILITY_PROVIDER = "emp.capability_provider" as const;
export const EMP_AGENT_SCOPE_BOND_AUTONOMY = "emp.bond_autonomy" as const;

export const SocialProxyPosturePolicySchema = z.object({
  autoHello: z.boolean().default(false),
  autoChatWithPeerAgents: z.boolean().default(true),
  autoChatWithPeerHumans: z.boolean().default(false),
  maxNewIntrosPerDay: z.number().int().min(0).max(100).default(5),
  requireOwnerCommitmentRefOnBondRequest: z.boolean().default(true),
  helloRequiresApproval: z.boolean().default(true),
  scheduleIntervalHours: z.union([z.literal(0), z.literal(24), z.literal(168)]).default(0),
  /** Phase 23A: auto-sort bonded contacts into circles. */
  autoCircleContacts: z.boolean().default(false),
}).strict();

export const DocumentAcquisitionPosturePolicySchema = z.object({
  searchBondedOnly: z.boolean().default(true),
  /** Max relay hops for network-wide discovery. 0 = bonded-only. */
  maxHops: z.number().int().min(0).max(8).default(0),
  /** Max broadcast responses before stopping (Phase 20). */
  maxBroadcastResults: z.number().int().min(1).max(100).default(10),
  /** Timeout for broadcast responses in milliseconds (Phase 20). */
  broadcastResponseTimeoutMs: z.number().int().min(1000).max(120000).default(30000),
  maxNegotiationRounds: z.number().int().min(1).max(32).default(5),
  /** Sensitivity ceiling for auto-requesting shares (public = only public docs). */
  autoRequestShareUpTo: SensitivitySchema.default("public"),
  autoAcceptInboundShareUpTo: SensitivitySchema.default("friends"),
  maxActiveJobs: z.number().int().min(1).max(16).default(3),
  jobTtlHours: z.number().int().min(1).max(720).default(72),
}).strict();

export const CapabilityProviderPosturePolicySchema = z.object({
  maxActiveJobs: z.number().int().min(1).max(16).default(3),
  jobTtlHours: z.number().int().min(1).max(720).default(72),
  searchBondedOnly: z.boolean().default(true),
  /** Max relay hops for network-wide capability search. 0 = bonded-only. */
  maxHops: z.number().int().min(0).max(8).default(0),
  /** Max broadcast responses before stopping (Phase 21). */
  maxBroadcastResults: z.number().int().min(1).max(100).default(10),
  /** Timeout for broadcast responses in milliseconds (Phase 21). */
  broadcastResponseTimeoutMs: z.number().int().min(1000).max(120000).default(30000),
  /** Whether to allow unbonded peers to execute tasks (narrow scope). */
  allowUnbondedTaskExecution: z.boolean().default(false),
  /** Phase 24C: minimum reputation score for unbonded providers. */
  minReputationScore: z.number().min(0).max(1).default(0),
}).strict();

/** Federated RAG configuration (Phase 22) — agent queries bonded peers' published knowledge. */
export const FederatedRagConfigSchema = z.object({
  enabled: z.boolean().default(false),
  maxPeers: z.number().int().min(1).max(16).default(5),
  queryTimeoutMs: z.number().int().min(1000).max(60000).default(15000),
  maxSensitivity: SensitivitySchema.default("public"),
  /** Whether to include unbonded (but discovered) peers in query. */
  includeUnbondedPeers: z.boolean().default(false),
  /** Max results to return from peer queries before synthesizing. */
  maxPeerResults: z.number().int().min(1).max(50).default(10),
}).strict();

/** Bond autonomy posture policy — bounds agent-driven bond acceptance (Phase 19). */
export const BondAutonomyPosturePolicySchema = z.object({
  /** Maximum auto-accepted bonds per day (0 = no limit beyond mandate expiry). */
  maxAutoBondsPerDay: z.number().int().min(0).max(100).default(5),
  /** Require a referral proof (intro correlation) before auto-accepting. */
  requireReferralProof: z.boolean().default(true),
  /** Maximum bond tier the agent may auto-accept (direct = bonded, referred = trust-mode intro). */
  maxAutoBondTier: z.enum(["referred", "direct"]).default("direct"),
  /** Minimum trust-mode overlap score (0.0–1.0) for auto-accept. */
  minTrustOverlapScore: z.number().min(0).max(1).default(0.3),
  /** Whether auto-accepted bonds require post-facto owner notification. Default: true. */
  notifyOwnerOnAutoBond: z.boolean().default(true),
}).strict();

export const PosturePolicySchema = z.union([
  BondAutonomyPosturePolicySchema,
  CapabilityProviderPosturePolicySchema,
  DocumentAcquisitionPosturePolicySchema,
  SocialProxyPosturePolicySchema,
]);

export const PublicIdentitySchema = z.object({
  id: z.string().min(1),
  publicKeyPem: z.string().min(1),
});

export const UnsignedDeviceCertificateSchema = z.object({
  version: z.literal("0.1"),
  certificateId: z.string().min(1),
  ownerId: z.string().min(1),
  deviceId: z.string().min(1),
  devicePublicKeyPem: z.string().min(1),
  deviceProfile: DeviceProfileSchema,
  capabilities: z.array(CapabilitySchema).min(1),
  issuedAt: z.string().datetime(),
  expiresAt: z.string().datetime().nullable(),
});

export const DeviceCertificateSchema = UnsignedDeviceCertificateSchema.extend({
  signature: z.string().min(1),
});

export const DeviceRevocationReasonSchema = z.enum([
  "lost",
  "compromised",
  "rotated",
  "retired",
  "policy_violation",
  // The device record was a duplicate of another record; revoked as
  // part of an authorized-devices merge. Not a real compromise —
  // just a historical bookkeeping cleanup.
  "deduplicated",
]);

export const UnsignedDeviceRevocationRecordSchema = z.object({
  version: z.literal("0.1"),
  revocationId: z.string().min(1),
  ownerId: z.string().min(1),
  deviceId: z.string().min(1),
  certificateId: z.string().min(1).optional(),
  reason: DeviceRevocationReasonSchema,
  revokedAt: z.string().datetime(),
});

export const DeviceRevocationRecordSchema = UnsignedDeviceRevocationRecordSchema.extend({
  signature: z.string().min(1),
});

/**
 * AgentCredential links an AI agent to its owner.
 * The agent has its own key pair and peer ID, but is authorized by the owner's signature.
 * Peers can verify: "This agent is authorized by envoy:owner:XXX"
 */
export const UnsignedAgentCredentialSchema = z.object({
  version: z.literal("0.1"),
  credentialId: z.string().min(1),
  ownerId: z.string().min(1),
  /** Owner public key used to verify the owner signature without an out-of-band lookup. */
  ownerPublicKeyPem: z.string().min(1),
  agentId: z.string().min(1),
  agentPeerId: z.string().min(1),
  agentPublicKeyPem: z.string().min(1),
  /** Intents the agent is allowed to send on behalf of the owner */
  scope: z.array(z.string().min(1)).min(1),
  issuedAt: z.string().datetime(),
  expiresAt: z.string().datetime().nullable(),
});

export const AgentCredentialSchema = UnsignedAgentCredentialSchema.extend({
  signature: z.string().min(1),
});

// ============================================
// Fleet Manifest (Fleet Onboarding B)
// ============================================

/**
 * A `FleetManifest` is an owner-signed roster of every device in a fleet.
 * An operator who already knows all member public keys (e.g. provisioned out of
 * band) can upload one manifest; the receiving node walks the roster and
 * pre-stages trust + peer-directory entries so the joiners can be auto-accepted
 * on first contact.
 *
 * The manifest is single-use: importing it once and re-importing the same
 * `manifestId` is a no-op. Revocation happens by trusting the joiner with a
 * lower level, not by changing the manifest.
 */
export const FleetMemberTrustLevelSchema = z.enum([
  "direct",
  "referred",
  "public",
  "blocked",
]);

export const FleetMemberSchema = z.object({
  /** env-owner id of the member. */
  ownerId: z.string().min(1).max(256),
  /** Stable device id. */
  deviceId: z.string().min(1).max(256),
  /** PEM-encoded Ed25519 public key of the device. Used to derive the libp2p peer id. */
  devicePublicKeyPem: z.string().min(1),
  /** Free-form role label (e.g. "operator", "agent", "satellite", "router"). */
  role: z.string().min(1).max(64),
  /** Trust level the manifest asks the issuer to apply on the joiner's behalf. */
  trustLevel: FleetMemberTrustLevelSchema,
  /** Optional human-readable display name. */
  displayName: z.string().max(128).optional(),
  /** Optional pre-shared note stored on the trust record. */
  note: z.string().max(256).optional(),
});

export const UnsignedFleetManifestSchema = z.object({
  version: z.literal("0.1"),
  manifestId: z.string().min(1).max(128),
  /** Owner id of the issuer. Must match `deriveOwnerId(issuerOwnerPublicKeyPem)`. */
  issuerOwnerId: z.string().min(1).max(256),
  /** PEM-encoded public key of the issuer's owner key (so verifiers can check the signature). */
  issuerOwnerPublicKeyPem: z.string().min(1),
  /** Free-form label (e.g. "Acme Corp — Q3 onboarding"). */
  label: z.string().max(128).optional(),
  issuedAt: z.string().datetime(),
  /**
   * Manifest expiry. Use `null` (not omitted) to mean "never expires".
   * Optional so the wire format is forgiving when a sender omits the field,
   * but `null` is the canonical "no expiry" value and is what the runtime
   * always produces.
   */
  expiresAt: z.string().datetime().nullable().optional(),
  members: z.array(FleetMemberSchema).min(1).max(1024),
  /**
   * When true, the importer auto-enables `capabilityProviderEnabled` so its
   * node joins the Agent Network as a worker. This is the fleet-onboarding
   * "one-click agent network" signal: every node that imports a manifest
   * with this flag becomes a chain worker without a manual toggle.
   * Default: false (omitted = not set).
   */
  autoJoinAgentNetwork: z.boolean().optional(),
});

export const FleetManifestSchema = UnsignedFleetManifestSchema.extend({
  signature: z.string().min(1),
});

export type FleetMember = z.infer<typeof FleetMemberSchema>;
export type FleetMemberTrustLevel = z.infer<typeof FleetMemberTrustLevelSchema>;
export type UnsignedFleetManifest = z.infer<typeof UnsignedFleetManifestSchema>;
export type FleetManifest = z.infer<typeof FleetManifestSchema>;

export function fleetManifestForSigning(manifest: FleetManifest): UnsignedFleetManifest {
  const { signature: _signature, ...unsigned } = manifest;
  return unsigned;
}

// ============================================
// DHT Capability Topic Record
// ============================================

/**
 * Unsigned capability topic record — signed and embedded in DHT provider multiaddr query params.
 * The signed version is verified by queriers before attempting a dial.
 */
export const UnsignedCapabilityTopicRecordSchema = z.object({
  topic: z.string().min(1),
  peerId: z.string().min(1),
  multiaddr: z.string().min(1),
  createdAt: z.string().datetime(),
  ttlSeconds: z.number().int().min(1),
  org: z.string().optional(),
  net: z.string().optional(),
  ver: z.string().optional(),
});

export const SignedCapabilityTopicRecordSchema = UnsignedCapabilityTopicRecordSchema.extend({
  /** base64url-encoded Ed25519 signature over canonical JSON of the unsigned fields */
  signature: z.string().min(1),
});

export type UnsignedCapabilityTopicRecord = z.infer<typeof UnsignedCapabilityTopicRecordSchema>;
export type SignedCapabilityTopicRecord = z.infer<typeof SignedCapabilityTopicRecordSchema>;

const EnvoyEnvelopeObjectSchema = z.object({
  version: z.literal("0.1"),
  messageId: z.string().min(1),
  correlationId: z.string().min(1).optional(),
  createdAt: z.string().datetime(),
  senderPeerId: z.string().min(1),
  senderPublicKey: z.string().min(1),
  senderRole: EnvoyActorRoleSchema,
  recipientPeerId: z.string().min(1).optional(),
  recipientRole: EnvoyActorRoleSchema,
  intent: EnvoyIntentSchema,
  payload: z.unknown(),
  /** Agent credential, required when senderRole is "agent" */
  agentCredential: AgentCredentialSchema.optional(),
  /** Links automated traffic to an active standing mandate id (EnvoyAI). */
  postureRef: z.string().min(1).optional(),
  signature: z.string().min(1),
});

export const EnvoyEnvelopeSchema = EnvoyEnvelopeObjectSchema.superRefine(envelopeRoleRefinement);

export const UnsignedEnvoyEnvelopeSchema = EnvoyEnvelopeObjectSchema.omit({
  signature: true,
}).superRefine(envelopeRoleRefinement);

export const SystemPingPayloadSchema = z.object({
  nonce: z.string().min(1),
  message: z.string().max(512).optional(),
});

export const SystemSignalPayloadSchema = z.object({
  ownerId: z.string().min(1),
  ownerPublicKeyPem: z.string().min(1),
  deviceId: z.string().min(1),
  deviceCertificate: DeviceCertificateSchema,
  deviceProfile: DeviceProfileSchema,
  capabilities: z.array(CapabilitySchema).min(1),
  supportedProtocolVersions: z.array(z.string().min(1)).min(1),
  /** Optional EnvoyAI capability flags under emp/0.1. */
  supportedCapabilities: z.array(EmpCapabilitySchema).default([]),
  listenAddrs: z.array(z.string().min(1)).default([]),
  publicTopics: z.array(z.string().min(1)).default([]),
  status: z.enum(["online", "away", "busy"]).default("online"),
});



export const DevicePairRequestPayloadSchema = z.object({
  requestId: z.string().min(1),
  requesterOwnerId: z.string().min(1),
  requesterDeviceId: z.string().min(1),
  requesterDevicePublicKeyPem: z.string().min(1),
  requestedDeviceProfile: DeviceProfileSchema.default("satellite"),
  requestedCapabilities: z.array(CapabilitySchema).default(["ui.channel", "message.send"]),
  note: z.string().min(1).max(1000).optional(),
  createdAt: z.string().datetime(),
  /** When set, home node may auto-accept if this matches the latest token from `getPairingPayload`. */
  pairingToken: z.string().min(1).optional(),
  /**
   * @deprecated Prefer {@link lanFleetTokenProof}. Legacy plaintext fleet
   * secret — accepted only for older peers; never send from current nodes.
   */
  lanFleetToken: z.string().min(1).max(256).optional(),
  /**
   * Phase 35C — HMAC proof of the shared fleet token, bound to requester
   * identity + requestId so a sniffed proof cannot be replayed as another peer.
   * Format: `v1.` + base64url(HMAC-SHA256(token, binding)).
   */
  lanFleetTokenProof: z.string().min(1).max(128).optional(),
});

export const DevicePairApprovePayloadSchema = z.object({
  requestId: z.string().min(1),
  approvalId: z.string().min(1).optional(),
  deviceCertificate: DeviceCertificateSchema,
  approvedAt: z.string().datetime(),
});

export const DevicePairDeferredPayloadSchema = z.object({
  requestId: z.string().min(1),
  reason: z.string().min(1).max(1000),
  deferredByDeviceId: z.string().min(1).optional(),
  createdAt: z.string().datetime(),
});

export const AuthChallengePayloadSchema = z.object({
  challengeId: z.string().min(1),
  nonce: z.string().min(1),
  challengerOwnerId: z.string().min(1).optional(),
  challengerDeviceId: z.string().min(1).optional(),
  targetOwnerId: z.string().min(1).optional(),
  targetDeviceId: z.string().min(1).optional(),
  requestedIntent: EnvoyIntentSchema.optional(),
  expiresAt: z.string().datetime(),
});

export const AuthChallengeProofSchema = z.object({
  challengeId: z.string().min(1),
  nonce: z.string().min(1),
  responderOwnerId: z.string().min(1),
  responderDeviceId: z.string().min(1),
});

export const AuthChallengeResponsePayloadSchema = AuthChallengeProofSchema.extend({
  ownerPublicKeyPem: z.string().min(1),
  deviceCertificate: DeviceCertificateSchema,
  proof: z.string().min(1),
});

export const TrustPolicySummarySchema = z.object({
  acceptsDirectBondRequests: z.boolean().default(false),
  acceptsReferralRequests: z.boolean().default(true),
  requiresHumanApprovalForRawFiles: z.boolean().default(true),
});

export const AgentCardSchema = z.object({
  version: z.literal("0.1"),
  ownerId: z.string().min(1),
  displayName: z.string().min(1).max(120),
  nodeProfile: DeviceProfileSchema,
  /** Membership tags (opt-in / can-execute). Not specialty skills — see agentNetworkProfile.skills. */
  membership: z.array(z.string().min(1)).min(1),
  publicTopics: z.array(z.string().min(1)).default([]),
  trustPolicySummary: TrustPolicySummarySchema,
  supportedProtocolVersions: z.array(z.string().min(1)).min(1),
  /** Phase 45D — canonical root URL for this owner's web content (envoy://…). */
  webContentRoot: z.string().min(1).optional(),
  /**
   * Agent Network worker profile (owner-attested). Advertised when the peer
   * has opted into Join Agent Network; used for scored worker selection.
   */
  agentNetworkProfile: AgentNetworkProfileSchema.optional(),
  /**
   * Phase 60 — protocol feature negotiation (leases, provenance, reconcile…).
   * Absent on legacy cards; assigners fall back to ready-probe / grace paths.
   */
  features: z.array(AgentCardProtocolFeatureSchema).optional(),
});

export const AgentCardRequestPayloadSchema = z.object({
  requesterOwnerId: z.string().min(1).optional(),
  requesterDeviceId: z.string().min(1).optional(),
  requestedTopics: z.array(z.string().min(1)).default([]),
  requestedCapabilities: z.array(z.string().min(1)).default([]),
});

export const AgentCardResponsePayloadSchema = z.object({
  card: AgentCardSchema,
});

// ============================================
// Rendezvous Capability Schemas (used by HumanProfile)
// ============================================

/**
 * Simple tag capability - just a string identifier
 */
export const SimpleTagCapabilitySchema = z.object({
  tag: z.string().min(1),
});

/**
 * Structured capability with type and optional params
 */
export const StructuredCapabilitySchema = z.object({
  type: z.string().min(1),
  params: z.record(z.string(), z.unknown()).optional(),
  confidence: z.number().min(0).max(1).optional(),
});

/**
 * Descriptor capability for future semantic matching
 */
export const DescriptorCapabilitySchema = z.object({
  descriptor: z.string().min(1),
});

/**
 * Union of all capability types for registry
 */
export const CapabilityUnionSchema = z.union([
  SimpleTagCapabilitySchema,
  StructuredCapabilitySchema,
  DescriptorCapabilitySchema,
]);

export type CapabilityUnion = z.infer<typeof CapabilityUnionSchema>;

/**
 * Human profile fields that can be updated after initial setup.
 * Signed by the owner key so recipients can verify authenticity.
 */
export const ProfilePhotoMimeSchema = z.enum(["image/jpeg", "image/png", "image/webp"]);

export const ProfilePhotoRefSchema = z.object({
  vaultRelativePath: z
    .string()
    .min(1)
    .max(256)
    .regex(/^profile\/(thumbnail\.[a-z]+|gallery\/[a-zA-Z0-9_-]+\.[a-z]+)$/),
  contentSha256: z.string().regex(/^[a-f0-9]{64}$/i),
  mimeType: ProfilePhotoMimeSchema,
});

export const ProfileGalleryPhotoVisibilitySchema = z.enum(["public", "referred", "direct"]);

export const ProfileGalleryPhotoSchema = ProfilePhotoRefSchema.extend({
  photoId: z.string().min(1).max(64),
  label: z.string().max(80).optional(),
  visibility: ProfileGalleryPhotoVisibilitySchema,
});

/** Owner-controlled discoverability granularity for geo DHT topics. */
export const DiscoveryLocationPrecisionSchema = z.enum([
  "hidden",
  "country",
  "region",
  "city",
  "town",
  "nearby",
]);

export type DiscoveryLocationPrecision = z.infer<typeof DiscoveryLocationPrecisionSchema>;

/** Signed profile location — admin divisions + optional geohash (never raw lat/lng). */
export const DiscoveryLocationSchema = z.object({
  countryCode: z
    .string()
    .length(2)
    .regex(/^[A-Z]{2}$/),
  regionCode: z.string().min(1).max(16).optional(),
  city: z.string().min(1).max(80).optional(),
  town: z.string().min(1).max(80).optional(),
  geohash: z
    .string()
    .min(4)
    .max(12)
    .regex(/^[0-9b-hjkmnp-z]+$/i)
    .optional(),
});

export type DiscoveryLocation = z.infer<typeof DiscoveryLocationSchema>;

export const HumanProfilePayloadSchema = z.object({
  version: z.literal("0.1"),
  ownerId: z.string().min(1),
  displayName: z.string().min(1).max(120),
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/),
  bio: z.string().max(500).optional(),
  gender: z.string().max(40).optional(),
  hobbies: z.array(z.string().min(1).max(50)).max(20).optional(),
  knowledge: z.array(z.string().min(1).max(100)).max(50).optional(),
  // profileVisibility is part of the signed material. Required: Zod 4's
  // .default() injects the value during parse, which changes the canonical
  // JSON and breaks the signature. Callers must set this explicitly.
  profileVisibility: z.enum(["public", "private"]),
  /** Always public when set — small avatar for discovery and contacts. */
  publicThumbnail: ProfilePhotoRefSchema.optional(),
  /** Additional photos; visibility per entry. */
  galleryPhotos: z.array(ProfileGalleryPhotoSchema).max(12).optional(),
  /** Optional place metadata for geo-scoped DHT discovery (see Phase 17). */
  discoveryLocation: DiscoveryLocationSchema.optional(),
  /**
   * Optional so legacy senders that don't include it still parse. When the
   * field is absent, callers should treat it as "hidden" (the default
   * consumers want). Crucially, no `.default("hidden")` here — Zod 4 would
   * otherwise inject the value during parse and break the signature.
   */
  discoveryLocationPrecision: DiscoveryLocationPrecisionSchema.optional(),
  // Rendezvous capabilities for peer discovery
  capabilities: z.array(CapabilityUnionSchema).max(20).optional(),
  updatedAt: z.string().datetime(),
  signature: z.string().min(1),
});

export type ProfilePhotoRef = z.infer<typeof ProfilePhotoRefSchema>;
export type ProfileGalleryPhoto = z.infer<typeof ProfileGalleryPhotoSchema>;
export type ProfileGalleryPhotoVisibility = z.infer<typeof ProfileGalleryPhotoVisibilitySchema>;

export type HumanProfilePayload = z.infer<typeof HumanProfilePayloadSchema>;

export interface CreateHumanProfilePayloadInput {
  ownerId: string;
  displayName: string;
  username: string;
  bio?: string;
  gender?: string;
  hobbies?: string[];
  knowledge?: string[];
  profileVisibility?: "public" | "private";
  publicThumbnail?: z.infer<typeof ProfilePhotoRefSchema>;
  galleryPhotos?: z.infer<typeof ProfileGalleryPhotoSchema>[];
  discoveryLocation?: DiscoveryLocation;
  discoveryLocationPrecision?: DiscoveryLocationPrecision;
  capabilities?: Array<{ tag: string } | { type: string; params?: Record<string, unknown>; confidence?: number } | { descriptor: string }>;
  ownerPrivateKeyPem: string;
}

/**
 * Build a {@link HumanProfilePayload} (unsigned) from user input.
 *
 * Returns the **unsigned** shape — the caller must sign via
 * {@link signHumanProfile} from `@envoymesh/identity` or
 * `@envoymesh/mobile-identity` to produce a usable payload. This avoids the
 * footgun where downstream callers stored a `signature: ""` placeholder and
 * the verification step silently failed.
 */
export function createHumanProfilePayload(
  input: CreateHumanProfilePayloadInput,
): Omit<HumanProfilePayload, "signature"> {
  const { ownerPrivateKeyPem: _ignored, ...rest } = input;
  void _ignored;
  return {
    version: "0.1",
    ownerId: input.ownerId,
    displayName: input.displayName.trim(),
    username: input.username.trim(),
    bio: input.bio?.trim(),
    gender: input.gender?.trim(),
    hobbies: input.hobbies,
    knowledge: input.knowledge,
    profileVisibility: input.profileVisibility ?? "private",
    publicThumbnail: input.publicThumbnail,
    galleryPhotos: input.galleryPhotos,
    discoveryLocation: input.discoveryLocation,
    discoveryLocationPrecision: input.discoveryLocationPrecision ?? "hidden",
    capabilities: input.capabilities,
    updatedAt: new Date().toISOString(),
  };
}

export function humanProfileForSigning(payload: HumanProfilePayload): Omit<HumanProfilePayload, "signature"> {
  const { signature: _signature, ...unsigned } = payload;
  return unsigned;
}

/** Purpose tag for tiered disclosure (Trust mode); signed by owner key like full HumanProfile. */
export const HumanProfileFragmentPurposeSchema = z.enum(["discovery-card", "trust-mode-intro"]);

export const HumanProfileFragmentPayloadSchema = z.object({
  version: z.literal("0.1"),
  ownerId: z.string().min(1),
  purpose: HumanProfileFragmentPurposeSchema,
  expiresAt: z.string().datetime(),
  displayName: z.string().min(1).max(120).optional(),
  bio: z.string().max(500).optional(),
  hobbies: z.array(z.string().min(1).max(50)).max(10).optional(),
  tags: z.array(z.string().min(1).max(64)).max(20).optional(),
  /** Copy of owner public thumbnail (always public). */
  publicThumbnail: ProfilePhotoRefSchema.optional(),
  signature: z.string().min(1),
});

export type HumanProfileFragmentPayload = z.infer<typeof HumanProfileFragmentPayloadSchema>;

export function humanProfileFragmentForSigning(
  payload: HumanProfileFragmentPayload,
): Omit<HumanProfileFragmentPayload, "signature"> {
  const { signature: _signature, ...unsigned } = payload;
  return unsigned;
}

/** Owner-signed friend-matching criteria (Trust mode Phase F); canonical-signed like HumanProfile. */
export const FRIEND_MATCHING_PREFERENCES_TEXT_MAX = 4096;

export const FriendMatchingPreferencesPayloadSchema = z.object({
  version: z.literal("0.1"),
  ownerId: z.string().min(1),
  text: z.string().min(1).max(FRIEND_MATCHING_PREFERENCES_TEXT_MAX),
  /** Optional geography for Trust-mode matching (Phase 17C). Overrides profile location when set. */
  matchingLocation: DiscoveryLocationSchema.optional(),
  matchingLocationScope: z.enum(["country", "region", "city", "town", "nearby"]).optional(),
  expiresAt: z.string().datetime(),
  signature: z.string().min(1),
});

export type FriendMatchingPreferencesPayload = z.infer<typeof FriendMatchingPreferencesPayloadSchema>;

export function friendMatchingPreferencesForSigning(
  payload: FriendMatchingPreferencesPayload,
): Omit<FriendMatchingPreferencesPayload, "signature"> {
  const { signature: _signature, ...unsigned } = payload;
  return unsigned;
}

/** First-class EMP payload for `knowledge.query` (vault-backed retrieval is still mock/offline in node). */
export const KnowledgeQueryPayloadSchema = z.object({
  query: z.string().min(1).max(4096),
  requestedSensitivity: SensitivitySchema.optional(),
});

/** First-class EMP payload for `knowledge.response`. */
export const KnowledgeResponsePayloadSchema = z.object({
  inReplyTo: z.string(), // messageId of the originating knowledge.query
  answer: z.string().max(32768),
  sensitivity: SensitivitySchema.default("public"),
  matchScore: z.number().min(0).max(1).optional(),
  /** Vault-relative path when responder identifies a published library item (document acquisition interop). */
  suggestedRelativePath: z.string().min(1).max(512).optional(),
  refused: z.boolean().optional().default(false),
  refusalReason: z.string().max(500).optional(),
});

/**
 * Phase 45 — `library.read` request payload.
 *
 * A peer asks the serving node for raw content by URL path. This is the
 * pull-based analog of the published-library discovery metadata: discovery
 * returns *what* a node has; `library.read` returns the *bytes*.
 *
 * Visibility is server-enforced (per-item flags in web-content.json mapped
 * to Bonds sensitivity tiers) — there is intentionally NO token/credential
 * field here. The requester's signed envelope is the credential.
 *
 * Design: docs/web-content-browsing-design.md §4.4.
 */
export const LibraryReadRangeSchema = z
  .object({
    start: z.number().int().nonnegative(),
    end: z.number().int().nonnegative(),
  })
  .refine((r) => r.start <= r.end, { message: "range start must be <= end" });

export const LibraryReadPayloadSchema = z.object({
  requesterOwnerId: z.string().min(1),
  targetOwnerId: z.string().min(1),
  /**
   * URL path, leading slash stripped, percent-decoded by the requester.
   * Empty string means the site root and resolves to `index.md` on the
   * serving node (Phase 45A directory-index convention).
   */
  path: z.string().max(512),
  /**
   * Optional sensitivity hint (the serving node applies its own ceiling).
   * Web content visibility only maps to public/friends/private (no
   * "trusted" tier — see design doc §4.3.2).
   */
  requestedSensitivity: z.enum(["public", "friends", "private"]).optional(),
  /** Optional byte range, like HTTP Range. Enables large-file chunking. */
  range: LibraryReadRangeSchema.optional(),
  /**
   * Phase 45B — If-None-Match style cache revalidation. When the current
   * etag matches, the server responds with `status: "not_modified"` and
   * no body so the Browser can keep its cached render.
   */
  ifNoneMatch: z.string().min(1).max(128).optional(),
});

/**
 * Phase 45 — `library.read.response` payload.
 *
 * Status discriminator mirrors HTTP semantics: `ok` returns content,
 * `not_found` for missing paths, `forbidden` for trust-gate rejection,
 * `too_large` when the file exceeds the envelope cap without a `range`
 * (includes `byteLength` so the client can issue range requests),
 * `not_modified` when `ifNoneMatch` matched the current etag (45B).
 *
 * When `status === "forbidden"` and a public-tier version of the content
 * exists, `publicRedirection` carries the alt path so the Browser view
 * can offer "view public version".
 */
export const LibraryReadResponseStatusSchema = z.enum([
  "ok",
  "not_found",
  "forbidden",
  "too_large",
  "not_modified",
  // Transport-level error (dial failure, timeout, unexpected reply).
  // Distinct from not_found so the Browser can show "offline" vs
  // "not found" — design §4.7.1.
  "error",
]);

export const LibraryReadResponsePayloadSchema = z.object({
  inReplyTo: z.string().min(1),
  status: LibraryReadResponseStatusSchema,
  /** UTF-8 text for text content, base64 for binary. Present when `status === "ok"`. */
  body: z.string().optional(),
  /** MIME type (e.g. "text/markdown", "image/jpeg", "application/pdf"). */
  contentType: z.string().optional(),
  /** sha256 of the full resource bytes (not a range slice). Browser verifies assembled bodies. */
  contentHash: z.string().optional(),
  byteLength: z.number().int().nonnegative().optional(),
  /** Hash prefix for cache revalidation (ETag equivalent). */
  etag: z.string().optional(),
  /** Present when responding to a `range` request. */
  range: z
    .object({
      start: z.number().int().nonnegative(),
      end: z.number().int().nonnegative(),
      total: z.number().int().nonnegative(),
    })
    .optional(),
  /** Alt path with public-tier content when access was forbidden but a public version exists. */
  publicRedirection: z.string().optional(),
});

/**
 * Phase 45E — `feed.notify` payload.
 *
 * Publisher pushes a small metadata envelope to eligible bonded contacts after
 * a successful web-content publish. Recipients open via `library.read` on `url`.
 * No body bytes — push is notify-only.
 *
 * Design: docs/web-content-browsing-design.md §7.5.
 */
export const FeedNotifyPayloadSchema = z.object({
  publisherOwnerId: z.string().min(1),
  publishedAt: z.string().min(1),
  title: z.string().min(1).max(500),
  /** Absolute envoy:// URL for the published item. */
  url: z.string().min(1).max(2048),
  kind: z.enum(["article", "note", "photo", "gallery", "file", "profile", "section", "feed"]),
  visibility: z.enum(["public", "bonded", "contacts", "private"]),
  summary: z.string().max(2000).optional(),
  /** Free-form tags; used for interest-overlap filtering (45E Slice B). */
  tags: z.array(z.string().min(1).max(64)).max(32).optional(),
  contentHash: z.string().min(1).max(128).optional(),
  /** Optional listing/index URL (blog index, photo wall). */
  listingUrl: z.string().min(1).max(2048).optional(),
  /** Feed Moments image URLs (`envoy://…/feeds/media/…`) — notify-only, no bytes. */
  imageUrls: z.array(z.string().min(1).max(2048)).max(9).optional(),
});

/**
 * Feed/Blog engagement — star toggle, comment, or snapshot pull.
 * Author node is source of truth; readers pull via action `get`.
 */
export const FeedEngagePayloadSchema = z.object({
  url: z.string().min(1).max(2048),
  action: z.enum(["star", "unstar", "comment", "uncomment", "get", "snapshot"]),
  /** Required for action `comment`. */
  text: z.string().min(1).max(280).optional(),
  /** Required for action `uncomment`. */
  commentId: z.string().min(1).max(128).optional(),
  /** Actor owner id (must match verified sender for mutating actions). */
  actorOwnerId: z.string().min(1).optional(),
  /** Snapshot fields (action `snapshot`). */
  starOwnerIds: z.array(z.string().min(1)).max(500).optional(),
  comments: z
    .array(
      z.object({
        id: z.string().min(1),
        authorOwnerId: z.string().min(1),
        text: z.string().min(1).max(280),
        createdAt: z.string().min(1),
      }),
    )
    .max(100)
    .optional(),
});

/**
 * `share.preview` — safe preview of content available for sharing.
 * Contains only a descriptive summary, not raw vault content.
 * The responder sends this after evaluating policy; the requester can then
 * send `share.accept` to receive the actual content via `knowledge.response`
 * or `/envoymesh/data/0.1.0`.
 */
export const SharePreviewPayloadSchema = z.object({
  inReplyTo: z.string(), // messageId of the originating share.request
  /** Human-readable description of what sharing would provide. */
  previewText: z.string().max(500),
  /** Sensitivity level of the content that would be shared. */
  sensitivity: SensitivitySchema.default("public"),
  /** Whether the full share requires owner approval (e.g. private sensitivity or file transfer). */
  requiresApproval: z.boolean().default(false),
  /** Optional hint about what format the content is in (e.g. "text answer", "file: research.pdf"). */
  contentHint: z.string().max(200).optional(),
  /** If true, the full share would go through /envoymesh/data/0.1.0 (file transfer). */
  isFileTransfer: z.boolean().default(false),
  /** Refused preview reason, if preview was denied. */
  refused: z.boolean().optional().default(false),
  refusalReason: z.string().max(300).optional(),
});

export type SharePreviewPayload = z.infer<typeof SharePreviewPayloadSchema>;

/**
 * `share.request` — request a safe preview of content before accepting a full share.
 * The requester indicates what they want (query, capability, or file reference).
 */
export const ShareRequestPayloadSchema = z.object({
  /** What is being requested: a knowledge query or a reference to shared vault content. */
  requestType: z.enum(["knowledge", "file"]),
  /** For knowledge requests: the query string. */
  query: z.string().max(4096).optional(),
  /** For file requests: the vault-relative path being requested. */
  relativePath: z.string().max(500).optional(),
  /** Requested sensitivity level. */
  requestedSensitivity: SensitivitySchema.default("public"),
  /** Correlation ID linking this request to a discovery match. */
  correlationId: z.string().optional(),
  /**
   * `responder` (default): `relativePath` is in the **receiver's** vault (pull).
   * `sender`: `relativePath` is in the **sender's** vault (push offer); receiver previews without a local file.
   */
  fileOrigin: z.enum(["responder", "sender"]).default("responder"),
  /** `chat`: deliver inline in a chat thread (direct bonds may auto-accept). Default: inbox offer. */
  deliveryChannel: z.enum(["inbox", "chat", "agent"]).default("inbox"),
  /** When set, completed file transfer updates this group message attachment. */
  chatRoomId: z.string().uuid().optional(),
  chatMessageId: z.string().uuid().optional(),
  chatAttachmentId: z.string().uuid().optional(),
});

export type ShareRequestPayload = z.infer<typeof ShareRequestPayloadSchema>;

/**
 * `share.accept` — explicit acceptance to receive the full content after reviewing a preview.
 * Triggers the actual share: knowledge.response or /envoymesh/data/0.1.0 transfer.
 */
export const ShareAcceptPayloadSchema = z.object({
  inReplyTo: z.string(), // messageId of the originating share.preview
  /** Acknowledge the preview and accept the share. */
  accept: z.boolean().default(true),
});

export type ShareAcceptPayload = z.infer<typeof ShareAcceptPayloadSchema>;

export const BondRequestedLevelSchema = z.enum(["direct", "referred"]);

/** `bond.request` — ask for a trust relationship; optional proof-of-context for policy / owner review. */
export const BondRequestPayloadSchema = z.object({
  requesterOwnerId: z.string().min(1),
  requesterDisplayName: z.string().min(1).max(120).optional(),
  message: z.string().max(1024).optional(),
  proofOfContext: z.string().max(4096).optional(),
  requestedLevel: BondRequestedLevelSchema.default("direct"),
  /** Links this bond handshake to a Trust-mode intro thread (same id may appear as envelope correlationId). */
  introCorrelationId: z.string().min(1).max(128).optional(),
  /** Opaque handle proving owner reviewed an intro (e.g. approval-queue id); verified locally/product-layer. */
  ownerCommitmentRef: z.string().min(1).max(256).optional(),
});

/** Agent→agent coordination for Trust-mode intros (non-binding). */
export const SocialIntroInterestSchema = z.enum([
  "explore",
  "decline",
  "request-human-review",
  "withdraw",
]);

export const SocialIntroSyncPayloadSchema = z.object({
  introCorrelationId: z.string().min(1),
  ownerId: z.string().min(1),
  counterpartyOwnerIdHint: z.string().min(1).optional(),
  profileFragmentRefs: z.array(z.string().min(1)).max(16).default([]),
  interest: SocialIntroInterestSchema,
  noteToCounterpartyAgent: z.string().max(1024).optional(),
});

/** Agent→human: candidate intro with owner-signed fragment or opaque ref (Trust mode). */
export const SocialIntroProposePayloadSchema = z
  .object({
    introCorrelationId: z.string().min(1),
    candidateOwnerId: z.string().min(1),
    candidatePeerId: z.string().min(1),
    profileFragment: HumanProfileFragmentPayloadSchema.optional(),
    profileFragmentRef: z.string().min(1).max(256).optional(),
    rationale: z.string().max(2048).optional(),
  })
  .refine((value) => value.profileFragment !== undefined || value.profileFragmentRef !== undefined, {
    message: "social.intro.propose requires profileFragment or profileFragmentRef",
  });

/** Human→human or human→agent: owner readiness before emitting bond.request (envelope signature covers payload). */
export const SocialIntroOwnerReadyPayloadSchema = z.object({
  introCorrelationId: z.string().min(1),
  ownerId: z.string().min(1),
  nonce: z.string().min(1),
  expiresAt: z.string().datetime(),
});

export type SocialIntroSyncPayload = z.infer<typeof SocialIntroSyncPayloadSchema>;
export type SocialIntroProposePayload = z.infer<typeof SocialIntroProposePayloadSchema>;
export type SocialIntroOwnerReadyPayload = z.infer<typeof SocialIntroOwnerReadyPayloadSchema>;

export const BondChallengePayloadSchema = z.object({
  challengeId: z.string().min(1),
  nonce: z.string().min(1),
  challengerOwnerId: z.string().min(1),
  targetOwnerId: z.string().min(1),
  expiresAt: z.string().datetime(),
  message: z.string().max(1024).optional(),
});

export const BondChallengeResponsePayloadSchema = z.object({
  challengeId: z.string().min(1),
  nonce: z.string().min(1),
  responderOwnerId: z.string().min(1),
  decision: z.enum(["accept", "reject"]),
  proofOfContext: z.string().max(4096).optional(),
  note: z.string().max(512).optional(),
});

/** `bond.accept` — confirmation that the receiver accepted a bond request */
export const BondAcceptPayloadSchema = z.object({
  responderOwnerId: z.string().min(1),
  requesterOwnerId: z.string().min(1),
  message: z.string().max(1024).optional(),
});

export type BondAcceptPayload = z.infer<typeof BondAcceptPayloadSchema>;

export interface CreateBondAcceptPayloadInput {
  responderOwnerId: string;
  requesterOwnerId: string;
  message?: string;
}

export function createBondAcceptPayload(input: CreateBondAcceptPayloadInput): BondAcceptPayload {
  return BondAcceptPayloadSchema.parse({
    responderOwnerId: input.responderOwnerId,
    requesterOwnerId: input.requesterOwnerId,
    message: input.message,
  });
}

export function parseBondAcceptPayload(input: unknown): BondAcceptPayload {
  return BondAcceptPayloadSchema.parse(input);
}

/** Inline thumbnail bytes for `profile.sync` (vault path on profile is verified via sha256). */
export const ProfileThumbnailInlineSchema = z.object({
  contentBase64: z.string().min(1),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  contentSha256: z.string().min(1),
});

export type ProfileThumbnailInline = z.infer<typeof ProfileThumbnailInlineSchema>;

/** Owner-signed profile broadcast to bonded peers (`profile.sync` / `profile.response`). */
export const ProfileSyncPayloadSchema = z.object({
  profile: HumanProfilePayloadSchema,
  publicThumbnailInline: ProfileThumbnailInlineSchema.optional(),
  /** Lets recipients verify the profile before any prior `ownerPublicKeyPem` was cached (e.g. from chat). */
  ownerPublicKeyPem: z.string().min(1).optional(),
});

export type ProfileSyncPayload = z.infer<typeof ProfileSyncPayloadSchema>;

export function createProfileSyncPayload(
  profile: HumanProfilePayload,
  publicThumbnailInline?: ProfileThumbnailInline,
  ownerPublicKeyPem?: string,
): ProfileSyncPayload {
  return ProfileSyncPayloadSchema.parse({ profile, publicThumbnailInline, ownerPublicKeyPem });
}

export function parseProfileSyncPayload(input: unknown): ProfileSyncPayload {
  return ProfileSyncPayloadSchema.parse(input);
}

export const ProfileRequestPayloadSchema = z.object({
  requesterOwnerId: z.string().min(1),
});

export type ProfileRequestPayload = z.infer<typeof ProfileRequestPayloadSchema>;

export function createProfileRequestPayload(requesterOwnerId: string): ProfileRequestPayload {
  return ProfileRequestPayloadSchema.parse({ requesterOwnerId });
}

export function parseProfileRequestPayload(input: unknown): ProfileRequestPayload {
  return ProfileRequestPayloadSchema.parse(input);
}

export const DiscoveryReferralAttestationSchema = z.object({
  referralOwnerId: z.string().min(1),
  requestMessageId: z.string().min(1),
  correlationId: z.string().min(1).optional(),
  anonymizedRequesterId: z.string().min(1),
  signature: z.string().min(1),
});

export const DiscoveryRequestPayloadSchema = z
  .object({
    requesterOwnerId: z.string().min(1),
    requestedTagHashes: z.array(z.string().min(1)).default([]),
    requestedCapabilities: z.array(z.string().min(1)).default([]),
    maxResults: z.number().int().min(1).max(20).default(5),
    /** Requested sensitivity level. If absent, defaults to "public". */
    requestedSensitivity: z.enum(["public", "friends", "private"]).optional(),
    /** FS-D: optional substring match on published library title or path (responder-side). */
    fileTitleQuery: z.string().max(200).optional(),
    /** FS-D: prefix match on content hash (base64url) for published documents. */
    requestedContentHashPrefixes: z.array(z.string().min(4).max(128)).max(8).optional(),
    /**
     * Phase 45E — match publishers by web-content tags.
     * Accepts raw tags or canonical `publish:<slug>` topics; responder normalizes.
     */
    requestedPublishTopics: z.array(z.string().min(1).max(128)).max(16).optional(),
    /** Story D (US-MH1): max forward hops including originator tier. Default 1 = direct only. */
    maxHops: z.number().int().min(0).max(4).default(1),
    /** Story D (US-MH1): hops already traversed (0 at originator). */
    currentHop: z.number().int().min(0).max(4).default(0),
    /** Story D (US-MH2): hide original requester from downstream peers when forwarding. */
    forwardPrivacy: z.enum(["none", "anonymous"]).default("none"),
    /** Story D (US-MH2): intermediary owner vouching for anonymous forward tier. */
    referralOwnerId: z.string().min(1).optional(),
    /** Story D (US-MH2+): intermediary-signed proof binding anonymous forward to referral owner. */
    referralAttestation: DiscoveryReferralAttestationSchema.optional(),
  })
  .refine(
    (value) =>
      value.requestedTagHashes.length > 0 ||
      value.requestedCapabilities.length > 0 ||
      Boolean(value.fileTitleQuery?.trim()) ||
      (value.requestedContentHashPrefixes?.length ?? 0) > 0 ||
      (value.requestedPublishTopics?.length ?? 0) > 0,
    "discovery.request requires tag hashes, capabilities, a file title query, content hash prefixes, or publish topics",
  );

/** Max length for optional IPFS CID on published-library discovery matches (F3 inbound guard). */
export const LIBRARY_FILE_MATCH_CID_MAX_LENGTH = 128;

export const LibraryFileMatchSchema = z.object({
  documentId: z.string().min(1),
  title: z.string(),
  relativePath: z.string(),
  contentHash: z.string(),
  byteLength: z.number().int().nonnegative().optional(),
  sensitivity: z.enum(["public", "friends", "private"]).optional(),
  /** Kubo `ipfs add` root CID when the responder has exported this revision (metadata only). */
  cid: z.string().min(1).max(LIBRARY_FILE_MATCH_CID_MAX_LENGTH).optional(),
  // Phase 45 — Web Content Browsing extensions (additive, backward compatible).
  /** Templated site type for UI rendering hints. */
  kind: z.enum(["article", "note", "photo", "gallery", "file", "profile", "section", "feed"]).optional(),
  /** MIME type of the matched content (e.g. "text/markdown", "image/jpeg"). */
  mimeType: z.string().optional(),
  /** Short excerpt for listing displays. */
  summary: z.string().optional(),
  /** Per-item visibility flag from web-content.json manifest. */
  visibility: z.enum(["public", "bonded", "contacts", "private"]).optional(),
  /** Pretty URL slug (defaults to filename when not set in manifest). */
  urlSlug: z.string().optional(),
  /** ISO 8601 timestamp of the last content update. */
  updatedAt: z.string().datetime().optional(),
});

export const DiscoveryMatchSchema = z.object({
  ownerId: z.string().min(1),
  peerId: z.string().min(1),
  matchedTagHashes: z.array(z.string().min(1)).default([]),
  matchedCapabilities: z.array(z.string().min(1)).default([]),
  /** FS-D: metadata-only matches for published vault documents (no bytes transferred). */
  libraryMatches: z.array(LibraryFileMatchSchema).optional(),
  /** Story D: hop distance from original requester (1 = direct bond). */
  hopDistance: z.number().int().min(1).max(4).optional(),
});

/** `sync.state` — small signed CRDT / state deltas between owner devices. */
export const SyncStatePayloadSchema = z.object({
  scope: z.string().min(1).max(64),
  updateBase64: z.string().min(1).max(512_000),
  senderOwnerId: z.string().min(1),
});

export type SyncStatePayload = z.infer<typeof SyncStatePayloadSchema>;

export const DiscoveryResponsePayloadSchema = z.object({
  requestMessageId: z.string().min(1),
  responderOwnerId: z.string().min(1),
  matches: z.array(DiscoveryMatchSchema).default([]),
  truncated: z.boolean().default(false),
  /** Intermediary ack: hop-2 forward approval queued (US-MH4 aggregation UX). */
  forwardPendingAck: z.boolean().default(false),
});

/** `broadcast.request` — one-to-many discovery query sent through a relay. */
export const BroadcastRequestPayloadSchema = z.object({
  /** Unique ID for this broadcast; used for dedup and cancel. */
  queryId: z.string().min(1),
  /**
   * Time-to-live: number of relay hops. Set to 1 for single-relay fanout.
   * Each relay decrements before forwarding; stops at 0.
   */
  ttl: z.number().int().min(0).max(8).default(1),
  /** Maximum responses to collect before terminating. */
  maxResponses: z.number().int().min(1).max(100).default(10),
  /** Topic tag hashes to match. */
  requestedTagHashes: z.array(z.string().min(1)).default([]),
  /** Capabilities to match. */
  requestedCapabilities: z.array(z.string().min(1)).default([]),
  /** Sensitivity floor for the query. */
  requestedSensitivity: z.enum(["public", "friends", "private"]).default("public"),
  /** Owner issuing the broadcast. */
  senderOwnerId: z.string().min(1),
  /** Stop collecting after this many milliseconds. */
  timeoutMs: z.number().int().min(1000).max(300_000).default(30_000),
});

/** `broadcast.response` — a peer's response to a broadcast.request. */
export const BroadcastResponsePayloadSchema = z.object({
  queryId: z.string().min(1),
  responderOwnerId: z.string().min(1),
  responderPeerId: z.string().min(1),
  matchedTagHashes: z.array(z.string().min(1)).default([]),
  matchedCapabilities: z.array(z.string().min(1)).default([]),
  /** Set to true on the last response from this peer. */
  done: z.boolean().default(false),
});

/** `broadcast.cancel` — cancel an in-progress broadcast. */
export const BroadcastCancelPayloadSchema = z.object({
  queryId: z.string().min(1),
  reason: z.string().min(1).default("cancelled"),
});

/** `relay.peers.request` — ask a relay server for peers connected via this relay. */
export const RelayPeersRequestPayloadSchema = z.object({});

/** Info about a peer connected via a relay, returned in `relay.peers.response`. */
export const RelayPeerInfoSchema = z.object({
  peerId: z.string().min(1),
  ownerId: z.string().min(1),
  /** Typically /p2p-circuit addresses allowing dial through the relay. */
  multiaddrs: z.array(z.string().min(1)).default([]),
});

/** `relay.peers.response` — list of peers connected to the same relay as the queried relay. */
export const RelayPeersResponsePayloadSchema = z.object({
  requestMessageId: z.string().min(1),
  peers: z.array(RelayPeerInfoSchema).default([]),
});

export const RelayVisibilitySchema = z.enum(["public", "capability", "bonded", "private"]);

export const RelayAdvertisementSchema = z.object({
  capability: z.string().min(1).optional(),
  topicHash: z.string().min(1).optional(),
  visibility: RelayVisibilitySchema.default("bonded"),
  expiresAt: z.string().datetime().optional(),
}).refine(
  (value) => Boolean(value.capability || value.topicHash),
  "relay advertisement requires capability or topicHash",
);

export const RelayHintSchema = z.object({
  relayId: z.string().min(1),
  level: z.number().int().min(0).max(8).optional(),
  region: z.string().min(1).optional(),
  multiaddrs: z.array(z.string().min(1)).default([]),
  scoreHint: z.number().finite().optional(),
  expiresAt: z.string().datetime().optional(),
});

export const RelayPeerCandidateSchema = z.object({
  peerId: z.string().min(1),
  ownerId: z.string().min(1).optional(),
  displayName: z.string().optional(),
  multiaddrs: z.array(z.string().min(1)).default([]),
  viaRelayId: z.string().min(1).optional(),
  capabilities: z.array(z.string().min(1)).default([]),
  visibility: RelayVisibilitySchema.default("public"),
  expiresAt: z.string().datetime().optional(),
  /**
   * True when this relay currently holds a live circuit-relay-v2 reservation
   * for the candidate (hoppable). Absent/false means checkin-only / unknown.
   */
  hasHopSlot: z.boolean().optional(),
});

export const RelayCheckinPayloadSchema = z.object({
  peerId: z.string().min(1),
  ownerId: z.string().min(1).optional(),
  displayName: z.string().optional(),
  relayReachableAddrs: z.array(z.string().min(1)).default([]),
  capabilities: z.array(z.string().min(1)).default([]),
  advertisements: z.array(RelayAdvertisementSchema).default([]),
  relayHints: z.array(RelayHintSchema).default([]),
  expiresAt: z.string().datetime(),
});

export const RelayLookupPayloadSchema = z
  .object({
    queryId: z.string().min(1),
    targetPeerId: z.string().min(1).optional(),
    targetOwnerId: z.string().min(1).optional(),
    capability: z.string().min(1).optional(),
    topicHash: z.string().min(1).optional(),
    maxResults: z.number().int().min(1).max(100).default(20),
    // maxHops: schema allows up to 8 for future layered-relay work.
    // Phase 46 hard-caps the client at maxHops: 1 (one-hop miss-forward).
    maxHops: z.number().int().min(0).max(8).default(0),
    maxFanout: z.number().int().min(1).max(8).default(2),
    visibilityScope: RelayVisibilitySchema.default("public"),
    expiresAt: z.string().datetime(),
  })
  .refine(
    (value) => Boolean(value.targetPeerId || value.targetOwnerId || value.capability || value.topicHash),
    "relay.lookup requires targetPeerId, targetOwnerId, capability, or topicHash",
  );

export const RelayLookupResponsePayloadSchema = z.object({
  queryId: z.string().min(1),
  peers: z.array(RelayPeerCandidateSchema).default([]),
  relayHints: z.array(RelayHintSchema).default([]),
  truncated: z.boolean().default(false),
  policy: z.string().min(1).optional(),
  expiresAt: z.string().datetime(),
});

export const RelayHintsRequestPayloadSchema = z.object({
  reason: z.enum(["lookup-failed", "dial-failed", "bootstrap", "refresh"]).default("refresh"),
  region: z.string().min(1).optional(),
  maxResults: z.number().int().min(1).max(50).default(10),
  expiresAt: z.string().datetime(),
});

export const RelayHintsResponsePayloadSchema = z.object({
  relayHints: z.array(RelayHintSchema).default([]),
  truncated: z.boolean().default(false),
  expiresAt: z.string().datetime(),
});

export const RelayRelationSchema = z.enum(["parent", "ancestor", "sibling", "child", "candidate"]);
export const RelayBookStateSchema = z.enum(["seed", "candidate", "probing", "verified", "active", "stale", "removed"]);

export const RelayMetadataSchema = z.object({
  relayId: z.string().min(1),
  level: z.number().int().min(0).max(8),
  region: z.string().min(1).optional(),
  publicAddrs: z.array(z.string().min(1)).default([]),
  capacity: z.number().int().positive().optional(),
  relation: RelayRelationSchema.optional(),
  state: RelayBookStateSchema.optional(),
  expiresAt: z.string().datetime(),
});

export const RelayJoinRequestPayloadSchema = z.object({
  relay: RelayMetadataSchema,
  desiredLevel: z.number().int().min(0).max(8).optional(),
  knownRelays: z.array(RelayHintSchema).default([]),
  /** Operator-shared secret; required when joining a community preset relay fleet. */
  joinToken: z.string().min(1).optional(),
});

export const RelayJoinResponsePayloadSchema = z.object({
  accepted: z.boolean(),
  acceptedLevel: z.number().int().min(0).max(8).optional(),
  parents: z.array(RelayHintSchema).default([]),
  ancestors: z.array(RelayHintSchema).default([]),
  siblings: z.array(RelayHintSchema).default([]),
  candidateRelays: z.array(RelayHintSchema).default([]),
  childLimit: z.number().int().min(0).optional(),
  graphEpoch: z.string().min(1).optional(),
  reason: z.string().min(1).optional(),
  expiresAt: z.string().datetime(),
});

export const RelayRegisterPayloadSchema = z.object({
  relay: RelayMetadataSchema,
  requestedRelation: RelayRelationSchema,
  graphEpoch: z.string().min(1).optional(),
});

export const RelayRegisterResponsePayloadSchema = z.object({
  accepted: z.boolean(),
  relation: RelayRelationSchema.optional(),
  state: RelayBookStateSchema.default("verified"),
  reason: z.string().min(1).optional(),
  expiresAt: z.string().datetime(),
});

export const RelaySummaryPayloadSchema = z.object({
  relayId: z.string().min(1),
  level: z.number().int().min(0).max(8),
  region: z.string().min(1).optional(),
  childRelayCount: z.number().int().min(0).default(0),
  livePeerCount: z.number().int().min(0).default(0),
  capabilityBloom: z.string().min(1).optional(),
  topicBuckets: z.array(z.string().min(1)).default([]),
  graphEpoch: z.string().min(1).optional(),
  expiresAt: z.string().datetime(),
});

/**
 * Relay/node `rendezvous.response` replies use these strings so {@link EnvoyEnvelopeSchema} passes;
 * they are not Ed25519 device signatures and clients must not treat them as authenticated.
 */
export const RENDEZVOUS_RESPONSE_PLACEHOLDER_PUBLIC_KEY = "relay:rendezvous-response/unsigned-placeholder";
export const RENDEZVOUS_RESPONSE_PLACEHOLDER_SIGNATURE = "relay:rendezvous-response/unsigned-placeholder";

/**
 * Rendezvous Registration Payload
 * Peers send this to register their capabilities with the rendezvous server
 */
export const RendezvousRegisterPayloadSchema = z.object({
  peerId: z.string().min(1),
  multiaddr: z.string().min(1),
  capabilities: z.array(CapabilityUnionSchema),
  ttlSeconds: z.number().int().min(60).max(86400).default(3600),
});

/**
 * Rendezvous Query Payload
 * Peers send this to find other peers with matching capabilities
 */
export const RendezvousQueryPayloadSchema = z.object({
  match: z.union([
    z.object({
      tag: z.string().min(1),
    }),
    z.object({
      type: z.string().min(1),
      params: z.record(z.string(), z.unknown()).optional(),
    }),
  ]),
  maxResults: z.number().int().min(1).max(100).default(10),
});

/**
 * A single match result from a rendezvous query
 */
export const RendezvousMatchSchema = z.object({
  peerId: z.string().min(1),
  multiaddr: z.string().min(1),
  capabilities: z.array(CapabilityUnionSchema),
});

/**
 * Rendezvous Response Payload
 * Server returns matching peers
 */
export const RendezvousResponsePayloadSchema = z.object({
  matches: z.array(RendezvousMatchSchema),
});

export const ChatDeliveredPayloadSchema = z.object({
  messageId: z.string().min(1),
  recipientOwnerId: z.string().min(1),
  deliveredAt: z.string().min(1),
});

/** Max wait for a peer to reply with chat.delivered on the same libp2p stream. */
export const CHAT_DELIVERY_ACK_TIMEOUT_MS = 45_000;

function refineChatSenderDeviceFields(
  value: {
    senderOwnerId: string;
    deviceCertificate?: DeviceCertificate;
    ownerPublicKeyPem?: string;
  },
  ctx: z.RefinementCtx,
): void {
  if (value.deviceCertificate && !value.ownerPublicKeyPem) {
    ctx.addIssue({
      code: "custom",
      message: "ownerPublicKeyPem is required when deviceCertificate is present",
      path: ["ownerPublicKeyPem"],
    });
  }
  if (value.deviceCertificate && value.deviceCertificate.ownerId !== value.senderOwnerId) {
    ctx.addIssue({
      code: "custom",
      message: "deviceCertificate.ownerId must match senderOwnerId",
      path: ["deviceCertificate"],
    });
  }
}

export const ChatMessagePayloadSchema = z
  .object({
    senderOwnerId: z.string().min(1),
    /** Text body of the message. May be empty when an audio attachment is present (Phase 37). */
    text: z.string().max(128000).default(""),
    /** File / audio attachments (Phase 37). Reuses the same schema as group chat attachments. */
    attachments: z.array(z.lazy(() => ChatRoomAttachmentSchema)).max(8).optional(),
    /** Phase 63B — listing-scoped commerce thread (Envoy Market inquire). */
    listingId: z.string().min(1).max(80).optional(),
    /** Owner-signed device certificate when sender is an authorized satellite/primary device. */
    deviceCertificate: DeviceCertificateSchema.optional(),
    /** Owner public key PEM — required when deviceCertificate is present (for cert verification). */
    ownerPublicKeyPem: z.string().min(1).optional(),
  })
  .superRefine((value, ctx) => {
    refineChatSenderDeviceFields(value, ctx);
    // Phase 37: at least one of text or attachment must be present
    const hasText = value.text.trim().length > 0;
    const hasAttachment = value.attachments && value.attachments.length > 0;
    if (!hasText && !hasAttachment) {
      ctx.addIssue({
        code: "custom",
        message: "Either text or an attachment is required",
        path: ["text"],
      });
    }
  });

function refineChatRoomSyncDeviceFields(
  value: {
    updatedByOwnerId: string;
    deviceCertificate?: DeviceCertificate;
    ownerPublicKeyPem?: string;
  },
  ctx: z.RefinementCtx,
): void {
  if (value.deviceCertificate && !value.ownerPublicKeyPem) {
    ctx.addIssue({
      code: "custom",
      message: "ownerPublicKeyPem is required when deviceCertificate is present",
      path: ["ownerPublicKeyPem"],
    });
  }
  if (value.deviceCertificate && value.deviceCertificate.ownerId !== value.updatedByOwnerId) {
    ctx.addIssue({
      code: "custom",
      message: "deviceCertificate.ownerId must match updatedByOwnerId",
      path: ["deviceCertificate"],
    });
  }
}

export const ChatRoomSyncPayloadSchema = z
  .object({
    roomId: z.string().uuid(),
    title: z.string().min(1).max(128),
    creatorOwnerId: z.string().min(1),
    /** Owner id of the member applying this revision (room creator or inviter). */
    updatedByOwnerId: z.string().min(1),
    memberOwnerIds: z.array(z.string().min(1)).max(64),
    revision: z.number().int().nonnegative(),
    updatedAt: z.string().datetime(),
    action: z.enum(["create", "invite", "leave", "remove", "rename", "dismiss"]),
    /** Required when action is remove — members removed by the creator. */
    removedMemberOwnerIds: z.array(z.string().min(1)).max(64).optional(),
    deviceCertificate: DeviceCertificateSchema.optional(),
    ownerPublicKeyPem: z.string().min(1).optional(),
  })
  .superRefine((value, ctx) => {
    refineChatRoomSyncDeviceFields(value, ctx);
    if (value.action !== "dismiss" && value.memberOwnerIds.length < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "memberOwnerIds must include at least one member unless action is dismiss",
        path: ["memberOwnerIds"],
      });
    }
    if (value.action === "remove" && (!value.removedMemberOwnerIds || value.removedMemberOwnerIds.length < 1)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "removedMemberOwnerIds is required when action is remove",
        path: ["removedMemberOwnerIds"],
      });
    }
    if (value.action === "remove" && value.removedMemberOwnerIds) {
      for (const removedId of value.removedMemberOwnerIds) {
        if (value.memberOwnerIds.includes(removedId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "removedMemberOwnerIds must not overlap memberOwnerIds",
            path: ["removedMemberOwnerIds"],
          });
          break;
        }
      }
    }
  });

export const ChatRoomAttachmentSchema = z.object({
  id: z.string().uuid(),
  filename: z.string().min(1).max(500),
  mimeType: z.string().min(1).max(200),
  sizeBytes: z.number().int().nonnegative(),
  sensitivity: SensitivitySchema,
});

export type ChatRoomAttachment = z.infer<typeof ChatRoomAttachmentSchema>;

export const ChatRoomMessagePayloadSchema = z
  .object({
    roomId: z.string().uuid(),
    senderOwnerId: z.string().min(1),
    // Empty text allowed when attachments are present (voice notes / file-only).
    text: z.string().max(128000),
    attachments: z.array(ChatRoomAttachmentSchema).max(8).optional(),
    deviceCertificate: DeviceCertificateSchema.optional(),
    ownerPublicKeyPem: z.string().min(1).optional(),
  })
  .superRefine((value, ctx) => {
    refineChatSenderDeviceFields(value, ctx);
    if (!value.text.trim() && (value.attachments?.length ?? 0) === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Message text or attachments required",
        path: ["text"],
      });
    }
  });

export const MandateActionSchema = z.enum([
  "discover",
  "query",
  "negotiate",
  "report",
  "delegate",
  "purchase",
  "share.private_data",
  "send.raw_files",
  "raw_contact_exchange",
  "device.sync",
  "tool.call",
]);

export const MandatePeerScopeSchema = z.enum(["self", "direct", "referred", "public"]);

export const MandateCostLimitSchema = z.object({
  amount: z.number().nonnegative(),
  currency: z.string().min(1).max(12),
});

export const UnsignedMandateSchema = z.object({
  version: z.literal("0.1"),
  mandateId: z.string().min(1),
  ownerId: z.string().min(1),
  issuedToDeviceId: z.string().min(1),
  taskIntent: z.string().min(1),
  objective: z.string().min(1).max(2000),
  allowedPeerScopes: z.array(MandatePeerScopeSchema).min(1),
  allowedActions: z.array(MandateActionSchema).min(1),
  disallowedActions: z.array(MandateActionSchema).default([]),
  maxSensitivity: SensitivitySchema,
  maxCost: MandateCostLimitSchema,
  expiresAt: z.string().datetime(),
  closeOnFirstCompletedResult: z.boolean().default(false),
  /** When set (2–32), task stays open until this many completed task.result payloads arrive. Ignored if closeOnFirstCompletedResult is true. */
  collectCompletedResults: z.number().int().min(2).max(32).optional(),
  /** Time-to-live: max relay hops for task propagation. Default 3. */
  ttl: z.number().int().min(1).max(8).default(3),
  requiresApprovalFor: z.array(MandateActionSchema).default([]),
  /** Standing posture mandate (EnvoyAI). When set, {@link posturePolicy} bounds autonomous work. */
  posture: EmpPostureSchema.optional(),
  posturePolicy: PosturePolicySchema.optional(),
  /** Agent recipient for standing mandates (optional; device may still be {@link issuedToDeviceId}). */
  issuedToAgentId: z.string().min(1).optional(),
});

export const MandateSchema = UnsignedMandateSchema.extend({
  signature: z.string().min(1),
});

// ---------------------------------------------------------------------------
// Identity value types — shared between @envoymesh/identity (node:crypto) and
// @envoymesh/mobile-identity (@noble/curves). Both packages re-export these
// types so consumers can use a single source of truth.
// ---------------------------------------------------------------------------

export const EnvoyKeyPairSchema = z.object({
  publicKeyPem: z.string().min(1),
  privateKeyPem: z.string().min(1),
});

export const EnvoyIdentitySchema = z.object({
  peerId: z.string().min(1),
  publicKeyPem: z.string().min(1),
  privateKeyPem: z.string().min(1),
});

export const OwnerIdentitySchema = z.object({
  ownerId: z.string().min(1),
  publicKeyPem: z.string().min(1),
  privateKeyPem: z.string().min(1),
});

export const DeviceIdentitySchema = z.object({
  deviceId: z.string().min(1),
  publicKeyPem: z.string().min(1),
  privateKeyPem: z.string().min(1),
});

export const AgentIdentitySchema = z.object({
  agentId: z.string().min(1),
  agentPeerId: z.string().min(1),
  publicKeyPem: z.string().min(1),
  privateKeyPem: z.string().min(1),
});

export const CreateAgentCredentialInputSchema = z.object({
  owner: OwnerIdentitySchema,
  agent: AgentIdentitySchema,
  scope: z.array(z.string()).optional(),
  credentialId: z.string().optional(),
  issuedAt: z.string().optional(),
  expiresAt: z.string().nullable().optional(),
});

export const CreateDeviceCertificateInputSchema = z.object({
  owner: OwnerIdentitySchema,
  device: DeviceIdentitySchema,
  deviceProfile: DeviceProfileSchema,
  capabilities: z.array(CapabilitySchema).min(1),
  certificateId: z.string().optional(),
  issuedAt: z.string().optional(),
  expiresAt: z.string().nullable().optional(),
});

export const CreateDeviceRevocationRecordInputSchema = z.object({
  owner: OwnerIdentitySchema,
  deviceId: z.string().min(1),
  reason: DeviceRevocationReasonSchema,
  certificateId: z.string().optional(),
  revokedAt: z.string().optional(),
  revocationId: z.string().optional(),
});

export const CreateChallengeResponseInputSchema = z.object({
  challenge: AuthChallengePayloadSchema,
  ownerPublicKeyPem: z.string().min(1),
  deviceCertificate: DeviceCertificateSchema,
  devicePrivateKeyPem: z.string().min(1),
});

export const CreateMandateInputSchema = z.object({
  owner: OwnerIdentitySchema,
  unsignedMandate: UnsignedMandateSchema,
});

export const CreateProofOfIntentInputSchema = z.object({
  mandate: MandateSchema,
  taskId: z.string().min(1),
  requestIntent: EnvoyIntentSchema,
  device: DeviceIdentitySchema,
  nonce: z.string().optional(),
});

export const ProofOfIntentPayloadSchema = z.object({
  version: z.literal("0.1"),
  mandateId: z.string().min(1),
  mandateHash: z.string().min(1),
  taskId: z.string().min(1),
  requestIntent: EnvoyIntentSchema,
  nonce: z.string().min(1),
  deviceId: z.string().min(1),
});

export const ProofOfIntentSchema = ProofOfIntentPayloadSchema.extend({
  proof: z.string().min(1),
});

export const TaskMandatePayloadSchema = z.object({
  taskId: z.string().min(1).optional(),
  mandate: MandateSchema,
});

export const TaskLifecycleStateSchema = z.enum([
  "created",
  "planned",
  "discovering",
  "negotiating",
  "waiting_for_peer",
  "waiting_for_owner",
  "running",
  "partial",
  // Phase 40 — Agent Network Collaboration Layer.
  // Orchestrator is merging partial results into a final ChainReport.
  "synthesizing",
  "completed",
  "failed",
  "cancelled",
]);

export const TaskJournalEventTypeSchema = z.enum([
  "created",
  "mandate_attached",
  "proposed",
  "negotiated",
  "accepted",
  "rejected",
  "heartbeat",
  "result_received",
  "report_created",
  "cancelled",
  "failed",
  // Phase 40 — emitted when a single subtask within a chain completes
  // (distinct from the whole-chain completion recorded via report_created).
  "chain_subtask_completed",
]);

export const TaskJournalEntrySchema = z.object({
  version: z.literal("0.1"),
  eventId: z.string().min(1),
  taskId: z.string().min(1),
  mandateId: z.string().min(1).optional(),
  eventType: TaskJournalEventTypeSchema,
  state: TaskLifecycleStateSchema,
  summary: z.string().min(1).max(2000),
  peerOwnerId: z.string().min(1).optional(),
  peerDeviceId: z.string().min(1).optional(),
  relatedMessageId: z.string().min(1).optional(),
  createdAt: z.string().datetime(),
  // Phase 40 — additive chain lineage. Absent on solo A2A entries.
  // The journal reader treats entries without these fields as solo A2A.
  chainId: z.string().min(1).optional(),
  parentTaskId: z.string().min(1).optional(),
  subtaskId: z.string().min(1).optional(),
  /** Phase 65A — lineage depth aligns with CHAIN_MAX_DEPTH (4). */
  depth: z.number().int().min(1).max(4).optional(),
});

export const TaskProposePayloadSchema = z.object({
  taskId: z.string().min(1),
  mandateId: z.string().min(1),
  proofOfIntent: ProofOfIntentSchema,
  objective: z.string().min(1).max(2000),
  requestedResult: z.string().min(1).max(1000),
  constraints: z.array(z.string().min(1)).default([]),
  expiresAt: z.string().datetime().optional(),
});

export const TaskNegotiatePayloadSchema = z.object({
  taskId: z.string().min(1),
  mandateId: z.string().min(1),
  proofOfIntent: ProofOfIntentSchema,
  negotiationId: z.string().min(1),
  message: z.string().min(1).max(2000),
  proposedChanges: z.array(z.string().min(1)).default([]),
  requiresOwnerApproval: z.boolean().default(false),
});

export const TaskAcceptPayloadSchema = z.object({
  taskId: z.string().min(1),
  mandateId: z.string().min(1),
  acceptedAt: z.string().datetime(),
  agreementSummary: z.string().min(1).max(2000),
});

export const TaskRejectPayloadSchema = z.object({
  taskId: z.string().min(1),
  mandateId: z.string().min(1).optional(),
  reason: z.string().min(1).max(2000),
  retryable: z.boolean().default(false),
  requiresOwnerApproval: z.boolean().default(false),
});

export const TaskCancelPayloadSchema = z.object({
  taskId: z.string().min(1),
  mandateId: z.string().min(1).optional(),
  reason: z.string().min(1).max(2000),
  cancelledBy: z.enum(["owner", "device", "peer", "policy"]),
  createdAt: z.string().datetime(),
  /** Optional fan-out: after handling locally, relay cancel to these libp2p peer ids while relayRemainingHops > 0. */
  forwardToPeerIds: z.array(z.string().min(1)).max(16).optional(),
  relayRemainingHops: z.number().int().min(0).max(16).optional(),
});

export const UnsignedDataTransferVoucherSchema = z.object({
  version: z.literal("0.1"),
  transferId: z.string().min(1),
  issuerPeerId: z.string().min(1),
  issuerOwnerId: z.string().min(1),
  issuerDeviceId: z.string().min(1),
  relativePath: z.string().min(1).max(2048),
  totalBytes: z.number().int().nonnegative(),
  contentHash: z.string().min(1).max(128),
  issuedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
});

export const DataTransferVoucherSchema = UnsignedDataTransferVoucherSchema.extend({
  signature: z.string().min(1),
});

export const TaskHeartbeatPayloadSchema = z.object({
  taskId: z.string().min(1),
  mandateId: z.string().min(1).optional(),
  state: TaskLifecycleStateSchema,
  summary: z.string().min(1).max(1000),
  nextRetryAt: z.string().datetime().optional(),
  createdAt: z.string().datetime(),
});

/**
 * Phase 33 — Typed Artifact payload. A `task.result` envelope's `artifacts` field is now a
 * discriminated union of three variants:
 *  - `text`       — plain text reply (e.g. assistant prose)
 *  - `file`       — vault document reference with content hash + optional mime type
 *  - `structured` — JSON blob with a schema ref (e.g. task report, tool result)
 *
 * **Breaking change from Phase 32.** Old payloads with `artifacts: string[]` are now rejected
 * at parse time. EnvoyMesh owns all senders, so this is internal-only.
 */
export const TextArtifactSchema = z.object({
  kind: z.literal("text"),
  content: z.string().min(1).max(64_000),
  mimeType: z.string().min(1).optional(),
});

export const FileArtifactSchema = z.object({
  kind: z.literal("file"),
  vaultPath: z.string().min(1),
  contentHash: z.string().min(1).max(128),
  mimeType: z.string().min(1).optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
  displayName: z.string().min(1).optional(),
});

export const StructuredArtifactSchema = z.object({
  kind: z.literal("structured"),
  schemaRef: z.string().min(1).max(256),
  data: z.record(z.string(), z.unknown()),
});

// Phase 40 — Composite artifact (defined in agent-network.ts). Imported here
// so ArtifactSchema can include it in its discriminated union. The reverse
// import (agent-network → index) uses `import type` to avoid a runtime cycle.
import { CompositeArtifactSchema } from "./agent-network.js";

export const ArtifactSchema = z.discriminatedUnion("kind", [
  TextArtifactSchema,
  FileArtifactSchema,
  StructuredArtifactSchema,
  // Phase 40 — Agent Network Collaboration Layer.
  // A composite artifact bundles N weighted worker contributions into a
  // single deliverable. CompositeArtifactSchema is defined in
  // ./agent-network.js and imported near the bottom of this file (after the
  // chain payload schemas) to avoid pulling a heavy chain payload surface
  // into the top-of-file schema block. Both files compile in the same cycle.
  CompositeArtifactSchema,
]);

export type TextArtifact = z.infer<typeof TextArtifactSchema>;
export type FileArtifact = z.infer<typeof FileArtifactSchema>;
export type StructuredArtifact = z.infer<typeof StructuredArtifactSchema>;
export type Artifact = z.infer<typeof ArtifactSchema>;

export const TaskResultPayloadSchema = z.object({
  taskId: z.string().min(1),
  mandateId: z.string().min(1).optional(),
  status: TaskLifecycleStateSchema,
  summary: z.string().min(1).max(4000),
  artifacts: z.array(ArtifactSchema).default([]),
  /** Story E receipt-only: vault document attestation (no payment fields). */
  deliveryAttestation: z
    .object({
      documentId: z.string().min(1),
      relativePath: z.string().min(1),
      contentHash: z.string().min(1).max(128),
      cid: z.string().min(1).max(256).optional(),
      counterpartyOwnerId: z.string().min(1),
    })
    .optional(),
  createdAt: z.string().datetime(),
  // Phase 40 — additive chain lineage. Absent on solo A2A results.
  chainId: z.string().min(1).optional(),
  parentTaskId: z.string().min(1).optional(),
  subtaskId: z.string().min(1).optional(),
  /** Phase 65A — lineage depth aligns with CHAIN_MAX_DEPTH (4). */
  depth: z.number().int().min(1).max(4).optional(),
});

export type CommerceDeliveryAttestation = NonNullable<
  z.infer<typeof TaskResultPayloadSchema>["deliveryAttestation"]
>;

/** `task.feedback` — signed feedback from one peer about task outcome; used to update local reputation scores. */
export const TaskFeedbackPayloadSchema = z.object({
  taskId: z.string().min(1),
  outcome: z.enum(["success", "failure"]),
  latencyMs: z.number().int().min(0),
  abuseFlags: z.array(z.enum(["none", "slow_response", "no_answer", "malicious", "offensive"])).default([]),
  notes: z.string().min(1).max(500).optional(),
});

/** `official.credential` — a signed credential from a trusted anchor attesting to a peer's capabilities. */
export const OfficialCredentialSchema = z.object({
  version: z.literal("0.1"),
  anchorId: z.string().min(1),
  peerId: z.string().min(1),
  ownerId: z.string().min(1),
  capabilities: z.array(z.string().min(1)).default([]),
  expiresAt: z.string().datetime(),
  issuedAt: z.string().datetime(),
});

export const SignedOfficialCredentialSchema = OfficialCredentialSchema.extend({
  signature: z.string().min(1),
});

export const ReportingModeSchema = z.enum(["instant", "brief", "silent", "approval"]);

export const AutonomousReportingPolicySchema = z.object({
  defaultMode: ReportingModeSchema.default("brief"),
  urgentMode: ReportingModeSchema.default("instant"),
  approvalMode: ReportingModeSchema.default("approval"),
  silentStates: z.array(TaskLifecycleStateSchema).default(["running"]),
  approvalRequiredFor: z.array(MandateActionSchema).default([
    "purchase",
    "share.private_data",
    "send.raw_files",
    "raw_contact_exchange",
  ]),
});

export const ReportEvidenceSchema = z.object({
  type: z.enum(["peer_response", "local_result", "owner_input", "audit_event"]),
  source: z.string().min(1),
  sensitivity: SensitivitySchema,
  reference: z.string().min(1).optional(),
});

export const ReportSuggestedActionSchema = z.object({
  label: z.string().min(1).max(200),
  action: z.string().min(1).max(200),
  requiresApproval: z.boolean().default(true),
});

export const ReportSchema = z.object({
  version: z.literal("0.1"),
  reportId: z.string().min(1),
  taskId: z.string().min(1),
  mandateId: z.string().min(1).optional(),
  ownerId: z.string().min(1),
  status: TaskLifecycleStateSchema,
  mode: ReportingModeSchema,
  summary: z.string().min(1).max(4000),
  evidence: z.array(ReportEvidenceSchema).default([]),
  suggestedActions: z.array(ReportSuggestedActionSchema).default([]),
  createdAt: z.string().datetime(),
});

export const ReportCreatePayloadSchema = z.object({
  report: ReportSchema,
});

export type EnvoyIntent = z.infer<typeof EnvoyIntentSchema>;
export type Sensitivity = z.infer<typeof SensitivitySchema>;
export type DeviceProfile = z.infer<typeof DeviceProfileSchema>;
export type EnvoyActorRole = z.infer<typeof EnvoyActorRoleSchema>;
export type Capability = z.infer<typeof CapabilitySchema>;
export type PublicIdentity = z.infer<typeof PublicIdentitySchema>;
export type EnvoyKeyPair = z.infer<typeof EnvoyKeyPairSchema>;
export type EnvoyIdentity = z.infer<typeof EnvoyIdentitySchema>;
export type OwnerIdentity = z.infer<typeof OwnerIdentitySchema>;
export type DeviceIdentity = z.infer<typeof DeviceIdentitySchema>;
export type AgentIdentity = z.infer<typeof AgentIdentitySchema>;
export type CreateAgentCredentialInput = z.infer<typeof CreateAgentCredentialInputSchema>;
export type CreateDeviceCertificateInput = z.infer<typeof CreateDeviceCertificateInputSchema>;
export type CreateDeviceRevocationRecordInput = z.infer<typeof CreateDeviceRevocationRecordInputSchema>;
export type CreateChallengeResponseInput = z.infer<typeof CreateChallengeResponseInputSchema>;
export type CreateMandateInput = z.infer<typeof CreateMandateInputSchema>;
export type CreateProofOfIntentInput = z.infer<typeof CreateProofOfIntentInputSchema>;
export type UnsignedDeviceCertificate = z.infer<typeof UnsignedDeviceCertificateSchema>;
export type DeviceCertificate = z.infer<typeof DeviceCertificateSchema>;
export type DeviceRevocationReason = z.infer<typeof DeviceRevocationReasonSchema>;
export type UnsignedDeviceRevocationRecord = z.infer<
  typeof UnsignedDeviceRevocationRecordSchema
>;
export type DeviceRevocationRecord = z.infer<typeof DeviceRevocationRecordSchema>;
export type UnsignedAgentCredential = z.infer<typeof UnsignedAgentCredentialSchema>;
export type AgentCredential = z.infer<typeof AgentCredentialSchema>;
export type SystemPingPayload = z.infer<typeof SystemPingPayloadSchema>;
export type SystemSignalPayload = z.infer<typeof SystemSignalPayloadSchema>;
export type DevicePairRequestPayload = z.infer<typeof DevicePairRequestPayloadSchema>;
export type DevicePairApprovePayload = z.infer<typeof DevicePairApprovePayloadSchema>;
export type DevicePairDeferredPayload = z.infer<typeof DevicePairDeferredPayloadSchema>;
export type AuthChallengePayload = z.infer<typeof AuthChallengePayloadSchema>;
export type AuthChallengeProof = z.infer<typeof AuthChallengeProofSchema>;
export type AuthChallengeResponsePayload = z.infer<typeof AuthChallengeResponsePayloadSchema>;
export type TrustPolicySummary = z.infer<typeof TrustPolicySummarySchema>;
export type AgentCard = z.infer<typeof AgentCardSchema>;
export type AgentCardRequestPayload = z.infer<typeof AgentCardRequestPayloadSchema>;
export type AgentCardResponsePayload = z.infer<typeof AgentCardResponsePayloadSchema>;
export type KnowledgeQueryPayload = z.infer<typeof KnowledgeQueryPayloadSchema>;
export type KnowledgeResponsePayload = z.infer<typeof KnowledgeResponsePayloadSchema>;
// Phase 45 — Web Content Browsing.
export type LibraryReadRange = z.infer<typeof LibraryReadRangeSchema>;
export type LibraryReadPayload = z.infer<typeof LibraryReadPayloadSchema>;
export type LibraryReadResponseStatus = z.infer<typeof LibraryReadResponseStatusSchema>;
export type LibraryReadResponsePayload = z.infer<typeof LibraryReadResponsePayloadSchema>;
export type FeedNotifyPayload = z.infer<typeof FeedNotifyPayloadSchema>;
export type FeedEngagePayload = z.infer<typeof FeedEngagePayloadSchema>;
export type BondRequestedLevel = z.infer<typeof BondRequestedLevelSchema>;
export type BondRequestPayload = z.infer<typeof BondRequestPayloadSchema>;
export type BondChallengePayload = z.infer<typeof BondChallengePayloadSchema>;
export type BondChallengeResponsePayload = z.infer<typeof BondChallengeResponsePayloadSchema>;
export type DiscoveryReferralAttestation = z.infer<typeof DiscoveryReferralAttestationSchema>;
export type DiscoveryRequestPayload = z.infer<typeof DiscoveryRequestPayloadSchema>;
export type LibraryFileMatch = z.infer<typeof LibraryFileMatchSchema>;
export type DiscoveryMatch = z.infer<typeof DiscoveryMatchSchema>;
export type DiscoveryResponsePayload = z.infer<typeof DiscoveryResponsePayloadSchema>;
export type BroadcastRequestPayload = z.infer<typeof BroadcastRequestPayloadSchema>;
export type BroadcastResponsePayload = z.infer<typeof BroadcastResponsePayloadSchema>;
export type BroadcastCancelPayload = z.infer<typeof BroadcastCancelPayloadSchema>;
export type RelayPeersRequestPayload = z.infer<typeof RelayPeersRequestPayloadSchema>;
export type RelayPeerInfo = z.infer<typeof RelayPeerInfoSchema>;
export type RelayPeersResponsePayload = z.infer<typeof RelayPeersResponsePayloadSchema>;
export type RelayVisibility = z.infer<typeof RelayVisibilitySchema>;
export type RelayAdvertisement = z.infer<typeof RelayAdvertisementSchema>;
export type RelayHint = z.infer<typeof RelayHintSchema>;
export type RelayPeerCandidate = z.infer<typeof RelayPeerCandidateSchema>;
export type RelayCheckinPayload = z.infer<typeof RelayCheckinPayloadSchema>;
export type RelayLookupPayload = z.infer<typeof RelayLookupPayloadSchema>;
export type RelayLookupResponsePayload = z.infer<typeof RelayLookupResponsePayloadSchema>;
export type RelayHintsRequestPayload = z.infer<typeof RelayHintsRequestPayloadSchema>;
export type RelayHintsResponsePayload = z.infer<typeof RelayHintsResponsePayloadSchema>;
export type RelayRelation = z.infer<typeof RelayRelationSchema>;
export type RelayBookState = z.infer<typeof RelayBookStateSchema>;
export type RelayMetadata = z.infer<typeof RelayMetadataSchema>;
export type RelayJoinRequestPayload = z.infer<typeof RelayJoinRequestPayloadSchema>;
export type RelayJoinResponsePayload = z.infer<typeof RelayJoinResponsePayloadSchema>;
export type RelayRegisterPayload = z.infer<typeof RelayRegisterPayloadSchema>;
export type RelayRegisterResponsePayload = z.infer<typeof RelayRegisterResponsePayloadSchema>;
export type RelaySummaryPayload = z.infer<typeof RelaySummaryPayloadSchema>;
export type RendezvousRegisterPayload = z.infer<typeof RendezvousRegisterPayloadSchema>;
export type RendezvousQueryPayload = z.infer<typeof RendezvousQueryPayloadSchema>;
export type RendezvousMatch = z.infer<typeof RendezvousMatchSchema>;
export type RendezvousResponsePayload = z.infer<typeof RendezvousResponsePayloadSchema>;
export type ChatMessagePayload = z.infer<typeof ChatMessagePayloadSchema>;
export type ChatRoomSyncPayload = z.infer<typeof ChatRoomSyncPayloadSchema>;
export type ChatRoomMessagePayload = z.infer<typeof ChatRoomMessagePayloadSchema>;
export type ChatDeliveredPayload = z.infer<typeof ChatDeliveredPayloadSchema>;
export type MandateAction = z.infer<typeof MandateActionSchema>;
export type EmpPosture = z.infer<typeof EmpPostureSchema>;
export type EmpCapability = z.infer<typeof EmpCapabilitySchema>;
export type SocialProxyPosturePolicy = z.infer<typeof SocialProxyPosturePolicySchema>;
export type DocumentAcquisitionPosturePolicy = z.infer<typeof DocumentAcquisitionPosturePolicySchema>;
export type CapabilityProviderPosturePolicy = z.infer<typeof CapabilityProviderPosturePolicySchema>;
export type BondAutonomyPosturePolicy = z.infer<typeof BondAutonomyPosturePolicySchema>;
export type PosturePolicy = z.infer<typeof PosturePolicySchema>;
export type FederatedRagConfig = z.infer<typeof FederatedRagConfigSchema>;
export type MandatePeerScope = z.infer<typeof MandatePeerScopeSchema>;
export type MandateCostLimit = z.infer<typeof MandateCostLimitSchema>;
export type UnsignedMandate = z.infer<typeof UnsignedMandateSchema>;
export type Mandate = z.infer<typeof MandateSchema>;
export type ProofOfIntentPayload = z.infer<typeof ProofOfIntentPayloadSchema>;
export type ProofOfIntent = z.infer<typeof ProofOfIntentSchema>;
export type TaskMandatePayload = z.infer<typeof TaskMandatePayloadSchema>;
export type TaskLifecycleState = z.infer<typeof TaskLifecycleStateSchema>;
export type TaskJournalEventType = z.infer<typeof TaskJournalEventTypeSchema>;
export type TaskJournalEntry = z.infer<typeof TaskJournalEntrySchema>;
export type TaskProposePayload = z.infer<typeof TaskProposePayloadSchema>;
export type TaskNegotiatePayload = z.infer<typeof TaskNegotiatePayloadSchema>;
export type TaskAcceptPayload = z.infer<typeof TaskAcceptPayloadSchema>;
export type TaskRejectPayload = z.infer<typeof TaskRejectPayloadSchema>;
export type TaskCancelPayload = z.infer<typeof TaskCancelPayloadSchema>;
export type UnsignedDataTransferVoucher = z.infer<typeof UnsignedDataTransferVoucherSchema>;
export type DataTransferVoucher = z.infer<typeof DataTransferVoucherSchema>;
export type TaskHeartbeatPayload = z.infer<typeof TaskHeartbeatPayloadSchema>;
export type TaskResultPayload = z.infer<typeof TaskResultPayloadSchema>;
export type TaskFeedbackPayload = z.infer<typeof TaskFeedbackPayloadSchema>;
export type OfficialCredential = z.infer<typeof OfficialCredentialSchema>;
export type SignedOfficialCredential = z.infer<typeof SignedOfficialCredentialSchema>;
export type ReportingMode = z.infer<typeof ReportingModeSchema>;
export type AutonomousReportingPolicy = z.infer<typeof AutonomousReportingPolicySchema>;
export type ReportEvidence = z.infer<typeof ReportEvidenceSchema>;
export type ReportSuggestedAction = z.infer<typeof ReportSuggestedActionSchema>;
export type Report = z.infer<typeof ReportSchema>;
export type ReportCreatePayload = z.infer<typeof ReportCreatePayloadSchema>;
export type EnvoyEnvelope<TPayload = unknown> = Omit<
  z.infer<typeof EnvoyEnvelopeSchema>,
  "payload"
> & {
  payload: TPayload;
};
export type UnsignedEnvoyEnvelope<TPayload = unknown> = Omit<
  EnvoyEnvelope<TPayload>,
  "signature"
>;

export interface CreateEnvelopeInput<TPayload> {
  senderPeerId: string;
  senderPublicKey: string;
  senderRole?: EnvoyActorRole;
  recipientPeerId?: string;
  recipientRole?: EnvoyActorRole;
  intent: EnvoyIntent;
  payload: TPayload;
  agentCredential?: AgentCredential;
  createdAt?: string;
  messageId?: string;
  correlationId?: string;
  postureRef?: string;
}

// ---------------------------------------------------------------------------
// Phase 38 — Real-time voice/video call payloads
// ---------------------------------------------------------------------------

/** Maximum inbound ring duration before auto-reject (60 s). */
export const CALL_RING_TIMEOUT_MS = 60_000;

export const CallMediaTypeSchema = z.enum(["audio", "video"]);
export type CallMediaType = z.infer<typeof CallMediaTypeSchema>;

// --- call.invite ---
export const CallInvitePayloadSchema = z.object({
  callId: z.string().uuid(),
  callerOwnerId: z.string().min(1),
  callerPeerId: z.string().min(1),
  callType: CallMediaTypeSchema.default("audio"),
  timestamp: z.string().datetime(),
  sdpOffer: z.string().min(1),
  iceServers: z.array(z.object({
    urls: z.string(),
    username: z.string().optional(),
    credential: z.string().optional(),
  })).optional(),
  sdpMid: z.string().optional(),
  sdpMLineIndex: z.number().int().optional(),
});
export type CallInvitePayload = z.infer<typeof CallInvitePayloadSchema>;

export interface CreateCallInvitePayloadInput {
  callId: string;
  callerOwnerId: string;
  callerPeerId: string;
  callType?: CallMediaType;
  timestamp?: string;
  sdpOffer: string;
  iceServers?: Array<{ urls: string; username?: string; credential?: string }>;
  sdpMid?: string;
  sdpMLineIndex?: number;
}
export function createCallInvitePayload(input: CreateCallInvitePayloadInput): CallInvitePayload {
  return CallInvitePayloadSchema.parse({
    callId: input.callId,
    callerOwnerId: input.callerOwnerId,
    callerPeerId: input.callerPeerId,
    callType: input.callType ?? "audio",
    timestamp: input.timestamp ?? new Date().toISOString(),
    sdpOffer: input.sdpOffer,
    iceServers: input.iceServers,
    sdpMid: input.sdpMid,
    sdpMLineIndex: input.sdpMLineIndex,
  });
}
export function parseCallInvitePayload(input: unknown): CallInvitePayload {
  return CallInvitePayloadSchema.parse(input);
}

// --- call.reinvite ---
/** Path 1 → Path 2 fallback: same callId, new SDP offer with STUN/TURN. */
export const CallReinvitePayloadSchema = z.object({
  callId: z.string().uuid(),
  callerOwnerId: z.string().min(1),
  callerPeerId: z.string().min(1),
  timestamp: z.string().datetime(),
  sdpOffer: z.string().min(1),
  iceServers: z.array(z.object({
    urls: z.string(),
    username: z.string().optional(),
    credential: z.string().optional(),
  })).min(1),
  reason: z.enum(["path1_timeout", "path1_failed"]).default("path1_timeout"),
  transportPath: z.literal("path2").default("path2"),
});
export type CallReinvitePayload = z.infer<typeof CallReinvitePayloadSchema>;

export interface CreateCallReinvitePayloadInput {
  callId: string;
  callerOwnerId: string;
  callerPeerId: string;
  timestamp?: string;
  sdpOffer: string;
  iceServers: Array<{ urls: string; username?: string; credential?: string }>;
  reason?: "path1_timeout" | "path1_failed";
  transportPath?: "path2";
}
export function createCallReinvitePayload(input: CreateCallReinvitePayloadInput): CallReinvitePayload {
  return CallReinvitePayloadSchema.parse({
    callId: input.callId,
    callerOwnerId: input.callerOwnerId,
    callerPeerId: input.callerPeerId,
    timestamp: input.timestamp ?? new Date().toISOString(),
    sdpOffer: input.sdpOffer,
    iceServers: input.iceServers,
    reason: input.reason ?? "path1_timeout",
    transportPath: input.transportPath ?? "path2",
  });
}
export function parseCallReinvitePayload(input: unknown): CallReinvitePayload {
  return CallReinvitePayloadSchema.parse(input);
}

// --- call.accept ---
export const CallAcceptPayloadSchema = z.object({
  callId: z.string().uuid(),
  calleeOwnerId: z.string().min(1),
  calleePeerId: z.string().min(1),
  timestamp: z.string().datetime(),
  sdpAnswer: z.string().min(1),
  iceServers: z.array(z.object({
    urls: z.string(),
    username: z.string().optional(),
    credential: z.string().optional(),
  })).optional(),
  sdpMid: z.string().optional(),
  sdpMLineIndex: z.number().int().optional(),
});
export type CallAcceptPayload = z.infer<typeof CallAcceptPayloadSchema>;

export interface CreateCallAcceptPayloadInput {
  callId: string;
  calleeOwnerId: string;
  calleePeerId: string;
  timestamp?: string;
  sdpAnswer: string;
  iceServers?: Array<{ urls: string; username?: string; credential?: string }>;
  sdpMid?: string;
  sdpMLineIndex?: number;
}
export function createCallAcceptPayload(input: CreateCallAcceptPayloadInput): CallAcceptPayload {
  return CallAcceptPayloadSchema.parse({
    callId: input.callId,
    calleeOwnerId: input.calleeOwnerId,
    calleePeerId: input.calleePeerId,
    timestamp: input.timestamp ?? new Date().toISOString(),
    sdpAnswer: input.sdpAnswer,
    iceServers: input.iceServers,
    sdpMid: input.sdpMid,
    sdpMLineIndex: input.sdpMLineIndex,
  });
}
export function parseCallAcceptPayload(input: unknown): CallAcceptPayload {
  return CallAcceptPayloadSchema.parse(input);
}

// --- call.reject ---
export const CallRejectPayloadSchema = z.object({
  callId: z.string().uuid(),
  calleeOwnerId: z.string().min(1),
  calleePeerId: z.string().min(1),
  reason: z.enum(["busy", "declined", "no_answer", "offline", "error"]).default("declined"),
  timestamp: z.string().datetime(),
});
export type CallRejectPayload = z.infer<typeof CallRejectPayloadSchema>;

export interface CreateCallRejectPayloadInput {
  callId: string;
  calleeOwnerId: string;
  calleePeerId: string;
  reason?: "busy" | "declined" | "no_answer" | "offline" | "error";
  timestamp?: string;
}
export function createCallRejectPayload(input: CreateCallRejectPayloadInput): CallRejectPayload {
  return CallRejectPayloadSchema.parse({
    callId: input.callId,
    calleeOwnerId: input.calleeOwnerId,
    calleePeerId: input.calleePeerId,
    reason: input.reason ?? "declined",
    timestamp: input.timestamp ?? new Date().toISOString(),
  });
}
export function parseCallRejectPayload(input: unknown): CallRejectPayload {
  return CallRejectPayloadSchema.parse(input);
}

// --- call.ice-candidate ---
export const CallIceCandidatePayloadSchema = z.object({
  callId: z.string().uuid(),
  candidate: z.object({
    candidate: z.string(),
    sdpMid: z.string().nullable(),
    sdpMLineIndex: z.number().int().nullable(),
    usernameFragment: z.string().nullable().optional(),
  }),
  timestamp: z.string().datetime(),
});
export type CallIceCandidatePayload = z.infer<typeof CallIceCandidatePayloadSchema>;

export interface CreateCallIceCandidatePayloadInput {
  callId: string;
  candidate: { candidate: string; sdpMid: string | null; sdpMLineIndex: number | null; usernameFragment?: string | null };
  timestamp?: string;
}
export function createCallIceCandidatePayload(input: CreateCallIceCandidatePayloadInput): CallIceCandidatePayload {
  return CallIceCandidatePayloadSchema.parse({
    callId: input.callId,
    candidate: input.candidate,
    timestamp: input.timestamp ?? new Date().toISOString(),
  });
}
export function parseCallIceCandidatePayload(input: unknown): CallIceCandidatePayload {
  return CallIceCandidatePayloadSchema.parse(input);
}

// --- call.hangup ---
export const CallHangupPayloadSchema = z.object({
  callId: z.string().uuid(),
  reason: z.enum(["normal", "error", "no_answer"]).default("normal"),
  timestamp: z.string().datetime(),
});
export type CallHangupPayload = z.infer<typeof CallHangupPayloadSchema>;

export interface CreateCallHangupPayloadInput {
  callId: string;
  reason?: "normal" | "error" | "no_answer";
  timestamp?: string;
}
export function createCallHangupPayload(input: CreateCallHangupPayloadInput): CallHangupPayload {
  return CallHangupPayloadSchema.parse({
    callId: input.callId,
    reason: input.reason ?? "normal",
    timestamp: input.timestamp ?? new Date().toISOString(),
  });
}
export function parseCallHangupPayload(input: unknown): CallHangupPayload {
  return CallHangupPayloadSchema.parse(input);
}

// --- call.mute ---
export const CallMutePayloadSchema = z.object({
  callId: z.string().uuid(),
  muted: z.boolean(),
  timestamp: z.string().datetime(),
});
export type CallMutePayload = z.infer<typeof CallMutePayloadSchema>;

export interface CreateCallMutePayloadInput {
  callId: string;
  muted: boolean;
  timestamp?: string;
}
export function createCallMutePayload(input: CreateCallMutePayloadInput): CallMutePayload {
  return CallMutePayloadSchema.parse({
    callId: input.callId,
    muted: input.muted,
    timestamp: input.timestamp ?? new Date().toISOString(),
  });
}
export function parseCallMutePayload(input: unknown): CallMutePayload {
  return CallMutePayloadSchema.parse(input);
}

export function createUnsignedEnvelope<TPayload>(
  input: CreateEnvelopeInput<TPayload>,
): UnsignedEnvoyEnvelope<TPayload> {
  const defaultRoles =
    input.intent === "chat.message" ||
    input.intent === "chat.room.sync" ||
    input.intent === "chat.room.message" ||
    input.intent === "feed.notify" ||
    input.intent === "feed.engage" ||
    input.intent === "market.announce" ||
    input.intent === "market.search" ||
    input.intent === "market.search.result" ||
    input.intent.startsWith("call.")
      ? { senderRole: "human" as const, recipientRole: "human" as const }
      : input.intent.startsWith("system.")
        ? { senderRole: "system" as const, recipientRole: "agent" as const }
        : { senderRole: "agent" as const, recipientRole: "agent" as const };
  return UnsignedEnvoyEnvelopeSchema.parse({
    version: "0.1",
    messageId: input.messageId ?? randomUUID(),
    correlationId: input.correlationId,
    createdAt: input.createdAt ?? new Date().toISOString(),
    senderPeerId: input.senderPeerId,
    senderPublicKey: input.senderPublicKey,
    senderRole: input.senderRole ?? defaultRoles.senderRole,
    recipientPeerId: input.recipientPeerId,
    recipientRole: input.recipientRole ?? defaultRoles.recipientRole,
    intent: input.intent,
    payload: input.payload,
    agentCredential: input.agentCredential,
    postureRef: input.postureRef,
  }) as UnsignedEnvoyEnvelope<TPayload>;
}

export function parseEnvelope(input: unknown): EnvoyEnvelope {
  return EnvoyEnvelopeSchema.parse(input) as EnvoyEnvelope;
}

export function parseUnsignedEnvelope(input: unknown): UnsignedEnvoyEnvelope {
  return UnsignedEnvoyEnvelopeSchema.parse(input) as UnsignedEnvoyEnvelope;
}

export function parseSystemPingPayload(input: unknown): SystemPingPayload {
  return SystemPingPayloadSchema.parse(input);
}

export function parseSystemSignalPayload(input: unknown): SystemSignalPayload {
  return SystemSignalPayloadSchema.parse(input);
}

export function parseDevicePairRequestPayload(input: unknown): DevicePairRequestPayload {
  return DevicePairRequestPayloadSchema.parse(input);
}

export function parseDevicePairApprovePayload(input: unknown): DevicePairApprovePayload {
  return DevicePairApprovePayloadSchema.parse(input);
}

export function parseDevicePairDeferredPayload(input: unknown): DevicePairDeferredPayload {
  return DevicePairDeferredPayloadSchema.parse(input);
}

export function parseAuthChallengePayload(input: unknown): AuthChallengePayload {
  return AuthChallengePayloadSchema.parse(input);
}

export function parseAuthChallengeResponsePayload(
  input: unknown,
): AuthChallengeResponsePayload {
  return AuthChallengeResponsePayloadSchema.parse(input);
}

export function parseAgentCard(input: unknown): AgentCard {
  return AgentCardSchema.parse(input);
}

export function parseAgentCardRequestPayload(input: unknown): AgentCardRequestPayload {
  return AgentCardRequestPayloadSchema.parse(input);
}

export function parseAgentCardResponsePayload(input: unknown): AgentCardResponsePayload {
  return AgentCardResponsePayloadSchema.parse(input);
}

export function parseKnowledgeQueryPayload(input: unknown): KnowledgeQueryPayload {
  return KnowledgeQueryPayloadSchema.parse(input);
}

export function parseKnowledgeResponsePayload(input: unknown): KnowledgeResponsePayload {
  return KnowledgeResponsePayloadSchema.parse(input);
}

// Phase 45 — Web Content Browsing parse helpers.
export function parseLibraryReadPayload(input: unknown): LibraryReadPayload {
  return LibraryReadPayloadSchema.parse(input);
}

export function parseLibraryReadResponsePayload(input: unknown): LibraryReadResponsePayload {
  return LibraryReadResponsePayloadSchema.parse(input);
}

export function parseFeedNotifyPayload(input: unknown): FeedNotifyPayload {
  return FeedNotifyPayloadSchema.parse(input);
}

export function parseFeedEngagePayload(input: unknown): FeedEngagePayload {
  return FeedEngagePayloadSchema.parse(input);
}

export function parseShareRequestPayload(input: unknown): ShareRequestPayload {
  return ShareRequestPayloadSchema.parse(input);
}

export function parseSharePreviewPayload(input: unknown): SharePreviewPayload {
  return SharePreviewPayloadSchema.parse(input);
}

export function parseShareAcceptPayload(input: unknown): ShareAcceptPayload {
  return ShareAcceptPayloadSchema.parse(input);
}

export function parseBondRequestPayload(input: unknown): BondRequestPayload {
  return BondRequestPayloadSchema.parse(input);
}

export function parseHumanProfileFragmentPayload(input: unknown): HumanProfileFragmentPayload {
  return HumanProfileFragmentPayloadSchema.parse(input);
}

export function parseFriendMatchingPreferencesPayload(input: unknown): FriendMatchingPreferencesPayload {
  return FriendMatchingPreferencesPayloadSchema.parse(input);
}

export function parseSocialIntroSyncPayload(input: unknown): SocialIntroSyncPayload {
  return SocialIntroSyncPayloadSchema.parse(input);
}

export function parseSocialIntroProposePayload(input: unknown): SocialIntroProposePayload {
  return SocialIntroProposePayloadSchema.parse(input);
}

export function parseSocialIntroOwnerReadyPayload(input: unknown): SocialIntroOwnerReadyPayload {
  return SocialIntroOwnerReadyPayloadSchema.parse(input);
}

export function parseBondChallengePayload(input: unknown): BondChallengePayload {
  return BondChallengePayloadSchema.parse(input);
}

export function parseBondChallengeResponsePayload(input: unknown): BondChallengeResponsePayload {
  return BondChallengeResponsePayloadSchema.parse(input);
}

export function parseDiscoveryRequestPayload(input: unknown): DiscoveryRequestPayload {
  return DiscoveryRequestPayloadSchema.parse(input);
}

export function parseDiscoveryResponsePayload(input: unknown): DiscoveryResponsePayload {
  return DiscoveryResponsePayloadSchema.parse(input);
}

export function parseBroadcastRequestPayload(input: unknown): BroadcastRequestPayload {
  return BroadcastRequestPayloadSchema.parse(input);
}

export function parseBroadcastResponsePayload(input: unknown): BroadcastResponsePayload {
  return BroadcastResponsePayloadSchema.parse(input);
}

export function parseBroadcastCancelPayload(input: unknown): BroadcastCancelPayload {
  return BroadcastCancelPayloadSchema.parse(input);
}

export function parseRelayPeersRequestPayload(input: unknown): RelayPeersRequestPayload {
  return RelayPeersRequestPayloadSchema.parse(input);
}

export function parseRelayPeersResponsePayload(input: unknown): RelayPeersResponsePayload {
  return RelayPeersResponsePayloadSchema.parse(input);
}

export function parseRelayCheckinPayload(input: unknown): RelayCheckinPayload {
  return RelayCheckinPayloadSchema.parse(input);
}

export function parseRelayLookupPayload(input: unknown): RelayLookupPayload {
  return RelayLookupPayloadSchema.parse(input);
}

export function parseRelayLookupResponsePayload(input: unknown): RelayLookupResponsePayload {
  return RelayLookupResponsePayloadSchema.parse(input);
}

export function parseRelayHintsRequestPayload(input: unknown): RelayHintsRequestPayload {
  return RelayHintsRequestPayloadSchema.parse(input);
}

export function parseRelayHintsResponsePayload(input: unknown): RelayHintsResponsePayload {
  return RelayHintsResponsePayloadSchema.parse(input);
}

export function parseRelayJoinRequestPayload(input: unknown): RelayJoinRequestPayload {
  return RelayJoinRequestPayloadSchema.parse(input);
}

export function parseRelayJoinResponsePayload(input: unknown): RelayJoinResponsePayload {
  return RelayJoinResponsePayloadSchema.parse(input);
}

export function parseRelayRegisterPayload(input: unknown): RelayRegisterPayload {
  return RelayRegisterPayloadSchema.parse(input);
}

export function parseRelayRegisterResponsePayload(input: unknown): RelayRegisterResponsePayload {
  return RelayRegisterResponsePayloadSchema.parse(input);
}

export function parseRelaySummaryPayload(input: unknown): RelaySummaryPayload {
  return RelaySummaryPayloadSchema.parse(input);
}

export function parseRendezvousRegisterPayload(input: unknown): RendezvousRegisterPayload {
  return RendezvousRegisterPayloadSchema.parse(input);
}

export function parseRendezvousQueryPayload(input: unknown): RendezvousQueryPayload {
  return RendezvousQueryPayloadSchema.parse(input);
}

export function parseChatMessagePayload(input: unknown): ChatMessagePayload {
  return ChatMessagePayloadSchema.parse(input);
}

export function parseChatRoomSyncPayload(input: unknown): ChatRoomSyncPayload {
  return ChatRoomSyncPayloadSchema.parse(input);
}

export function parseChatRoomMessagePayload(input: unknown): ChatRoomMessagePayload {
  return ChatRoomMessagePayloadSchema.parse(input);
}

export function parseChatDeliveredPayload(input: unknown): ChatDeliveredPayload {
  return ChatDeliveredPayloadSchema.parse(input);
}

export function parseMandate(input: unknown): Mandate {
  return MandateSchema.parse(input);
}

export function parseProofOfIntent(input: unknown): ProofOfIntent {
  return ProofOfIntentSchema.parse(input);
}

export function parseTaskMandatePayload(input: unknown): TaskMandatePayload {
  return TaskMandatePayloadSchema.parse(input);
}

export function parseTaskJournalEntry(input: unknown): TaskJournalEntry {
  return TaskJournalEntrySchema.parse(input);
}

export function parseTaskProposePayload(input: unknown): TaskProposePayload {
  return TaskProposePayloadSchema.parse(input);
}

export function parseTaskNegotiatePayload(input: unknown): TaskNegotiatePayload {
  return TaskNegotiatePayloadSchema.parse(input);
}

export function parseTaskAcceptPayload(input: unknown): TaskAcceptPayload {
  return TaskAcceptPayloadSchema.parse(input);
}

export function parseTaskRejectPayload(input: unknown): TaskRejectPayload {
  return TaskRejectPayloadSchema.parse(input);
}

export function parseTaskCancelPayload(input: unknown): TaskCancelPayload {
  return TaskCancelPayloadSchema.parse(input);
}

export function parseDataTransferVoucher(input: unknown): DataTransferVoucher {
  return DataTransferVoucherSchema.parse(input);
}

export function dataTransferVoucherForSigning(voucher: DataTransferVoucher): UnsignedDataTransferVoucher {
  const { signature: _signature, ...unsigned } = voucher;
  return unsigned;
}

export function parseTaskHeartbeatPayload(input: unknown): TaskHeartbeatPayload {
  return TaskHeartbeatPayloadSchema.parse(input);
}

export function parseTaskResultPayload(input: unknown): TaskResultPayload {
  return TaskResultPayloadSchema.parse(input);
}

export function parseArtifact(input: unknown): Artifact {
  return ArtifactSchema.parse(input);
}

export function parseTextArtifact(input: unknown): TextArtifact {
  return TextArtifactSchema.parse(input);
}

export function parseFileArtifact(input: unknown): FileArtifact {
  return FileArtifactSchema.parse(input);
}

export function parseStructuredArtifact(input: unknown): StructuredArtifact {
  return StructuredArtifactSchema.parse(input);
}

export function createTextArtifact(input: {
  content: string;
  mimeType?: string;
}): TextArtifact {
  return TextArtifactSchema.parse({
    kind: "text",
    content: input.content,
    mimeType: input.mimeType,
  });
}

export function createFileArtifact(input: {
  vaultPath: string;
  contentHash: string;
  mimeType?: string;
  sizeBytes?: number;
  displayName?: string;
}): FileArtifact {
  return FileArtifactSchema.parse({
    kind: "file",
    vaultPath: input.vaultPath,
    contentHash: input.contentHash,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    displayName: input.displayName,
  });
}

export function createStructuredArtifact(input: {
  schemaRef: string;
  data: Record<string, unknown>;
}): StructuredArtifact {
  return StructuredArtifactSchema.parse({
    kind: "structured",
    schemaRef: input.schemaRef,
    data: input.data,
  });
}

export function parseTaskFeedbackPayload(input: unknown): TaskFeedbackPayload {
  return TaskFeedbackPayloadSchema.parse(input);
}

export function parseOfficialCredentialPayload(input: unknown): SignedOfficialCredential {
  return SignedOfficialCredentialSchema.parse(input);
}

export function parseReport(input: unknown): Report {
  return ReportSchema.parse(input);
}

export function parseReportCreatePayload(input: unknown): ReportCreatePayload {
  return ReportCreatePayloadSchema.parse(input);
}

export function parseDeviceCertificate(input: unknown): DeviceCertificate {
  return DeviceCertificateSchema.parse(input);
}

export function parseDeviceRevocationRecord(input: unknown): DeviceRevocationRecord {
  return DeviceRevocationRecordSchema.parse(input);
}

export function parseAgentCredential(input: unknown): AgentCredential {
  return AgentCredentialSchema.parse(input);
}

export function agentCredentialForSigning(credential: AgentCredential): UnsignedAgentCredential {
  const { signature: _signature, ...unsigned } = credential;
  return unsigned;
}

export function capabilityTopicRecordForSigning(
  record: SignedCapabilityTopicRecord,
): UnsignedCapabilityTopicRecord {
  const { signature: _signature, ...unsigned } = record;
  return unsigned;
}

export function deviceCertificateForSigning(
  certificate: DeviceCertificate,
): UnsignedDeviceCertificate {
  const { signature: _signature, ...unsigned } = certificate;
  return unsigned;
}

export function deviceRevocationRecordForSigning(
  record: DeviceRevocationRecord,
): UnsignedDeviceRevocationRecord {
  const { signature: _signature, ...unsigned } = record;
  return unsigned;
}

export function createSystemPingPayload(message?: string): SystemPingPayload {
  return {
    nonce: randomUUID(),
    message,
  };
}

export interface CreateKnowledgeQueryPayloadInput {
  query: string;
  requestedSensitivity?: Sensitivity;
}

export function createKnowledgeQueryPayload(input: CreateKnowledgeQueryPayloadInput): KnowledgeQueryPayload {
  return KnowledgeQueryPayloadSchema.parse({
    query: input.query,
    requestedSensitivity: input.requestedSensitivity,
  });
}

export interface CreateKnowledgeResponsePayloadInput {
  inReplyTo: string;
  answer: string;
  sensitivity?: Sensitivity;
  matchScore?: number;
  suggestedRelativePath?: string;
  refused?: boolean;
  refusalReason?: string;
}

export function createKnowledgeResponsePayload(input: CreateKnowledgeResponsePayloadInput): KnowledgeResponsePayload {
  return KnowledgeResponsePayloadSchema.parse({
    inReplyTo: input.inReplyTo,
    answer: input.answer,
    sensitivity: input.sensitivity ?? "public",
    matchScore: input.matchScore,
    suggestedRelativePath: input.suggestedRelativePath,
    refused: input.refused ?? false,
    refusalReason: input.refusalReason,
  });
}

// Phase 45 — Web Content Browsing create helpers.
export interface CreateLibraryReadPayloadInput {
  requesterOwnerId: string;
  targetOwnerId: string;
  path: string;
  requestedSensitivity?: Sensitivity;
  range?: LibraryReadRange;
  ifNoneMatch?: string;
}

export function createLibraryReadPayload(input: CreateLibraryReadPayloadInput): LibraryReadPayload {
  return LibraryReadPayloadSchema.parse({
    requesterOwnerId: input.requesterOwnerId,
    targetOwnerId: input.targetOwnerId,
    path: input.path,
    requestedSensitivity: input.requestedSensitivity,
    range: input.range,
    ifNoneMatch: input.ifNoneMatch,
  });
}

export interface CreateLibraryReadResponsePayloadInput {
  inReplyTo: string;
  status: LibraryReadResponseStatus;
  body?: string;
  contentType?: string;
  contentHash?: string;
  byteLength?: number;
  etag?: string;
  range?: { start: number; end: number; total: number };
  publicRedirection?: string;
}

export function createLibraryReadResponsePayload(
  input: CreateLibraryReadResponsePayloadInput,
): LibraryReadResponsePayload {
  return LibraryReadResponsePayloadSchema.parse({
    inReplyTo: input.inReplyTo,
    status: input.status,
    body: input.body,
    contentType: input.contentType,
    contentHash: input.contentHash,
    byteLength: input.byteLength,
    etag: input.etag,
    range: input.range,
    publicRedirection: input.publicRedirection,
  });
}

export interface CreateFeedNotifyPayloadInput {
  publisherOwnerId: string;
  publishedAt: string;
  title: string;
  url: string;
  kind: FeedNotifyPayload["kind"];
  visibility: FeedNotifyPayload["visibility"];
  summary?: string;
  tags?: string[];
  contentHash?: string;
  listingUrl?: string;
  imageUrls?: string[];
}

export function createFeedNotifyPayload(input: CreateFeedNotifyPayloadInput): FeedNotifyPayload {
  return FeedNotifyPayloadSchema.parse({
    publisherOwnerId: input.publisherOwnerId,
    publishedAt: input.publishedAt,
    title: input.title,
    url: input.url,
    kind: input.kind,
    visibility: input.visibility,
    summary: input.summary,
    tags: input.tags,
    contentHash: input.contentHash,
    listingUrl: input.listingUrl,
    imageUrls: input.imageUrls,
  });
}

export interface CreateFeedEngagePayloadInput {
  url: string;
  action: FeedEngagePayload["action"];
  text?: string;
  commentId?: string;
  actorOwnerId?: string;
  starOwnerIds?: string[];
  comments?: FeedEngagePayload["comments"];
}

export function createFeedEngagePayload(input: CreateFeedEngagePayloadInput): FeedEngagePayload {
  return FeedEngagePayloadSchema.parse({
    url: input.url,
    action: input.action,
    text: input.text,
    commentId: input.commentId,
    actorOwnerId: input.actorOwnerId,
    starOwnerIds: input.starOwnerIds,
    comments: input.comments,
  });
}

export interface CreateSharePreviewPayloadInput {
  inReplyTo: string;
  previewText: string;
  sensitivity?: Sensitivity;
  requiresApproval?: boolean;
  contentHint?: string;
  isFileTransfer?: boolean;
  refused?: boolean;
  refusalReason?: string;
}

export function createSharePreviewPayload(input: CreateSharePreviewPayloadInput): SharePreviewPayload {
  return SharePreviewPayloadSchema.parse({
    inReplyTo: input.inReplyTo,
    previewText: input.previewText,
    sensitivity: input.sensitivity ?? "public",
    requiresApproval: input.requiresApproval ?? false,
    contentHint: input.contentHint,
    isFileTransfer: input.isFileTransfer ?? false,
    refused: input.refused ?? false,
    refusalReason: input.refusalReason,
  });
}

export interface CreateShareRequestPayloadInput {
  requestType: "knowledge" | "file";
  query?: string;
  relativePath?: string;
  requestedSensitivity?: Sensitivity;
  correlationId?: string;
  fileOrigin?: "responder" | "sender";
  deliveryChannel?: "inbox" | "chat" | "agent";
  chatRoomId?: string;
  chatMessageId?: string;
  chatAttachmentId?: string;
}

export function createShareRequestPayload(input: CreateShareRequestPayloadInput): ShareRequestPayload {
  return ShareRequestPayloadSchema.parse({
    requestType: input.requestType,
    query: input.query,
    relativePath: input.relativePath,
    requestedSensitivity: input.requestedSensitivity ?? "public",
    correlationId: input.correlationId,
    fileOrigin: input.fileOrigin ?? "responder",
    deliveryChannel: input.deliveryChannel ?? "inbox",
    chatRoomId: input.chatRoomId,
    chatMessageId: input.chatMessageId,
    chatAttachmentId: input.chatAttachmentId,
  });
}

export interface CreateShareAcceptPayloadInput {
  inReplyTo: string;
  accept?: boolean;
}

export function createShareAcceptPayload(input: CreateShareAcceptPayloadInput): ShareAcceptPayload {
  return ShareAcceptPayloadSchema.parse({
    inReplyTo: input.inReplyTo,
    accept: input.accept ?? true,
  });
}

export interface CreateBondRequestPayloadInput {
  requesterOwnerId: string;
  requesterDisplayName?: string;
  message?: string;
  proofOfContext?: string;
  requestedLevel?: BondRequestedLevel;
  introCorrelationId?: string;
  ownerCommitmentRef?: string;
}

export function createBondRequestPayload(input: CreateBondRequestPayloadInput): BondRequestPayload {
  return BondRequestPayloadSchema.parse({
    requesterOwnerId: input.requesterOwnerId,
    requesterDisplayName: input.requesterDisplayName,
    message: input.message,
    proofOfContext: input.proofOfContext,
    requestedLevel: input.requestedLevel,
    introCorrelationId: input.introCorrelationId,
    ownerCommitmentRef: input.ownerCommitmentRef,
  });
}

export interface CreateHumanProfileFragmentPayloadInput {
  ownerId: string;
  purpose: HumanProfileFragmentPayload["purpose"];
  expiresAt: string;
  displayName?: string;
  bio?: string;
  hobbies?: string[];
  tags?: string[];
  /** Placeholder until caller signs with owner key via identity.signCanonicalPayload */
  signature?: string;
}

export function createHumanProfileFragmentPayload(
  input: CreateHumanProfileFragmentPayloadInput,
): HumanProfileFragmentPayload {
  return HumanProfileFragmentPayloadSchema.parse({
    version: "0.1",
    ownerId: input.ownerId,
    purpose: input.purpose,
    expiresAt: input.expiresAt,
    displayName: input.displayName,
    bio: input.bio,
    hobbies: input.hobbies,
    tags: input.tags,
    signature: input.signature ?? "",
  });
}

export interface CreateFriendMatchingPreferencesPayloadInput {
  ownerId: string;
  text: string;
  matchingLocation?: DiscoveryLocation;
  matchingLocationScope?: "country" | "region" | "city" | "town" | "nearby";
  expiresAt: string;
  signature: string;
}

export function createFriendMatchingPreferencesPayload(
  input: CreateFriendMatchingPreferencesPayloadInput,
): FriendMatchingPreferencesPayload {
  return FriendMatchingPreferencesPayloadSchema.parse({
    version: "0.1",
    ownerId: input.ownerId,
    text: input.text,
    matchingLocation: input.matchingLocation,
    matchingLocationScope: input.matchingLocationScope,
    expiresAt: input.expiresAt,
    signature: input.signature,
  });
}

export interface CreateSocialIntroSyncPayloadInput {
  introCorrelationId: string;
  ownerId: string;
  counterpartyOwnerIdHint?: string;
  profileFragmentRefs?: string[];
  interest: SocialIntroSyncPayload["interest"];
  noteToCounterpartyAgent?: string;
}

export function createSocialIntroSyncPayload(input: CreateSocialIntroSyncPayloadInput): SocialIntroSyncPayload {
  return SocialIntroSyncPayloadSchema.parse({
    introCorrelationId: input.introCorrelationId,
    ownerId: input.ownerId,
    counterpartyOwnerIdHint: input.counterpartyOwnerIdHint,
    profileFragmentRefs: input.profileFragmentRefs ?? [],
    interest: input.interest,
    noteToCounterpartyAgent: input.noteToCounterpartyAgent,
  });
}

export interface CreateSocialIntroProposePayloadInput {
  introCorrelationId: string;
  candidateOwnerId: string;
  candidatePeerId: string;
  profileFragment?: HumanProfileFragmentPayload;
  profileFragmentRef?: string;
  rationale?: string;
}

export function createSocialIntroProposePayload(
  input: CreateSocialIntroProposePayloadInput,
): SocialIntroProposePayload {
  return SocialIntroProposePayloadSchema.parse({
    introCorrelationId: input.introCorrelationId,
    candidateOwnerId: input.candidateOwnerId,
    candidatePeerId: input.candidatePeerId,
    profileFragment: input.profileFragment,
    profileFragmentRef: input.profileFragmentRef,
    rationale: input.rationale,
  });
}

export interface CreateSocialIntroOwnerReadyPayloadInput {
  introCorrelationId: string;
  ownerId: string;
  nonce: string;
  expiresAt: string;
}

export function createSocialIntroOwnerReadyPayload(
  input: CreateSocialIntroOwnerReadyPayloadInput,
): SocialIntroOwnerReadyPayload {
  return SocialIntroOwnerReadyPayloadSchema.parse({
    introCorrelationId: input.introCorrelationId,
    ownerId: input.ownerId,
    nonce: input.nonce,
    expiresAt: input.expiresAt,
  });
}

export interface CreateBondChallengePayloadInput {
  challengeId?: string;
  nonce?: string;
  challengerOwnerId: string;
  targetOwnerId: string;
  expiresAt?: string;
  message?: string;
}

export function createBondChallengePayload(input: CreateBondChallengePayloadInput): BondChallengePayload {
  return BondChallengePayloadSchema.parse({
    challengeId: input.challengeId ?? randomUUID(),
    nonce: input.nonce ?? randomUUID(),
    challengerOwnerId: input.challengerOwnerId,
    targetOwnerId: input.targetOwnerId,
    expiresAt: input.expiresAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    message: input.message,
  });
}

export interface CreateBondChallengeResponsePayloadInput {
  challengeId: string;
  nonce: string;
  responderOwnerId: string;
  decision: BondChallengeResponsePayload["decision"];
  proofOfContext?: string;
  note?: string;
}

export function createBondChallengeResponsePayload(
  input: CreateBondChallengeResponsePayloadInput,
): BondChallengeResponsePayload {
  return BondChallengeResponsePayloadSchema.parse({
    challengeId: input.challengeId,
    nonce: input.nonce,
    responderOwnerId: input.responderOwnerId,
    decision: input.decision,
    proofOfContext: input.proofOfContext,
    note: input.note,
  });
}

export interface CreateDiscoveryRequestPayloadInput {
  requesterOwnerId: string;
  requestedTagHashes?: string[];
  requestedCapabilities?: string[];
  maxResults?: number;
  requestedSensitivity?: "public" | "friends" | "private";
  fileTitleQuery?: string;
  requestedContentHashPrefixes?: string[];
  requestedPublishTopics?: string[];
  maxHops?: number;
  currentHop?: number;
  forwardPrivacy?: "none" | "anonymous";
  referralOwnerId?: string;
  referralAttestation?: DiscoveryReferralAttestation;
}

export function createDiscoveryRequestPayload(
  input: CreateDiscoveryRequestPayloadInput,
): DiscoveryRequestPayload {
  return DiscoveryRequestPayloadSchema.parse({
    requesterOwnerId: input.requesterOwnerId,
    requestedTagHashes: input.requestedTagHashes ?? [],
    requestedCapabilities: input.requestedCapabilities ?? [],
    maxResults: input.maxResults,
    requestedSensitivity: input.requestedSensitivity,
    fileTitleQuery: input.fileTitleQuery,
    requestedContentHashPrefixes: input.requestedContentHashPrefixes,
    requestedPublishTopics: input.requestedPublishTopics,
    maxHops: input.maxHops,
    currentHop: input.currentHop,
    forwardPrivacy: input.forwardPrivacy,
    referralOwnerId: input.referralOwnerId,
    referralAttestation: input.referralAttestation,
  });
}

export function parseSyncStatePayload(input: unknown): SyncStatePayload {
  return SyncStatePayloadSchema.parse(input);
}

export interface CreateSyncStatePayloadInput {
  scope: string;
  updateBase64: string;
  senderOwnerId: string;
}

export function createSyncStatePayload(input: CreateSyncStatePayloadInput): SyncStatePayload {
  return SyncStatePayloadSchema.parse(input);
}

export interface CreateDiscoveryResponsePayloadInput {
  requestMessageId: string;
  responderOwnerId: string;
  matches?: DiscoveryMatch[];
  truncated?: boolean;
  forwardPendingAck?: boolean;
}

export function createDiscoveryResponsePayload(
  input: CreateDiscoveryResponsePayloadInput,
): DiscoveryResponsePayload {
  return DiscoveryResponsePayloadSchema.parse({
    requestMessageId: input.requestMessageId,
    responderOwnerId: input.responderOwnerId,
    matches: input.matches ?? [],
    truncated: input.truncated ?? false,
    forwardPendingAck: input.forwardPendingAck ?? false,
  });
}

export interface CreateBroadcastRequestPayloadInput {
  queryId: string;
  ttl?: number;
  maxResponses?: number;
  requestedTagHashes?: string[];
  requestedCapabilities?: string[];
  requestedSensitivity?: "public" | "friends" | "private";
  senderOwnerId: string;
  timeoutMs?: number;
}

export function createBroadcastRequestPayload(input: CreateBroadcastRequestPayloadInput): BroadcastRequestPayload {
  return BroadcastRequestPayloadSchema.parse({
    queryId: input.queryId,
    ttl: input.ttl ?? 1,
    maxResponses: input.maxResponses ?? 10,
    requestedTagHashes: input.requestedTagHashes ?? [],
    requestedCapabilities: input.requestedCapabilities ?? [],
    requestedSensitivity: input.requestedSensitivity ?? "public",
    senderOwnerId: input.senderOwnerId,
    timeoutMs: input.timeoutMs ?? 30_000,
  });
}

export interface CreateBroadcastResponsePayloadInput {
  queryId: string;
  responderOwnerId: string;
  responderPeerId: string;
  matchedTagHashes?: string[];
  matchedCapabilities?: string[];
  done?: boolean;
}

export function createBroadcastResponsePayload(input: CreateBroadcastResponsePayloadInput): BroadcastResponsePayload {
  return BroadcastResponsePayloadSchema.parse({
    queryId: input.queryId,
    responderOwnerId: input.responderOwnerId,
    responderPeerId: input.responderPeerId,
    matchedTagHashes: input.matchedTagHashes ?? [],
    matchedCapabilities: input.matchedCapabilities ?? [],
    done: input.done ?? false,
  });
}

export interface CreateBroadcastCancelPayloadInput {
  queryId: string;
  reason?: string;
}

export function createBroadcastCancelPayload(input: CreateBroadcastCancelPayloadInput): BroadcastCancelPayload {
  return BroadcastCancelPayloadSchema.parse({
    queryId: input.queryId,
    reason: input.reason ?? "cancelled",
  });
}

export interface CreateRelayPeersResponsePayloadInput {
  requestMessageId: string;
  peers?: RelayPeerInfo[];
}

export function createRelayPeersResponsePayload(
  input: CreateRelayPeersResponsePayloadInput,
): RelayPeersResponsePayload {
  return RelayPeersResponsePayloadSchema.parse({
    requestMessageId: input.requestMessageId,
    peers: input.peers ?? [],
  });
}

export type CreateRelayCheckinPayloadInput = z.input<typeof RelayCheckinPayloadSchema>;
export function createRelayCheckinPayload(input: CreateRelayCheckinPayloadInput): RelayCheckinPayload {
  return RelayCheckinPayloadSchema.parse(input);
}

export type CreateRelayLookupPayloadInput = z.input<typeof RelayLookupPayloadSchema>;
export function createRelayLookupPayload(input: CreateRelayLookupPayloadInput): RelayLookupPayload {
  return RelayLookupPayloadSchema.parse(input);
}

export type CreateRelayLookupResponsePayloadInput = z.input<typeof RelayLookupResponsePayloadSchema>;
export function createRelayLookupResponsePayload(
  input: CreateRelayLookupResponsePayloadInput,
): RelayLookupResponsePayload {
  return RelayLookupResponsePayloadSchema.parse(input);
}

export type CreateRelayHintsRequestPayloadInput = z.input<typeof RelayHintsRequestPayloadSchema>;
export function createRelayHintsRequestPayload(input: CreateRelayHintsRequestPayloadInput): RelayHintsRequestPayload {
  return RelayHintsRequestPayloadSchema.parse(input);
}

export type CreateRelayHintsResponsePayloadInput = z.input<typeof RelayHintsResponsePayloadSchema>;
export function createRelayHintsResponsePayload(
  input: CreateRelayHintsResponsePayloadInput,
): RelayHintsResponsePayload {
  return RelayHintsResponsePayloadSchema.parse(input);
}

export type CreateRelayJoinRequestPayloadInput = z.input<typeof RelayJoinRequestPayloadSchema>;
export function createRelayJoinRequestPayload(input: CreateRelayJoinRequestPayloadInput): RelayJoinRequestPayload {
  return RelayJoinRequestPayloadSchema.parse(input);
}

export type CreateRelayJoinResponsePayloadInput = z.input<typeof RelayJoinResponsePayloadSchema>;
export function createRelayJoinResponsePayload(input: CreateRelayJoinResponsePayloadInput): RelayJoinResponsePayload {
  return RelayJoinResponsePayloadSchema.parse(input);
}

export type CreateRelayRegisterPayloadInput = z.input<typeof RelayRegisterPayloadSchema>;
export function createRelayRegisterPayload(input: CreateRelayRegisterPayloadInput): RelayRegisterPayload {
  return RelayRegisterPayloadSchema.parse(input);
}

export type CreateRelayRegisterResponsePayloadInput = z.input<typeof RelayRegisterResponsePayloadSchema>;
export function createRelayRegisterResponsePayload(
  input: CreateRelayRegisterResponsePayloadInput,
): RelayRegisterResponsePayload {
  return RelayRegisterResponsePayloadSchema.parse(input);
}

export type CreateRelaySummaryPayloadInput = z.input<typeof RelaySummaryPayloadSchema>;
export function createRelaySummaryPayload(input: CreateRelaySummaryPayloadInput): RelaySummaryPayload {
  return RelaySummaryPayloadSchema.parse(input);
}

export interface CreateRendezvousRegisterPayloadInput {
  peerId: string;
  multiaddr: string;
  capabilities: Array<
    | { tag: string }
    | { type: string; params?: Record<string, unknown>; confidence?: number }
    | { descriptor: string }
  >;
  ttlSeconds?: number;
}

export function createRendezvousRegisterPayload(
  input: CreateRendezvousRegisterPayloadInput,
): RendezvousRegisterPayload {
  return RendezvousRegisterPayloadSchema.parse({
    peerId: input.peerId,
    multiaddr: input.multiaddr,
    capabilities: input.capabilities,
    ttlSeconds: input.ttlSeconds ?? 3600,
  });
}

export interface CreateRendezvousQueryPayloadInput {
  match:
    | { tag: string }
    | { type: string; params?: Record<string, unknown> };
  maxResults?: number;
}

export function createRendezvousQueryPayload(input: CreateRendezvousQueryPayloadInput): RendezvousQueryPayload {
  return RendezvousQueryPayloadSchema.parse({
    match: input.match,
    maxResults: input.maxResults ?? 10,
  });
}

export interface CreateRendezvousMatchInput {
  peerId: string;
  multiaddr: string;
  capabilities: Array<
    | { tag: string }
    | { type: string; params?: Record<string, unknown>; confidence?: number }
    | { descriptor: string }
  >;
}

export function createRendezvousMatch(input: CreateRendezvousMatchInput): RendezvousMatch {
  return RendezvousMatchSchema.parse(input);
}

export interface CreateRendezvousResponsePayloadInput {
  matches: CreateRendezvousMatchInput[];
}

export function createRendezvousResponsePayload(
  input: CreateRendezvousResponsePayloadInput,
): RendezvousResponsePayload {
  return RendezvousResponsePayloadSchema.parse({
    matches: input.matches.map((m) => createRendezvousMatch(m)),
  });
}

export interface CreateChatMessagePayloadInput {
  senderOwnerId: string;
  text?: string;
  attachments?: ChatRoomAttachment[];
  listingId?: string;
  deviceCertificate?: DeviceCertificate;
  ownerPublicKeyPem?: string;
}

export function createChatMessagePayload(input: CreateChatMessagePayloadInput): ChatMessagePayload {
  return ChatMessagePayloadSchema.parse({
    senderOwnerId: input.senderOwnerId,
    text: input.text ?? "",
    attachments: input.attachments,
    listingId: input.listingId,
    deviceCertificate: input.deviceCertificate,
    ownerPublicKeyPem: input.ownerPublicKeyPem,
  });
}

export interface CreateChatRoomSyncPayloadInput {
  roomId: string;
  title: string;
  creatorOwnerId: string;
  updatedByOwnerId: string;
  memberOwnerIds: string[];
  revision: number;
  updatedAt?: string;
  action: ChatRoomSyncPayload["action"];
  removedMemberOwnerIds?: string[];
  deviceCertificate?: DeviceCertificate;
  ownerPublicKeyPem?: string;
}

export function createChatRoomSyncPayload(input: CreateChatRoomSyncPayloadInput): ChatRoomSyncPayload {
  return ChatRoomSyncPayloadSchema.parse({
    roomId: input.roomId,
    title: input.title,
    creatorOwnerId: input.creatorOwnerId,
    updatedByOwnerId: input.updatedByOwnerId,
    memberOwnerIds: input.memberOwnerIds,
    revision: input.revision,
    updatedAt: input.updatedAt ?? new Date().toISOString(),
    action: input.action,
    removedMemberOwnerIds: input.removedMemberOwnerIds,
    deviceCertificate: input.deviceCertificate,
    ownerPublicKeyPem: input.ownerPublicKeyPem,
  });
}

export interface CreateChatRoomMessagePayloadInput {
  roomId: string;
  senderOwnerId: string;
  text: string;
  attachments?: ChatRoomAttachment[];
  deviceCertificate?: DeviceCertificate;
  ownerPublicKeyPem?: string;
}

export function createChatRoomMessagePayload(
  input: CreateChatRoomMessagePayloadInput,
): ChatRoomMessagePayload {
  return ChatRoomMessagePayloadSchema.parse({
    roomId: input.roomId,
    senderOwnerId: input.senderOwnerId,
    text: input.text,
    attachments: input.attachments,
    deviceCertificate: input.deviceCertificate,
    ownerPublicKeyPem: input.ownerPublicKeyPem,
  });
}

export interface CreateChatDeliveredPayloadInput {
  messageId: string;
  recipientOwnerId: string;
  deliveredAt?: string;
}

export function createChatDeliveredPayload(input: CreateChatDeliveredPayloadInput): ChatDeliveredPayload {
  return ChatDeliveredPayloadSchema.parse({
    messageId: input.messageId,
    recipientOwnerId: input.recipientOwnerId,
    deliveredAt: input.deliveredAt ?? new Date().toISOString(),
  });
}

export interface CreateUnsignedDeviceRevocationRecordInput {
  ownerId: string;
  deviceId: string;
  reason: DeviceRevocationReason;
  certificateId?: string;
  revokedAt?: string;
  revocationId?: string;
}

export function createUnsignedDeviceRevocationRecord(
  input: CreateUnsignedDeviceRevocationRecordInput,
): UnsignedDeviceRevocationRecord {
  return UnsignedDeviceRevocationRecordSchema.parse({
    version: "0.1",
    revocationId: input.revocationId ?? `revocation_${randomUUID()}`,
    ownerId: input.ownerId,
    deviceId: input.deviceId,
    certificateId: input.certificateId,
    reason: input.reason,
    revokedAt: input.revokedAt ?? new Date().toISOString(),
  });
}

export interface CreateSystemSignalPayloadInput {
  deviceCertificate: DeviceCertificate;
  ownerPublicKeyPem: string;
  supportedProtocolVersions?: string[];
  supportedCapabilities?: SystemSignalPayload["supportedCapabilities"];
  listenAddrs?: string[];
  publicTopics?: string[];
  status?: SystemSignalPayload["status"];
}

export function createSystemSignalPayload(
  input: CreateSystemSignalPayloadInput,
): SystemSignalPayload {
  return {
    ownerId: input.deviceCertificate.ownerId,
    ownerPublicKeyPem: input.ownerPublicKeyPem,
    deviceId: input.deviceCertificate.deviceId,
    deviceCertificate: input.deviceCertificate,
    deviceProfile: input.deviceCertificate.deviceProfile,
    capabilities: input.deviceCertificate.capabilities,
    supportedProtocolVersions: input.supportedProtocolVersions ?? ["emp/0.1"],
    supportedCapabilities: input.supportedCapabilities ?? [],
    listenAddrs: input.listenAddrs ?? [],
    publicTopics: input.publicTopics ?? [],
    status: input.status ?? "online",
  };
}

export interface CreateAuthChallengePayloadInput {
  challengerOwnerId?: string;
  challengerDeviceId?: string;
  targetOwnerId?: string;
  targetDeviceId?: string;
  requestedIntent?: EnvoyIntent;
  expiresAt?: string;
}

export function createAuthChallengePayload(
  input: CreateAuthChallengePayloadInput = {},
): AuthChallengePayload {
  return {
    challengeId: `challenge_${randomUUID()}`,
    nonce: randomUUID(),
    challengerOwnerId: input.challengerOwnerId,
    challengerDeviceId: input.challengerDeviceId,
    targetOwnerId: input.targetOwnerId,
    targetDeviceId: input.targetDeviceId,
    requestedIntent: input.requestedIntent,
    expiresAt: input.expiresAt ?? new Date(Date.now() + 5 * 60 * 1000).toISOString(),
  };
}

export function authChallengeProofForSigning(
  response: AuthChallengeResponsePayload,
): AuthChallengeProof {
  const {
    ownerPublicKeyPem: _ownerPublicKeyPem,
    deviceCertificate: _deviceCertificate,
    proof: _proof,
    ...proofPayload
  } = response;
  return proofPayload;
}

export interface CreateAgentCardInput {
  ownerId: string;
  displayName: string;
  nodeProfile: DeviceProfile;
  membership: string[];
  publicTopics?: string[];
  trustPolicySummary?: Partial<TrustPolicySummary>;
  supportedProtocolVersions?: string[];
  /** Phase 45D — optional canonical web root URL. */
  webContentRoot?: string;
  /** Agent Network worker profile (when opted into Join Agent Network). */
  agentNetworkProfile?: import("./agent-network-profile.js").AgentNetworkProfile;
  /** Phase 60 — protocol feature negotiation tags. */
  features?: AgentCardProtocolFeature[];
}

export function createAgentCard(input: CreateAgentCardInput): AgentCard {
  return AgentCardSchema.parse({
    version: "0.1",
    ownerId: input.ownerId,
    displayName: input.displayName,
    nodeProfile: input.nodeProfile,
    membership: input.membership,
    publicTopics: input.publicTopics ?? [],
    trustPolicySummary: {
      acceptsDirectBondRequests: false,
      acceptsReferralRequests: true,
      requiresHumanApprovalForRawFiles: true,
      ...input.trustPolicySummary,
    },
    supportedProtocolVersions: input.supportedProtocolVersions ?? ["emp/0.1"],
    ...(input.webContentRoot ? { webContentRoot: input.webContentRoot } : {}),
    ...(input.agentNetworkProfile
      ? { agentNetworkProfile: input.agentNetworkProfile }
      : {}),
    ...(input.features && input.features.length > 0
      ? { features: input.features }
      : {}),
  });
}

export function createAgentCardRequestPayload(
  input: Partial<AgentCardRequestPayload> = {},
): AgentCardRequestPayload {
  return AgentCardRequestPayloadSchema.parse({
    requesterOwnerId: input.requesterOwnerId,
    requesterDeviceId: input.requesterDeviceId,
    requestedTopics: input.requestedTopics ?? [],
    requestedCapabilities: input.requestedCapabilities ?? [],
  });
}

export function createAgentCardResponsePayload(card: AgentCard): AgentCardResponsePayload {
  return {
    card,
  };
}

export function mandateForSigning(mandate: Mandate): UnsignedMandate {
  const { signature: _signature, ...unsigned } = mandate;
  return unsigned;
}

export interface CreateUnsignedMandateInput {
  ownerId: string;
  issuedToDeviceId: string;
  taskIntent: string;
  objective: string;
  allowedPeerScopes?: MandatePeerScope[];
  allowedActions?: MandateAction[];
  disallowedActions?: MandateAction[];
  maxSensitivity?: Sensitivity;
  maxCost?: MandateCostLimit;
  expiresAt?: string;
  closeOnFirstCompletedResult?: boolean;
  collectCompletedResults?: number;
  ttl?: number;
  requiresApprovalFor?: MandateAction[];
  mandateId?: string;
  posture?: EmpPosture;
  posturePolicy?: z.infer<typeof PosturePolicySchema>;
  issuedToAgentId?: string;
}

export function createUnsignedMandate(input: CreateUnsignedMandateInput): UnsignedMandate {
  return UnsignedMandateSchema.parse({
    version: "0.1",
    mandateId: input.mandateId ?? `mandate_${randomUUID()}`,
    ownerId: input.ownerId,
    issuedToDeviceId: input.issuedToDeviceId,
    taskIntent: input.taskIntent,
    objective: input.objective,
    allowedPeerScopes: input.allowedPeerScopes ?? ["direct"],
    allowedActions: input.allowedActions ?? ["discover", "query", "negotiate", "report"],
    disallowedActions: input.disallowedActions ?? [
      "purchase",
      "share.private_data",
      "send.raw_files",
    ],
    maxSensitivity: input.maxSensitivity ?? "public",
    maxCost: input.maxCost ?? { amount: 0, currency: "USD" },
    expiresAt: input.expiresAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    closeOnFirstCompletedResult: input.closeOnFirstCompletedResult ?? false,
    collectCompletedResults: input.collectCompletedResults,
    ttl: input.ttl ?? 3,
    requiresApprovalFor: input.requiresApprovalFor ?? ["purchase", "raw_contact_exchange"],
    posture: input.posture,
    posturePolicy: input.posturePolicy,
    issuedToAgentId: input.issuedToAgentId,
  });
}

export interface CreateUnsignedAgentCredentialInput {
  ownerId: string;
  ownerPublicKeyPem: string;
  agentId: string;
  agentPeerId: string;
  agentPublicKeyPem: string;
  scope?: string[];
  credentialId?: string;
  issuedAt?: string;
  expiresAt?: string | null;
}

export function createUnsignedAgentCredential(
  input: CreateUnsignedAgentCredentialInput,
): UnsignedAgentCredential {
  return UnsignedAgentCredentialSchema.parse({
    version: "0.1",
    credentialId: input.credentialId ?? `agent_cred_${randomUUID()}`,
    ownerId: input.ownerId,
    ownerPublicKeyPem: input.ownerPublicKeyPem,
    agentId: input.agentId,
    agentPeerId: input.agentPeerId,
    agentPublicKeyPem: input.agentPublicKeyPem,
    scope: input.scope ?? ["chat.message", "knowledge.query", "discovery.request", "discovery.response", "share.request", "share.preview", "share.accept"],
    issuedAt: input.issuedAt ?? new Date().toISOString(),
    expiresAt: input.expiresAt ?? null,
  });
}


export interface CreateDevicePairRequestPayloadInput {
  requesterOwnerId: string;
  requesterDeviceId: string;
  requesterDevicePublicKeyPem: string;
  requestedDeviceProfile?: DeviceProfile;
  requestedCapabilities?: Capability[];
  note?: string;
  requestId?: string;
  createdAt?: string;
  /** Same value as `PairingPayload.token` from the QR / `getPairingPayload` RPC. */
  pairingToken?: string;
  /**
   * @deprecated Prefer {@link lanFleetTokenProof}. Do not send plaintext tokens
   * from current nodes.
   */
  lanFleetToken?: string;
  /** Phase 35C — HMAC proof of fleet token (see DevicePairRequestPayloadSchema). */
  lanFleetTokenProof?: string;
}

export function createDevicePairRequestPayload(
  input: CreateDevicePairRequestPayloadInput,
): DevicePairRequestPayload {
  return DevicePairRequestPayloadSchema.parse({
    requestId: input.requestId ?? `pair_req_${randomUUID()}`,
    requesterOwnerId: input.requesterOwnerId,
    requesterDeviceId: input.requesterDeviceId,
    requesterDevicePublicKeyPem: input.requesterDevicePublicKeyPem,
    requestedDeviceProfile: input.requestedDeviceProfile,
    requestedCapabilities: input.requestedCapabilities,
    note: input.note,
    createdAt: input.createdAt ?? new Date().toISOString(),
    pairingToken: input.pairingToken,
    lanFleetToken: input.lanFleetToken,
    lanFleetTokenProof: input.lanFleetTokenProof,
  });
}

export function createDevicePairApprovePayload(
  input: Omit<DevicePairApprovePayload, "approvedAt"> & { approvedAt?: string },
): DevicePairApprovePayload {
  return DevicePairApprovePayloadSchema.parse({
    ...input,
    approvedAt: input.approvedAt ?? new Date().toISOString(),
  });
}

export function createDevicePairDeferredPayload(
  input: Omit<DevicePairDeferredPayload, "createdAt"> & { createdAt?: string },
): DevicePairDeferredPayload {
  return DevicePairDeferredPayloadSchema.parse({
    ...input,
    createdAt: input.createdAt ?? new Date().toISOString(),
  });
}

export interface CreateUnsignedDataTransferVoucherInput {
  issuerPeerId: string;
  issuerOwnerId: string;
  issuerDeviceId: string;
  relativePath: string;
  totalBytes: number;
  contentHash: string;
  issuedAt?: string;
  expiresAt?: string;
  transferId?: string;
}

export function createUnsignedDataTransferVoucher(
  input: CreateUnsignedDataTransferVoucherInput,
): UnsignedDataTransferVoucher {
  const issuedAt = input.issuedAt ?? new Date().toISOString();
  return UnsignedDataTransferVoucherSchema.parse({
    version: "0.1",
    transferId: input.transferId ?? `xfer_${randomUUID()}`,
    issuerPeerId: input.issuerPeerId,
    issuerOwnerId: input.issuerOwnerId,
    issuerDeviceId: input.issuerDeviceId,
    relativePath: input.relativePath,
    totalBytes: input.totalBytes,
    contentHash: input.contentHash,
    issuedAt,
    expiresAt: input.expiresAt ?? new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  });
}

export function proofOfIntentForSigning(proof: ProofOfIntent): ProofOfIntentPayload {
  const { proof: _proof, ...payload } = proof;
  return payload;
}

export function createTaskMandatePayload(
  mandate: Mandate,
  input: { taskId?: string } = {},
): TaskMandatePayload {
  return {
    taskId: input.taskId,
    mandate,
  };
}

export interface CreateTaskJournalEntryInput {
  taskId: string;
  eventType: TaskJournalEventType;
  state: TaskLifecycleState;
  summary: string;
  mandateId?: string;
  peerOwnerId?: string;
  peerDeviceId?: string;
  relatedMessageId?: string;
  createdAt?: string;
  eventId?: string;
}

export function createTaskJournalEntry(input: CreateTaskJournalEntryInput): TaskJournalEntry {
  return TaskJournalEntrySchema.parse({
    version: "0.1",
    eventId: input.eventId ?? `event_${randomUUID()}`,
    taskId: input.taskId,
    mandateId: input.mandateId,
    eventType: input.eventType,
    state: input.state,
    summary: input.summary,
    peerOwnerId: input.peerOwnerId,
    peerDeviceId: input.peerDeviceId,
    relatedMessageId: input.relatedMessageId,
    createdAt: input.createdAt ?? new Date().toISOString(),
  });
}

export interface CreateTaskProposePayloadInput {
  taskId: string;
  mandateId: string;
  proofOfIntent: ProofOfIntent;
  objective: string;
  requestedResult: string;
  constraints?: string[];
  expiresAt?: string;
}

export function createTaskProposePayload(
  input: CreateTaskProposePayloadInput,
): TaskProposePayload {
  return TaskProposePayloadSchema.parse({
    taskId: input.taskId,
    mandateId: input.mandateId,
    proofOfIntent: input.proofOfIntent,
    objective: input.objective,
    requestedResult: input.requestedResult,
    constraints: input.constraints ?? [],
    expiresAt: input.expiresAt,
  });
}

export interface CreateTaskNegotiatePayloadInput {
  taskId: string;
  mandateId: string;
  proofOfIntent: ProofOfIntent;
  message: string;
  proposedChanges?: string[];
  requiresOwnerApproval?: boolean;
  negotiationId?: string;
}

export function createTaskNegotiatePayload(
  input: CreateTaskNegotiatePayloadInput,
): TaskNegotiatePayload {
  return TaskNegotiatePayloadSchema.parse({
    taskId: input.taskId,
    mandateId: input.mandateId,
    proofOfIntent: input.proofOfIntent,
    negotiationId: input.negotiationId ?? `negotiation_${randomUUID()}`,
    message: input.message,
    proposedChanges: input.proposedChanges ?? [],
    requiresOwnerApproval: input.requiresOwnerApproval ?? false,
  });
}

export function createTaskAcceptPayload(
  input: Omit<TaskAcceptPayload, "acceptedAt"> & { acceptedAt?: string },
): TaskAcceptPayload {
  return TaskAcceptPayloadSchema.parse({
    ...input,
    acceptedAt: input.acceptedAt ?? new Date().toISOString(),
  });
}

export function createTaskRejectPayload(input: TaskRejectPayload): TaskRejectPayload {
  return TaskRejectPayloadSchema.parse(input);
}

export function createTaskCancelPayload(
  input: Omit<TaskCancelPayload, "createdAt"> & { createdAt?: string },
): TaskCancelPayload {
  return TaskCancelPayloadSchema.parse({
    ...input,
    createdAt: input.createdAt ?? new Date().toISOString(),
  });
}

export function createTaskHeartbeatPayload(
  input: Omit<TaskHeartbeatPayload, "createdAt"> & { createdAt?: string },
): TaskHeartbeatPayload {
  return TaskHeartbeatPayloadSchema.parse({
    ...input,
    createdAt: input.createdAt ?? new Date().toISOString(),
  });
}

export function createTaskResultPayload(
  input: Omit<TaskResultPayload, "artifacts" | "createdAt"> &
    Partial<Pick<TaskResultPayload, "artifacts" | "createdAt">>,
): TaskResultPayload {
  return TaskResultPayloadSchema.parse({
    ...input,
    artifacts: input.artifacts ?? [],
    createdAt: input.createdAt ?? new Date().toISOString(),
  });
}

export function createTaskFeedbackPayload(
  input: Omit<TaskFeedbackPayload, "abuseFlags"> & Partial<Pick<TaskFeedbackPayload, "abuseFlags">>,
): TaskFeedbackPayload {
  return TaskFeedbackPayloadSchema.parse({
    ...input,
    abuseFlags: input.abuseFlags ?? [],
  });
}

export function createSignedOfficialCredential(
  input: Omit<SignedOfficialCredential, never>,
): SignedOfficialCredential {
  return SignedOfficialCredentialSchema.parse(input);
}

export function createAutonomousReportingPolicy(
  input: Partial<AutonomousReportingPolicy> = {},
): AutonomousReportingPolicy {
  return AutonomousReportingPolicySchema.parse(input);
}

export interface CreateReportInput {
  taskId: string;
  ownerId: string;
  status: TaskLifecycleState;
  mode: ReportingMode;
  summary: string;
  mandateId?: string;
  evidence?: ReportEvidence[];
  suggestedActions?: ReportSuggestedAction[];
  createdAt?: string;
  reportId?: string;
}

export function createReport(input: CreateReportInput): Report {
  return ReportSchema.parse({
    version: "0.1",
    reportId: input.reportId ?? `report_${randomUUID()}`,
    taskId: input.taskId,
    mandateId: input.mandateId,
    ownerId: input.ownerId,
    status: input.status,
    mode: input.mode,
    summary: input.summary,
    evidence: input.evidence ?? [],
    suggestedActions: input.suggestedActions ?? [],
    createdAt: input.createdAt ?? new Date().toISOString(),
  });
}

export function createReportCreatePayload(report: Report): ReportCreatePayload {
  return {
    report,
  };
}

export function envelopeForSigning(envelope: EnvoyEnvelope): UnsignedEnvoyEnvelope {
  const { signature: _signature, ...unsigned } = envelope;
  return unsigned;
}

export function canonicalJson(input: unknown): string {
  return JSON.stringify(sortForCanonicalJson(input));
}

function sortForCanonicalJson(input: unknown): unknown {
  if (Array.isArray(input)) {
    return input.map(sortForCanonicalJson);
  }

  if (input === null || typeof input !== "object") {
    return input;
  }

  return Object.fromEntries(
    Object.entries(input)
      .filter(([, value]) => value !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => [key, sortForCanonicalJson(value)]),
  );
}

export function evaluateEnvelopeRolePolicy(
  intent: EnvoyIntent,
  senderRole: EnvoyActorRole,
  recipientRole: EnvoyActorRole,
): { ok: true } | { ok: false; reason: string } {
  // Re-exported from role-policy-table.ts so the existing API surface
  // (and any test that calls this function directly) keeps working.
  return evaluateEnvelopeRolePolicyFromTable(intent, senderRole, recipientRole);
}

import {
  evaluateEnvelopeRolePolicy as evaluateEnvelopeRolePolicyFromTable,
} from "./role-policy-table.js";

import { envelopeRoleRefinement } from "./envelope-role-refinement.js";

// Phase 40 — Agent Network Collaboration Layer.
// Re-export the chain schemas, constructors, and parsers from the dedicated
// agent-network module so consumers can import them from "@envoymesh/protocol".
export {
  ChainIdSchema,
  ChainMandateIdSchema,
  ChainSubtaskIdSchema,
  ChainRoleSchema,
  CHAIN_MAX_DEPTH,
  UnsignedChainMandateSchema,
  ChainMandateSignedSchema,
  ChainSubtaskSchema,
  ChainSubtaskExpectSchema,
  NamedArtifactSchema,
  CHAIN_NAMED_ARTIFACTS_MAX,
  CHAIN_INPUT_ARTIFACTS_MAX,
  ChainSubtaskBidSchema,
  ChainSubtaskAwardSchema,
  ChainSubtaskPartialSchema,
  CHAIN_SUBTASK_PARTIAL_NOTE_MAX,
  clipChainSubtaskPartialNote,
  CompositeArtifactPartSchema,
  CompositeArtifactSchema,
  ChainReportSectionSchema,
  ChainReportSchema,
  TaskChainMandatePayloadSchema,
  TaskChainProposePayloadSchema,
  TaskChainBidPayloadSchema,
  TaskChainAcceptPayloadSchema,
  TaskChainPartialPayloadSchema,
  TaskChainMergePayloadSchema,
  TaskChainCancelPayloadSchema,
  TaskChainHeartbeatPayloadSchema,
  TaskChainStatusStepSchema,
  TaskChainStatusPayloadSchema,
  TaskChainReportPayloadSchema,
  TaskChainReadyRequestPayloadSchema,
  TaskChainReadyResponsePayloadSchema,
  TaskHarnessSubmitRequestPayloadSchema,
  TaskHarnessSubmitResponsePayloadSchema,
  parseChainMandate,
  parseChainSubtask,
  parseChainSubtaskBid,
  parseChainSubtaskAward,
  parseChainSubtaskPartial,
  parseChainReport,
  parseCompositeArtifact,
  parseTaskChainReadyRequestPayload,
  parseTaskChainReadyResponsePayload,
  parseTaskHarnessSubmitRequestPayload,
  parseTaskHarnessSubmitResponsePayload,
  createChainMandateId,
  createChainId,
  createChainSubtaskId,
  createChainReadyProbeId,
  createTaskChainReadyRequestPayload,
  createTaskChainReadyResponsePayload,
  createTaskHarnessSubmitRequestPayload,
  createTaskHarnessSubmitResponsePayload,
} from "./agent-network.js";
export type {
  UnsignedChainMandate,
  ChainMandate,
  VerifyMode,
  ChainSubtask,
  ChainSubtaskExpect,
  NamedArtifact,
  ChainSubtaskBid,
  ChainSubtaskAward,
  ChainSubtaskPartial,
  CompositeArtifactPart,
  CompositeArtifact,
  ChainReportSection,
  ChainReport,
  TaskChainMandatePayload,
  TaskChainProposePayload,
  TaskChainBidPayload,
  TaskChainAcceptPayload,
  TaskChainPartialPayload,
  TaskChainMergePayload,
  TaskChainCancelPayload,
  TaskChainHeartbeatPayload,
  TaskChainStatusStep,
  TaskChainStatusPayload,
  TaskChainReportPayload,
  TaskChainReadyRequestPayload,
  TaskChainReadyResponsePayload,
  TaskHarnessSubmitRequestPayload,
  TaskHarnessSubmitResponsePayload,
} from "./agent-network.js";

export {
  ChainHandoffRequestPayloadSchema,
  ChainHandoffDelegatePayloadSchema,
  ChainHandoffStatusSchema,
  ChainIterationWireSchema,
  CHAIN_ITERATION_MAX_ROUNDS,
  ChainRelayRouteSchema,
  ChainArbitrationEntrySchema,
  ChainArbitrationPayloadSchema,
  getSubChainRootSubtasks,
  isHandoffOpen,
  isHandoffTerminal,
  isHandoffLive,
  TaskChainOwnershipPayloadSchema,
  createTaskChainOwnershipPayload,
  parseTaskChainOwnershipPayload,
} from "./agent-network-handoff.js";
export type {
  ChainHandoffRequest,
  ChainHandoffDelegate,
  ChainHandoffRequestPayload,
  ChainHandoffDelegatePayload,
  ChainHandoffStatus,
  ChainIterationWire,
  ChainRelayRoute,
  ChainArbitrationEntry,
  ChainArbitrationPayload,
  ChainOwnershipNotifyStatus,
  TaskChainOwnershipPayload,
} from "./agent-network-handoff.js";

export {
  AgentNetworkProfileSchema,
  AgentNetworkContextWindowSchema,
  AgentNetworkSpendPostureSchema,
  AgentNetworkSkillKindSchema,
  AgentNetworkSkillSourceSchema,
  AgentNetworkSkillEntrySchema,
  AGENT_NETWORK_WELL_KNOWN_ROLES,
  DEFAULT_AGENT_NETWORK_PROFILE,
  parseAgentNetworkProfile,
  createAgentNetworkProfile,
  coerceAgentNetworkSkillEntry,
  coerceAgentNetworkSkills,
  coerceAgentNetworkRoleId,
  coerceAgentNetworkRoles,
  isAgentNetworkRoleId,
  agentNetworkPrimaryRole,
  agentNetworkRoleIds,
  agentNetworkHasRole,
  createOwnerDomainSkill,
  createOpenClawSkill,
  createExtAgentSkill,
  agentNetworkSkillId,
  agentNetworkSkillIds,
  agentNetworkDomainSkillIds,
  agentNetworkRankingSkillIds,
} from "./agent-network-profile.js";
export type {
  AgentNetworkProfile,
  AgentNetworkContextWindow,
  AgentNetworkSpendPosture,
  AgentNetworkSkillKind,
  AgentNetworkSkillSource,
  AgentNetworkSkillEntry,
  AgentNetworkRoleId,
  AgentNetworkWellKnownRole,
} from "./agent-network-profile.js";

// ---------------------------------------------------------------------------
// MAP (Mesh Adapter Pattern) — per-adapter wire surface
// Re-exported from `./agent-adapter.js` (see that file for JSDoc).
// Schemas: `AgentRuntimeSchema`, `SkillIdSchema`, `SkillDescriptorSchema`,
//   `CapabilityManifestSchema`, `SignedCapabilityManifestSchema`,
//   `ContentBlockSchema`, `AgentResultSchema`, `SignedAgentResultSchema`,
//   `VerdictSchema`, `VerifierSourceSchema`, `VerdictEntrySchema`.
// Types: matching `z.infer<typeof XxxSchema>` aliases.
// ---------------------------------------------------------------------------

export {
  AgentRuntimeSchema,
  SkillIdSchema,
  SkillDescriptorSchema,
  ReputationScoreSchema,
  CapabilityManifestSchema,
  SignedCapabilityManifestSchema,
  ContentBlockSchema,
  CitationSchema,
  AgentMetricsSchema,
  AgentResultSchema,
  SignedAgentResultSchema,
  VerdictSchema,
  VerifierSourceSchema,
  VerdictEntrySchema,
} from "./agent-adapter.js";

export type {
  AgentRuntime,
  SkillId,
  SkillDescriptor,
  ReputationScore,
  CapabilityManifest,
  SignedCapabilityManifest,
  ContentBlock,
  Citation,
  AgentMetrics,
  AgentResult,
  SignedAgentResult,
  Verdict,
  VerifierSource,
  VerdictEntry,
} from "./agent-adapter.js";

export {
  AgentWorkerLeaseRuntimeSchema,
  AgentWorkerLeasePayloadSchema,
  AgentWorkerLeaseRevokePayloadSchema,
  AgentWorkerLeaseRequestPayloadSchema,
  createAgentWorkerLeasePayload,
  parseAgentWorkerLeasePayload,
  createAgentWorkerLeaseRevokePayload,
  parseAgentWorkerLeaseRevokePayload,
  createAgentWorkerLeaseRequestPayload,
  parseAgentWorkerLeaseRequestPayload,
} from "./agent-worker-lease.js";

export type {
  AgentWorkerLeaseRuntime,
  AgentWorkerLeasePayload,
  AgentWorkerLeaseRevokePayload,
  AgentWorkerLeaseRequestPayload,
} from "./agent-worker-lease.js";

export {
  ChainReconcileAttemptStateSchema,
  ChainReconcileKnownAttemptSchema,
  TaskChainReconcileRequestPayloadSchema,
  ChainReconcileAttemptReportSchema,
  TaskChainReconcileResponsePayloadSchema,
  createTaskChainReconcileRequestPayload,
  parseTaskChainReconcileRequestPayload,
  createTaskChainReconcileResponsePayload,
  parseTaskChainReconcileResponsePayload,
} from "./chain-reconcile.js";

export type {
  ChainReconcileAttemptState,
  ChainReconcileKnownAttempt,
  TaskChainReconcileRequestPayload,
  ChainReconcileAttemptReport,
  TaskChainReconcileResponsePayload,
} from "./chain-reconcile.js";

export {
  MarketCardSchema,
  MarketAnnouncePayloadSchema,
  MarketSearchPayloadSchema,
  MarketSearchResultPayloadSchema,
  MarketListingCategorySchema,
  MarketListingStatusSchema,
  MarketListingVisibilitySchema,
  MarketPriceSchema,
  parseMarketCard,
  parseMarketAnnouncePayload,
  parseMarketSearchPayload,
  parseMarketSearchResultPayload,
  createMarketAnnouncePayload,
  createMarketSearchPayload,
  createMarketSearchResultPayload,
} from "./market.js";

export type {
  MarketCard,
  MarketAnnouncePayload,
  MarketSearchPayload,
  MarketSearchResultPayload,
  CreateMarketAnnouncePayloadInput,
  CreateMarketSearchPayloadInput,
  CreateMarketSearchResultPayloadInput,
} from "./market.js";
