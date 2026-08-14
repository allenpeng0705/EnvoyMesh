/**
 * Normalize persisted / partial AiSettings so callers never see missing
 * identity/status (older profiles may only store knowledgeBase).
 */
import type { AiSettings, AiIdentity, AiAssistantStatus } from "./ws-protocol.js";
import { DEFAULT_AI_KNOWLEDGE_BASE, resolveAiKnowledgeBaseSettings } from "./ai-knowledge-base.js";
import {
  DEFAULT_DOCUMENT_AUTONOMY_POLICY,
  normalizeDocumentAutonomyPolicy,
} from "./document-autonomy.js";
import {
  DEFAULT_ENVOY_DISCLOSURE_SETTINGS,
  normalizeEnvoyDisclosureSettings,
} from "./envoy-disclosure.js";
import {
  DEFAULT_PROFILE_MEDIA_POLICY,
  normalizeProfileMediaPolicy,
} from "./profile-media.js";
import {
  DEFAULT_AUTO_REPLY_LIMITS,
  normalizeAutoReplyLimits,
} from "./auto-reply-limits.js";

const DEFAULT_STATUS: AiAssistantStatus = {
  onlineAssistantEnabled: true,
  offlineAgentEnabled: false,
  statusMode: "automatic",
};

const DEFAULT_IDENTITY: AiIdentity = { mode: "transparent" };

export function defaultAiSettings(): AiSettings {
  return {
    status: { ...DEFAULT_STATUS },
    identity: { ...DEFAULT_IDENTITY },
    defaultModeForNewContacts: "manual",
    rules: [],
    documentAutonomy: { ...DEFAULT_DOCUMENT_AUTONOMY_POLICY },
    disclosure: { ...DEFAULT_ENVOY_DISCLOSURE_SETTINGS },
    profileMedia: { ...DEFAULT_PROFILE_MEDIA_POLICY },
    knowledgeBase: { ...DEFAULT_AI_KNOWLEDGE_BASE },
    autoReplyLimits: { ...DEFAULT_AUTO_REPLY_LIMITS },
  };
}

/** Merge disk/partial aiSettings — always returns complete identity + status. */
export function normalizeAiSettings(raw: AiSettings | null | undefined): AiSettings {
  const base = defaultAiSettings();
  if (!raw) return base;
  return {
    ...base,
    ...raw,
    status: { ...base.status, ...(raw.status ?? {}) },
    identity: { ...base.identity, ...(raw.identity ?? {}) },
    defaultModeForNewContacts: raw.defaultModeForNewContacts ?? base.defaultModeForNewContacts,
    rules: Array.isArray(raw.rules) ? raw.rules : [],
    documentAutonomy: normalizeDocumentAutonomyPolicy(raw.documentAutonomy),
    disclosure: normalizeEnvoyDisclosureSettings(raw.disclosure),
    profileMedia: normalizeProfileMediaPolicy(raw.profileMedia),
    knowledgeBase: resolveAiKnowledgeBaseSettings(raw.knowledgeBase),
    autoReplyLimits: normalizeAutoReplyLimits(raw.autoReplyLimits),
  };
}
