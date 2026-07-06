import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useT } from "../../context/I18nContext.js";
import { useToast } from "../../hooks/useToast.js";
import { useNodeState } from "../../context/NodeStateContext.js";
import {
  useIsInProcessMobileNode,
  useModelProviderUiScope,
  useNodeService,
} from "../../hooks/useNodeService.js";
import { useOptimisticToggle } from "../../hooks/useOptimisticToggle.js";
import { AgentSettings } from "./settings/AgentSettings.js";
import { ChainDefaultsPanel } from "./settings/ChainDefaultsPanel.js";
import type {
  AiIdentityMode,
  AiKnowledgeBaseSettings,
  AiRagMode,
  AiRule,
  AiRuleActionType,
  AiRuleCategory,
  AiSettings,
  DocumentAutonomyPolicy,
  ModelProviderMode,
  RagIndexStatus,
  AutonomousPolicy,
  A2aChatNotificationMode,
  AgentActivityDomain,
  AgentInteractionMode,
  AgentNotifyMode,
  AutonomousDomain,
} from "@envoymesh/api";
import {
  DEFAULT_AI_KNOWLEDGE_BASE,
  DEFAULT_AI_KNOWLEDGE_BASE_MAX_FILE_BYTES,
  DEFAULT_AI_KNOWLEDGE_BASE_CHUNK_OVERLAP_CHARS,
  DEFAULT_AI_KNOWLEDGE_BASE_CHUNK_SIZE_CHARS,
  DEFAULT_DOCUMENT_AUTONOMY_POLICY,
  DEFAULT_PROFILE_MEDIA_POLICY,
  DEFAULT_ENVOY_DISCLOSURE_SETTINGS,
  DEFAULT_AUTO_REPLY_LIMITS,
  normalizeAutoReplyLimits,
  isAutoReplyCapUnlimited,
  AUTO_REPLY_CAP_UNLIMITED,
  normalizeDocumentAutonomyPolicy,
  normalizeEnvoyDisclosureSettings,
  normalizeProfileMediaPolicy,
  type AgentIdentityDocument,
  type ProfileMediaPolicy,
} from "@envoymesh/api";

// ---------------------------------------------------------------------------
// "Add Rule" form — now fully controlled via React state (fixes the
// imperative document.getElementById pattern from the original App.tsx).
// ---------------------------------------------------------------------------

interface RuleFormState {
  name: string;
  category: AiRuleCategory;
  priority: number;
  keywords: string;
  regex: string;
  isGreeting: boolean;
  accessLevel: "" | "full" | "assistant_only";
  actionType: AiRuleActionType;
  identityOverride: "" | AiIdentityMode;
  template: string;
}

const EMPTY_RULE_FORM: RuleFormState = {
  name: "",
  category: "availability",
  priority: 1,
  keywords: "",
  regex: "",
  isGreeting: false,
  accessLevel: "",
  actionType: "draft",
  identityOverride: "",
  template: "",
};

function RagIndexStatusPanel() {
  const t = useT();
  const nodeService = useNodeService();
  const [status, setStatus] = useState<RagIndexStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const next = await nodeService.getRagIndexStatus();
        if (!cancelled) setStatus(next);
      } catch {
        if (!cancelled) setStatus(null);
      }
    };
    void refresh();
    const off = nodeService.on("rag:reindex", (progress) => {
      setStatus((prev) => ({
        isIndexing: progress.phase !== "done" && progress.phase !== "idle" && progress.phase !== "error",
        progress,
        lastCompletedAt: progress.phase === "done" ? progress.updatedAt : prev?.lastCompletedAt,
        trackedDocuments: prev?.trackedDocuments ?? 0,
      }));
    });
    const timer = window.setInterval(() => {
      void refresh();
    }, 5000);
    return () => {
      cancelled = true;
      off();
      window.clearInterval(timer);
    };
  }, [nodeService]);

  if (!status) return null;

  const { progress } = status;
  const pct =
    progress.total > 0 ? Math.min(100, Math.round((progress.processed / progress.total) * 100)) : status.isIndexing ? 0 : 100;

  return (
    <div className="form-group">
      <label>{t("settings.ai.rag.indexStatusLabel")}</label>
      <div className="settings-status-panel">
        <div className="settings-progress-bar" aria-hidden="true">
          <div className="settings-progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <p className="field-desc">
          {status.isIndexing
            ? t("settings.ai.rag.indexStatusIndexing", {
                phase: progress.phase,
                processed: progress.processed,
                total: progress.total,
              })
            : progress.phase === "done"
              ? t("settings.ai.rag.indexStatusDone", {
                  indexed: progress.indexed,
                  skipped: progress.skipped,
                  removed: progress.removed,
                })
              : progress.phase === "error"
                ? t("settings.ai.rag.indexStatusError", {
                    message: progress.message ?? t("settings.ai.rag.indexStatusUnknown"),
                  })
                : t("settings.ai.rag.indexStatusIdle")}
          {status.lastCompletedAt
            ? t("settings.ai.rag.indexStatusLastRunSuffix", {
                time: new Date(status.lastCompletedAt).toLocaleString(),
              })
            : ""}
          {status.trackedDocuments > 0
            ? t("settings.ai.rag.indexStatusTrackedSuffix", { count: status.trackedDocuments })
            : ""}
        </p>
      </div>
    </div>
  );
}

function KnowledgeBaseSettings(props: {
  value: AiKnowledgeBaseSettings;
  onChange: (next: AiKnowledgeBaseSettings) => Promise<void>;
}) {
  const t = useT();
  const kb = props.value;
  const patch = async (partial: Partial<AiKnowledgeBaseSettings>) => {
    await props.onChange({ ...kb, ...partial });
  };

  return (
    <>
      <div className="settings-toggle-row">
        <div className="toggle-info">
          <strong>{t("settings.ai.rag.enableVaultKb")}</strong>
          <span className="toggle-desc">{t("settings.ai.rag.enableVaultKbDesc")}</span>
        </div>
        <label className="toggle-switch">
          <input
            type="checkbox"
            checked={kb.enabled !== false}
            onChange={async (e) => {
              await patch({ enabled: e.target.checked });
            }}
          />
          <span className="slider" />
        </label>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label>{t("settings.ai.rag.retrievalMode")}</label>
          <select
            value={kb.ragMode ?? DEFAULT_AI_KNOWLEDGE_BASE.ragMode}
            onChange={async (e) => {
              await patch({ ragMode: e.target.value as AiRagMode });
            }}
          >
            <option value="vector">{t("settings.ai.rag.retrievalVector")}</option>
            <option value="hybrid">{t("settings.ai.rag.retrievalHybrid")}</option>
            <option value="lexical">{t("settings.ai.rag.retrievalLexical")}</option>
          </select>
        </div>
        <div className="form-group">
          <label>{t("settings.ai.rag.embeddingProvider")}</label>
          <select
            value={kb.embedding?.mode ?? "inherit"}
            onChange={async (e) => {
              const nextMode = e.target.value as "inherit" | "mock" | "ollama" | "openai-compatible";
              await patch({
                embedding: {
                  ...kb.embedding,
                  mode: nextMode,
                  modelName: kb.embedding?.modelName,
                  endpoint: kb.embedding?.endpoint,
                  apiKey: kb.embedding?.apiKey,
                  maxInputTokens: kb.embedding?.maxInputTokens,
                },
              });
            }}
          >
            <option value="inherit">{t("settings.ai.rag.embeddingModeInherit")}</option>
            <option value="openai-compatible">{t("settings.ai.rag.embeddingModeOpenAiCompatible")}</option>
            <option value="ollama">{t("settings.ai.rag.embeddingModeOllama")}</option>
            <option value="mock">{t("settings.ai.rag.embeddingModeMock")}</option>
          </select>
        </div>
        <div className="form-group">
          <label>{t("settings.ai.rag.embeddingModel")}</label>
          <input
            type="text"
            placeholder={t("settings.ai.rag.embeddingPlaceholder")}
            value={kb.embedding?.modelName ?? ""}
            onChange={async (e) => {
              await patch({
                embedding: {
                  ...kb.embedding,
                  mode: kb.embedding?.mode ?? "inherit",
                  modelName: e.target.value.trim() || undefined,
                },
              });
            }}
          />
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label>{t("settings.ai.rag.embeddingEndpoint")}</label>
          <input
            type="text"
            placeholder={t("settings.ai.rag.embeddingEndpointPlaceholder")}
            value={kb.embedding?.endpoint ?? ""}
            onChange={async (e) => {
              await patch({
                embedding: {
                  ...kb.embedding,
                  mode: kb.embedding?.mode ?? "inherit",
                  endpoint: e.target.value.trim() || undefined,
                },
              });
            }}
          />
          <p className="field-desc">{t("settings.ai.rag.embeddingEndpointHint")}</p>
        </div>
        <div className="form-group">
          <label>{t("settings.ai.rag.embeddingApiKey")}</label>
          <input
            type="password"
            placeholder={t("settings.ai.rag.embeddingApiKeyPlaceholder")}
            value={kb.embedding?.apiKey ?? ""}
            onChange={async (e) => {
              await patch({
                embedding: {
                  ...kb.embedding,
                  mode: kb.embedding?.mode ?? "inherit",
                  apiKey: e.target.value.trim() || undefined,
                },
              });
            }}
          />
        </div>
        <div className="form-group">
          <label>{t("settings.ai.rag.embeddingMaxInputTokens")}</label>
          <input
            type="number"
            min={1}
            placeholder="4096"
            value={kb.embedding?.maxInputTokens ?? ""}
            onChange={async (e) => {
              const raw = e.target.value.trim();
              await patch({
                embedding: {
                  ...kb.embedding,
                  mode: kb.embedding?.mode ?? "inherit",
                  maxInputTokens: raw ? Number.parseInt(raw, 10) : undefined,
                },
              });
            }}
          />
          <p className="field-desc">{t("settings.ai.rag.embeddingMaxInputTokensHint")}</p>
        </div>
      </div>

      <div className="settings-toggle-row">
        <div className="toggle-info">
          <strong>{t("settings.ai.rag.purgeRagOnDelete")}</strong>
          <span className="toggle-desc">{t("settings.ai.rag.purgeRagOnDeleteDesc")}</span>
        </div>
        <label className="toggle-switch">
          <input
            type="checkbox"
            checked={kb.purgeChatRagOnDelete === true}
            onChange={async (e) => {
              await patch({ purgeChatRagOnDelete: e.target.checked });
            }}
          />
          <span className="slider" />
        </label>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label>{t("settings.ai.rag.recentMessagesInContext")}</label>
          <input
            type="number"
            min={1}
            max={50}
            value={kb.recentMessageLimit ?? DEFAULT_AI_KNOWLEDGE_BASE.recentMessageLimit}
            onChange={async (e) => {
              await patch({ recentMessageLimit: parseInt(e.target.value, 10) || DEFAULT_AI_KNOWLEDGE_BASE.recentMessageLimit });
            }}
          />
        </div>
        <div className="form-group">
          <label>{t("settings.ai.rag.ragHistoryMessages")}</label>
          <input
            type="number"
            min={0}
            max={20}
            value={kb.ragMessageLimit ?? DEFAULT_AI_KNOWLEDGE_BASE.ragMessageLimit}
            onChange={async (e) => {
              await patch({ ragMessageLimit: parseInt(e.target.value, 10) || 0 });
            }}
          />
        </div>
        <div className="form-group">
          <label>{t("settings.ai.rag.vaultSnippetsPerPrompt")}</label>
          <input
            type="number"
            min={0}
            max={20}
            value={kb.vaultSnippetLimit ?? DEFAULT_AI_KNOWLEDGE_BASE.vaultSnippetLimit}
            onChange={async (e) => {
              await patch({ vaultSnippetLimit: parseInt(e.target.value, 10) || 0 });
            }}
          />
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label>{t("settings.ai.rag.maxFileSizeMb")}</label>
          <input
            type="number"
            min={1}
            max={512}
            value={Math.round(
              (kb.maxFileBytes ?? DEFAULT_AI_KNOWLEDGE_BASE.maxFileBytes) / (1024 * 1024),
            )}
            onChange={async (e) => {
              const mb = parseInt(e.target.value, 10) || 25;
              await patch({ maxFileBytes: mb * 1024 * 1024 });
            }}
          />
        </div>
        <div className="form-group">
          <label>{t("settings.ai.rag.chunkSizeChars")}</label>
          <input
            type="number"
            min={200}
            max={4000}
            value={kb.chunkSizeChars ?? DEFAULT_AI_KNOWLEDGE_BASE.chunkSizeChars}
            onChange={async (e) => {
              await patch({
                chunkSizeChars: parseInt(e.target.value, 10) || DEFAULT_AI_KNOWLEDGE_BASE_CHUNK_SIZE_CHARS,
              });
            }}
          />
        </div>
        <div className="form-group">
          <label>{t("settings.ai.rag.chunkOverlapChars")}</label>
          <input
            type="number"
            min={0}
            max={1000}
            value={kb.chunkOverlapChars ?? DEFAULT_AI_KNOWLEDGE_BASE.chunkOverlapChars}
            onChange={async (e) => {
              await patch({
                chunkOverlapChars: parseInt(e.target.value, 10) || DEFAULT_AI_KNOWLEDGE_BASE_CHUNK_OVERLAP_CHARS,
              });
            }}
          />
        </div>
      </div>

      <RagIndexStatusPanel />

      <div className="form-group">
        <label>{t("settings.ai.rag.publicKnowledgePaths")}</label>
        <input
          type="text"
          placeholder={t("settings.ai.rag.publicPathsPlaceholder")}
          value={(kb.publicVaultPaths ?? kb.vaultPaths ?? DEFAULT_AI_KNOWLEDGE_BASE.publicVaultPaths).join(", ")}
          onChange={async (e) => {
            const publicVaultPaths = e.target.value
              .split(",")
              .map((p) => p.trim())
              .filter(Boolean);
            await patch({ publicVaultPaths, vaultPaths: undefined });
          }}
        />
        <p className="field-desc">{t("settings.ai.rag.publicPathsDesc")}</p>
      </div>

      <div className="form-group">
        <label>{t("settings.ai.rag.privateKnowledgePaths")}</label>
        <input
          type="text"
          placeholder={t("settings.ai.rag.privatePathsPlaceholder")}
          value={(kb.privateVaultPaths ?? DEFAULT_AI_KNOWLEDGE_BASE.privateVaultPaths).join(", ")}
          onChange={async (e) => {
            const privateVaultPaths = e.target.value
              .split(",")
              .map((p) => p.trim())
              .filter(Boolean);
            await patch({ privateVaultPaths });
          }}
        />
        <p className="field-desc">{t("settings.ai.rag.privatePathsDesc")}</p>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label>{t("settings.ai.rag.externalProvider")}</label>
          <select
            value={kb.externalProvider ?? "none"}
            onChange={async (e) => {
              await patch({
                externalProvider: e.target.value as "none" | "mcp",
              });
            }}
          >
            <option value="none">{t("settings.ai.rag.externalNone")}</option>
            <option value="mcp">{t("settings.ai.rag.externalMcp")}</option>
          </select>
        </div>
        <div className="form-group">
          <label>{t("settings.ai.rag.mcpServerUrl")}</label>
          <input
            type="text"
            placeholder={t("settings.ai.rag.mcpUrlPlaceholder")}
            value={kb.mcpServerUrl ?? ""}
            disabled={kb.externalProvider !== "mcp"}
            onChange={async (e) => {
              await patch({ mcpServerUrl: e.target.value.trim() || undefined });
            }}
          />
        </div>
      </div>

      {kb.externalProvider === "mcp" && (
        <div className="form-row">
          <div className="form-group">
            <label>{t("settings.ai.rag.mcpSearchTool")}</label>
            <input
              type="text"
              placeholder={t("settings.ai.rag.mcpSearchToolPlaceholder")}
              value={kb.mcpSearchTool ?? ""}
              onChange={async (e) => {
                await patch({ mcpSearchTool: e.target.value.trim() || undefined });
              }}
            />
          </div>
          <div className="form-group">
            <label>{t("settings.ai.rag.mcpApiKeyOptional")}</label>
            <input
              type="password"
              value={kb.mcpApiKey ?? ""}
              onChange={async (e) => {
                await patch({ mcpApiKey: e.target.value.trim() || undefined });
              }}
            />
          </div>
        </div>
      )}
    </>
  );
}

function AgentIdentityEditor() {
  const t = useT();
  const nodeService = useNodeService();
  const [content, setContent] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void nodeService.getAgentIdentity().then((doc: AgentIdentityDocument) => {
      if (cancelled) return;
      setContent(doc.content);
      setUpdatedAt(doc.updatedAt);
      setLoading(false);
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [nodeService]);

  const handleSave = async () => {
    setSaving(true);
    setSaveMessage(null);
    try {
      const doc = await nodeService.updateAgentIdentity(content);
      setUpdatedAt(doc.updatedAt);
      setSaveMessage(t("settings.ai.agent.saved"));
    } catch (err) {
      setSaveMessage(err instanceof Error ? err.message : t("settings.ai.agent.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <h4>{t("settings.ai.agent.operatingInstructionsHeading")}</h4>
      <p className="field-desc">{t("settings.ai.agent.operatingInstructionsDesc")}</p>
      {loading ? (
        <p className="field-desc">{t("settings.ai.agent.loading")}</p>
      ) : (
        <>
          <div className="form-group">
            <textarea
              rows={14}
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          </div>
          <div className="form-actions">
            <button type="button" className="btn-primary" disabled={saving} onClick={() => void handleSave()}>
              {saving ? t("settings.ai.agent.saving") : t("settings.ai.agent.saveButton")}
            </button>
            {updatedAt && updatedAt !== new Date(0).toISOString() ? (
              <span className="field-desc">
                {t("settings.ai.agent.lastSaved", { time: new Date(updatedAt).toLocaleString() })}
              </span>
            ) : null}
            {saveMessage ? <span className="field-desc">{saveMessage}</span> : null}
          </div>
        </>
      )}
    </>
  );
}

function AutoReplyLimitsSettings({
  aiSettings,
  updateAiSettings,
}: {
  aiSettings: AiSettings;
  updateAiSettings: (partial: Partial<AiSettings>) => Promise<void>;
}) {
  const t = useT();
  const limits = normalizeAutoReplyLimits(aiSettings.autoReplyLimits);
  const hourlyUnlimited = isAutoReplyCapUnlimited(limits.maxPerContactPerHour);
  const dailyUnlimited = isAutoReplyCapUnlimited(limits.maxPerContactPerDay);

  const patchLimits = (partial: Partial<typeof limits>) => {
    void updateAiSettings({
      autoReplyLimits: { ...limits, ...partial },
    });
  };

  return (
    <>
      <div className="settings-toggle-row">
        <div className="toggle-info">
          <strong>{t("settings.ai.chat.limitsEnabled")}</strong>
          <span className="toggle-desc">{t("settings.ai.chat.limitsEnabledDesc")}</span>
        </div>
        <label className="toggle-switch">
          <input
            type="checkbox"
            checked={limits.enabled}
            onChange={(e) => patchLimits({ enabled: e.target.checked })}
          />
          <span className="slider" />
        </label>
      </div>
      <div className="settings-toggle-row">
        <div className="toggle-info">
          <strong>{t("settings.ai.chat.limitsOnlyAgentPeers")}</strong>
          <span className="toggle-desc">{t("settings.ai.chat.limitsOnlyAgentPeersDesc")}</span>
        </div>
        <label className="toggle-switch">
          <input
            type="checkbox"
            checked={limits.onlyForAgentPeers}
            disabled={!limits.enabled}
            onChange={(e) => patchLimits({ onlyForAgentPeers: e.target.checked })}
          />
          <span className="slider" />
        </label>
      </div>
      <div className="form-group">
        <label htmlFor="auto-reply-max-hour">{t("settings.ai.chat.limitsPerHour")}</label>
        <div className="settings-inline-row">
          <input
            id="auto-reply-max-hour"
            type="number"
            min={1}
            max={100}
            value={hourlyUnlimited ? DEFAULT_AUTO_REPLY_LIMITS.maxPerContactPerHour : limits.maxPerContactPerHour}
            disabled={!limits.enabled || hourlyUnlimited}
            onChange={(e) => {
              const n = Number.parseInt(e.target.value, 10);
              if (Number.isFinite(n) && n >= 1) patchLimits({ maxPerContactPerHour: n });
            }}
          />
          <label className="settings-checkbox-inline">
            <input
              type="checkbox"
              checked={hourlyUnlimited}
              disabled={!limits.enabled}
              onChange={(e) =>
                patchLimits({
                  maxPerContactPerHour: e.target.checked
                    ? AUTO_REPLY_CAP_UNLIMITED
                    : DEFAULT_AUTO_REPLY_LIMITS.maxPerContactPerHour,
                })
              }
            />
            {t("settings.ai.chat.limitsUnlimited")}
          </label>
        </div>
      </div>
      <div className="form-group">
        <label htmlFor="auto-reply-max-day">{t("settings.ai.chat.limitsPerDay")}</label>
        <div className="settings-inline-row">
          <input
            id="auto-reply-max-day"
            type="number"
            min={1}
            max={500}
            value={dailyUnlimited ? DEFAULT_AUTO_REPLY_LIMITS.maxPerContactPerDay : limits.maxPerContactPerDay}
            disabled={!limits.enabled || dailyUnlimited}
            onChange={(e) => {
              const n = Number.parseInt(e.target.value, 10);
              if (Number.isFinite(n) && n >= 1) patchLimits({ maxPerContactPerDay: n });
            }}
          />
          <label className="settings-checkbox-inline">
            <input
              type="checkbox"
              checked={dailyUnlimited}
              disabled={!limits.enabled}
              onChange={(e) =>
                patchLimits({
                  maxPerContactPerDay: e.target.checked
                    ? AUTO_REPLY_CAP_UNLIMITED
                    : DEFAULT_AUTO_REPLY_LIMITS.maxPerContactPerDay,
                })
              }
            />
            {t("settings.ai.chat.limitsUnlimited")}
          </label>
        </div>
      </div>
      <div className="settings-toggle-row">
        <div className="toggle-info">
          <strong>{t("settings.ai.chat.limitsPauseThread")}</strong>
          <span className="toggle-desc">{t("settings.ai.chat.limitsPauseThreadDesc")}</span>
        </div>
        <label className="toggle-switch">
          <input
            type="checkbox"
            checked={limits.pauseThreadOnLimit}
            disabled={!limits.enabled}
            onChange={(e) => patchLimits({ pauseThreadOnLimit: e.target.checked })}
          />
          <span className="slider" />
        </label>
      </div>
    </>
  );
}

function defaultAiSettings(): AiSettings {
  return {
    status: { onlineAssistantEnabled: true, offlineAgentEnabled: false, statusMode: "automatic" },
    identity: { mode: "transparent" },
    defaultModeForNewContacts: "manual",
    rules: [],
    documentAutonomy: { ...DEFAULT_DOCUMENT_AUTONOMY_POLICY },
    disclosure: { ...DEFAULT_ENVOY_DISCLOSURE_SETTINGS },
    profileMedia: { ...DEFAULT_PROFILE_MEDIA_POLICY },
    knowledgeBase: { ...DEFAULT_AI_KNOWLEDGE_BASE },
    autoReplyLimits: { ...DEFAULT_AUTO_REPLY_LIMITS },
  };
}

function ModelProviderSettings({
  nodeConfig,
  refreshNodeConfig,
}: {
  nodeConfig: import("@envoymesh/api").NodeConfig | null;
  refreshNodeConfig: () => Promise<void>;
}) {
  const t = useT();
  const nodeService = useNodeService();
  const modelProviderUiScope = useModelProviderUiScope();
  const cloudOnlyMobile = modelProviderUiScope === "cloud-only";
  const isMobileNode = useIsInProcessMobileNode();

  const [modelEndpoint, setModelEndpoint] = useState(nodeConfig?.modelProviders?.endpoint ?? "");
  const [modelName, setModelName] = useState(nodeConfig?.modelProviders?.modelName ?? "");
  const [modelApiKey, setModelApiKey] = useState(nodeConfig?.modelProviders?.apiKey ?? "");
  const [settingsSaveStatus, setSettingsSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const modelProviderFieldsDirtyRef = useRef(false);

  useEffect(() => {
    if (settingsSaveStatus === "saving" || modelProviderFieldsDirtyRef.current) return;
    const mp = nodeConfig?.modelProviders;
    if (!mp) return;
    setModelEndpoint(mp.endpoint ?? "");
    setModelName(mp.modelName ?? "");
    setModelApiKey(mp.apiKey ?? "");
  }, [nodeConfig?.modelProviders, settingsSaveStatus]);

  const modelMode = nodeConfig?.modelProviders?.mode ?? "mock";
  const modelProviderHints = useMemo(() => {
    switch (modelMode) {
      case "ollama":
        return {
          endpointPlaceholder: t("settings.ai.model.endpointPlaceholderOllama"),
          hint: t("settings.ai.model.endpointHintOllama"),
          apiKeyHint: t("settings.ai.model.apiKeyHintOllama"),
        };
      case "litellm":
        return {
          endpointPlaceholder: t("settings.ai.model.endpointPlaceholderLitellm"),
          hint: t("settings.ai.model.endpointHintLitellm"),
          apiKeyHint: t("settings.ai.model.apiKeyHintLitellm"),
        };
      case "openai-compatible":
        return {
          endpointPlaceholder: t("settings.ai.model.endpointPlaceholderOpenAi"),
          hint: t("settings.ai.model.endpointHintOpenAi"),
          apiKeyHint: t("settings.ai.model.apiKeyHintOpenAi"),
        };
      case "anthropic-compatible":
        return {
          endpointPlaceholder: t("settings.ai.model.endpointPlaceholderAnthropic"),
          hint: t("settings.ai.model.endpointHintAnthropic"),
          apiKeyHint: t("settings.ai.model.apiKeyHintAnthropic"),
        };
      default:
        return { endpointPlaceholder: "", hint: "", apiKeyHint: "" };
    }
  }, [modelMode, t]);

  const updateNodeConfig = async (partial: Partial<import("@envoymesh/api").NodeConfig>) => {
    await nodeService.updateNodeConfig(partial);
    await refreshNodeConfig();
  };

  return (
    <>
      <h4>{t("settings.ai.model.heading")}</h4>
      <p className="section-desc">
        {cloudOnlyMobile
          ? t("settings.ai.model.sectionDescCloud")
          : t("settings.ai.model.sectionDescDefault")}
      </p>
      <dl className="settings-list">
        <dt>{t("settings.ai.model.providerLabel")}</dt>
        <dd>
          <select
            className="settings-select"
            value={nodeConfig?.modelProviders?.mode ?? "mock"}
            onChange={async (e) => {
              const mode = e.target.value as ModelProviderMode;
              await updateNodeConfig({
                modelProviders: { ...nodeConfig?.modelProviders, mode },
              });
            }}
          >
            <option value="mock">{t("settings.ai.model.modeMock")}</option>
            <option value="openai-compatible">{t("settings.ai.model.modeOpenAiCompatible")}</option>
            <option value="anthropic-compatible">{t("settings.ai.model.modeAnthropicCompatible")}</option>
            {!cloudOnlyMobile && !isMobileNode && (
              <>
                <option value="ollama">{t("settings.ai.model.modeOllama")}</option>
                <option value="litellm">{t("settings.ai.model.modeLitellm")}</option>
              </>
            )}
            <option value="disabled">{t("settings.ai.model.modeDisabled")}</option>
          </select>
        </dd>
        <dt>{t("settings.ai.model.endpointUrl")}</dt>
        <dd>
          <input
            type="text"
            className="settings-input"
            placeholder={modelProviderHints.endpointPlaceholder || t("settings.ai.model.endpointPlaceholderDefault")}
            value={modelEndpoint}
            onChange={(e) => {
              modelProviderFieldsDirtyRef.current = true;
              setModelEndpoint(e.target.value);
            }}
          />
          {modelProviderHints.hint ? (
            <p className="settings-hint" style={{ marginTop: "6px" }}>
              {modelProviderHints.hint}
            </p>
          ) : null}
        </dd>
        <dt>{t("settings.ai.model.modelName")}</dt>
        <dd>
          <input
            type="text"
            className="settings-input"
            placeholder={t("settings.ai.model.modelNamePlaceholder")}
            value={modelName}
            onChange={(e) => {
              modelProviderFieldsDirtyRef.current = true;
              setModelName(e.target.value);
            }}
          />
        </dd>
        <dt>{t("settings.ai.model.apiKey")}</dt>
        <dd>
          <input
            type="password"
            className="settings-input"
            placeholder={t("settings.ai.model.apiKeyPlaceholder")}
            value={modelApiKey}
            onChange={(e) => {
              modelProviderFieldsDirtyRef.current = true;
              setModelApiKey(e.target.value);
            }}
          />
          {modelProviderHints.apiKeyHint ? (
            <p className="settings-hint" style={{ marginTop: "6px" }}>
              {modelProviderHints.apiKeyHint}
            </p>
          ) : null}
        </dd>
      </dl>
      <div className="settings-buttons">
        <button
          type="button"
          className="settings-save-btn"
          disabled={settingsSaveStatus === "saving"}
          onClick={async () => {
            setSettingsSaveStatus("saving");
            try {
              await updateNodeConfig({
                modelProviders: {
                  ...(nodeConfig?.modelProviders ?? { mode: "mock" as ModelProviderMode }),
                  endpoint: modelEndpoint,
                  modelName,
                  apiKey: modelApiKey,
                },
              });
              modelProviderFieldsDirtyRef.current = false;
              setSettingsSaveStatus("saved");
              setTimeout(() => setSettingsSaveStatus("idle"), 2000);
            } catch {
              setSettingsSaveStatus("error");
              setTimeout(() => setSettingsSaveStatus("idle"), 2000);
            }
          }}
        >
          {settingsSaveStatus === "saving"
            ? t("settings.ai.model.saving")
            : settingsSaveStatus === "saved"
              ? t("settings.ai.model.saved")
              : t("settings.ai.model.saveProvider")}
        </button>
        <button
          type="button"
          className="settings-cancel-btn"
          onClick={() => {
            modelProviderFieldsDirtyRef.current = false;
            setModelEndpoint(nodeConfig?.modelProviders?.endpoint ?? "");
            setModelName(nodeConfig?.modelProviders?.modelName ?? "");
            setModelApiKey(nodeConfig?.modelProviders?.apiKey ?? "");
            setSettingsSaveStatus("idle");
          }}
        >
          {t("settings.ai.model.reset")}
        </button>
        {settingsSaveStatus === "error" && (
          <span className="settings-save-error">{t("settings.ai.model.saveFailed")}</span>
        )}
      </div>
    </>
  );
}

function TerminalAssistSettings({
  nodeConfig,
  refreshNodeConfig,
  isMobileNode,
}: {
  nodeConfig: import("@envoymesh/api").NodeConfig | null;
  refreshNodeConfig: () => Promise<void>;
  isMobileNode: boolean;
}) {
  const t = useT();
  const nodeService = useNodeService();
  const [assistModel, setAssistModel] = useState(nodeConfig?.terminalAssistModelName ?? "");
  const [allowPatterns, setAllowPatterns] = useState(
    (nodeConfig?.terminalCommandAllowPatterns ?? []).join("\n"),
  );
  const [denyPatterns, setDenyPatterns] = useState(
    (nodeConfig?.terminalCommandDenyPatterns ?? []).join("\n"),
  );
  const [destructivePatterns, setDestructivePatterns] = useState(
    (nodeConfig?.terminalCommandDestructivePatterns ?? []).join("\n"),
  );
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [herdrStatus, setHerdrStatus] = useState<"idle" | "opening" | "done" | "error">("idle");
  const [herdrMessage, setHerdrMessage] = useState<string | null>(null);

  useEffect(() => {
    if (saveStatus === "saving") return;
    setAssistModel(nodeConfig?.terminalAssistModelName ?? "");
    setAllowPatterns((nodeConfig?.terminalCommandAllowPatterns ?? []).join("\n"));
    setDenyPatterns((nodeConfig?.terminalCommandDenyPatterns ?? []).join("\n"));
    setDestructivePatterns((nodeConfig?.terminalCommandDestructivePatterns ?? []).join("\n"));
  }, [nodeConfig, saveStatus]);

  if (isMobileNode) {
    return (
      <p className="section-desc">{t("settings.ai.terminalAssist.sectionDesc")}</p>
    );
  }

  const splitPatterns = (raw: string) =>
    raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

  return (
    <>
      <p className="section-desc">{t("settings.ai.terminalAssist.sectionDesc")}</p>
      <dl className="settings-list">
        <dt>{t("settings.ai.terminalAssist.modelName")}</dt>
        <dd>
          <input
            type="text"
            className="settings-input"
            placeholder={
              nodeConfig?.modelProviders?.modelName?.trim() ||
              t("settings.ai.terminalAssist.modelNamePlaceholder")
            }
            value={assistModel}
            onChange={(e) => setAssistModel(e.target.value)}
          />
          <p className="settings-hint">{t("settings.ai.terminalAssist.modelNameHint")}</p>
        </dd>
        <dt>{t("settings.ai.terminalAssist.autoRunPolicy")}</dt>
        <dd>
          <select
            className="settings-select"
            value={nodeConfig?.terminalAutoRunPolicy ?? "always-confirm"}
            onChange={async (e) => {
              await nodeService.updateNodeConfig({
                terminalAutoRunPolicy: e.target.value as import("@envoymesh/api").TerminalAutoRunPolicy,
              });
              await refreshNodeConfig();
            }}
          >
            <option value="always-confirm">{t("settings.ai.terminalAssist.autoRunAlwaysConfirm")}</option>
            <option value="safe-only">{t("settings.ai.terminalAssist.autoRunSafeOnly")}</option>
            <option value="off">{t("settings.ai.terminalAssist.autoRunOff")}</option>
          </select>
        </dd>
        <dt>{t("settings.ai.terminalAssist.allowPatterns")}</dt>
        <dd>
          <textarea
            className="settings-input"
            rows={3}
            placeholder={t("settings.ai.terminalAssist.allowPatternsPlaceholder")}
            value={allowPatterns}
            onChange={(e) => setAllowPatterns(e.target.value)}
          />
          <p className="settings-hint">{t("settings.ai.terminalAssist.allowPatternsDesc")}</p>
        </dd>
        <dt>{t("settings.ai.terminalAssist.denyPatterns")}</dt>
        <dd>
          <textarea
            className="settings-input"
            rows={3}
            placeholder={t("settings.ai.terminalAssist.denyPatternsPlaceholder")}
            value={denyPatterns}
            onChange={(e) => setDenyPatterns(e.target.value)}
          />
          <p className="settings-hint">{t("settings.ai.terminalAssist.denyPatternsDesc")}</p>
        </dd>
        <dt>{t("settings.ai.terminalAssist.destructivePatterns")}</dt>
        <dd>
          <textarea
            className="settings-input"
            rows={3}
            placeholder={t("settings.ai.terminalAssist.destructivePatternsPlaceholder")}
            value={destructivePatterns}
            onChange={(e) => setDestructivePatterns(e.target.value)}
          />
          <p className="settings-hint">{t("settings.ai.terminalAssist.destructivePatternsDesc")}</p>
        </dd>
      </dl>
      <div className="settings-toggle-row">
        <div className="toggle-info">
          <strong>{t("settings.ai.terminalAssist.agentModeDefault")}</strong>
          <span className="toggle-desc">{t("settings.ai.terminalAssist.agentModeDefaultDesc")}</span>
        </div>
        <label className="toggle-switch">
          <input
            type="checkbox"
            checked={nodeConfig?.terminalAgentModeDefault ?? false}
            onChange={async (e) => {
              await nodeService.updateNodeConfig({ terminalAgentModeDefault: e.target.checked });
              await refreshNodeConfig();
            }}
          />
          <span className="slider" />
        </label>
      </div>
      <div className="settings-toggle-row">
        <div className="toggle-info">
          <strong>{t("settings.ai.terminalAssist.inlineSuggest")}</strong>
          <span className="toggle-desc">{t("settings.ai.terminalAssist.inlineSuggestDesc")}</span>
        </div>
        <label className="toggle-switch">
          <input
            type="checkbox"
            checked={nodeConfig?.terminalInlineSuggestEnabled ?? false}
            onChange={async (e) => {
              await nodeService.updateNodeConfig({ terminalInlineSuggestEnabled: e.target.checked });
              await refreshNodeConfig();
            }}
          />
          <span className="slider" />
        </label>
      </div>
      <div className="settings-toggle-row">
        <div className="toggle-info">
          <strong>{t("settings.ai.terminalAssist.xtermSlashIntercept")}</strong>
          <span className="toggle-desc">{t("settings.ai.terminalAssist.xtermSlashInterceptDesc")}</span>
        </div>
        <label className="toggle-switch">
          <input
            type="checkbox"
            checked={nodeConfig?.terminalXtermSlashIntercept ?? false}
            onChange={async (e) => {
              await nodeService.updateNodeConfig({ terminalXtermSlashIntercept: e.target.checked });
              await refreshNodeConfig();
            }}
          />
          <span className="slider" />
        </label>
      </div>
      <div className="settings-buttons">
        <button
          type="button"
          className="settings-save-btn"
          disabled={saveStatus === "saving"}
          onClick={async () => {
            setSaveStatus("saving");
            try {
              await nodeService.updateNodeConfig({
                terminalAssistModelName: assistModel.trim() || undefined,
                terminalCommandAllowPatterns: splitPatterns(allowPatterns),
                terminalCommandDenyPatterns: splitPatterns(denyPatterns),
                terminalCommandDestructivePatterns: splitPatterns(destructivePatterns),
              });
              await refreshNodeConfig();
              setSaveStatus("saved");
              setTimeout(() => setSaveStatus("idle"), 2000);
            } catch {
              setSaveStatus("error");
              setTimeout(() => setSaveStatus("idle"), 2000);
            }
          }}
        >
          {saveStatus === "saving"
            ? t("settings.ai.terminalAssist.saving")
            : saveStatus === "saved"
              ? t("settings.ai.terminalAssist.saved")
              : t("settings.ai.terminalAssist.save")}
        </button>
        {saveStatus === "error" ? (
          <span className="settings-save-error">{t("settings.ai.terminalAssist.saveFailed")}</span>
        ) : null}
      </div>
      <div className="settings-subsection">
        <h5>{t("settings.ai.terminalAssist.herdrHeading")}</h5>
        <p className="settings-hint">{t("settings.ai.terminalAssist.herdrDesc")}</p>
        <div className="settings-buttons">
          <button
            type="button"
            className="secondary"
            disabled={herdrStatus === "opening"}
            onClick={async () => {
              setHerdrStatus("opening");
              setHerdrMessage(null);
              try {
                const result = await nodeService.openInHerdr({});
                if (result.ok) {
                  setHerdrStatus("done");
                  setHerdrMessage(t("settings.ai.terminalAssist.herdrOpened", { cwd: result.cwd }));
                } else {
                  setHerdrStatus("error");
                  const reasonKey =
                    result.reason === "herdr.unsupportedPlatform"
                      ? "settings.ai.terminalAssist.herdrUnsupportedPlatform"
                      : result.reason === "herdr.mobileUnsupported"
                        ? "settings.ai.terminalAssist.herdrMobileUnsupported"
                        : result.reason === "herdr.workspaceUnavailable"
                          ? "settings.ai.terminalAssist.herdrWorkspaceUnavailable"
                          : "settings.ai.terminalAssist.herdrSpawnFailed";
                  setHerdrMessage(t(reasonKey));
                }
              } catch (e: unknown) {
                setHerdrStatus("error");
                setHerdrMessage(e instanceof Error ? e.message : String(e));
              }
              setTimeout(() => setHerdrStatus("idle"), 4000);
            }}
          >
            {herdrStatus === "opening"
              ? t("settings.ai.terminalAssist.herdrOpening")
              : t("settings.ai.terminalAssist.herdrOpen")}
          </button>
        </div>
        {herdrMessage ? <p className="settings-hint">{herdrMessage}</p> : null}
        <p className="settings-hint">{t("settings.ai.terminalAssist.herdrExportNote")}</p>
      </div>
    </>
  );
}

export function SettingsAITab() {
  const t = useT();
  const nodeService = useNodeService();
  const { showToast } = useToast();
  const isMobileNode = useIsInProcessMobileNode();
  const { nodeConfig, refreshNodeConfig, bridgeStatus } = useNodeState();
  const aiSettings = nodeConfig?.aiSettings ?? defaultAiSettings();
  const documentAutonomy = normalizeDocumentAutonomyPolicy(aiSettings.documentAutonomy);
  const profileMedia = normalizeProfileMediaPolicy(aiSettings.profileMedia);
  const disclosure = normalizeEnvoyDisclosureSettings(aiSettings.disclosure);

  const [ruleForm, setRuleForm] = useState<RuleFormState>(EMPTY_RULE_FORM);

  const updateAiSettings = async (partial: Partial<AiSettings>) => {
    await nodeService.updateNodeConfig({
      aiSettings: { ...aiSettings, ...partial },
    });
    await refreshNodeConfig();
  };

  // ---- Rule CRUD ----

  const handleAddRule = async () => {
    if (!ruleForm.name.trim()) {
      showToast(t("settings.ai.rules.nameRequiredAlert"), "error");
      return;
    }

    const newRule: AiRule = {
      id: `rule_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      enabled: true,
      name: ruleForm.name.trim(),
      category: ruleForm.category,
      priority: ruleForm.priority,
      trigger: {
        ...(ruleForm.keywords.trim() ? { keywords: ruleForm.keywords.split(",").map(k => k.trim()).filter(Boolean) } : {}),
        ...(ruleForm.regex.trim() ? { messageContains: ruleForm.regex.trim() } : {}),
        ...(ruleForm.isGreeting ? { isGreeting: true } : {}),
        ...(ruleForm.accessLevel ? { contactAiAccessLevel: [ruleForm.accessLevel] } : {}),
      },
      action: {
        type: ruleForm.actionType,
        ...(ruleForm.template.trim() ? { template: ruleForm.template.trim() } : {}),
        ...(ruleForm.identityOverride ? { aiIdentityOverride: ruleForm.identityOverride } : {}),
      },
    };

    const currentRules = aiSettings.rules ?? [];
    await updateAiSettings({ rules: [...currentRules, newRule] });
    setRuleForm({
      ...EMPTY_RULE_FORM,
      priority: currentRules.length > 0 ? Math.max(...currentRules.map(r => r.priority)) + 1 : 1,
    });
  };

  const handleDeleteRule = async (ruleId: string) => {
    const newRules = aiSettings.rules.filter(r => r.id !== ruleId);
    await updateAiSettings({ rules: newRules });
  };

  // ---- Helpers ----

  const currentStatus = aiSettings.status;

  const onlineAssistantToggle = useOptimisticToggle(
    currentStatus.onlineAssistantEnabled,
    async (onlineAssistantEnabled) => {
      await updateAiSettings({ status: { ...currentStatus, onlineAssistantEnabled } });
    },
  );
  const offlineAgentToggle = useOptimisticToggle(
    currentStatus.offlineAgentEnabled,
    async (offlineAgentEnabled) => {
      await updateAiSettings({ status: { ...currentStatus, offlineAgentEnabled } });
    },
  );

  const isOnlineManual = currentStatus.isOnlineManual ?? true;
  const manualStatusToggle = useOptimisticToggle(
    isOnlineManual,
    async (next) => {
      await updateAiSettings({ status: { ...currentStatus, isOnlineManual: next } });
    },
  );

  const updateNodeConfigPartial = async (partial: Parameters<typeof nodeService.updateNodeConfig>[0]) => {
    await nodeService.updateNodeConfig(partial);
    await refreshNodeConfig();
  };

  const chatAssistToggle = useOptimisticToggle(
    nodeConfig?.chatAssistEnabled ?? false,
    async (chatAssistEnabled) => {
      await updateNodeConfigPartial({ chatAssistEnabled });
    },
  );

  const socialAutoSend = !!(nodeConfig?.autonomousPolicies ?? []).find((p) => p.domain === "social")?.autoSendChat;

  const autoSendChatToggle = useOptimisticToggle(socialAutoSend, async (next) => {
    const currentPolicies = nodeConfig?.autonomousPolicies ?? [];
    const existingSocial = currentPolicies.find((p) => p.domain === "social");
    let updatedPolicies: AutonomousPolicy[];
    if (existingSocial) {
      updatedPolicies = currentPolicies.map((p) =>
        p.domain === "social" ? { ...p, autoSendChat: next } : p,
      );
    } else {
      updatedPolicies = [
        ...currentPolicies,
        {
          domain: "social" as AutonomousDomain,
          maxSensitivity: "friends",
          autoAnswer: next,
          autoSendChat: next,
        },
      ];
    }
    await updateNodeConfigPartial({ autonomousPolicies: updatedPolicies });
  });

  const killSwitchToggle = useOptimisticToggle(
    nodeConfig?.autonomousKillSwitch ?? false,
    async (autonomousKillSwitch) => {
      await updateNodeConfigPartial({ autonomousKillSwitch });
    },
  );

  // ---- Phase 32 — Agent Network (built-in OpenClaw + Ext Agent bridge) ----
  // The Built-in OpenClaw block is read-only in the UI (the owner edits
  // node-config.json and restarts). The Ext Agent block is writable.
  const [openClawStatus, setOpenClawStatus] = useState<{
    enabled: boolean;
    running: boolean;
    url: string;
    childPid?: number;
  } | null>(null);

  const refreshOpenClawStatus = useCallback(async () => {
    try {
      const oc = await nodeService.getOpenClawStatus();
      setOpenClawStatus({
        enabled: oc.enabled,
        running: oc.running,
        url: oc.url,
        childPid: oc.childPid,
      });
    } catch (e) {
      console.warn("[SettingsAITab] failed to fetch OpenClaw status", e);
    }
  }, [nodeService]);

  useEffect(() => { void refreshOpenClawStatus(); }, [refreshOpenClawStatus]);

  // Refetch OpenClaw live status when persisted AI-engine flags change.
  const lastEngineFlagsRef = useRef<string>("");
  useEffect(() => {
    const key = `${nodeConfig?.bridgeEnabled ?? false}:${nodeConfig?.openclawEnabled ?? true}:${nodeConfig?.activeExtAgentId ?? ""}`;
    if (lastEngineFlagsRef.current === key) return;
    lastEngineFlagsRef.current = key;
    void refreshOpenClawStatus();
  }, [
    nodeConfig?.bridgeEnabled,
    nodeConfig?.openclawEnabled,
    nodeConfig?.activeExtAgentId,
    refreshOpenClawStatus,
  ]);

  const envoyAIInfo = useMemo(
    () => ({
      enabled: nodeConfig?.openclawEnabled ?? true,
      running: openClawStatus?.running ?? false,
      url: openClawStatus?.url ?? "",
      childPid: openClawStatus?.childPid,
    }),
    [nodeConfig?.openclawEnabled, openClawStatus],
  );

  const extAgentConfig = useMemo(
    () => ({
      enabled: nodeConfig?.bridgeEnabled ?? false,
      configured: Boolean(bridgeStatus?.agentPeerId),
      name: bridgeStatus?.agentName ?? "",
      url: bridgeStatus?.agentUrl ?? "",
      listenPort: bridgeStatus?.listenPort ?? nodeConfig?.bridgeListenPort ?? 3031,
      activeExtAgentId: bridgeStatus?.activeExtAgentId ?? nodeConfig?.activeExtAgentId,
      extAgents: bridgeStatus?.extAgents ?? nodeConfig?.extAgents,
    }),
    [
      nodeConfig?.bridgeEnabled,
      nodeConfig?.activeExtAgentId,
      nodeConfig?.extAgents,
      nodeConfig?.bridgeListenPort,
      bridgeStatus?.agentPeerId,
      bridgeStatus?.agentName,
      bridgeStatus?.agentUrl,
      bridgeStatus?.listenPort,
      bridgeStatus?.activeExtAgentId,
      bridgeStatus?.extAgents,
    ],
  );

  const handleExtAgentSave = useCallback(async (next: {
    enabled: boolean;
    configured: boolean;
    name?: string;
    url?: string;
    listenPort?: number;
    activeExtAgentId?: string;
    extAgents?: import("@envoymesh/api").ExtAgentDefinition[];
  }) => {
    await updateNodeConfigPartial({
      bridgeEnabled: next.enabled,
      activeExtAgentId: next.activeExtAgentId,
      extAgents: next.extAgents,
      bridgeListenPort: next.listenPort,
    });
  }, [updateNodeConfigPartial]);

  // Phase 35C — LAN auto-bond lives in SettingsAgentNetworkTab. The settings
  // tab here is dedicated to AI behaviour (provider, rules, terminal assist,
  // autonomy, identity) and the operator-facing agent-network onboarding
  // (LAN auto-bond, company invites, pairing kiosk, fleet manifest) is on
  // its own tab so neither tab is overstuffed.

  return (
    <>
      <section className="settings-section">
        <h3>{t("settings.ai.title")}</h3>
        <p className="section-desc">{t("settings.ai.sectionDesc")}</p>
      </section>

      {/* ============================================================
       * Section order is "frequent first, defaults last":
       * 1. Model provider                           — foundational LLM backend
       * 2. AI engine (EnvoyAI / Ext Agent)         — picks which agent surfaces the AI
       * 3. Chat (toggles + auto-reply limits)        — daily drivers
       * 4. AI identity & disclosure                  — affects every reply
       * 5. Postures (social proxy / doc acq / etc.)  — power switches
       * 6. Notifications (a2a + per-domain)          — daily driver
       * 7. Presence (online / offline / status)      — daily driver
       * 8. AI rules                                 — set when authoring
       * 9. Agent operating instructions              — set once
       * --------- Defaults / set-once ----------
       * 10. Knowledge base (RAG)                     — many default fields
       * 11. Profile gallery media policy             — default share tier
       * 12. Document autonomy policy                 — default share tier
       * 13. Terminal assist                          — advanced, set once
       * 14. Contact default mode                    — has default "manual"
       * --------- Developer-only ----------
       * 15. Debug prefix                             — dev / debug toggle
       * ============================================================ */}

      <section className="settings-section">
        <h4>{t("settings.ai.modelProvider.heading")}</h4>
        <ModelProviderSettings nodeConfig={nodeConfig} refreshNodeConfig={refreshNodeConfig} />
      </section>

      <section className="settings-section">
        <h4>{t("settings.ai.aiEngine.heading")}</h4>
        <p className="section-desc">{t("settings.ai.aiEngine.desc")}</p>
        {openClawStatus ? (
          <AgentSettings
            envoyAI={envoyAIInfo}
            extAgent={extAgentConfig}
            onExtAgentSave={handleExtAgentSave}
          />
        ) : (
          <p className="settings-hint">{t("settings.ai.aiEngine.loading")}</p>
        )}
      </section>

      {/* Agent Network chain defaults — budget ceiling, stall policy, bid
          ranking weights. Moved here (from the orphaned panel) so all
          agent-behavior config lives together. The "Agent Network" tab is
          now "Devices & Fleet" (device bonding), clearing the naming clash. */}
      <section className="settings-section">
        <ChainDefaultsPanel />
      </section>

      <section className="settings-section">
        <h4>{t("settings.ai.chat.heading")}</h4>
        <p className="section-desc">{t("settings.ai.chat.sectionDesc")}</p>
        <div className="settings-toggle-row">
          <div className="toggle-info">
            <strong>{t("settings.ai.chat.chatAssist")}</strong>
            <span className="toggle-desc">{t("settings.ai.chat.chatAssistDesc")}</span>
          </div>
          <label className="toggle-switch">
            <input type="checkbox" checked={chatAssistToggle.checked} onChange={chatAssistToggle.onCheckboxChange} />
            <span className="slider" />
          </label>
        </div>
        <div className="settings-toggle-row">
          <div className="toggle-info">
            <strong>{t("settings.ai.chat.autoSendChat")}</strong>
            <span className="toggle-desc">{t("settings.ai.chat.autoSendChatDesc")}</span>
          </div>
          <label className="toggle-switch">
            <input type="checkbox" checked={autoSendChatToggle.checked} onChange={autoSendChatToggle.onCheckboxChange} />
            <span className="slider" />
          </label>
        </div>
        <div className="settings-toggle-row">
          <div className="toggle-info">
            <strong>{t("settings.ai.chat.pauseAllAi")}</strong>
            <span className="toggle-desc">{t("settings.ai.chat.pauseAllAiDesc")}</span>
          </div>
          <label className="toggle-switch">
            <input type="checkbox" checked={killSwitchToggle.checked} onChange={killSwitchToggle.onCheckboxChange} />
            <span className="slider" />
          </label>
        </div>
      </section>

      <section className="settings-section">
        <h4>{t("settings.ai.chat.limitsHeading")}</h4>
        <p className="section-desc">{t("settings.ai.chat.limitsDesc")}</p>
        <AutoReplyLimitsSettings aiSettings={aiSettings} updateAiSettings={updateAiSettings} />
      </section>

      <section className="settings-section">
        <h4>{t("settings.ai.identity.heading")}</h4>
        <p className="section-desc">{t("settings.ai.identity.sectionDesc")}</p>
        <div className="identity-mode-options">
          {(
            [
              ["invisible", "modeInvisible", "modeInvisibleDesc", "modeInvisibleExample"],
              ["transparent", "modeTransparent", "modeTransparentDesc", "modeTransparentExample"],
              ["defensive", "modeDefensive", "modeDefensiveDesc", "modeDefensiveExample"],
            ] as const
          ).map(([mode, titleKey, descKey, exampleKey]) => (
            <label key={mode} className={`identity-mode-option ${aiSettings.identity.mode === mode ? "active" : ""}`}>
              <input type="radio" name="ai-identity" value={mode}
                checked={aiSettings.identity.mode === mode}
                onChange={async () => {
                  await updateAiSettings({ identity: { ...aiSettings.identity, mode } });
                }} />
              <div className="identity-mode-content">
                <strong>{t(`settings.ai.identity.${titleKey}`)}</strong>
                <span>{t(`settings.ai.identity.${descKey}`)}</span>
                <small>{t(`settings.ai.identity.${exampleKey}`)}</small>
              </div>
            </label>
          ))}
        </div>

        <h5>{t("settings.ai.identity.disclosureHeading")}</h5>
        <p className="field-desc">{t("settings.ai.identity.disclosureDesc")}</p>
        <div className="settings-field">
          <label className="settings-checkbox-row">
            <input
              type="checkbox"
              checked={disclosure.showAgentBadges}
              onChange={async (e) => {
                await updateAiSettings({
                  disclosure: { ...disclosure, showAgentBadges: e.target.checked },
                });
              }}
            />
            <span>{t("settings.ai.identity.showAgentBadges")}</span>
          </label>
        </div>
        <div className="settings-field">
          <label className="settings-checkbox-row">
            <input
              type="checkbox"
              checked={disclosure.collapsePeerAgentToContact}
              onChange={async (e) => {
                await updateAiSettings({
                  disclosure: {
                    ...disclosure,
                    collapsePeerAgentToContact: e.target.checked,
                  },
                });
              }}
            />
            <span>{t("settings.ai.identity.collapsePeerAgentToContact")}</span>
          </label>
        </div>
      </section>

      <section className="settings-section">
        <h4>{t("settings.ai.postures.heading")}</h4>
        <p className="section-desc">{t("settings.ai.postures.sectionDesc")}</p>
        <div className="settings-field">
          <label className="settings-checkbox-row">
            <input
              type="checkbox"
              checked={nodeConfig?.socialProxyEnabled === true}
              disabled={!nodeConfig?.trustModeEnabled}
              onChange={async (e) => {
                const enabled = e.target.checked;
                await nodeService.updateNodeConfig({
                  socialProxyEnabled: enabled,
                  ...(enabled ? { friendAutopilotEnabled: false } : {}),
                });
                await refreshNodeConfig();
              }}
            />
            <span>{t("settings.ai.postures.socialProxy")}</span>
          </label>
        </div>
        <div className="settings-field">
          <label className="settings-checkbox-row">
            <input
              type="checkbox"
              checked={nodeConfig?.documentAcquisitionEnabled === true}
              onChange={async (e) => {
                await nodeService.updateNodeConfig({ documentAcquisitionEnabled: e.target.checked });
                await refreshNodeConfig();
              }}
            />
            <span>{t("settings.ai.postures.documentAcquisition")}</span>
          </label>
        </div>
        <div className="settings-field">
          <label className="settings-checkbox-row">
            <input
              type="checkbox"
              checked={nodeConfig?.capabilityProviderEnabled === true}
              onChange={async (e) => {
                await nodeService.updateNodeConfig({ capabilityProviderEnabled: e.target.checked });
                await refreshNodeConfig();
              }}
            />
            <span>{t("settings.ai.postures.capabilityProvider")}</span>
          </label>
        </div>
      </section>

      <section className="settings-section">
        <h4>{t("settings.ai.chat.notificationsHeading")}</h4>
        <div className="form-group">
          <label>{t("settings.ai.chat.activityNotifications")}</label>
          <select
            className="settings-input"
            value={nodeConfig?.a2aChatNotifications ?? "off"}
            onChange={(e) => {
              void updateNodeConfigPartial({
                a2aChatNotifications: e.target.value as A2aChatNotificationMode,
              });
            }}
          >
            <option value="off">{t("settings.ai.chat.notificationsOff")}</option>
            <option value="milestones_only">{t("settings.ai.chat.notificationsMilestonesOnly")}</option>
            <option value="all_reports">{t("settings.ai.chat.notificationsAllReports")}</option>
          </select>
        </div>
        <div className="form-group">
          <label>{t("settings.ai.chat.interactionMode")}</label>
          <select
            className="settings-input"
            value={nodeConfig?.agentInteractionMode ?? "structured_preferred"}
            onChange={(e) => {
              void updateNodeConfigPartial({
                agentInteractionMode: e.target.value as AgentInteractionMode,
              });
            }}
          >
            <option value="structured_preferred">{t("settings.ai.chat.interactionStructuredPreferred")}</option>
            <option value="chat_ok">{t("settings.ai.chat.interactionChatOk")}</option>
          </select>
        </div>
        <div className="form-group">
          <label>{t("settings.ai.chat.visibilityByDomain")}</label>
          {(["social", "knowledge", "home", "research"] as AgentActivityDomain[]).map((domain) => (
            <div className="form-row" key={domain}>
              <div className="form-group">
                <label>
                  {domain === "social"
                    ? t("settings.ai.chat.domainSocial")
                    : domain === "knowledge"
                      ? t("settings.ai.chat.domainKnowledge")
                      : domain === "home"
                        ? t("settings.ai.chat.domainHome")
                        : t("settings.ai.chat.domainResearch")}
                </label>
                <select
                  className="settings-input"
                  value={nodeConfig?.agentVisibility?.[domain] ?? "instant"}
                  onChange={(e) => {
                    void updateNodeConfigPartial({
                      agentVisibility: {
                        ...(nodeConfig?.agentVisibility ?? {}),
                        [domain]: e.target.value as AgentNotifyMode,
                      },
                    });
                  }}
                >
                  <option value="instant">{t("settings.ai.chat.notifyInstant")}</option>
                  <option value="brief">{t("settings.ai.chat.notifyBrief")}</option>
                  <option value="silent">{t("settings.ai.chat.notifySilent")}</option>
                  <option value="approval">{t("settings.ai.chat.notifyApprovalOnly")}</option>
                </select>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="settings-section">
        <h4>{t("settings.ai.presence.heading")}</h4>
        <div className="settings-toggle-row">
          <div className="toggle-info">
            <strong>{t("settings.ai.presence.onlineAssistant")}</strong>
            <span className="toggle-desc">{t("settings.ai.presence.onlineAssistantDesc")}</span>
          </div>
          <label className="toggle-switch">
            <input type="checkbox" checked={onlineAssistantToggle.checked}
              onChange={onlineAssistantToggle.onCheckboxChange} />
            <span className="slider" />
          </label>
        </div>

        <div className="settings-toggle-row">
          <div className="toggle-info">
            <strong>{t("settings.ai.presence.offlineAgent")}</strong>
            <span className="toggle-desc">{t("settings.ai.presence.offlineAgentDesc")}</span>
          </div>
          <label className="toggle-switch">
            <input type="checkbox" checked={offlineAgentToggle.checked}
              onChange={offlineAgentToggle.onCheckboxChange} />
            <span className="slider" />
          </label>
        </div>

        <h5>{t("settings.ai.presence.detectionHeading")}</h5>
        <p className="field-desc">{t("settings.ai.presence.detectionDesc")}</p>
        <div className="settings-radio-group">
          {(["automatic", "manual"] as const).map((mode) => (
            <label key={mode} className={`settings-radio-option ${currentStatus.statusMode === mode ? "active" : ""}`}>
              <input type="radio" name="status-mode" value={mode}
                checked={currentStatus.statusMode === mode}
                onChange={async () => {
                  await updateAiSettings({ status: { ...currentStatus, statusMode: mode } });
                }} />
              <div className="radio-content">
                <strong>
                  {mode === "automatic"
                    ? t("settings.ai.presence.modeAutomatic")
                    : t("settings.ai.presence.modeManual")}
                </strong>
                <span>
                  {mode === "automatic"
                    ? t("settings.ai.presence.modeAutomaticDesc")
                    : t("settings.ai.presence.modeManualDesc")}
                </span>
              </div>
            </label>
          ))}
        </div>
          {currentStatus.statusMode === "manual" && (
            <div className="settings-toggle-row" style={{ marginTop: "0.75rem" }}>
              <div className="toggle-info">
                <strong>{t("settings.ai.presence.currentStatus")}</strong>
                <span className="toggle-desc">{t("settings.ai.presence.currentStatusDesc")}</span>
              </div>
              <label className="toggle-switch">
                <input type="checkbox" checked={manualStatusToggle.checked}
                  onChange={manualStatusToggle.onCheckboxChange} />
                <span className="slider" />
              </label>
            </div>
          )}
      </section>

      <section className="settings-section">
        <h4>{t("settings.ai.rules.heading")}</h4>
        <p className="section-desc">{t("settings.ai.rules.sectionDesc")}</p>

        {/* Rules List */}
        {aiSettings.rules.length > 0 ? (
          <div className="rules-list">
            {aiSettings.rules.map((rule) => (
              <div key={rule.id} className="rule-item">
                <div className="rule-item-header">
                  <span className="rule-item-name">{rule.name}</span>
                  <span className="rule-item-category">{rule.category}</span>
                </div>
                <div className="rule-item-triggers">
                  {rule.trigger.isGreeting && `${t("settings.ai.rules.listGreetings")} `}
                  {rule.trigger.keywords && rule.trigger.keywords.length > 0
                    && `${t("settings.ai.rules.listKeywordsPrefix")} ${rule.trigger.keywords.join(", ")} `}
                  {rule.trigger.messageContains
                    && `${t("settings.ai.rules.listRegexPrefix")} ${rule.trigger.messageContains}`}
                  {rule.trigger.contactAiAccessLevel && rule.trigger.contactAiAccessLevel.length > 0
                    && ` ${t("settings.ai.rules.listAccessPrefix")} ${rule.trigger.contactAiAccessLevel.join(", ")}`}
                  {!rule.trigger.isGreeting && (!rule.trigger.keywords || rule.trigger.keywords.length === 0) && !rule.trigger.messageContains && t("settings.ai.rules.listNoTriggers")}
                </div>
                <div className="rule-item-actions">
                  {t("settings.ai.rules.listActionPrefix")} {rule.action.type}
                  {rule.action.template && ` — "${rule.action.template.slice(0, 50)}${rule.action.template.length > 50 ? "..." : ""}"`}
                  {rule.action.aiIdentityOverride
                    && ` | ${t("settings.ai.rules.listIdentityPrefix")} ${rule.action.aiIdentityOverride}`}
                </div>
                <div className="rule-item-controls">
                  <button type="button" className="settings-button" onClick={() => handleDeleteRule(rule.id)}>{t("settings.ai.rules.delete")}</button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="field-desc" style={{ marginBottom: "1rem" }}>{t("settings.ai.rules.empty")}</p>
        )}

        {/* Add Rule Form — fully controlled */}
        <div className="add-rule-form">
          <h5>{t("settings.ai.rules.addHeading")}</h5>
          <div className="form-group">
            <label>{t("settings.ai.rules.nameLabel")}</label>
            <input type="text" className="settings-input" placeholder={t("settings.ai.rules.namePlaceholder")}
              value={ruleForm.name}
              onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })} />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>{t("settings.ai.rules.categoryLabel")}</label>
              <select className="settings-input" value={ruleForm.category}
                onChange={(e) => setRuleForm({ ...ruleForm, category: e.target.value as AiRuleCategory })}>
                <option value="availability">{t("settings.ai.rules.categoryAvailability")}</option>
                <option value="capability">{t("settings.ai.rules.categoryCapability")}</option>
                <option value="catch_all">{t("settings.ai.rules.categoryCatchAll")}</option>
              </select>
            </div>
            <div className="form-group">
              <label>{t("settings.ai.rules.priorityLabel")}</label>
              <input type="number" className="settings-input" value={ruleForm.priority} min={1} max={100}
                onChange={(e) => setRuleForm({ ...ruleForm, priority: parseInt(e.target.value) || 1 })} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>{t("settings.ai.rules.triggerKeywords")}</label>
              <input type="text" className="settings-input" placeholder={t("settings.ai.rules.triggerKeywordsPlaceholder")}
                value={ruleForm.keywords}
                onChange={(e) => setRuleForm({ ...ruleForm, keywords: e.target.value })} />
            </div>
            <div className="form-group">
              <label>{t("settings.ai.rules.triggerRegex")}</label>
              <input type="text" className="settings-input" placeholder={t("settings.ai.rules.triggerRegexPlaceholder")}
                value={ruleForm.regex}
                onChange={(e) => setRuleForm({ ...ruleForm, regex: e.target.value })} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>{t("settings.ai.rules.triggerGreeting")}</label>
              <select className="settings-input" value={ruleForm.isGreeting ? "true" : ""}
                onChange={(e) => setRuleForm({ ...ruleForm, isGreeting: e.target.value === "true" })}>
                <option value="">{t("settings.ai.rules.triggerGreetingAny")}</option>
                <option value="true">{t("settings.ai.rules.triggerGreetingYes")}</option>
              </select>
            </div>
            <div className="form-group">
              <label>{t("settings.ai.rules.triggerAccessLevel")}</label>
              <select className="settings-input" value={ruleForm.accessLevel}
                onChange={(e) => setRuleForm({ ...ruleForm, accessLevel: e.target.value as "" | "full" | "assistant_only" })}>
                <option value="">{t("settings.ai.rules.triggerAccessAny")}</option>
                <option value="full">{t("settings.ai.rules.triggerAccessFull")}</option>
                <option value="assistant_only">{t("settings.ai.rules.triggerAccessAssistantOnly")}</option>
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>{t("settings.ai.rules.actionType")}</label>
              <select className="settings-input" value={ruleForm.actionType}
                onChange={(e) => setRuleForm({ ...ruleForm, actionType: e.target.value as AiRuleActionType })}>
                <option value="draft">{t("settings.ai.rules.actionDraft")}</option>
                <option value="auto_send">{t("settings.ai.rules.actionAutoSend")}</option>
                <option value="gatekeep">{t("settings.ai.rules.actionGatekeep")}</option>
                <option value="defer">{t("settings.ai.rules.actionDefer")}</option>
              </select>
            </div>
            <div className="form-group">
              <label>{t("settings.ai.rules.identityOverride")}</label>
              <select className="settings-input" value={ruleForm.identityOverride}
                onChange={(e) => setRuleForm({ ...ruleForm, identityOverride: e.target.value as "" | AiIdentityMode })}>
              <option value="">{t("settings.ai.rules.identityUseDefault")}</option>
              <option value="invisible">{t("settings.ai.rules.identityInvisible")}</option>
              <option value="transparent">{t("settings.ai.rules.identityTransparent")}</option>
              <option value="defensive">{t("settings.ai.rules.identityDefensive")}</option>
            </select>
          </div>
        </div>
        </div>
        <div className="form-group">
          <label>{t("settings.ai.rules.templateLabel")}</label>
          <textarea className="settings-input" placeholder={t("settings.ai.rules.templatePlaceholder")}
            value={ruleForm.template}
            onChange={(e) => setRuleForm({ ...ruleForm, template: e.target.value })} />
        </div>
        <div className="settings-buttons">
          <button type="button" className="settings-save-btn" onClick={handleAddRule}>{t("settings.ai.rules.addButton")}</button>
        </div>
      </section>

      <section className="settings-section">
        <AgentIdentityEditor />
      </section>

      <section className="settings-section">
        <h4>{t("settings.ai.rag.heading")}</h4>
        <p className="section-desc">{t("settings.ai.rag.sectionDesc")}</p>
        <KnowledgeBaseSettings
          value={aiSettings.knowledgeBase ?? { ...DEFAULT_AI_KNOWLEDGE_BASE }}
          onChange={async (knowledgeBase) => {
            await updateAiSettings({ knowledgeBase });
          }}
        />
      </section>

      <section className="settings-section">
        <h4>{t("settings.ai.profileMedia.heading")}</h4>
        <p className="section-desc">{t("settings.ai.profileMedia.sectionDesc")}</p>
        <div className="settings-toggle-row">
          <div className="toggle-info">
            <strong>{t("settings.ai.profileMedia.allowAgentShare")}</strong>
            <span className="toggle-desc">{t("settings.ai.profileMedia.allowAgentShareDesc")}</span>
          </div>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={profileMedia.allowAgentShareGalleryPhotos}
              onChange={async (e) => {
                await updateAiSettings({
                  profileMedia: { ...profileMedia, allowAgentShareGalleryPhotos: e.target.checked },
                });
              }}
            />
            <span className="slider" />
          </label>
        </div>
        <div className="form-group">
          <label>{t("settings.ai.profileMedia.shareAutonomyTier")}</label>
          <select
            className="settings-input"
            value={profileMedia.maxAutonomousShareTier}
            disabled={!profileMedia.allowAgentShareGalleryPhotos}
            onChange={async (e) => {
              const tier = Number(e.target.value) as ProfileMediaPolicy["maxAutonomousShareTier"];
              await updateAiSettings({
                profileMedia: { ...profileMedia, maxAutonomousShareTier: tier },
              });
            }}
          >
            <option value={0}>{t("settings.ai.profileMedia.tier0ProposeInbox")}</option>
            <option value={2}>{t("settings.ai.profileMedia.tier2AutoShare")}</option>
          </select>
        </div>
        <div className="form-group">
          <label>{t("settings.ai.profileMedia.minVisibility")}</label>
          <select
            className="settings-input"
            value={profileMedia.autonomousShareMinVisibility}
            disabled={!profileMedia.allowAgentShareGalleryPhotos}
            onChange={async (e) => {
              await updateAiSettings({
                profileMedia: {
                  ...profileMedia,
                  autonomousShareMinVisibility: e.target.value as ProfileMediaPolicy["autonomousShareMinVisibility"],
                },
              });
            }}
          >
            <option value="public">{t("settings.ai.profileMedia.visibilityPublic")}</option>
            <option value="referred">{t("settings.ai.profileMedia.visibilityReferred")}</option>
            <option value="direct">{t("settings.ai.profileMedia.visibilityDirect")}</option>
          </select>
        </div>
      </section>

      <section className="settings-section">
        <h4>{t("settings.ai.autonomy.heading")}</h4>
        <p className="section-desc">{t("settings.ai.autonomy.sectionDesc")}</p>
        <div className="form-group">
          <label>{t("settings.ai.autonomy.shareAutonomyTier")}</label>
          <select
            className="settings-input"
            value={documentAutonomy.maxAutonomousShareTier}
            onChange={async (e) => {
              const tier = Number(e.target.value) as DocumentAutonomyPolicy["maxAutonomousShareTier"];
              await updateAiSettings({
                documentAutonomy: { ...documentAutonomy, maxAutonomousShareTier: tier },
              });
            }}
          >
            <option value={0}>{t("settings.ai.autonomy.tier0ProposalsOnly")}</option>
            <option value={1}>{t("settings.ai.autonomy.tier1Delegated")}</option>
            <option value={2}>{t("settings.ai.autonomy.tier2AutoShareDirect")}</option>
          </select>
        </div>
        <div className="settings-toggle-row">
          <div className="toggle-info">
            <strong>{t("settings.ai.autonomy.autonomousPublishMetadata")}</strong>
            <span className="toggle-desc">{t("settings.ai.autonomy.autonomousPublishMetadataDesc")}</span>
          </div>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={documentAutonomy.allowAutonomousPublish}
              onChange={async (e) => {
                await updateAiSettings({
                  documentAutonomy: { ...documentAutonomy, allowAutonomousPublish: e.target.checked },
                });
              }}
            />
            <span className="slider" />
          </label>
        </div>
      </section>

      <section className="settings-section">
        <h4>{t("settings.ai.terminalAssist.heading")}</h4>
        <TerminalAssistSettings
          nodeConfig={nodeConfig}
          refreshNodeConfig={refreshNodeConfig}
          isMobileNode={isMobileNode}
        />
      </section>

      <section className="settings-section">
        <h4>{t("settings.ai.contacts.heading")}</h4>
        <p className="section-desc">{t("settings.ai.contacts.sectionDesc")}</p>
        <select className="settings-input" value={aiSettings.defaultModeForNewContacts}
          onChange={async (e) => {
            await updateAiSettings({ defaultModeForNewContacts: e.target.value as "manual" | "assistant" | "auto" });
          }}>
          <option value="manual">{t("settings.ai.contacts.modeManual")}</option>
          <option value="assistant">{t("settings.ai.contacts.modeAssistant")}</option>
          <option value="auto">{t("settings.ai.contacts.modeAuto")}</option>
        </select>
      </section>

      <section className="settings-section">
        <h4>{t("settings.ai.identity.debugHeading")}</h4>
        <div className="settings-field">
          <label className="settings-checkbox-row">
            <input
              type="checkbox"
              checked={aiSettings.identity.debugPrefixInMessageText === true}
              onChange={async (e) => {
                await updateAiSettings({
                  identity: {
                    ...aiSettings.identity,
                    debugPrefixInMessageText: e.target.checked,
                  },
                });
              }}
            />
            <span>
              <strong>{t("settings.ai.identity.debugEmbedPrefix")}</strong>
              <span className="field-desc block">{t("settings.ai.identity.debugEmbedPrefixDesc")}</span>
            </span>
          </label>
        </div>

        <div className="settings-field">
          <label htmlFor="ai-debug-prefix">{t("settings.ai.identity.debugPrefixLabel")}</label>
          <input
            id="ai-debug-prefix"
            type="text"
            className="settings-input"
          placeholder={t("settings.ai.identity.debugPrefixPlaceholder")}
          value={aiSettings.identity.transparentPrefix ?? ""}
          disabled={aiSettings.identity.debugPrefixInMessageText !== true}
          onChange={async (e) => {
            const transparentPrefix = e.target.value.trim();
            await updateAiSettings({
              identity: {
                ...aiSettings.identity,
                transparentPrefix: transparentPrefix || undefined,
              },
            });
          }}
        />
      </div>
      </section>
    </>
  );
}
