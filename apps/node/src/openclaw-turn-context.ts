/**
 * Build EnvoyMesh retrieved context for OpenClaw turns (vault RAG, chat history, profile).
 * Injected via OpenClaw trusted GroupSystemPrompt — supplements native workspace/skills.
 *
 * Local (Envoy Local) uses leaner caps than cloud so llama.cpp prefill stays snappy.
 */

import type { AiKnowledgeBaseScope, AiKnowledgeBaseSettings } from "@envoymesh/api";
import { resolveAiKnowledgeBaseSettings } from "@envoymesh/api";
import type { AgentIdentityStore, HumanProfileStore, LocalChatLogStore, LocalTrustStore } from "@envoymesh/local-store";
import { buildVaultIndex } from "@envoymesh/vault";
import { loadAgentIdentitySection } from "./agent-identity-context.js";
import {
  formatThreadMessagesSection,
  formatVaultKnowledgeSection,
  loadKnowledgeSensitivityOverrides,
  loadThreadMessages,
  searchChatHistoryRag,
  searchVaultKnowledgeBase,
  selectRecentThreadMessages,
  type KnowledgeAccessLevel,
} from "./ai-context.js";
import { buildContextInjection } from "./context-injector.js";
import type { RagService } from "./rag-service.js";

/** Cloud keeps today's OpenClaw defaults; Local is intentionally leaner. */
export type OpenClawRetrievedContextProfile = "cloud" | "local";

export const OPENCLAW_RETRIEVED_CONTEXT_CAPS = {
  cloud: {
    maxChars: 20_000,
    maxBondThreads: 8,
    recentPerBond: 5,
    ragPerBond: 3,
  },
  local: {
    maxChars: 7_000,
    maxBondThreads: 3,
    recentPerBond: 3,
    ragPerBond: 1,
  },
} as const;

function truncateRetrievedContext(text: string, maxChars: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) {
    return trimmed;
  }
  return `${trimmed.slice(0, Math.max(0, maxChars - 40))}\n\n[... EnvoyMesh context truncated ...]`;
}

/** Merge policy + retrieved blocks for OpenClaw trusted system append. */
export function composeOpenClawTrustedEnvoyMeshContext(params: {
  policyPrompt?: string;
  retrievedContext?: string;
  /** @deprecated legacy single blob — treated as policy */
  systemPrompt?: string;
}): string | undefined {
  const policy = (params.policyPrompt ?? params.systemPrompt ?? "").trim();
  const retrieved = (params.retrievedContext ?? "").trim();
  const parts: string[] = [];
  if (policy) parts.push(`## EnvoyMesh policy\n${policy}`);
  if (retrieved) parts.push(`## EnvoyMesh retrieved context\n${retrieved}`);
  return parts.length > 0 ? parts.join("\n\n") : undefined;
}

async function buildBondChatSections(input: {
  message: string;
  bonds: Array<{ peerOwnerId: string; displayName?: string | null }>;
  chatLogStore: LocalChatLogStore | null;
  ragService: RagService | null;
  knowledgeBase?: AiKnowledgeBaseSettings | null;
  caps: (typeof OPENCLAW_RETRIEVED_CONTEXT_CAPS)[OpenClawRetrievedContextProfile];
}): Promise<string[]> {
  if (!input.chatLogStore || !input.message.trim()) {
    return [];
  }
  const kb = resolveAiKnowledgeBaseSettings(input.knowledgeBase);
  const sections: string[] = [];
  for (const bond of input.bonds.slice(0, input.caps.maxBondThreads)) {
    const thread = await loadThreadMessages(input.chatLogStore, bond.peerOwnerId);
    if (thread.length === 0) continue;
    const label = bond.displayName?.trim() || bond.peerOwnerId;
    const recent = selectRecentThreadMessages(
      thread,
      Math.min(input.caps.recentPerBond, kb.recentMessageLimit),
    );
    const recentSection = formatThreadMessagesSection(
      `Recent conversation with ${label}`,
      recent,
    );
    if (recentSection) sections.push(recentSection);

    if (kb.ragMessageLimit <= 0) continue;
    const ragLimit = Math.min(input.caps.ragPerBond, kb.ragMessageLimit);
    const ragHits = input.ragService
      ? await input.ragService.searchChatHistoryRag({
          threadOwnerId: bond.peerOwnerId,
          query: input.message,
          messages: thread,
          knowledgeBase: input.knowledgeBase,
          recentLimit: kb.recentMessageLimit,
          ragLimit,
        })
      : searchChatHistoryRag(thread, input.message, {
          recentLimit: kb.recentMessageLimit,
          ragLimit,
        });
    const ragSection = formatThreadMessagesSection(
      `Related earlier messages with ${label}`,
      ragHits,
    );
    if (ragSection) sections.push(ragSection);
  }
  return sections;
}

export async function buildEnvoyMeshRetrievedContext(input: {
  message: string;
  ownerId: string;
  bonds: Array<{ peerOwnerId: string; displayName?: string | null }>;
  chatLogStore: LocalChatLogStore | null;
  trustStore: LocalTrustStore;
  humanProfileStore: HumanProfileStore | null;
  agentIdentityStore: AgentIdentityStore | null;
  vaultDir: string;
  ragService: RagService | null;
  knowledgeBase?: AiKnowledgeBaseSettings | null;
  /** Defaults to cloud (OpenClaw historical behavior). */
  profile?: OpenClawRetrievedContextProfile;
  /** Profile dir for Published-toggle sensitivity overrides (57B). */
  profileDir?: string;
  /**
   * Vault sensitivity ceiling. Default `private` (owner EnvoyAI).
   * Contact-facing Agent Mode drafts should pass contact prefs (often `public`).
   */
  knowledgeAccess?: KnowledgeAccessLevel;
  /**
   * Vault path scope. Default `owner` (public + private roots).
   * Contact-facing drafts should pass `public`.
   */
  knowledgeScope?: AiKnowledgeBaseScope;
  /** When set, only include bond-chat RAG for this contact thread. */
  contactThreadOwnerId?: string;
}): Promise<string> {
  const caps = OPENCLAW_RETRIEVED_CONTEXT_CAPS[input.profile ?? "cloud"];
  const knowledgeAccess = input.knowledgeAccess ?? "private";
  const knowledgeScope = input.knowledgeScope ?? "owner";
  const sections: string[] = [];

  const agentIdentity = await loadAgentIdentitySection(input.agentIdentityStore);
  if (agentIdentity.trim()) {
    sections.push(`### Agent instructions\n${agentIdentity.trim()}`);
  }

  try {
    const vaultIndex = await buildVaultIndex({ rootDir: input.vaultDir });
    const sensitivityOverrides = await loadKnowledgeSensitivityOverrides(input.profileDir);
    const vaultResults = input.ragService
      ? await input.ragService.searchVaultKnowledgeBase({
          vaultIndex,
          query: input.message,
          knowledgeAccess,
          knowledgeBase: input.knowledgeBase,
          knowledgeScope,
          sensitivityOverrides,
        })
      : searchVaultKnowledgeBase({
          vaultIndex,
          query: input.message,
          knowledgeAccess,
          knowledgeBase: input.knowledgeBase,
          knowledgeScope,
          sensitivityOverrides,
        });
    if (vaultResults.length > 0) {
      sections.push(
        formatVaultKnowledgeSection(vaultResults).replace(/^## Knowledge base\n/, "### Knowledge base\n"),
      );
    }
  } catch {
    /* vault optional */
  }

  // External MCP is owner-only (same gate as rag-service.getExternalKnowledgeContext).
  if (input.ragService && knowledgeScope === "owner") {
    try {
      const external = await input.ragService.getExternalKnowledgeContext({
        query: input.message,
        knowledgeBase: input.knowledgeBase,
        knowledgeScope: "owner",
      });
      if (external.trim()) {
        sections.push(external.trim());
      }
    } catch {
      /* external MCP optional */
    }
  }

  if (knowledgeScope === "owner") {
    const roots = resolveAiKnowledgeBaseSettings(input.knowledgeBase).linkedObsidianVaultPaths ?? [];
    if (roots.length) {
      try {
        const {
          searchLinkedObsidianKnowledge,
          formatLinkedObsidianKnowledgeSection,
        } = await import("./knowledge-hub.js");
        const hits = await searchLinkedObsidianKnowledge({
          absoluteRoots: roots,
          query: input.message,
        });
        const section = formatLinkedObsidianKnowledgeSection(hits);
        if (section.trim()) sections.push(section.trim());
      } catch {
        /* linked vault optional */
      }
    }
  }

  if (input.humanProfileStore) {
    const profileContext = await buildContextInjection(
      input.ownerId,
      input.chatLogStore,
      input.trustStore,
      input.humanProfileStore,
      {
        knowledgeBase: input.knowledgeBase,
        ragQuery: input.message,
        ragService: input.ragService,
      },
    );
    if (profileContext.trim()) {
      sections.push(profileContext.trim());
    }
  }

  const bondsForChat = input.contactThreadOwnerId
    ? input.bonds.filter((b) => b.peerOwnerId === input.contactThreadOwnerId)
    : input.bonds;

  const bondSections = await buildBondChatSections({
    message: input.message,
    bonds: bondsForChat,
    chatLogStore: input.chatLogStore,
    ragService: input.ragService,
    knowledgeBase: input.knowledgeBase,
    caps,
  });
  sections.push(...bondSections);

  if (sections.length === 0) {
    return "";
  }

  return truncateRetrievedContext(sections.join("\n\n"), caps.maxChars);
}
