/**
 * Build EnvoyMesh retrieved context for OpenClaw turns (vault RAG, chat history, profile).
 * Injected via OpenClaw trusted GroupSystemPrompt — supplements native workspace/skills.
 */

import type { AiKnowledgeBaseSettings } from "@envoymesh/api";
import { resolveAiKnowledgeBaseSettings } from "@envoymesh/api";
import type { AgentIdentityStore, HumanProfileStore, LocalChatLogStore, LocalTrustStore } from "@envoymesh/local-store";
import { buildVaultIndex } from "@envoymesh/vault";
import { loadAgentIdentitySection } from "./agent-identity-context.js";
import {
  formatThreadMessagesSection,
  formatVaultKnowledgeSection,
  loadThreadMessages,
  searchChatHistoryRag,
  searchVaultKnowledgeBase,
  selectRecentThreadMessages,
} from "./ai-context.js";
import { buildContextInjection } from "./context-injector.js";
import type { RagService } from "./rag-service.js";

const MAX_RETRIEVED_CONTEXT_CHARS = 20_000;
const MAX_BOND_CHAT_THREADS = 8;

function truncateRetrievedContext(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= MAX_RETRIEVED_CONTEXT_CHARS) {
    return trimmed;
  }
  return `${trimmed.slice(0, MAX_RETRIEVED_CONTEXT_CHARS - 40)}\n\n[... EnvoyMesh context truncated ...]`;
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
}): Promise<string[]> {
  if (!input.chatLogStore || !input.message.trim()) {
    return [];
  }
  const kb = resolveAiKnowledgeBaseSettings(input.knowledgeBase);
  const sections: string[] = [];
  for (const bond of input.bonds.slice(0, MAX_BOND_CHAT_THREADS)) {
    const thread = await loadThreadMessages(input.chatLogStore, bond.peerOwnerId);
    if (thread.length === 0) continue;
    const label = bond.displayName?.trim() || bond.peerOwnerId;
    const recent = selectRecentThreadMessages(thread, Math.min(5, kb.recentMessageLimit));
    const recentSection = formatThreadMessagesSection(
      `Recent conversation with ${label}`,
      recent,
    );
    if (recentSection) sections.push(recentSection);

    if (kb.ragMessageLimit <= 0) continue;
    const ragHits = input.ragService
      ? await input.ragService.searchChatHistoryRag({
          threadOwnerId: bond.peerOwnerId,
          query: input.message,
          messages: thread,
          knowledgeBase: input.knowledgeBase,
          recentLimit: kb.recentMessageLimit,
          ragLimit: Math.min(3, kb.ragMessageLimit),
        })
      : searchChatHistoryRag(thread, input.message, {
          recentLimit: kb.recentMessageLimit,
          ragLimit: Math.min(3, kb.ragMessageLimit),
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
}): Promise<string> {
  const sections: string[] = [];

  const agentIdentity = await loadAgentIdentitySection(input.agentIdentityStore);
  if (agentIdentity.trim()) {
    sections.push(`### Agent instructions\n${agentIdentity.trim()}`);
  }

  try {
    const vaultIndex = await buildVaultIndex({ rootDir: input.vaultDir });
    const vaultResults = input.ragService
      ? await input.ragService.searchVaultKnowledgeBase({
          vaultIndex,
          query: input.message,
          knowledgeAccess: "personal",
          knowledgeBase: input.knowledgeBase,
          knowledgeScope: "owner",
        })
      : searchVaultKnowledgeBase({
          vaultIndex,
          query: input.message,
          knowledgeAccess: "personal",
          knowledgeBase: input.knowledgeBase,
          knowledgeScope: "owner",
        });
    if (vaultResults.length > 0) {
      sections.push(
        formatVaultKnowledgeSection(vaultResults).replace(/^## Knowledge base\n/, "### Knowledge base\n"),
      );
    }
  } catch {
    /* vault optional */
  }

  if (input.ragService) {
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

  const bondSections = await buildBondChatSections({
    message: input.message,
    bonds: input.bonds,
    chatLogStore: input.chatLogStore,
    ragService: input.ragService,
    knowledgeBase: input.knowledgeBase,
  });
  sections.push(...bondSections);

  if (sections.length === 0) {
    return "";
  }

  return truncateRetrievedContext(sections.join("\n\n"));
}
