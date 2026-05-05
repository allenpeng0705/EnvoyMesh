import { createAuditEvent, type LocalTaskStore, type LocalTrustStore, type LocalPeerDirectoryStore, type NodeProfile } from "@envoymesh/local-store";
import {
  createKnowledgeResponsePayload,
  parseKnowledgeQueryPayload,
  type EnvoyEnvelope,
  type KnowledgeResponsePayload,
} from "@envoymesh/protocol";
import { evaluatePolicy } from "@envoymesh/bonds";
import { searchVaultWithAudit, type VaultIndex } from "@envoymesh/vault";
import {
  createMockModelProvider,
  createOllamaLiteLlmProvider,
  createLiteLlmProvider,
  routeModelRequest,
  type ModelProvider,
} from "@envoymesh/models";
import type { ModelProviderConfig } from "@envoymesh/api";
import { ZodError } from "zod";

export type KnowledgeQueryInboundResult =
  | { ok: true; responsePayload: KnowledgeResponsePayload }
  | { ok: false; reason: string };

/**
 * Build the list of model providers from the node's model provider configuration.
 */
function buildModelProviders(config: ModelProviderConfig): ModelProvider[] {
  switch (config.mode) {
    case "disabled":
      return [];
    case "mock":
      return [
        createMockModelProvider({
          providerId: "local.mock",
          providerType: "local",
        }),
      ];
    case "ollama":
      return [
        createOllamaLiteLlmProvider({
          providerId: `local.ollama.${config.modelName ?? "llama3.1"}`,
          modelName: config.modelName ?? "llama3.1",
          endpoint: config.endpoint ?? "http://127.0.0.1:11434",
        }),
      ];
    case "litellm":
      return [
        createLiteLlmProvider({
          providerId: `cloud.${config.modelName ?? "litellm-model"}`,
          providerType: config.requireApprovalForCloud !== false ? "cloud" : "local",
          modelName: config.modelName ?? "gpt-4o-mini",
          endpoint: config.endpoint ?? "http://127.0.0.1:4000/v1",
          apiKey: config.apiKey,
        }),
      ];
    default:
      return [createMockModelProvider({ providerId: "local.mock" })];
  }
}

/**
 * Resolve the owner ID for a sender using the peer directory.
 * Returns undefined if the sender is not a known contact.
 */
async function resolveSenderOwnerId(
  senderPeerId: string,
  peerDirectoryStore: LocalPeerDirectoryStore,
): Promise<string | undefined> {
  const records = await peerDirectoryStore.listPeerRecords();
  const match = records.find((r) => r.peerId === senderPeerId);
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
 * 7. Route prompt through model router (mock provider)
 * 8. Audit policy, vault, model routing decisions
 * 9. Return signed knowledge.response payload for the caller to send
 */
export async function handleInboundKnowledgeQuery(input: {
  envelope: EnvoyEnvelope;
  remotePeerId: string;
  receivedAt: number;
  correlationId: string | undefined;
  taskStore: Pick<LocalTaskStore, "appendAuditEvent">;
  trustStore: LocalTrustStore;
  peerDirectoryStore: LocalPeerDirectoryStore;
  profile: NodeProfile;
  vaultIndex: VaultIndex | null;
  modelProviders: ModelProviderConfig;
}): Promise<KnowledgeQueryInboundResult> {
  const { envelope, remotePeerId, receivedAt, correlationId, taskStore, trustStore, peerDirectoryStore, profile, vaultIndex, modelProviders } = input;

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
  const senderOwnerId = await resolveSenderOwnerId(envelope.senderPeerId, peerDirectoryStore);
  const bondLevel = senderOwnerId
    ? (await trustStore.getTrustRecord(senderOwnerId))?.level ?? "public"
    : "public";

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
  const allowedSensitivity = maxSens ?? "public";

  // 4. Search vault (best-effort; if vaultIndex is null, skip vault search)
  let vaultResults: { results: ReturnType<typeof searchVaultWithAudit>["results"]; audited: boolean } = { results: [], audited: false };
  if (vaultIndex) {
    const searchResult = searchVaultWithAudit(vaultIndex, payload.query, {
      requesterPeerId: remotePeerId,
      requesterOwnerId: senderOwnerId,
      createdAt: envelope.createdAt,
    });
    vaultResults = { results: searchResult.results, audited: true };
    // Audit vault search
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
        summary: `vault search: ${searchResult.results.length} result(s) for query "${preview}"`,
        createdAt: envelope.createdAt,
      }),
    );
  }

  // 5. Build model prompt from vault snippets (if any)
  const snippets = vaultResults.results.slice(0, 5);
  const promptContext = snippets.length > 0
    ? snippets.map((r) => `[From ${r.document.title}]: ${r.chunk.text}`).join("\n\n")
    : "(No vault documents found — answering from general knowledge)";

  const prompt = `You are answering a knowledge query from a contact on the EnvoyMesh P2P network.\n\
Answer only based on the provided context. If the context does not contain relevant information, say so.\n\
Do not make up information. Keep the answer concise (2-4 sentences).\n\
Sensitivity level of this answer: ${allowedSensitivity}.\n\n\
Context:\n${promptContext}\n\n\
Query: ${payload.query}`;

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
    };
  }

  const providers = buildModelProviders(modelProviders);

  const modelResult = await routeModelRequest(
    {
      taskType: "knowledge.query",
      prompt,
      sensitivity: allowedSensitivity,
      requesterPeerId: remotePeerId,
      ownerApproved: false,
    },
    providers,
  );

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
  const answer = modelResult.response?.text ?? "Model unavailable.";
  const matchScore = snippets.length > 0
    ? Math.min(1, snippets.reduce((sum, r) => sum + r.score, 0) / snippets.length / 10)
    : 0;

  const responsePayload = createKnowledgeResponsePayload({
    inReplyTo: envelope.messageId,
    answer,
    sensitivity: allowedSensitivity,
    matchScore,
    refused: false,
  });

  return { ok: true, responsePayload };
}
