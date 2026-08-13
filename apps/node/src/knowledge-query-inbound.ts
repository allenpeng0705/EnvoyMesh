import { createAuditEvent, type LocalTaskStore, type LocalTrustStore, type LocalPeerDirectoryStore, type NodeProfile, type LocalChatLogStore, type HumanProfileStore, type AgentIdentityStore } from "@envoymesh/local-store";
import { buildContextInjection } from "./context-injector.js";
import { loadAgentIdentitySection } from "./agent-identity-context.js";
import {
  createKnowledgeResponsePayload,
  parseKnowledgeQueryPayload,
  type EnvoyEnvelope,
  type KnowledgeResponsePayload,
} from "@envoymesh/protocol";
import { evaluatePolicy, checkPublicKnowledgeRateLimit } from "@envoymesh/bonds";
import type { VaultIndex } from "@envoymesh/vault";
import { buildModelProviders } from "@envoymesh/models";
import { routeModelRequestWithCostTracking } from "./model-cost-tracking.js";
import {
  resolveKnowledgeSyndicationSensitivity,
  syndicationSensitivityToKnowledgeAccess,
  type AiKnowledgeBaseSettings,
  type KnowledgeSyndicationSensitivity,
  type ModelProviderConfig,
  stripModelThinking,
} from "@envoymesh/api";
import { ZodError } from "zod";
import { formatVaultKnowledgeSection, loadKnowledgeSensitivityOverrides, searchVaultKnowledgeBase, type KnowledgeAccessLevel } from "./ai-context.js";
import type { RagService } from "./rag-service.js";

export type KnowledgeQueryInboundResult =
  | {
      ok: true;
      responsePayload: KnowledgeResponsePayload;
      senderOwnerId?: string;
      queryPreview: string;
      syndicatedSensitivity: KnowledgeSyndicationSensitivity;
    }
  | { ok: false; reason: string };

/**
 * Resolve the owner ID for a sender using the peer directory.
 * Returns undefined if the sender is not a known contact.
 */
async function resolveSenderOwnerId(
  envelope: EnvoyEnvelope,
  remotePeerId: string,
  peerDirectoryStore: LocalPeerDirectoryStore,
): Promise<string | undefined> {
  if (envelope.agentCredential?.ownerId) {
    return envelope.agentCredential.ownerId;
  }
  const records = await peerDirectoryStore.listPeerRecords();
  const match =
    records.find((r) => r.peerId === envelope.senderPeerId) ??
    records.find((r) => r.peerId === remotePeerId);
  return match?.ownerId;
}

/**
 * Handle an inbound `knowledge.query` intent.
 *
 * Flow:
 * 1. Validate payload (Zod)
 * 2. Audit: message verified
 * 3. Resolve sender's owner ID via peer directory; look up bond level
 * 4. Evaluate bond policy via @envoymesh/bonds
 * 5. If denied/approval_required: audit and return rejection
 * 6. Search vault (within allowed sensitivity ceiling)
 * 7. Route prompt through model router (`routeModelRequest`)
 * 8. Audit policy, vault, model routing decisions
 * 9. Return signed knowledge.response payload for the caller to send
 */
export async function handleInboundKnowledgeQuery(input: {
  envelope: EnvoyEnvelope;
  remotePeerId: string;
  receivedAt: number;
  correlationId: string | undefined;
  taskStore: Pick<LocalTaskStore, "appendAuditEvent" | "recordModelCallCost">;
  trustStore: LocalTrustStore;
  peerDirectoryStore: LocalPeerDirectoryStore;
  profile: NodeProfile;
  vaultIndex: VaultIndex | null;
  modelProviders: ModelProviderConfig;
  /**
   * If true, this is a local self-query (e.g., from the AI tab via WebSocket).
   * Self-queries bypass public peer restrictions and get full access.
   */
  isLocalSelfQuery?: boolean;
  /**
   * If true, the owner has approved this request (skips owner approval check for cloud providers).
   */
  ownerApproved?: boolean;
  /** Chat log store for conversation context injection (Phase 9C). */
  chatLogStore?: LocalChatLogStore | null;
  /** Human profile store for owner profile context injection (Phase 9C). */
  humanProfileStore?: HumanProfileStore;
  /** Owner-editable agent operating instructions (`agent-identity.md`). */
  agentIdentityStore?: AgentIdentityStore | null;
  /** Owner knowledge base settings (chat history limits + vault paths). */
  knowledgeBase?: AiKnowledgeBaseSettings | null;
  /** Contact knowledge access ceiling for vault snippet filtering. Default: public. */
  knowledgeAccess?: KnowledgeAccessLevel;
  ragService?: RagService | null;
  /** Phase 14B — owner ceiling for peer vault syndication (ignored for local self-query). */
  knowledgeSyndicationMaxSensitivity?: KnowledgeSyndicationSensitivity;
  /** Phase 14B — optional per-contact ceiling (tighter than global). */
  contactSyndicationMaxSensitivity?: KnowledgeSyndicationSensitivity;
  /** Profile dir for Published-toggle sensitivity overrides (57B). */
  profileDir?: string;
}): Promise<KnowledgeQueryInboundResult> {
  const {
    envelope,
    remotePeerId,
    receivedAt,
    correlationId,
    taskStore,
    trustStore,
    peerDirectoryStore,
    profile,
    vaultIndex,
    modelProviders,
    isLocalSelfQuery = false,
    ownerApproved = false,
    chatLogStore = null,
    humanProfileStore,
    agentIdentityStore = null,
    knowledgeBase,
    knowledgeAccess = isLocalSelfQuery ? "private" : "public",
    ragService = null,
    knowledgeSyndicationMaxSensitivity,
    contactSyndicationMaxSensitivity,
    profileDir,
  } = input;

  let payload: ReturnType<typeof parseKnowledgeQueryPayload>;
  try {
    payload = parseKnowledgeQueryPayload(envelope.payload);
  } catch (error) {
    const reason =
      error instanceof ZodError
        ? error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`).join("; ")
        : "invalid knowledge.query payload";
    return { ok: false, reason };
  }

  const preview = payload.query.length > 120 ? `${payload.query.slice(0, 117)}...` : payload.query;

  // 1. Audit: inbound message verified
  await taskStore.appendAuditEvent(
    createAuditEvent({
      type: "message.verified",
      intent: envelope.intent,
      messageId: envelope.messageId,
      correlationId,
      remotePeerId,
      direction: "inbound",
      verificationStatus: "verified",
      latencyMs: Date.now() - receivedAt,
      outcome: "allow",
      summary: `knowledge.query received: ${preview}`,
      createdAt: envelope.createdAt,
    }),
  );

  // 2. Policy check: resolve sender's owner ID, then look up bond level
  // For local self-queries (AI tab), use "self" bond level to bypass public restrictions
  let bondLevel: "self" | "direct" | "referred" | "public" | "blocked" = "public";
  let senderOwnerId: string | undefined;

  if (isLocalSelfQuery) {
    bondLevel = "self";
  } else {
    senderOwnerId = await resolveSenderOwnerId(envelope, remotePeerId, peerDirectoryStore);
    bondLevel = senderOwnerId
      ? (await trustStore.getTrustRecord(senderOwnerId))?.level ?? "public"
      : "public";
  }

  // Phase 44B: rate-limit public (stranger) knowledge queries.
  // Bonded peers (direct/referred) are not rate-limited — they have higher trust.
  if (bondLevel === "public" && !isLocalSelfQuery) {
    const rateResult = checkPublicKnowledgeRateLimit(remotePeerId);
    if (!rateResult.allowed) {
      await taskStore.appendAuditEvent(
        createAuditEvent({
          type: "policy.decided",
          intent: "knowledge.query",
          messageId: envelope.messageId,
          correlationId,
          remotePeerId,
          direction: "inbound",
          verificationStatus: "verified",
          latencyMs: Date.now() - receivedAt,
          outcome: "deny",
          summary: `knowledge.query rate-limited: ${rateResult.remaining} remaining, resets at ${new Date(rateResult.resetAt).toISOString()}`,
          createdAt: envelope.createdAt,
        }),
      );
      return { ok: false, reason: "rate limited: too many knowledge queries" };
    }
  }

  const policyDecision = evaluatePolicy({
    peerId: senderOwnerId ?? envelope.senderPeerId,
    bondLevel,
    intent: "knowledge.query",
    requestedSensitivity: payload.requestedSensitivity,
  });

  // 3. Audit: policy decision
  if (policyDecision.action === "deny") {
    await taskStore.appendAuditEvent(
      createAuditEvent({
        type: "policy.decided",
        intent: "knowledge.query",
        messageId: envelope.messageId,
        correlationId,
        remotePeerId,
        direction: "inbound",
        verificationStatus: "verified",
        latencyMs: Date.now() - receivedAt,
        outcome: "deny",
        summary: `knowledge.query denied: ${policyDecision.reason}`,
        createdAt: envelope.createdAt,
      }),
    );
    return { ok: false, reason: policyDecision.reason };
  }

  if (policyDecision.action === "approval_required") {
    await taskStore.appendAuditEvent(
      createAuditEvent({
        type: "policy.decided",
        intent: "knowledge.query",
        messageId: envelope.messageId,
        correlationId,
        remotePeerId,
        direction: "inbound",
        verificationStatus: "verified",
        latencyMs: Date.now() - receivedAt,
        outcome: "deny",
        summary: `knowledge.query requires approval: ${policyDecision.reason}`,
        createdAt: envelope.createdAt,
      }),
    );
    return { ok: false, reason: `approval required: ${policyDecision.reason}` };
  }

  // action === "allow": proceed with vault search + model routing
  const maxSens = policyDecision.action === "allow" ? policyDecision.maxSensitivity : "public";
  const allowedSensitivity = (maxSens ?? "public") as KnowledgeSyndicationSensitivity;
  const syndicatedSensitivity = isLocalSelfQuery
    ? allowedSensitivity
    : resolveKnowledgeSyndicationSensitivity(
        allowedSensitivity,
        knowledgeSyndicationMaxSensitivity,
        contactSyndicationMaxSensitivity,
      );
  const effectiveKnowledgeAccess = isLocalSelfQuery
    ? knowledgeAccess
    : syndicationSensitivityToKnowledgeAccess(syndicatedSensitivity);

  // 4. Search vault knowledge base (best-effort)
  let vaultSnippets: Awaited<ReturnType<RagService["searchVaultKnowledgeBase"]>> = [];
  const knowledgeScope = isLocalSelfQuery ? "owner" : "public";
  if (vaultIndex) {
    const sensitivityOverrides = await loadKnowledgeSensitivityOverrides(profileDir);
    vaultSnippets = ragService
      ? await ragService.searchVaultKnowledgeBase({
          vaultIndex,
          query: payload.query,
          knowledgeAccess: effectiveKnowledgeAccess,
          knowledgeBase,
          knowledgeScope,
          sensitivityOverrides,
        })
      : searchVaultKnowledgeBase({
          vaultIndex,
          query: payload.query,
          knowledgeAccess: effectiveKnowledgeAccess,
          knowledgeBase,
          knowledgeScope,
          sensitivityOverrides,
        });
    await taskStore.appendAuditEvent(
      createAuditEvent({
        type: "vault.searched",
        intent: "knowledge.query",
        messageId: envelope.messageId,
        correlationId,
        remotePeerId,
        direction: "inbound",
        verificationStatus: "verified",
        latencyMs: Date.now() - receivedAt,
        outcome: "record",
        summary: `vault search: ${vaultSnippets.length} snippet(s) for query "${preview}"`,
        createdAt: envelope.createdAt,
      }),
    );
  }

  const promptContext = vaultSnippets.length > 0
    ? formatVaultKnowledgeSection(vaultSnippets).replace(/^## Knowledge base\n/, "")
    : "(No vault documents found — answering from general knowledge)";

  const contextOwnerId = isLocalSelfQuery ? profile.owner.ownerId : senderOwnerId;
  const injectedContext = humanProfileStore && contextOwnerId
    ? await buildContextInjection(contextOwnerId, chatLogStore, trustStore, humanProfileStore, {
        knowledgeBase,
        ragQuery: payload.query,
        ragService,
      })
    : "";

  const externalContext = ragService
    ? await ragService.getExternalKnowledgeContext({
        query: payload.query,
        knowledgeBase,
        knowledgeScope,
      })
    : "";

  const agentIdentitySection = await loadAgentIdentitySection(agentIdentityStore);

  const prompt = `You are answering a knowledge query from a contact on the EnvoyMesh P2P network.\n\
${agentIdentitySection}Answer only based on the provided context. If the context does not contain relevant information, say so.\n\
Do not make up information. Keep the answer concise (2-4 sentences).\n\
Sensitivity level of this answer: ${allowedSensitivity}.\n\n\
Context:\n${promptContext}\n${injectedContext}${externalContext}\n\
Query: ${payload.query}`;

  // Cap sensitivity for cloud providers (they only allow "public" by default)
  // For local self-queries with owner approval, we can use up to "friends" sensitivity
  const effectiveSensitivity = modelProviders.mode === "openai-compatible" || modelProviders.mode === "anthropic-compatible"
    ? (ownerApproved ? "friends" : "public")
    : allowedSensitivity;

  // 6. Route through model router with configured provider(s)
  if (modelProviders.mode === "disabled") {
    await taskStore.appendAuditEvent(
      createAuditEvent({
        type: "model.routed",
        intent: "knowledge.query",
        messageId: envelope.messageId,
        correlationId,
        remotePeerId,
        direction: "inbound",
        verificationStatus: "verified",
        latencyMs: Date.now() - receivedAt,
        outcome: "deny",
        summary: "model routing: denied (model provider is disabled)",
        createdAt: envelope.createdAt,
      }),
    );
    return {
      ok: true,
      responsePayload: createKnowledgeResponsePayload({
        inReplyTo: envelope.messageId,
        answer: "The model provider is currently disabled. Please enable a model provider to answer knowledge queries.",
        sensitivity: allowedSensitivity,
        matchScore: 0,
        refused: true,
        refusalReason: "model disabled",
      }),
      senderOwnerId,
      queryPreview: preview,
      syndicatedSensitivity,
    };
  }

  const providers = buildModelProviders(modelProviders, ownerApproved);
  console.log(`[knowledge-query] providers.length=${providers.length}`);

  const modelResult = await routeModelRequestWithCostTracking(
    {
      taskType: "knowledge.query",
      prompt,
      sensitivity: effectiveSensitivity,
      requesterPeerId: remotePeerId,
      ownerApproved,
    },
    providers,
    { taskStore },
  );
  console.log(`[knowledge-query] modelResult:`, JSON.stringify(modelResult));

  // 7. Audit model routing decision
  const evt = modelResult.auditEvent;
  await taskStore.appendAuditEvent(
    createAuditEvent({
      type: "model.routed",
      intent: "knowledge.query",
      messageId: envelope.messageId,
      correlationId,
      remotePeerId,
      direction: "inbound",
      verificationStatus: "verified",
      latencyMs: Date.now() - receivedAt,
      outcome: modelResult.decision.action === "allow" ? "allow" : "deny",
      summary: `model routing: ${modelResult.decision.action} (${"reason" in modelResult.decision ? modelResult.decision.reason : "provider=" + (evt?.providerId ?? "unknown")})`,
      createdAt: envelope.createdAt,
    }),
  );

  // 8. Build and return response payload
  const answer = stripModelThinking(modelResult.response?.text ?? "Model unavailable.");
  const matchScore = vaultSnippets.length > 0
    ? Math.min(1, vaultSnippets.reduce((sum, r) => sum + r.score, 0) / vaultSnippets.length / 10)
    : 0;

  const responsePayload = createKnowledgeResponsePayload({
    inReplyTo: envelope.messageId,
    answer,
    sensitivity: allowedSensitivity,
    matchScore,
    refused: false,
  });

  return {
    ok: true,
    responsePayload,
    senderOwnerId,
    queryPreview: preview,
    syndicatedSensitivity,
  };
}
