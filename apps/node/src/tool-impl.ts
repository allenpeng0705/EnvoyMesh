/**
 * Tool implementations for the local agent tool registry.
 *
 * These are the actual implementations of the standard tools (vault_search, peer_lookup,
 * task_summary) wired into the LocalToolRegistry in the node runtime.
 *
 * IMPORTANT: These tools cannot send libp2p messages directly.
 * All outbound traffic must go through the Envoy mesh runtime.
 */

import { searchVault, type VaultIndex } from "@envoymesh/vault";
import type { LocalPeerDirectoryStore, LocalTrustStore, LocalTaskStore } from "@envoymesh/local-store";
import type { ToolImplementation } from "@envoymesh/models";
import { evaluatePolicy } from "@envoymesh/bonds";
import { matchAgentCapabilityRoutes } from "@envoymesh/api";
import { derivePeerId, signUnsignedEnvelope } from "@envoymesh/identity";
import { createAuditEvent } from "@envoymesh/local-store";
import type { EnvoyMesh } from "@envoymesh/network";
import { createUnsignedEnvelope, type EnvoyIntent } from "@envoymesh/protocol";
// Inline egress scanning (Phase 8H) — avoids cross-package import resolution in test environment
// These patterns are a subset of the full @envoymesh/models semantic firewall patterns

type EgressScanResult =
  | { ok: true; text: string }
  | { ok: false; reason: string; matches: Array<{ pattern: string; description: string; index: number; length: number }> };

const EGRESS_PATTERNS: Array<{ pattern: RegExp; description: string }> = [
  // PEM private key block
  { pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----[\s\S]{1,200}?-----END (?:PRIVATE KEY)-----/, description: "PEM private key block" },
  // AWS access key + secret
  { pattern: /(?:AKIA|ABIA|ACCA|ASIA)[0-9A-Z]{16}:[0-9A-Za-z\/+=]{40,}/, description: "AWS access key + secret" },
  // JWT
  { pattern: /eyJ[0-9A-Za-z_-]*\.eyJ[0-9A-Za-z_-]*\.[0-9A-Za-z_-]*/, description: "JSON Web Token" },
  // Generic connection string with credentials
  { pattern: /(?:postgres|mysql|mongodb|redis|amqp|ssh|ftp):\/\/[^\s:]+:[^@\s]+@[^\s]+/, description: "Connection string with credentials" },
];

function scanEgress(text: string): EgressScanResult {
  if (!text || text.trim().length === 0) return { ok: true, text };
  for (const { pattern, description } of EGRESS_PATTERNS) {
    pattern.lastIndex = 0;
    const match = pattern.exec(text);
    if (match) {
      return {
        ok: false,
        reason: `egress content contains secret-like pattern: ${description}`,
        matches: [{ pattern: description, description, index: match.index, length: match[0].length }],
      };
    }
  }
  return { ok: true, text };
}

// ─── Tool invocation rate limiter (Phase 8H) ───────────────────────────────────

/** Rolling window tracker for tool invocation frequency. */
const invocationTimestamps = new Map<string, number[]>();

/**
 * Check whether a tool has exceeded its hourly invocation budget.
 * Returns { allowed: true } if under budget; { allowed: false; reason: string } if over.
 */
export function checkInvocationBudget(
  toolName: string,
  maxPerHour: number,
): { allowed: true } | { allowed: false; reason: string } {
  const now = Date.now();
  const windowMs = 60 * 60 * 1000;
  const timestamps = invocationTimestamps.get(toolName) ?? [];

  // Prune timestamps outside the rolling window
  const recent = timestamps.filter((t) => now - t < windowMs);
  invocationTimestamps.set(toolName, recent);

  if (recent.length >= maxPerHour) {
    return {
      allowed: false,
      reason: `rate limit exceeded: ${toolName} can only be called ${maxPerHour} time(s) per hour`,
    };
  }

  // Record this invocation
  recent.push(now);
  invocationTimestamps.set(toolName, recent);
  return { allowed: true };
}

// ─── Filesystem path allowlist checker (Phase 8H) ──────────────────────────────

/**
 * Check whether a path is within any of the allowed prefixes.
 * Returns { allowed: true } if the path matches at least one prefix, or no allowlist is set.
 * Returns { allowed: false; reason: string } if the path is outside all allowed prefixes.
 */
export function checkPathAllowlist(
  relativePath: string,
  allowedPaths: readonly string[] | undefined,
): { allowed: true } | { allowed: false; reason: string } {
  if (!allowedPaths || allowedPaths.length === 0) {
    return { allowed: true }; // No restriction
  }

  const normalized = relativePath.replace(/\\/g, "/");
  for (const prefix of allowedPaths) {
    const normPrefix = prefix.replace(/\\/g, "/").replace(/\/$/, "");
    if (normalized.startsWith(normPrefix) || normalized === normPrefix) {
      return { allowed: true };
    }
  }

  return {
    allowed: false,
    reason: `path "${relativePath}" is outside allowed filesystem scope`,
  };
}

// ─── Egress content scanner wrapper (Phase 8H) ────────────────────────────────

/**
 * Scan a tool result for secret material before returning it.
 * Returns the original result if scan passes; returns a sanitized result if scan fails.
 */
function sanitizeToolResult<T>(result: T, toolName: string): T | Record<string, unknown> {
  const text = JSON.stringify(result);
  const scan = scanEgress(text);
  if (scan.ok) {
    return result;
  }
  return {
    _tool: toolName,
    _egressBlocked: true,
    _reason: scan.reason,
    _matches: scan.matches?.map((m) => ({ pattern: m.pattern, description: m.description })) ?? [],
    _note: "Tool result contained secret-like patterns and was blocked from egress. Contact your administrator.",
  };
}

/**
 * Build the vault_search tool implementation.
 */
export function buildVaultSearchTool(
  vaultIndex: VaultIndex | null,
  opts?: { allowedPaths?: readonly string[]; maxInvocationsPerHour?: number },
): ToolImplementation {
  return async (params) => {
    if (!vaultIndex) {
      return { error: "vault index not available" };
    }

    // Rate budget check
    if (opts?.maxInvocationsPerHour) {
      const budget = checkInvocationBudget("vault_search", opts.maxInvocationsPerHour);
      if (!budget.allowed) {
        return { error: budget.reason, rateLimited: true };
      }
    }

    const query = typeof params.query === "string" ? params.query : String(params.query ?? "");
    if (!query) {
      return { error: "query parameter is required" };
    }

    // Path traversal check on vault paths (defense-in-depth — vault already enforces this,
    // but we re-check against the tool-specific allowlist)
    const allPaths = vaultIndex.chunks.map((c) => c.relativePath);
    const allowedPaths = opts?.allowedPaths;
    for (const p of allPaths) {
      if (allowedPaths && allowedPaths.length > 0) {
        const check = checkPathAllowlist(p, allowedPaths);
        if (!check.allowed) {
          return { error: check.reason, pathDenied: true };
        }
      }
    }

    const results = searchVault(vaultIndex, query, { limit: 10 });
    const mapped = results.map((r) => ({
      title: r.document?.title ?? r.chunk.relativePath,
      snippet: r.chunk.text.slice(0, 200),
      score: r.score,
      path: r.chunk.relativePath,
    }));

    const output: { results: typeof mapped; count: number } = { results: mapped, count: results.length };
    return sanitizeToolResult(output, "vault_search") as typeof output;
  };
}

/**
 * Build the peer_lookup tool implementation.
 */
export function buildPeerLookupTool(
  peerDirectoryStore: LocalPeerDirectoryStore,
): ToolImplementation {
  return async (params) => {
    const ownerId = typeof params.ownerId === "string" ? params.ownerId : undefined;
    if (!ownerId) {
      return { error: "ownerId parameter is required" };
    }

    const peer = await peerDirectoryStore.getPeerByOwnerId(ownerId);
    if (!peer) {
      return { found: false, ownerId };
    }

    return {
      found: true,
      ownerId: peer.ownerId,
      peerId: peer.peerId,
      lastSeenAt: peer.lastSeenAt,
    };
  };
}

/**
 * Build the task_summary tool implementation.
 */
export function buildTaskSummaryTool(taskStore: LocalTaskStore): ToolImplementation {
  return async () => {
    const entries = await taskStore.readTaskJournalEntries();
    const byState: Record<string, number> = {};
    for (const entry of entries as Array<{ state?: string }>) {
      const s = (entry as { state?: string }).state ?? "unknown";
      byState[s] = (byState[s] ?? 0) + 1;
    }
    return {
      totalTasks: entries.length,
      byState,
    };
  };
}

// ─── Agent adapter tool implementations (Phase 8G) ────────────────────────────────

/**
 * Check whether an outbound EMP action is allowed for an external agent.
 * External agents are treated as "private" sensitivity callers.
 * Returns { allowed: true } or { allowed: false; reason: string }.
 */
async function checkOutboundPolicy(opts: {
  trustStore: LocalTrustStore;
  targetOwnerId: string;
  intent: "knowledge.query" | "chat.message";
  requestedSensitivity?: "public" | "friends" | "trusted" | "private";
}): Promise<{ allowed: true } | { allowed: false; reason: string }> {
  const { trustStore, targetOwnerId, intent } = opts;
  const bond = await trustStore.getTrustRecord(targetOwnerId);
  const bondLevel = bond?.level ?? "public";

  const decision = evaluatePolicy({
    peerId: targetOwnerId,
    bondLevel,
    intent,
    requestedSensitivity: opts.requestedSensitivity ?? "public",
  });

  if (decision.action === "deny") {
    return { allowed: false, reason: decision.reason };
  }
  if (decision.action === "approval_required") {
    return { allowed: false, reason: `approval required: ${decision.reason}` };
  }
  return { allowed: true };
}

/**
 * Redact a contact record for external agent consumption.
 * Raw peer IDs, listen addresses, and private metadata are NEVER exposed.
 */
function redactContact(opts: {
  ownerId: string;
  displayName?: string;
  trustLevel?: string;
  interests?: string[];
  capabilityTags?: string[];
  suggestedRouteId?: string;
}) {
  return {
    ownerId: opts.ownerId,
    displayName: opts.displayName ?? opts.ownerId,
    trustLevel: opts.trustLevel ?? "unknown",
    interests: opts.interests ?? [],
    capabilityTags: opts.capabilityTags ?? [],
    suggestedRouteId: opts.suggestedRouteId,
  };
}

// ─── mesh_findCapability ─────────────────────────────────────────────────────────

export interface MeshFindCapabilityDeps {
  trustStore: LocalTrustStore;
  listBondedAgentCapabilities?: () => Promise<Array<{ ownerId: string; capabilities: string[] }>>;
  maxInvocationsPerHour?: number;
}

export function buildMeshFindCapabilityTool(
  deps: MeshFindCapabilityDeps,
): ToolImplementation {
  return async (params) => {
    // Rate budget check
    if (deps.maxInvocationsPerHour) {
      const budget = checkInvocationBudget("mesh_findCapability", deps.maxInvocationsPerHour);
      if (!budget.allowed) {
        return { error: budget.reason, rateLimited: true };
      }
    }

    const rawKeywords = params.keywords;
    const keywords: string[] = Array.isArray(rawKeywords)
      ? rawKeywords.map((k) => String(k).toLowerCase())
      : [];
    const filterCapabilityIds: string[] = Array.isArray(params.capabilityIds)
      ? params.capabilityIds.map((id) => String(id))
      : [];
    const maxResults = typeof params.maxResults === "number" ? Math.min(params.maxResults, 20) : 5;

    if (keywords.length === 0 && filterCapabilityIds.length === 0) {
      return { error: "keywords or capabilityIds parameter is required" };
    }

    const trustRecords = await deps.trustStore.listTrustRecords();

    const capabilitiesByOwner = new Map<string, string[]>();
    if (deps.listBondedAgentCapabilities) {
      for (const row of await deps.listBondedAgentCapabilities()) {
        capabilitiesByOwner.set(row.ownerId, row.capabilities);
      }
    }

    // Build ownerId -> displayName map from trust records
    const displayNameByOwner = new Map<string, string>();
    for (const r of trustRecords) {
      if (r.displayName) displayNameByOwner.set(r.peerOwnerId, r.displayName);
    }

    // Only bonded contacts (direct or referred) are visible to external agents
    const bondedOwnerIds = new Set<string>();
    for (const r of trustRecords) {
      if (r.level === "direct" || r.level === "referred") {
        bondedOwnerIds.add(r.peerOwnerId);
      }
    }

    // Find peers that match keywords and/or manifest/agent-card capability tags
    const matched: ReturnType<typeof redactContact>[] = [];
    for (const ownerId of bondedOwnerIds) {
      if (matched.length >= maxResults) break;

      const trust = trustRecords.find((t) => t.peerOwnerId === ownerId);
      if (!trust) continue;

      const capabilityTags = capabilitiesByOwner.get(ownerId) ?? [];
      const displayName = displayNameByOwner.get(ownerId) ?? ownerId;
      const searchable = `${ownerId} ${displayName} ${capabilityTags.join(" ")}`.toLowerCase();

      const matchesKeyword =
        keywords.length === 0 || keywords.some((kw) => searchable.includes(kw));
      const matchesCapability =
        filterCapabilityIds.length === 0 ||
        filterCapabilityIds.some((cap) =>
          capabilityTags.some((tag) => tag.toLowerCase() === cap.toLowerCase()),
        );

      if (matchesKeyword && matchesCapability) {
        const routes = matchAgentCapabilityRoutes({
          goal: keywords.join(" ") || displayName,
          capabilityIds: capabilityTags,
          maxResults: 1,
        });
        matched.push(
          redactContact({
            ownerId,
            displayName,
            trustLevel: trust.level,
            capabilityTags,
            suggestedRouteId: routes[0]?.routeId,
          }),
        );
      }
    }

    return {
      contacts: matched,
      count: matched.length,
      policy: "bonded_only",
    };
  };
}

// ─── mesh_listContacts ──────────────────────────────────────────────────────────

export interface MeshListContactsDeps {
  trustStore: LocalTrustStore;
  peerDirectoryStore: LocalPeerDirectoryStore;
  maxInvocationsPerHour?: number;
}

export function buildMeshListContactsTool(
  deps: MeshListContactsDeps,
): ToolImplementation {
  return async (params) => {
    // Rate budget check
    if (deps.maxInvocationsPerHour) {
      const budget = checkInvocationBudget("mesh_listContacts", deps.maxInvocationsPerHour);
      if (!budget.allowed) {
        return { error: budget.reason, rateLimited: true };
      }
    }

    const minLevel = params.minLevel === "referred" ? "referred" : "direct";

    const trustRecords = await deps.trustStore.listTrustRecords();

    const displayNameByOwner = new Map<string, string>();
    for (const r of trustRecords) {
      if (r.displayName) displayNameByOwner.set(r.peerOwnerId, r.displayName);
    }

    const contacts: ReturnType<typeof redactContact>[] = [];
    for (const record of trustRecords) {
      if (record.level === "blocked") continue;
      if (record.level === "public") continue; // Public = no bond, not a contact

      if (record.level === "direct" || (minLevel === "referred" && record.level === "referred")) {
        const displayName = displayNameByOwner.get(record.peerOwnerId) ?? record.peerOwnerId;
        contacts.push(
          redactContact({
            ownerId: record.peerOwnerId,
            displayName,
            trustLevel: record.level,
          }),
        );
      }
    }

    const output: { contacts: typeof contacts; count: number } = { contacts, count: contacts.length };
    return sanitizeToolResult(output, "mesh_listContacts") as typeof output;
  };
}

// ─── mesh_requestKnowledge ───────────────────────────────────────────────────────

export interface MeshRequestKnowledgeDeps {
  trustStore: LocalTrustStore;
  peerDirectoryStore: LocalPeerDirectoryStore;
  taskStore: Pick<LocalTaskStore, "appendAuditEvent">;
  profile: { device: { privateKeyPem: string; publicKeyPem: string }; owner: { ownerId: string } };
  mesh: EnvoyMesh;
  maxInvocationsPerHour?: number;
}

export function buildMeshRequestKnowledgeTool(
  deps: MeshRequestKnowledgeDeps,
): ToolImplementation {
  return async (params) => {
    // Rate budget check
    if (deps.maxInvocationsPerHour) {
      const budget = checkInvocationBudget("mesh_requestKnowledge", deps.maxInvocationsPerHour);
      if (!budget.allowed) {
        return { error: budget.reason, rateLimited: true };
      }
    }

    const targetOwnerId = typeof params.targetOwnerId === "string" ? params.targetOwnerId : undefined;
    const query = typeof params.query === "string" ? params.query : undefined;

    if (!targetOwnerId) {
      return { error: "targetOwnerId parameter is required" };
    }
    if (!query) {
      return { error: "query parameter is required" };
    }

    // Policy check: external agent must have a bond with the target
    const policyCheck = await checkOutboundPolicy({
      trustStore: deps.trustStore,
      targetOwnerId,
      intent: "knowledge.query",
      requestedSensitivity: "public",
    });
    if (!policyCheck.allowed) {
      return { error: policyCheck.reason, denied: true };
    }

    // Look up the target peer's peer ID from the peer directory
    const peerRecords = await deps.peerDirectoryStore.listPeerRecords();
    const targetPeer = peerRecords.find((p) => p.ownerId === targetOwnerId);
    if (!targetPeer) {
      return { error: `contact not found: ${targetOwnerId}` };
    }

    // Construct and sign the knowledge.query EMP envelope
    const senderPeerId = deps.profile.device.publicKeyPem
      ? derivePeerId(deps.profile.device.publicKeyPem)
      : "envoy:unknown";
    const envelope = signUnsignedEnvelope(
      createUnsignedEnvelope({
        senderPeerId,
        senderPublicKey: deps.profile.device.publicKeyPem,
        recipientPeerId: targetPeer.peerId,
        intent: "knowledge.query",
        payload: {
          query,
          requestedSensitivity: "public",
        },
      }),
      deps.profile.device.privateKeyPem,
    );

    // Send via mesh and wait for response
    let answer = "Request could not be completed.";
    let matchScore = 0;
    try {
      const response = await deps.mesh.sendExpectReply(targetPeer.peerId, envelope, {
        timeoutMs: 30000,
      });
      // Parse the knowledge.response payload — redacted before returning to agent
      if (response && typeof response === "object" && "payload" in response) {
        const payload = response.payload as { answer?: string; matchScore?: number };
        answer = payload.answer ?? answer;
        matchScore = payload.matchScore ?? 0;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Log the failure but don't expose raw error to external agent
      await deps.taskStore.appendAuditEvent(
        createAuditEvent({
          type: "policy.decided",
          intent: "knowledge.query",
          messageId: envelope.messageId,
          remotePeerId: targetPeer.peerId,
          direction: "outbound",
          verificationStatus: "verified",
          latencyMs: 0,
          outcome: "deny",
          summary: `mesh_requestKnowledge failed: ${msg}`,
        }),
      );
      return { error: `request to ${targetOwnerId} failed: network error`, denied: false };
    }

    // Egress scan the answer before returning — a compromised or malicious peer
    // could try to embed secret material in a knowledge.response
    const egressCheck = scanEgress(answer);
    if (!egressCheck.ok) {
      return {
        answer: "[content blocked — secret material detected in response]",
        matchScore: 0,
        contact: redactContact({ ownerId: targetOwnerId }),
        _egressBlocked: true,
        _egressReason: egressCheck.reason,
      };
    }

    // Return redacted response — no raw peer IDs or sensitive metadata
    return {
      answer,
      matchScore,
      contact: redactContact({ ownerId: targetOwnerId }),
    };
  };
}

// ─── mesh_sendChat ──────────────────────────────────────────────────────────────

export interface MeshSendChatDeps {
  trustStore: LocalTrustStore;
  peerDirectoryStore: LocalPeerDirectoryStore;
  taskStore: Pick<LocalTaskStore, "appendAuditEvent">;
  profile: { device: { privateKeyPem: string; publicKeyPem: string }; owner: { ownerId: string } };
  mesh: EnvoyMesh;
  maxInvocationsPerHour?: number;
}

export function buildMeshSendChatTool(
  deps: MeshSendChatDeps,
): ToolImplementation {
  return async (params) => {
    // Rate budget check
    if (deps.maxInvocationsPerHour) {
      const budget = checkInvocationBudget("mesh_sendChat", deps.maxInvocationsPerHour);
      if (!budget.allowed) {
        return { error: budget.reason, rateLimited: true };
      }
    }

    const targetOwnerId = typeof params.targetOwnerId === "string" ? params.targetOwnerId : undefined;
    const text = typeof params.text === "string" ? params.text : undefined;

    if (!targetOwnerId) {
      return { error: "targetOwnerId parameter is required" };
    }
    if (!text) {
      return { error: "text parameter is required" };
    }

    // Egress scan the message text — prevent external agents from using EnvoyMesh
    // as a channel to exfiltrate secrets or send credential-like content
    const egressCheck = scanEgress(text);
    if (!egressCheck.ok) {
      return {
        error: `message blocked: secret-like pattern detected in text`,
        denied: false,
        _egressBlocked: true,
        _egressReason: egressCheck.reason,
        _matches: egressCheck.matches?.map((m) => ({ pattern: m.pattern, description: m.description })),
      };
    }

    // Policy check: external agent must have a bond with the target
    const policyCheck = await checkOutboundPolicy({
      trustStore: deps.trustStore,
      targetOwnerId,
      intent: "chat.message",
      requestedSensitivity: "public",
    });
    if (!policyCheck.allowed) {
      return { error: policyCheck.reason, denied: true };
    }

    // Look up the target peer's peer ID
    const peerRecords = await deps.peerDirectoryStore.listPeerRecords();
    const targetPeer = peerRecords.find((p) => p.ownerId === targetOwnerId);
    if (!targetPeer) {
      return { error: `contact not found: ${targetOwnerId}` };
    }

    // Construct and sign the chat.message EMP envelope
    const senderPeerId = deps.profile.device.publicKeyPem
      ? derivePeerId(deps.profile.device.publicKeyPem)
      : "envoy:unknown";
    const { createChatMessagePayload } = await import("@envoymesh/protocol");
    const envelope = signUnsignedEnvelope(
      createUnsignedEnvelope({
        senderPeerId,
        senderPublicKey: deps.profile.device.publicKeyPem,
        recipientPeerId: targetPeer.peerId,
        intent: "chat.message",
        payload: createChatMessagePayload({
          senderOwnerId: deps.profile.owner.ownerId,
          text,
        }),
      }),
      deps.profile.device.privateKeyPem,
    );

    try {
      await deps.mesh.send(targetPeer.peerId, envelope, {});
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { error: `failed to send message: ${msg}`, denied: false };
    }

    return {
      sent: true,
      messageId: envelope.messageId,
      contact: redactContact({ ownerId: targetOwnerId }),
    };
  };
}
