import { z } from "zod";
import { randomUUID } from "node:crypto";

export const EnvoyIntentSchema = z.enum([
  "system.ping",
  "system.signal",
  "agent.card.request",
  "agent.card.response",
  "auth.challenge",
  "auth.challenge.response",
  "bond.request",
  "bond.challenge",
  "bond.challenge.response",
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
]);

export const SensitivitySchema = z.enum(["public", "friends", "trusted", "private"]);

export const DeviceProfileSchema = z.enum(["primary", "satellite", "full", "relay"]);

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

export const EnvoyEnvelopeSchema = z.object({
  version: z.literal("0.1"),
  messageId: z.string().min(1),
  createdAt: z.string().datetime(),
  senderPeerId: z.string().min(1),
  senderPublicKey: z.string().min(1),
  recipientPeerId: z.string().min(1).optional(),
  intent: EnvoyIntentSchema,
  payload: z.unknown(),
  signature: z.string().min(1),
});

export const UnsignedEnvoyEnvelopeSchema = EnvoyEnvelopeSchema.omit({
  signature: true,
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
export type Capability = z.infer<typeof CapabilitySchema>;
export type PublicIdentity = z.infer<typeof PublicIdentitySchema>;
export type UnsignedDeviceCertificate = z.infer<typeof UnsignedDeviceCertificateSchema>;
export type DeviceCertificate = z.infer<typeof DeviceCertificateSchema>;
export type DeviceRevocationReason = z.infer<typeof DeviceRevocationReasonSchema>;
export type UnsignedDeviceRevocationRecord = z.infer<
  typeof UnsignedDeviceRevocationRecordSchema
>;
export type DeviceRevocationRecord = z.infer<typeof DeviceRevocationRecordSchema>;
export type SystemPingPayload = z.infer<typeof SystemPingPayloadSchema>;
export type SystemSignalPayload = z.infer<typeof SystemSignalPayloadSchema>;
export type AuthChallengePayload = z.infer<typeof AuthChallengePayloadSchema>;
export type AuthChallengeProof = z.infer<typeof AuthChallengeProofSchema>;
export type AuthChallengeResponsePayload = z.infer<typeof AuthChallengeResponsePayloadSchema>;
export type TrustPolicySummary = z.infer<typeof TrustPolicySummarySchema>;
export type AgentCard = z.infer<typeof AgentCardSchema>;
export type AgentCardRequestPayload = z.infer<typeof AgentCardRequestPayloadSchema>;
export type AgentCardResponsePayload = z.infer<typeof AgentCardResponsePayloadSchema>;
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
export type TaskHeartbeatPayload = z.infer<typeof TaskHeartbeatPayloadSchema>;
export type TaskResultPayload = z.infer<typeof TaskResultPayloadSchema>;
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
  recipientPeerId?: string;
  intent: EnvoyIntent;
  payload: TPayload;
  createdAt?: string;
  messageId?: string;
}

export function createUnsignedEnvelope<TPayload>(
  input: CreateEnvelopeInput<TPayload>,
): UnsignedEnvoyEnvelope<TPayload> {
  return {
    version: "0.1",
    messageId: input.messageId ?? randomUUID(),
    createdAt: input.createdAt ?? new Date().toISOString(),
    senderPeerId: input.senderPeerId,
    senderPublicKey: input.senderPublicKey,
    recipientPeerId: input.recipientPeerId,
    intent: input.intent,
    payload: input.payload,
  };
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

export function parseTaskHeartbeatPayload(input: unknown): TaskHeartbeatPayload {
  return TaskHeartbeatPayloadSchema.parse(input);
}

export function parseTaskResultPayload(input: unknown): TaskResultPayload {
  return TaskResultPayloadSchema.parse(input);
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
    requiresApprovalFor: input.requiresApprovalFor ?? ["purchase", "raw_contact_exchange"],
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
