import { z } from "zod";
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
  signature: z.string().min(1),
});

export const EnvoyEnvelopeSchema = EnvoyEnvelopeObjectSchema.superRefine((value, context) => {
  const decision = evaluateEnvelopeRolePolicy(value.intent, value.senderRole, value.recipientRole);
  if (!decision.ok) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: decision.reason,
      path: ["senderRole"],
    });
  }
  // When senderRole is "agent" and intent is chat.message, agentCredential must be present.
  // chat.message is the primary intent where an agent directly represents the owner to a human.
  // For task.* and report.create intents, authorization comes from mandates instead.
  if (value.senderRole === "agent" && value.intent === "chat.message" && !value.agentCredential) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "agentCredential is required when senderRole is 'agent' for chat.message",
      path: ["agentCredential"],
    });
  }
});

export const UnsignedEnvoyEnvelopeSchema = EnvoyEnvelopeObjectSchema.omit({
  signature: true,
}).superRefine((value, context) => {
  const decision = evaluateEnvelopeRolePolicy(value.intent, value.senderRole, value.recipientRole);
  if (!decision.ok) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: decision.reason,
      path: ["senderRole"],
    });
  }
  // When senderRole is "agent" and intent is chat.message, agentCredential must be present.
  // chat.message is the primary intent where an agent directly represents the owner to a human.
  // For task.* and report.create intents, authorization comes from mandates instead.
  if (value.senderRole === "agent" && value.intent === "chat.message" && !value.agentCredential) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "agentCredential is required when senderRole is 'agent' for chat.message",
      path: ["agentCredential"],
    });
  }
});

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
  capabilities: z.array(z.string().min(1)).min(1),
  publicTopics: z.array(z.string().min(1)).default([]),
  trustPolicySummary: TrustPolicySummarySchema,
  supportedProtocolVersions: z.array(z.string().min(1)).min(1),
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
export const HumanProfilePayloadSchema = z.object({
  version: z.literal("0.1"),
  ownerId: z.string().min(1),
  displayName: z.string().min(1).max(120),
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/),
  bio: z.string().max(500).optional(),
  gender: z.string().max(40).optional(),
  hobbies: z.array(z.string().min(1).max(50)).max(20).optional(),
  knowledge: z.array(z.string().min(1).max(100)).max(50).optional(),
  profileVisibility: z.enum(["public", "private"]).default("private"),
  // Rendezvous capabilities for peer discovery
  capabilities: z.array(CapabilityUnionSchema).max(20).optional(),
  updatedAt: z.string().datetime(),
  signature: z.string().min(1),
});

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
  capabilities?: Array<{ tag: string } | { type: string; params?: Record<string, unknown>; confidence?: number } | { descriptor: string }>;
  ownerPrivateKeyPem: string;
}

export function createHumanProfilePayload(input: CreateHumanProfilePayloadInput): HumanProfilePayload {
  const { ownerPrivateKeyPem, ...rest } = input;
  const unsigned: Omit<HumanProfilePayload, "signature"> = {
    version: "0.1",
    ownerId: input.ownerId,
    displayName: input.displayName.trim(),
    username: input.username.trim(),
    bio: input.bio?.trim(),
    gender: input.gender?.trim(),
    hobbies: input.hobbies,
    knowledge: input.knowledge,
    profileVisibility: input.profileVisibility ?? "private",
    capabilities: input.capabilities,
    updatedAt: new Date().toISOString(),
  };
  return {
    ...unsigned,
    signature: "", // placeholder; caller must sign and replace
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
  refused: z.boolean().optional().default(false),
  refusalReason: z.string().max(500).optional(),
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
  })
  .refine(
    (value) =>
      value.requestedTagHashes.length > 0 ||
      value.requestedCapabilities.length > 0 ||
      Boolean(value.fileTitleQuery?.trim()) ||
      (value.requestedContentHashPrefixes?.length ?? 0) > 0,
    "discovery.request requires tag hashes, capabilities, a file title query, or content hash prefixes",
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
});

export const DiscoveryMatchSchema = z.object({
  ownerId: z.string().min(1),
  peerId: z.string().min(1),
  matchedTagHashes: z.array(z.string().min(1)).default([]),
  matchedCapabilities: z.array(z.string().min(1)).default([]),
  /** FS-D: metadata-only matches for published vault documents (no bytes transferred). */
  libraryMatches: z.array(LibraryFileMatchSchema).optional(),
});

export const DiscoveryResponsePayloadSchema = z.object({
  requestMessageId: z.string().min(1),
  responderOwnerId: z.string().min(1),
  matches: z.array(DiscoveryMatchSchema).default([]),
  truncated: z.boolean().default(false),
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
  multiaddrs: z.array(z.string().min(1)).default([]),
  viaRelayId: z.string().min(1).optional(),
  capabilities: z.array(z.string().min(1)).default([]),
  visibility: RelayVisibilitySchema.default("public"),
  expiresAt: z.string().datetime().optional(),
});

export const RelayCheckinPayloadSchema = z.object({
  peerId: z.string().min(1),
  ownerId: z.string().min(1).optional(),
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

export const ChatMessagePayloadSchema = z.object({
  senderOwnerId: z.string().min(1),
  text: z.string().min(1).max(128000),
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
});

export const MandateSchema = UnsignedMandateSchema.extend({
  signature: z.string().min(1),
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

export const TaskResultPayloadSchema = z.object({
  taskId: z.string().min(1),
  mandateId: z.string().min(1).optional(),
  status: TaskLifecycleStateSchema,
  summary: z.string().min(1).max(4000),
  artifacts: z.array(z.string().min(1)).default([]),
  createdAt: z.string().datetime(),
});

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
export type BondRequestedLevel = z.infer<typeof BondRequestedLevelSchema>;
export type BondRequestPayload = z.infer<typeof BondRequestPayloadSchema>;
export type BondChallengePayload = z.infer<typeof BondChallengePayloadSchema>;
export type BondChallengeResponsePayload = z.infer<typeof BondChallengeResponsePayloadSchema>;
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
export type MandateAction = z.infer<typeof MandateActionSchema>;
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
}

export function createUnsignedEnvelope<TPayload>(
  input: CreateEnvelopeInput<TPayload>,
): UnsignedEnvoyEnvelope<TPayload> {
  const defaultRoles =
    input.intent === "chat.message"
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
  refused?: boolean;
  refusalReason?: string;
}

export function createKnowledgeResponsePayload(input: CreateKnowledgeResponsePayloadInput): KnowledgeResponsePayload {
  return KnowledgeResponsePayloadSchema.parse({
    inReplyTo: input.inReplyTo,
    answer: input.answer,
    sensitivity: input.sensitivity ?? "public",
    matchScore: input.matchScore,
    refused: input.refused ?? false,
    refusalReason: input.refusalReason,
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
}

export function createShareRequestPayload(input: CreateShareRequestPayloadInput): ShareRequestPayload {
  return ShareRequestPayloadSchema.parse({
    requestType: input.requestType,
    query: input.query,
    relativePath: input.relativePath,
    requestedSensitivity: input.requestedSensitivity ?? "public",
    correlationId: input.correlationId,
    fileOrigin: input.fileOrigin ?? "responder",
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
  });
}

export interface CreateDiscoveryResponsePayloadInput {
  requestMessageId: string;
  responderOwnerId: string;
  matches?: DiscoveryMatch[];
  truncated?: boolean;
}

export function createDiscoveryResponsePayload(
  input: CreateDiscoveryResponsePayloadInput,
): DiscoveryResponsePayload {
  return DiscoveryResponsePayloadSchema.parse({
    requestMessageId: input.requestMessageId,
    responderOwnerId: input.responderOwnerId,
    matches: input.matches ?? [],
    truncated: input.truncated ?? false,
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
  text: string;
}

export function createChatMessagePayload(input: CreateChatMessagePayloadInput): ChatMessagePayload {
  return ChatMessagePayloadSchema.parse({
    senderOwnerId: input.senderOwnerId,
    text: input.text,
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
  capabilities: string[];
  publicTopics?: string[];
  trustPolicySummary?: Partial<TrustPolicySummary>;
  supportedProtocolVersions?: string[];
}

export function createAgentCard(input: CreateAgentCardInput): AgentCard {
  return AgentCardSchema.parse({
    version: "0.1",
    ownerId: input.ownerId,
    displayName: input.displayName,
    nodeProfile: input.nodeProfile,
    capabilities: input.capabilities,
    publicTopics: input.publicTopics ?? [],
    trustPolicySummary: {
      acceptsDirectBondRequests: false,
      acceptsReferralRequests: true,
      requiresHumanApprovalForRawFiles: true,
      ...input.trustPolicySummary,
    },
    supportedProtocolVersions: input.supportedProtocolVersions ?? ["emp/0.1"],
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

function evaluateEnvelopeRolePolicy(
  intent: EnvoyIntent,
  senderRole: EnvoyActorRole,
  recipientRole: EnvoyActorRole,
): { ok: true } | { ok: false; reason: string } {
  if (intent === "chat.message") {
    // chat.message is allowed for: human↔human, human↔agent, agent↔human, agent↔agent
    if (senderRole === "system" || recipientRole === "system") {
      return {
        ok: false,
        reason: "chat.message cannot involve system role",
      };
    }
    return { ok: true };
  }

  if (intent === "social.intro.sync") {
    if (senderRole !== "agent" || recipientRole !== "agent") {
      return {
        ok: false,
        reason: "social.intro.sync requires senderRole=agent and recipientRole=agent",
      };
    }
    return { ok: true };
  }

  if (intent === "social.intro.propose") {
    if (senderRole !== "agent") {
      return {
        ok: false,
        reason: "social.intro.propose requires senderRole=agent",
      };
    }
    if (recipientRole !== "human") {
      return {
        ok: false,
        reason: "social.intro.propose requires recipientRole=human",
      };
    }
    return { ok: true };
  }

  if (intent === "social.intro.owner-ready") {
    if (senderRole !== "human") {
      return {
        ok: false,
        reason: "social.intro.owner-ready requires senderRole=human",
      };
    }
    if (recipientRole !== "agent" && recipientRole !== "human") {
      return {
        ok: false,
        reason: "social.intro.owner-ready requires recipientRole=agent or recipientRole=human",
      };
    }
    return { ok: true };
  }

  if (intent.startsWith("task.") || intent === "report.create") {
    if (senderRole !== "agent") {
      return {
        ok: false,
        reason: `${intent} requires senderRole=agent`,
      };
    }
    if (recipientRole !== "agent") {
      return {
        ok: false,
        reason: `${intent} requires recipientRole=agent`,
      };
    }
  }

  return { ok: true };
}
