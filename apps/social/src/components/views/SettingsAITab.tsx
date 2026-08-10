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
import type {
  AiIdentityMode,
  AiKnowledgeBaseSettings,
  AiRagMode,
  AiRule,
  AiRuleActionType,
  AiRuleCategory,
  AiSettings,
  CostSummary,
  DocumentAutonomyPolicy,
  ModelProviderMode,
  PiStatus,
  EnvoyLocalStatus,
  EnvoyLocalInstalledModel,
  EnvoyLocalCatalogModel,
  EnvoyLocalEngineUpdateInfo,
  EnvoyLocalFlashAttn,
  EnvoyLocalFitMode,
  EnvoyLocalKvCacheType,
  RagIndexStatus,
  AutonomousPolicy,
  A2aChatNotificationMode,
  AgentActivityDomain,
  AgentInteractionMode,
  AgentNotifyMode,
  AutonomousDomain,
  KbPluginInfo,
  TerminalAutoRunPolicy,
} from "@envoymesh/api";
// Phase 49 (in-flight) — value imports for the Pi provider picker. These are
// real runtime values (a const array + two functions), so they can't be in
// the `import type` block above.
import {
  PI_NATIVE_PROVIDERS,
  getPiNativeProvider,
  piProviderFromEnvoyMode,
  listModelProviderPresets,
  getModelProviderPreset,
  inferModelProviderPreset,
  hasUsableModelProvider,
  hasUsableNonEnvoyLocalModelProvider,
  DEFAULT_ENVOY_LOCAL_SERVER_PARAMS,
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
  normalizeAiBotDefinition,
  type AgentIdentityDocument,
  type ProfileMediaPolicy,
} from "@envoymesh/api";
// Browser-safe subpath — does NOT pull in node:crypto / node:fs. The full
// `@envoymesh/rag` root depends on Node builtins and is intentionally not
// imported here; the resolver subpath is the only entry point the UI uses.
import { resolveEmbeddingConfig } from "@envoymesh/rag/embedding-resolver";
import { waitForEnvoyLocalIdle } from "../../lib/envoy-local-wait.js";

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

/**
 * Phase 44C — Knowledge Base Plugin management panel.
 * Lists registered plugins with activate/deactivate controls.
 */
function KbPluginSettings() {
  const t = useT();
  const nodeService = useNodeService();
  const { showToast } = useToast();

  const [plugins, setPlugins] = useState<KbPluginInfo[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const loadPlugins = useCallback(async () => {
    try {
      const list = await nodeService.listKbPlugins();
      setPlugins(list);
    } catch {
      // Best-effort — plugins may not be available (mobile).
    }
  }, [nodeService]);

  useEffect(() => {
    void loadPlugins();
  }, [loadPlugins]);

  const handleActivate = async (pluginId: string) => {
    setBusy(pluginId);
    try {
      const result = await nodeService.activateKbPlugin({ pluginId });
      if (!result.ok) {
        showToast(t("kbPlugins.activateError") + (result.reason ? `: ${result.reason}` : ""), "error");
      }
      await loadPlugins();
    } catch {
      showToast(t("kbPlugins.activateError"), "error");
    } finally {
      setBusy(null);
    }
  };

  const handleDeactivate = async (pluginId: string) => {
    setBusy(pluginId);
    try {
      const result = await nodeService.deactivateKbPlugin({ pluginId });
      if (!result.ok) {
        showToast(t("kbPlugins.deactivateError") + (result.reason ? `: ${result.reason}` : ""), "error");
      }
      await loadPlugins();
    } catch {
      showToast(t("kbPlugins.deactivateError"), "error");
    } finally {
      setBusy(null);
    }
  };

  const statusLabel = (status: KbPluginInfo["status"]) => {
    switch (status) {
      case "active": return t("kbPlugins.statusActive");
      case "disabled": return t("kbPlugins.statusDisabled");
      case "error": return t("kbPlugins.statusError");
      default: return t("kbPlugins.statusRegistered");
    }
  };

  return (
    <>
      {plugins.length === 0 ? (
        <p className="field-desc">{t("kbPlugins.empty")}</p>
      ) : (
        <div className="plugins-list">
          {plugins.map((p) => (
            <div key={p.pluginId} className="rule-item" style={{ marginBottom: "0.75rem" }}>
              <div className="rule-item-header">
                <span className="rule-item-name">{p.displayName}</span>
                <span className="rule-item-category">{p.version}</span>
              </div>
              <div className="rule-item-triggers">
                {p.description}
              </div>
              <div className="rule-item-triggers" style={{ opacity: 0.7 }}>
                {t("kbPlugins.pluginStatus")}: {statusLabel(p.status)}
                {p.activatedAt && ` · ${t("kbPlugins.activatedAt")}: ${new Date(p.activatedAt).toLocaleDateString()}`}
              </div>
              {p.errorMessage && (
                <div className="rule-item-triggers" style={{ color: "var(--error, #e74c3c)" }}>
                  {t("kbPlugins.errorLabel")}: {p.errorMessage}
                </div>
              )}
              <div className="rule-item-controls">
                {p.status !== "active" ? (
                  <button
                    type="button"
                    className="settings-button"
                    disabled={busy === p.pluginId}
                    onClick={() => void handleActivate(p.pluginId)}
                  >
                    {busy === p.pluginId ? t("kbPlugins.activating") : t("kbPlugins.activate")}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="settings-button"
                    disabled={busy === p.pluginId}
                    onClick={() => void handleDeactivate(p.pluginId)}
                  >
                    {busy === p.pluginId ? t("kbPlugins.deactivating") : t("kbPlugins.deactivate")}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function KnowledgeBaseSettings(props: {
  value: AiKnowledgeBaseSettings;
  onChange: (next: AiKnowledgeBaseSettings) => Promise<void>;
  modelProviders?: import("@envoymesh/api").ModelProviderConfig;
}) {
  const t = useT();
  const kb = props.value;
  const patch = async (partial: Partial<AiKnowledgeBaseSettings>) => {
    await props.onChange({ ...kb, ...partial });
  };

  // Compute the effective embedding config against the chat-model
  // providers, so we can show users the value that will actually be used
  // when they leave a field blank. Re-runs whenever the embedding panel
  // or the chat model provider changes.
  const resolved = useMemo(
    () => resolveEmbeddingConfig({
      embedding: kb.embedding,
      modelProviders: props.modelProviders,
    }),
    [kb.embedding, props.modelProviders],
  );

  // Which fields are *not* explicitly set by the user? Only those get an
  // inherited-value hint below the input.
  const hasExplicitModelName = !!kb.embedding?.modelName?.trim();
  const hasExplicitResponseShape = !!kb.embedding?.responseShape;
  const hasExplicitEndpoint = !!kb.embedding?.endpoint?.trim();
  const hasExplicitApiKey = !!kb.embedding?.apiKey?.trim();

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
      <p className="rag-inherit-banner">{t("settings.ai.rag.embeddingInheritBanner")}</p>
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
          {!hasExplicitModelName && resolved.modelName ? (
            <p className="rag-resolved-hint">
              {t("settings.ai.rag.embeddingResolvedHint", { value: resolved.modelName })}
            </p>
          ) : null}
        </div>
        <div className="form-group">
          <label>{t("settings.ai.rag.embeddingResponseShape")}</label>
          <select
            value={kb.embedding?.responseShape ?? "auto"}
            onChange={async (e) => {
              await patch({
                embedding: {
                  ...kb.embedding,
                  mode: kb.embedding?.mode ?? "inherit",
                  responseShape: e.target.value as "openai" | "minimax" | "auto",
                },
              });
            }}
          >
            <option value="openai">{t("settings.ai.rag.embeddingResponseShapeOpenAi")}</option>
            <option value="minimax">{t("settings.ai.rag.embeddingResponseShapeMinimax")}</option>
            <option value="auto">{t("settings.ai.rag.embeddingResponseShapeAuto")}</option>
          </select>
          <p className="field-desc">{t("settings.ai.rag.embeddingResponseShapeHint")}</p>
          {!hasExplicitResponseShape && resolved.responseShape && resolved.responseShape !== "auto" ? (
            <p className="rag-resolved-hint">
              {t("settings.ai.rag.embeddingResolvedHint", { value: resolved.responseShape })}
            </p>
          ) : null}
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
          {!hasExplicitEndpoint && resolved.endpoint && resolved.endpoint !== "mock://local" ? (
            <p className="rag-resolved-hint">
              {t("settings.ai.rag.embeddingResolvedHint", { value: resolved.endpoint })}
            </p>
          ) : null}
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
          {/* Don't reveal the inherited chat key in the DOM — just say
              that an inheritance is in effect so the user knows the
              password field is intentionally blank. */}
          {!hasExplicitApiKey && resolved.apiKey ? (
            <p className="rag-resolved-hint">{t("settings.ai.rag.embeddingApiKeyInherited")}</p>
          ) : null}
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
          {!kb.embedding?.maxInputTokens && resolved.maxInputTokens ? (
            <p className="rag-resolved-hint">
              {t("settings.ai.rag.embeddingResolvedHint", { value: resolved.maxInputTokens })}
            </p>
          ) : null}
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

/** Merge disk/partial aiSettings so Settings → AI never crashes on missing fields. */
function resolveAiSettings(raw: AiSettings | null | undefined): AiSettings {
  const base = defaultAiSettings();
  if (!raw) return base;
  return {
    ...base,
    ...raw,
    status: { ...base.status, ...(raw.status ?? {}) },
    identity: { ...base.identity, ...(raw.identity ?? {}) },
    rules: Array.isArray(raw.rules) ? raw.rules : [],
    documentAutonomy: normalizeDocumentAutonomyPolicy(raw.documentAutonomy),
    disclosure: normalizeEnvoyDisclosureSettings(raw.disclosure),
    profileMedia: normalizeProfileMediaPolicy(raw.profileMedia),
    knowledgeBase: { ...base.knowledgeBase, ...(raw.knowledgeBase ?? {}) },
    autoReplyLimits: { ...base.autoReplyLimits, ...(raw.autoReplyLimits ?? {}) },
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
  const includeLocal = !cloudOnlyMobile && !isMobileNode;

  const inferredPreset = inferModelProviderPreset(nodeConfig?.modelProviders);
  const [presetId, setPresetId] = useState(inferredPreset.id);
  const [modelEndpoint, setModelEndpoint] = useState(nodeConfig?.modelProviders?.endpoint ?? "");
  const [modelName, setModelName] = useState(nodeConfig?.modelProviders?.modelName ?? "");
  const [modelApiKey, setModelApiKey] = useState(nodeConfig?.modelProviders?.apiKey ?? "");
  const [settingsSaveStatus, setSettingsSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const modelProviderFieldsDirtyRef = useRef(false);

  useEffect(() => {
    if (settingsSaveStatus === "saving" || modelProviderFieldsDirtyRef.current) return;
    const mp = nodeConfig?.modelProviders;
    if (!mp) return;
    setPresetId(inferModelProviderPreset(mp).id);
    setModelEndpoint(mp.endpoint ?? "");
    setModelName(mp.modelName ?? "");
    setModelApiKey(mp.apiKey ?? "");
  }, [nodeConfig?.modelProviders, settingsSaveStatus]);

  const presets = useMemo(() => {
    const listed = listModelProviderPresets({ includeLocal });
    // Keep the currently saved local preset visible even on cloud-only scopes.
    if (!listed.some((p) => p.id === presetId)) {
      const current = getModelProviderPreset(presetId);
      if (current) return [...listed, current];
    }
    return listed;
  }, [includeLocal, presetId]);
  const activePreset = getModelProviderPreset(presetId) ?? inferredPreset;
  const showEndpoint =
    activePreset.endpointEditable !== false &&
    activePreset.mode !== "mock" &&
    activePreset.mode !== "disabled";
  const showModelAndKey =
    activePreset.mode !== "mock" && activePreset.mode !== "disabled";

  // Saved provider on the node (not unsaved form edits) — drives In use / Not in use.
  const savedMp = nodeConfig?.modelProviders;
  const savedPreset = inferModelProviderPreset(savedMp);
  const cloudOrOllamaInUse = hasUsableNonEnvoyLocalModelProvider(savedMp);
  const envoyLocalProviderActive =
    hasUsableModelProvider(savedMp) && savedPreset.id === "envoy-local";
  const providerUsageLabel = cloudOrOllamaInUse
    ? t("settings.ai.model.statusInUse")
    : envoyLocalProviderActive
      ? t("settings.ai.model.statusStandbyLocal")
      : t("settings.ai.model.statusNotInUse");

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
        <dt>{t("settings.ai.model.usageStatus")}</dt>
        <dd>
          <span
            className={
              cloudOrOllamaInUse
                ? "model-provider-status is-active"
                : "model-provider-status is-idle"
            }
            data-testid="model-provider-usage-status"
          >
            {providerUsageLabel}
          </span>
          {envoyLocalProviderActive ? (
            <div className="settings-hint">{t("settings.ai.model.statusStandbyLocalHint")}</div>
          ) : null}
        </dd>
        <dt>{t("settings.ai.model.providerLabel")}</dt>
        <dd>
          <select
            className="settings-select"
            value={presetId}
            disabled={settingsSaveStatus === "saving"}
            onChange={(e) => {
              modelProviderFieldsDirtyRef.current = true;
              const next = e.target.value;
              setPresetId(next);
              const info = getModelProviderPreset(next);
              if (!info) return;
              if (info.defaultEndpoint) setModelEndpoint(info.defaultEndpoint);
              else if (info.endpointEditable === false) setModelEndpoint("");
              if (info.models.length && (!modelName || !info.models.includes(modelName))) {
                setModelName(info.models[0] ?? "");
              }
              if (info.mode === "mock" || info.mode === "disabled") {
                setModelName("");
                setModelEndpoint("");
              }
            }}
          >
            {presets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          <p className="settings-hint" style={{ marginTop: "6px" }}>
            {t("settings.ai.model.presetHint")}
          </p>
        </dd>
        {showEndpoint ? (
          <>
            <dt>{t("settings.ai.model.endpointUrl")}</dt>
            <dd>
              <input
                type="text"
                className="settings-input"
                placeholder={
                  activePreset.endpointPlaceholder ||
                  t("settings.ai.model.endpointPlaceholderDefault")
                }
                value={modelEndpoint}
                onChange={(e) => {
                  modelProviderFieldsDirtyRef.current = true;
                  setModelEndpoint(e.target.value);
                }}
              />
            </dd>
          </>
        ) : null}
        {showModelAndKey ? (
          <>
            <dt>{t("settings.ai.model.modelName")}</dt>
            <dd>
              {activePreset.models.length > 0 ? (
                <select
                  className="settings-select"
                  value={activePreset.models.includes(modelName) ? modelName : "__custom__"}
                  disabled={settingsSaveStatus === "saving"}
                  onChange={(e) => {
                    modelProviderFieldsDirtyRef.current = true;
                    if (e.target.value === "__custom__") {
                      setModelName("");
                      return;
                    }
                    setModelName(e.target.value);
                  }}
                >
                  {activePreset.models.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                  <option value="__custom__">{t("settings.ai.model.modelCustomId")}</option>
                </select>
              ) : null}
              {(!activePreset.models.length || !activePreset.models.includes(modelName)) && (
                <input
                  type="text"
                  className="settings-input"
                  style={{ marginTop: activePreset.models.length ? "6px" : undefined }}
                  placeholder={
                    activePreset.models[0] || t("settings.ai.model.modelNamePlaceholder")
                  }
                  value={modelName}
                  onChange={(e) => {
                    modelProviderFieldsDirtyRef.current = true;
                    setModelName(e.target.value);
                  }}
                />
              )}
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
            </dd>
          </>
        ) : null}
      </dl>
      <div className="settings-buttons">
        <button
          type="button"
          className="settings-save-btn"
          disabled={settingsSaveStatus === "saving"}
          onClick={async () => {
            setSettingsSaveStatus("saving");
            try {
              const preset = getModelProviderPreset(presetId) ?? activePreset;
  // When clearing mock/disabled, drop leftover endpoint/key so they cannot
  // resurrect via a later shallow merge or confuse OpenClaw inference.
  await updateNodeConfig({
    modelProviders: {
      ...(nodeConfig?.modelProviders ?? { mode: "mock" as ModelProviderMode }),
      presetId: preset.id,
      mode: preset.mode,
      endpoint: showEndpoint ? modelEndpoint : undefined,
      modelName: showModelAndKey ? modelName : undefined,
      apiKey: showModelAndKey ? modelApiKey : undefined,
      ...(preset.mode === "mock" || preset.mode === "disabled"
        ? { endpoint: undefined, modelName: undefined, apiKey: undefined }
        : {}),
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
            const mp = nodeConfig?.modelProviders;
            setPresetId(inferModelProviderPreset(mp).id);
            setModelEndpoint(mp?.endpoint ?? "");
            setModelName(mp?.modelName ?? "");
            setModelApiKey(mp?.apiKey ?? "");
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

const COST_RANGE_PRESETS = ["today", "7d", "30d", "all"] as const;
type CostRangePreset = (typeof COST_RANGE_PRESETS)[number];

function costRangeToSince(preset: CostRangePreset): string | undefined {
  if (preset === "today") {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }
  if (preset === "7d") {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString();
  }
  if (preset === "30d") {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString();
  }
  return undefined;
}

function formatCost(usd: number): string {
  if (usd === 0) return "$0.00";
  if (usd < 0.01) return `<$0.01`;
  if (usd < 1) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

/**
 * Owner-facing cost dashboard. Reads from the daily/monthly rollup store via
 * getCostSummary — no raw audit scanning, so it stays fast even for a year of
 * history. Renders nothing when the node reports no recorded calls (e.g. fresh
 * install or mock-only provider).
 */
function CostDashboardPanel() {
  const t = useT();
  const nodeService = useNodeService();
  const [summary, setSummary] = useState<CostSummary | null>(null);
  const [range, setRange] = useState<CostRangePreset>("7d");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const next = await nodeService.getCostSummary({ since: costRangeToSince(range) });
        if (!cancelled) setSummary(next);
      } catch {
        if (!cancelled) setSummary(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [nodeService, range]);

  if (loading) {
    return (
      <section className="settings-section">
        <h4>{t("settings.ai.cost.heading", "Model Cost")}</h4>
        <p className="settings-hint">{t("settings.ai.cost.loading", "Loading…")}</p>
      </section>
    );
  }

  if (!summary || (summary.totalCalls === 0 && summary.byProvider.length === 0)) {
    return null;
  }

  const maxProviderCost = Math.max(0.0001, ...summary.byProvider.map((p) => p.costUsd));

  return (
    <section className="settings-section">
      <h4>{t("settings.ai.cost.heading", "Model Cost")}</h4>
      <p className="section-desc">
        {t(
          "settings.ai.cost.sectionDesc",
          "Per-call cost tracked across cloud and local LLM providers.",
        )}
      </p>

      <div className="settings-toggle-row" style={{ justifyContent: "flex-start", gap: 8 }}>
        {COST_RANGE_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            className={`chip-button${range === preset ? " chip-button--active" : ""}`}
            onClick={() => setRange(preset)}
          >
            {t(`settings.ai.cost.range.${preset}`, preset)}
          </button>
        ))}
      </div>

      <div className="form-group">
        <div className="settings-cost-totals">
          <div className="settings-cost-total">
            <span className="settings-cost-total-value">{formatCost(summary.totalCostUsd)}</span>
            <span className="settings-cost-total-label">
              {t("settings.ai.cost.totalCost", "Total cost")}
            </span>
          </div>
          <div className="settings-cost-total">
            <span className="settings-cost-total-value">{summary.totalCalls}</span>
            <span className="settings-cost-total-label">
              {t("settings.ai.cost.totalCalls", "Calls")}
            </span>
          </div>
          <div className="settings-cost-total">
            <span className="settings-cost-total-value">
              {formatTokens(summary.totalInputTokens)} / {formatTokens(summary.totalOutputTokens)}
            </span>
            <span className="settings-cost-total-label">
              {t("settings.ai.cost.tokensInOut", "Tokens in / out")}
            </span>
          </div>
        </div>
      </div>

      {summary.byProvider.length > 0 && (
        <div className="form-group">
          <label>{t("settings.ai.cost.byProvider", "By provider")}</label>
          <ul className="settings-cost-breakdown">
            {summary.byProvider.map((row) => (
              <li key={row.providerId} className="settings-cost-breakdown-row">
                <span className="settings-cost-breakdown-label">{row.providerId}</span>
                <div className="settings-cost-breakdown-bar" aria-hidden="true">
                  <div
                    className="settings-cost-breakdown-fill"
                    style={{ width: `${(row.costUsd / maxProviderCost) * 100}%` }}
                  />
                </div>
                <span className="settings-cost-breakdown-value">
                  {formatCost(row.costUsd)}{" "}
                  <span className="settings-cost-breakdown-calls">×{row.calls}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function formatApproxMb(bytes: number | undefined): string {
  if (!bytes || !Number.isFinite(bytes) || bytes <= 0) return "?";
  return String(Math.max(1, Math.round(bytes / (1024 * 1024))));
}

function EnvoyLocalSettings({
  refreshNodeConfig,
}: {
  refreshNodeConfig: () => Promise<void>;
}) {
  const t = useT();
  const { showToast } = useToast();
  const nodeService = useNodeService();
  const { nodeConfig } = useNodeState();
  const [status, setStatus] = useState<EnvoyLocalStatus | null>(null);
  const [installed, setInstalled] = useState<EnvoyLocalInstalledModel[]>([]);
  const [catalog, setCatalog] = useState<EnvoyLocalCatalogModel[]>([]);
  const [engineInfo, setEngineInfo] = useState<EnvoyLocalEngineUpdateInfo | null>(null);
  const [catalogQuery, setCatalogQuery] = useState("");
  const [debouncedCatalogQuery, setDebouncedCatalogQuery] = useState("");
  const [catalogSearching, setCatalogSearching] = useState(false);
  const [hfSearchError, setHfSearchError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [ctxSize, setCtxSize] = useState(DEFAULT_ENVOY_LOCAL_SERVER_PARAMS.ctxSize);
  const [nglMode, setNglMode] = useState<"auto" | "off" | "custom">("auto");
  const [nglCustom, setNglCustom] = useState(20);
  const [threads, setThreads] = useState<string>("");
  const [parallel, setParallel] = useState(DEFAULT_ENVOY_LOCAL_SERVER_PARAMS.parallel);
  const [flashAttn, setFlashAttn] = useState<EnvoyLocalFlashAttn>(
    DEFAULT_ENVOY_LOCAL_SERVER_PARAMS.flashAttn,
  );
  const [fit, setFit] = useState<EnvoyLocalFitMode>(DEFAULT_ENVOY_LOCAL_SERVER_PARAMS.fit);
  const [batchSize, setBatchSize] = useState<string>("");
  const [ubatchSize, setUbatchSize] = useState<string>("");
  const [cacheTypeK, setCacheTypeK] = useState<"" | EnvoyLocalKvCacheType>("");
  const [cacheTypeV, setCacheTypeV] = useState<"" | EnvoyLocalKvCacheType>("");
  const [loraPath, setLoraPath] = useState("");
  const [startupTimeoutSec, setStartupTimeoutSec] = useState<string>("");

  const refresh = useCallback(async (opts?: { syncParams?: boolean }) => {
    try {
      const [st, models, eng] = await Promise.all([
        nodeService.getEnvoyLocalStatus(),
        nodeService.listEnvoyLocalInstalledModels(),
        nodeService.checkEnvoyLocalEngineUpdate(),
      ]);
      setStatus(st);
      setInstalled(Array.isArray(models) ? models : []);
      setEngineInfo(eng);
      if (opts?.syncParams !== false) {
        const sp = st?.serverParams ?? DEFAULT_ENVOY_LOCAL_SERVER_PARAMS;
        setCtxSize(sp.ctxSize ?? DEFAULT_ENVOY_LOCAL_SERVER_PARAMS.ctxSize);
        if (sp.nGpuLayers === 0) setNglMode("off");
        else if (typeof sp.nGpuLayers === "number") {
          setNglMode("custom");
          setNglCustom(sp.nGpuLayers);
        } else setNglMode("auto");
        setThreads(typeof sp.threads === "number" ? String(sp.threads) : "");
        setParallel(sp.parallel ?? DEFAULT_ENVOY_LOCAL_SERVER_PARAMS.parallel);
        setFlashAttn(sp.flashAttn ?? DEFAULT_ENVOY_LOCAL_SERVER_PARAMS.flashAttn);
        setFit(sp.fit ?? DEFAULT_ENVOY_LOCAL_SERVER_PARAMS.fit);
        setBatchSize(typeof sp.batchSize === "number" ? String(sp.batchSize) : "");
        setUbatchSize(typeof sp.ubatchSize === "number" ? String(sp.ubatchSize) : "");
        setCacheTypeK(sp.cacheTypeK ?? "");
        setCacheTypeV(sp.cacheTypeV ?? "");
        setLoraPath(sp.loraPath?.trim() ? sp.loraPath : "");
        setStartupTimeoutSec(
          typeof sp.startupTimeoutMs === "number" && sp.startupTimeoutMs > 0
            ? String(Math.round(sp.startupTimeoutMs / 1000))
            : "",
        );
      }
      return st;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn("[SettingsAITab] failed to fetch Envoy Local status", e);
      setActionError(msg);
      return null;
    }
  }, [nodeService]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      setDebouncedCatalogQuery(catalogQuery);
    }, 300);
    return () => window.clearTimeout(id);
  }, [catalogQuery]);

  useEffect(() => {
    let cancelled = false;
    setCatalogSearching(true);
    void nodeService
      .searchEnvoyLocalModels({ query: debouncedCatalogQuery })
      .then((result) => {
        if (cancelled) return;
        setCatalog(Array.isArray(result?.models) ? result.models : []);
        setHfSearchError(result?.huggingfaceError ?? null);
      })
      .catch((e) => {
        if (cancelled) return;
        setCatalog([]);
        setHfSearchError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setCatalogSearching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [nodeService, debouncedCatalogQuery]);

  const phase = status?.phase;
  // Only real in-process ops disable actions / drive the poller. Sticky phase
  // strings alone must not lock the UI (server clears them when idle).
  const inFlight = busy || Boolean(status?.operationInProgress);

  useEffect(() => {
    if (!inFlight) return;
    const id = window.setInterval(() => {
      void refresh({ syncParams: false });
    }, 1_000);
    return () => window.clearInterval(id);
  }, [inFlight, refresh]);

  const statusLabel = (() => {
    if (!status) return "…";
    if (status.running || status.phase === "ready") return t("settings.ai.envoyLocal.statusReady");
    if (status.phase === "error") return t("settings.ai.envoyLocal.statusError");
    if (status.phase === "starting") return t("settings.ai.envoyLocal.statusStarting");
    if (
      inFlight &&
      (status.phase === "downloading-runtime" ||
        status.phase === "extracting-runtime" ||
        status.phase === "downloading-model" ||
        status.phase === "detecting")
    ) {
      return t("settings.ai.envoyLocal.statusDownloading");
    }
    if (!status.enabled) return t("settings.ai.envoyLocal.statusDisabled");
    return status.phase;
  })();

  const installedIds = useMemo(() => new Set(installed.map((m) => m.id)), [installed]);

  const savedMp = nodeConfig?.modelProviders;
  const localProviderInUse =
    hasUsableModelProvider(savedMp) &&
    inferModelProviderPreset(savedMp).id === "envoy-local";
  const fallbackMp = nodeConfig?.envoyLocal?.fallbackModelProviders;
  const fallbackPreset = fallbackMp ? inferModelProviderPreset(fallbackMp) : null;
  const fallbackLabel =
    fallbackPreset && hasUsableNonEnvoyLocalModelProvider(fallbackMp)
      ? fallbackPreset.label
      : null;

  return (
    <div className="envoy-local-settings" data-testid="envoy-local-settings">
      <p className="section-desc">{t("settings.ai.envoyLocal.desc")}</p>
      <p className="settings-hint">{t("settings.ai.envoyLocal.noteCloudFirst")}</p>
      {status ? (
        <dl className="settings-dl">
          <dt>{t("settings.ai.envoyLocal.usageStatus")}</dt>
          <dd>
            <span
              className={
                localProviderInUse
                  ? "model-provider-status is-active"
                  : "model-provider-status is-idle"
              }
              data-testid="envoy-local-usage-status"
            >
              {localProviderInUse
                ? t("settings.ai.envoyLocal.statusInUse")
                : t("settings.ai.envoyLocal.statusNotInUse")}
            </span>
            {!localProviderInUse && fallbackLabel ? (
              <div className="settings-hint">
                {t("settings.ai.envoyLocal.cloudFallbackHint", {
                  provider: fallbackLabel,
                })}
              </div>
            ) : null}
            {localProviderInUse && fallbackLabel ? (
              <div className="settings-hint">
                {t("settings.ai.envoyLocal.cloudStandbyHint", {
                  provider: fallbackLabel,
                })}
              </div>
            ) : null}
          </dd>
          <dt>{t("settings.ai.envoyLocal.runtime")}</dt>
          <dd>
            {statusLabel}
            {status.runtimeVersion ? ` · ${status.runtimeVersion}` : ""}
            {status.runtimeInstalled ? "" : " · not installed"}
          </dd>
          <dt>{t("settings.ai.envoyLocal.accel")}</dt>
          <dd>{status.accel ?? "—"}</dd>
          <dt>{t("settings.ai.envoyLocal.model")}</dt>
          <dd>{status.activeModelId ?? "—"}</dd>
          <dt>{t("settings.ai.envoyLocal.endpoint")}</dt>
          <dd className="settings-mono">{status.endpoint}</dd>
          <dt>{t("settings.ai.envoyLocal.downloadRegion")}</dt>
          <dd>
            <label className="settings-label">
              <select
                className="settings-input"
                data-testid="envoy-local-download-region"
                disabled={inFlight}
                value={status.downloadRegionPreference ?? "auto"}
                onChange={(e) => {
                  const region = e.target.value as "auto" | "cn" | "global";
                  void (async () => {
                    setBusy(true);
                    setActionError(null);
                    try {
                      const st = await nodeService.setEnvoyLocalDownloadRegion({
                        region,
                      });
                      setStatus(st);
                      showToast(
                        t("settings.ai.envoyLocal.downloadRegionEffective", {
                          region:
                            st.modelDownloadRegion === "cn"
                              ? t("settings.ai.envoyLocal.downloadRegionCn")
                              : t("settings.ai.envoyLocal.downloadRegionGlobal"),
                        }),
                        "info",
                      );
                    } catch (err) {
                      const msg = err instanceof Error ? err.message : String(err);
                      setActionError(msg);
                      showToast(msg, "error");
                    } finally {
                      setBusy(false);
                      await refresh({ syncParams: false });
                    }
                  })();
                }}
              >
                <option value="auto">{t("settings.ai.envoyLocal.downloadRegionAuto")}</option>
                <option value="cn">{t("settings.ai.envoyLocal.downloadRegionCn")}</option>
                <option value="global">
                  {t("settings.ai.envoyLocal.downloadRegionGlobal")}
                </option>
              </select>
            </label>
            <div className="settings-hint">
              {t("settings.ai.envoyLocal.downloadRegionEffective", {
                region:
                  status.modelDownloadRegion === "cn"
                    ? t("settings.ai.envoyLocal.downloadRegionCn")
                    : t("settings.ai.envoyLocal.downloadRegionGlobal"),
              })}
            </div>
            <div className="settings-hint">{t("settings.ai.envoyLocal.downloadRegionHint")}</div>
          </dd>
          {status.hardwareSummary ? (
            <>
              <dt>{t("settings.ai.envoyLocal.hardware")}</dt>
              <dd>{status.hardwareSummary}</dd>
            </>
          ) : null}
          {status.recommendedModelId ? (
            <>
              <dt>{t("settings.ai.envoyLocal.recommended")}</dt>
              <dd>
                {status.recommendedModelId}
                {status.recommendedModelReason ? (
                  <div className="settings-hint">{status.recommendedModelReason}</div>
                ) : null}
              </dd>
            </>
          ) : null}
        </dl>
      ) : null}
      {status?.download?.label ? (
        <p className="settings-hint">
          {t("settings.ai.envoyLocal.progress", { label: status.download.label })}
          {typeof status.download.fraction === "number"
            ? ` (${Math.round(status.download.fraction * 100)}%)`
            : ""}
        </p>
      ) : null}
      {status?.lastError ? (
        <p className="settings-hint pi-error" data-testid="envoy-local-last-error">
          {t("settings.ai.envoyLocal.lastError", { error: status.lastError })}
        </p>
      ) : null}
      {actionError ? (
        <p className="settings-hint pi-error" data-testid="envoy-local-action-error">
          {t("settings.ai.envoyLocal.actionError", { error: actionError })}
        </p>
      ) : null}
      {status?.accelFallbackNote ? (
        <p className="settings-hint">
          {t("settings.ai.envoyLocal.accelFallback", { note: status.accelFallbackNote })}
        </p>
      ) : null}
      <h5 className="settings-subheading">{t("settings.ai.envoyLocal.engineHeading")}</h5>
      {engineInfo ? (
        <dl className="settings-dl">
          <dt>{t("settings.ai.envoyLocal.enginePinned")}</dt>
          <dd className="settings-mono">{engineInfo.pinnedVersion}</dd>
          <dt>{t("settings.ai.envoyLocal.engineInstalled")}</dt>
          <dd>
            {engineInfo.installedVersion ?? "—"}
            {" · "}
            {engineInfo.updateAvailable
              ? t("settings.ai.envoyLocal.engineUpdateAvailable")
              : t("settings.ai.envoyLocal.engineUpToDate")}
          </dd>
        </dl>
      ) : null}
      <div className="settings-buttons">
        <button
          type="button"
          className="settings-cancel-btn"
          disabled={inFlight}
          onClick={async () => {
            setBusy(true);
            setActionError(null);
            try {
              setStatus(await nodeService.updateEnvoyLocalEngine());
              const st = await waitForEnvoyLocalIdle(
                () => nodeService.getEnvoyLocalStatus(),
                { onUpdate: setStatus },
              );
              setStatus(st);
              if (st.phase === "error" || st.lastError) {
                const msg = st.lastError ?? t("settings.ai.envoyLocal.enableFailed");
                setActionError(msg);
                showToast(msg, "error");
              }
              setEngineInfo(await nodeService.checkEnvoyLocalEngineUpdate());
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              setActionError(msg);
              showToast(msg, "error");
            } finally {
              setBusy(false);
              await refresh({ syncParams: false });
            }
          }}
        >
          {inFlight && status?.phase === "downloading-runtime"
            ? t("settings.ai.envoyLocal.updatingEngine")
            : t("settings.ai.envoyLocal.updateEngine")}
        </button>
        {!status?.runtimeInstalled || installed.length === 0 ? (
          <button
            type="button"
            className="settings-save-btn"
            data-testid="envoy-local-enable"
            disabled={inFlight}
            onClick={async () => {
              setBusy(true);
              setActionError(null);
              setStatus((prev) => {
                const download = {
                  phase: "detecting" as const,
                  label: t("settings.ai.envoyLocal.startingDownload"),
                  fraction: 0,
                };
                if (prev) {
                  return {
                    ...prev,
                    phase: "detecting",
                    lastError: null,
                    operationInProgress: true,
                    download,
                  };
                }
                return {
                  enabled: false,
                  running: false,
                  phase: "detecting",
                  port: 18790,
                  endpoint: "http://127.0.0.1:18790/v1",
                  runtimeInstalled: false,
                  lastError: null,
                  download,
                  serverParams: { ...DEFAULT_ENVOY_LOCAL_SERVER_PARAMS },
                  operationInProgress: true,
                };
              });
              try {
                setStatus(await nodeService.enableEnvoyLocal());
                const st = await waitForEnvoyLocalIdle(
                  () => nodeService.getEnvoyLocalStatus(),
                  { onUpdate: setStatus },
                );
                setStatus(st);
                if (st.phase === "error" || st.lastError) {
                  const msg = st.lastError ?? t("settings.ai.envoyLocal.enableFailed");
                  setActionError(msg);
                  showToast(msg, "error");
                } else {
                  showToast(t("settings.ai.envoyLocal.enableOk"), "success");
                }
                await refreshNodeConfig();
              } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                setActionError(msg);
                showToast(msg, "error");
              } finally {
                setBusy(false);
                await refresh();
              }
            }}
          >
            {inFlight
              ? t("settings.ai.envoyLocal.enabling")
              : t("settings.ai.envoyLocal.enable")}
          </button>
        ) : null}
        {status?.runtimeInstalled && installed.length > 0 && !status.running ? (
          <button
            type="button"
            className="settings-save-btn"
            data-testid="envoy-local-start"
            disabled={inFlight}
            onClick={async () => {
              setBusy(true);
              setActionError(null);
              setStatus((prev) =>
                prev
                  ? {
                      ...prev,
                      phase: "starting",
                      lastError: null,
                      operationInProgress: true,
                      download: {
                        phase: "starting",
                        label: t("settings.ai.envoyLocal.starting"),
                        fraction: 0,
                      },
                    }
                  : prev,
              );
              try {
                setStatus(await nodeService.startEnvoyLocal());
                const st = await waitForEnvoyLocalIdle(
                  () => nodeService.getEnvoyLocalStatus(),
                  { onUpdate: setStatus },
                );
                setStatus(st);
                if (st.phase === "error" || st.lastError) {
                  const msg = st.lastError ?? t("settings.ai.envoyLocal.startFailed");
                  setActionError(msg);
                  showToast(msg, "error");
                } else {
                  showToast(t("settings.ai.envoyLocal.startOk"), "success");
                }
                await refreshNodeConfig();
              } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                setActionError(msg);
                showToast(msg, "error");
              } finally {
                setBusy(false);
                await refresh();
              }
            }}
          >
            {inFlight
              ? t("settings.ai.envoyLocal.starting")
              : t("settings.ai.envoyLocal.start")}
          </button>
        ) : null}
        {status?.running ? (
          <>
            <button
              type="button"
              className="settings-cancel-btn"
              data-testid="envoy-local-stop"
              disabled={inFlight || status.canStop === false}
              title={
                status.canStop === false
                  ? t("settings.ai.envoyLocal.stopBlocked")
                  : undefined
              }
              onClick={async () => {
                if (status.canStop === false) {
                  showToast(t("settings.ai.envoyLocal.stopBlocked"), "info");
                  return;
                }
                setBusy(true);
                setActionError(null);
                try {
                  const st = await nodeService.stopEnvoyLocal();
                  setStatus(st);
                  if (st.running || st.enabled) {
                    // Backend no-op (no fallback) — keep local.
                    showToast(t("settings.ai.envoyLocal.stopBlocked"), "info");
                  } else {
                    showToast(t("settings.ai.envoyLocal.stopOk"), "success");
                  }
                  await refreshNodeConfig();
                } catch (e) {
                  const msg = e instanceof Error ? e.message : String(e);
                  setActionError(msg);
                  showToast(msg, "error");
                } finally {
                  setBusy(false);
                  await refresh({ syncParams: false });
                }
              }}
            >
              {inFlight
                ? t("settings.ai.envoyLocal.stopping")
                : t("settings.ai.envoyLocal.stop")}
            </button>
            <button
              type="button"
              className="settings-cancel-btn"
              disabled={inFlight}
              onClick={async () => {
                setBusy(true);
                try {
                  setStatus(await nodeService.restartEnvoyLocal());
                } finally {
                  setBusy(false);
                }
              }}
            >
              {t("settings.ai.envoyLocal.restart")}
            </button>
          </>
        ) : null}
        {status?.running && status.canStop === false ? (
          <div className="settings-hint">{t("settings.ai.envoyLocal.stopHint")}</div>
        ) : null}
        {inFlight && status?.phase !== "starting" ? (
          <button
            type="button"
            className="settings-cancel-btn"
            onClick={async () => {
              setStatus(await nodeService.cancelEnvoyLocalDownload());
            }}
          >
            {t("settings.ai.envoyLocal.cancel")}
          </button>
        ) : null}
      </div>

      <h5 className="settings-subheading">{t("settings.ai.envoyLocal.modelsHeading")}</h5>
      <p className="section-desc">{t("settings.ai.envoyLocal.modelsDesc")}</p>
      {status?.modelsDir ? (
        <div className="settings-hint" data-testid="envoy-local-models-dir">
          <strong>{t("settings.ai.envoyLocal.modelsFolder")}:</strong>{" "}
          <span className="settings-mono">{status.modelsDir}</span>
          <div>{t("settings.ai.envoyLocal.modelsFolderHint")}</div>
        </div>
      ) : null}
      <div className="settings-buttons">
        <button
          type="button"
          className="settings-cancel-btn"
          disabled={inFlight}
          data-testid="envoy-local-refresh-models"
          onClick={async () => {
            setBusy(true);
            setActionError(null);
            try {
              setInstalled(await nodeService.listEnvoyLocalInstalledModels());
              await refresh({ syncParams: false });
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              setActionError(msg);
              showToast(msg, "error");
            } finally {
              setBusy(false);
            }
          }}
        >
          {t("settings.ai.envoyLocal.refreshModels")}
        </button>
      </div>
      <div className="envoy-local-models">
        <div className="envoy-local-models-col">
          <div className="settings-hint">{t("settings.ai.envoyLocal.installed")}</div>
          {installed.length === 0 ? (
            <p className="settings-hint">{t("settings.ai.envoyLocal.noInstalled")}</p>
          ) : (
            <ul className="envoy-local-model-list">
              {installed.map((m) => (
                <li key={m.id} className="envoy-local-model-row">
                  <div>
                    <span className="settings-mono">{m.id}</span>
                    {m.active ? (
                      <span className="envoy-local-active-badge">
                        {" "}
                        {t("settings.ai.envoyLocal.activeBadge")}
                      </span>
                    ) : null}
                    {m.newerCuratedModelId ? (
                      <span className="envoy-local-active-badge" data-testid="envoy-local-newer-badge">
                        {" "}
                        {t("settings.ai.envoyLocal.newerAvailableBadge")}
                      </span>
                    ) : null}
                    {m.sizeBytes != null ? (
                      <div className="settings-hint">
                        {t("settings.ai.envoyLocal.approxSize", {
                          mb: formatApproxMb(m.sizeBytes),
                        })}
                      </div>
                    ) : null}
                    {m.newerCuratedModelId ? (
                      <div className="settings-hint">
                        {t("settings.ai.envoyLocal.newerAvailableHint", {
                          model: m.newerCuratedModelLabel ?? m.newerCuratedModelId,
                        })}
                      </div>
                    ) : null}
                  </div>
                  <div className="settings-buttons">
                    {m.newerCuratedModelId && !installedIds.has(m.newerCuratedModelId) ? (
                      <button
                        type="button"
                        className="settings-cancel-btn"
                        disabled={inFlight}
                        onClick={async () => {
                          setBusy(true);
                          setActionError(null);
                          try {
                            setInstalled(
                              await nodeService.downloadEnvoyLocalModel({
                                modelId: m.newerCuratedModelId!,
                              }),
                            );
                            const st = await waitForEnvoyLocalIdle(
                              () => nodeService.getEnvoyLocalStatus(),
                              { onUpdate: setStatus },
                            );
                            if (st.phase === "error" || st.lastError) {
                              const msg =
                                st.lastError ?? t("settings.ai.envoyLocal.enableFailed");
                              setActionError(msg);
                              showToast(msg, "error");
                            }
                            setInstalled(
                              await nodeService.listEnvoyLocalInstalledModels(),
                            );
                          } catch (e) {
                            const msg = e instanceof Error ? e.message : String(e);
                            setActionError(msg);
                            showToast(msg, "error");
                          } finally {
                            setBusy(false);
                            await refresh();
                          }
                        }}
                      >
                        {t("settings.ai.envoyLocal.downloadNewer")}
                      </button>
                    ) : null}
                    {!m.active ? (
                      <button
                        type="button"
                        className="settings-cancel-btn"
                        disabled={inFlight}
                        onClick={async () => {
                          setBusy(true);
                          try {
                            setStatus(
                              await nodeService.setEnvoyLocalActiveModel({ modelId: m.id }),
                            );
                            await refreshNodeConfig();
                          } finally {
                            setBusy(false);
                            await refresh();
                          }
                        }}
                      >
                        {t("settings.ai.envoyLocal.setActive")}
                      </button>
                    ) : null}
                    {!m.active ? (
                      <button
                        type="button"
                        className="settings-cancel-btn"
                        disabled={inFlight}
                        onClick={async () => {
                          setBusy(true);
                          try {
                            setInstalled(
                              await nodeService.deleteEnvoyLocalModel({ modelId: m.id }),
                            );
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        {t("settings.ai.envoyLocal.deleteModel")}
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="envoy-local-models-col">
          <label className="settings-label">
            {t("settings.ai.envoyLocal.catalogSearch")}
            <input
              type="search"
              className="settings-input"
              placeholder={t("settings.ai.envoyLocal.catalogSearchPlaceholder")}
              value={catalogQuery}
              onChange={(e) => setCatalogQuery(e.target.value)}
            />
          </label>
          <div className="settings-hint">{t("settings.ai.envoyLocal.catalog")}</div>
          {catalogSearching ? (
            <p className="settings-hint">{t("settings.ai.envoyLocal.searchingHf")}</p>
          ) : null}
          {hfSearchError ? (
            <p className="settings-hint pi-error" data-testid="envoy-local-hf-search-error">
              {t("settings.ai.envoyLocal.hfSearchError", { error: hfSearchError })}
            </p>
          ) : null}
          <ul className="envoy-local-model-list">
            {catalog.map((m) => (
              <li key={m.id} className="envoy-local-model-row">
                <div>
                  <strong>{m.label}</strong>
                  {m.source === "huggingface" ? (
                    <span className="envoy-local-active-badge">
                      {" "}
                      {t("settings.ai.envoyLocal.sourceHf")}
                    </span>
                  ) : (
                    <span className="envoy-local-active-badge">
                      {" "}
                      {t("settings.ai.envoyLocal.sourceCurated")}
                    </span>
                  )}
                  {m.recommended ? (
                    <span className="envoy-local-active-badge">
                      {" "}
                      {m.id === status?.recommendedModelId
                        ? t("settings.ai.envoyLocal.recommendedBadge")
                        : t("settings.ai.envoyLocal.alsoFitsBadge")}
                    </span>
                  ) : null}
                  <div className="settings-hint">{m.description}</div>
                  <div className="settings-hint">
                    {t("settings.ai.envoyLocal.approxSize", {
                      mb: formatApproxMb(m.approxBytes),
                    })}
                  </div>
                </div>
                <div className="settings-buttons">
                  <button
                    type="button"
                    className="settings-cancel-btn"
                    disabled={inFlight || installedIds.has(m.id)}
                    onClick={async () => {
                      setBusy(true);
                      setActionError(null);
                      try {
                        setInstalled(
                          await nodeService.downloadEnvoyLocalModel({ modelId: m.id }),
                        );
                        const st = await waitForEnvoyLocalIdle(
                          () => nodeService.getEnvoyLocalStatus(),
                          { onUpdate: setStatus },
                        );
                        if (st.phase === "error" || st.lastError) {
                          const msg =
                            st.lastError ?? t("settings.ai.envoyLocal.enableFailed");
                          setActionError(msg);
                          showToast(msg, "error");
                        }
                        setInstalled(
                          await nodeService.listEnvoyLocalInstalledModels(),
                        );
                      } catch (e) {
                        const msg = e instanceof Error ? e.message : String(e);
                        setActionError(msg);
                        showToast(msg, "error");
                      } finally {
                        setBusy(false);
                        await refresh();
                      }
                    }}
                  >
                    {installedIds.has(m.id)
                      ? t("settings.ai.envoyLocal.installed")
                      : t("settings.ai.envoyLocal.download")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <h5 className="settings-subheading">{t("settings.ai.envoyLocal.paramsHeading")}</h5>
      <p className="settings-hint">{t("settings.ai.envoyLocal.paramsHint")}</p>
      <div className="envoy-local-params" data-testid="envoy-local-params">
        <div className="envoy-local-params-section">
          <div className="envoy-local-params-section-label">
            {t("settings.ai.envoyLocal.paramsBasicLabel")}
          </div>
          <dl className="settings-dl envoy-local-params-dl">
            <dt>{t("settings.ai.envoyLocal.ctxSize")}</dt>
            <dd>
              <div className="envoy-local-ctx-presets" role="group">
                {(
                  [
                    [4096, "ctxPreset4k"],
                    [8192, "ctxPreset8k"],
                    [16384, "ctxPreset16k"],
                    [32768, "ctxPreset32k"],
                    [262144, "ctxPreset256k"],
                    [524288, "ctxPreset512k"],
                    [1048576, "ctxPreset1m"],
                  ] as const
                ).map(([n, key]) => (
                  <button
                    key={n}
                    type="button"
                    className={
                      ctxSize === n
                        ? "envoy-local-ctx-preset is-active"
                        : "envoy-local-ctx-preset"
                    }
                    onClick={() => setCtxSize(n)}
                  >
                    {t(`settings.ai.envoyLocal.${key}`)}
                  </button>
                ))}
              </div>
              <input
                type="number"
                className="settings-input"
                min={512}
                max={2097152}
                step={1024}
                value={ctxSize}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (!Number.isFinite(n) || n <= 0) {
                    setCtxSize(DEFAULT_ENVOY_LOCAL_SERVER_PARAMS.ctxSize);
                    return;
                  }
                  setCtxSize(Math.min(2_097_152, Math.max(512, Math.round(n))));
                }}
              />
              <div className="settings-hint">{t("settings.ai.envoyLocal.ctxSizeHint")}</div>
            </dd>
            <dt>{t("settings.ai.envoyLocal.nGpuLayers")}</dt>
            <dd>
              <select
                className="settings-input"
                value={nglMode}
                onChange={(e) => setNglMode(e.target.value as "auto" | "off" | "custom")}
              >
                <option value="auto">{t("settings.ai.envoyLocal.nGpuAuto")}</option>
                <option value="off">{t("settings.ai.envoyLocal.nGpuOff")}</option>
                <option value="custom">{t("settings.ai.envoyLocal.nGpuCustom")}</option>
              </select>
              {nglMode === "custom" ? (
                <input
                  type="number"
                  className="settings-input"
                  min={1}
                  max={999}
                  value={nglCustom}
                  onChange={(e) => setNglCustom(Number(e.target.value) || 1)}
                />
              ) : null}
              <div className="settings-hint">{t("settings.ai.envoyLocal.nGpuHint")}</div>
            </dd>
          </dl>
        </div>

        <div className="envoy-local-params-toggle-row">
          <button
            type="button"
            className="settings-cancel-btn"
            data-testid="envoy-local-params-advanced-toggle"
            onClick={() => setShowAdvanced((v) => !v)}
          >
            {showAdvanced
              ? t("settings.ai.envoyLocal.paramsSimple")
              : t("settings.ai.envoyLocal.paramsAdvanced")}
          </button>
        </div>

        {showAdvanced ? (
          <div className="envoy-local-params-section envoy-local-params-advanced">
            <div className="envoy-local-params-section-label">
              {t("settings.ai.envoyLocal.paramsAdvancedLabel")}
            </div>
            <dl className="settings-dl envoy-local-params-dl">
              <dt>{t("settings.ai.envoyLocal.flashAttn")}</dt>
              <dd>
                <select
                  className="settings-input"
                  value={flashAttn}
                  onChange={(e) => setFlashAttn(e.target.value as EnvoyLocalFlashAttn)}
                >
                  <option value="auto">{t("settings.ai.envoyLocal.flashAttnAuto")}</option>
                  <option value="on">{t("settings.ai.envoyLocal.flashAttnOn")}</option>
                  <option value="off">{t("settings.ai.envoyLocal.flashAttnOff")}</option>
                </select>
                <div className="settings-hint">{t("settings.ai.envoyLocal.flashAttnHint")}</div>
              </dd>
              <dt>{t("settings.ai.envoyLocal.fit")}</dt>
              <dd>
                <select
                  className="settings-input"
                  value={fit}
                  onChange={(e) => setFit(e.target.value as EnvoyLocalFitMode)}
                >
                  <option value="on">{t("settings.ai.envoyLocal.fitOn")}</option>
                  <option value="off">{t("settings.ai.envoyLocal.fitOff")}</option>
                </select>
                <div className="settings-hint">{t("settings.ai.envoyLocal.fitHint")}</div>
              </dd>
              <dt>{t("settings.ai.envoyLocal.threads")}</dt>
              <dd>
                <input
                  type="number"
                  className="settings-input"
                  min={1}
                  max={256}
                  placeholder={t("settings.ai.envoyLocal.threadsAuto")}
                  value={threads}
                  onChange={(e) => setThreads(e.target.value)}
                />
              </dd>
              <dt>{t("settings.ai.envoyLocal.parallel")}</dt>
              <dd>
                <input
                  type="number"
                  className="settings-input"
                  min={1}
                  max={16}
                  value={parallel}
                  onChange={(e) => setParallel(Number(e.target.value) || 1)}
                />
                <div className="settings-hint">{t("settings.ai.envoyLocal.parallelHint")}</div>
              </dd>
              <dt>{t("settings.ai.envoyLocal.batchSize")}</dt>
              <dd>
                <input
                  type="number"
                  className="settings-input"
                  min={1}
                  max={65536}
                  step={64}
                  placeholder={t("settings.ai.envoyLocal.batchSizeAuto")}
                  value={batchSize}
                  onChange={(e) => setBatchSize(e.target.value)}
                />
              </dd>
              <dt>{t("settings.ai.envoyLocal.ubatchSize")}</dt>
              <dd>
                <input
                  type="number"
                  className="settings-input"
                  min={1}
                  max={65536}
                  step={32}
                  placeholder={t("settings.ai.envoyLocal.ubatchSizeAuto")}
                  value={ubatchSize}
                  onChange={(e) => setUbatchSize(e.target.value)}
                />
              </dd>
              <dt>{t("settings.ai.envoyLocal.cacheTypeK")}</dt>
              <dd>
                <select
                  className="settings-input"
                  value={cacheTypeK}
                  onChange={(e) =>
                    setCacheTypeK(e.target.value as "" | EnvoyLocalKvCacheType)
                  }
                >
                  <option value="">{t("settings.ai.envoyLocal.cacheTypeDefault")}</option>
                  <option value="f16">f16</option>
                  <option value="bf16">bf16</option>
                  <option value="q8_0">q8_0</option>
                  <option value="q5_0">q5_0</option>
                  <option value="q4_0">q4_0</option>
                  <option value="q4_1">q4_1</option>
                </select>
              </dd>
              <dt>{t("settings.ai.envoyLocal.cacheTypeV")}</dt>
              <dd>
                <select
                  className="settings-input"
                  value={cacheTypeV}
                  onChange={(e) =>
                    setCacheTypeV(e.target.value as "" | EnvoyLocalKvCacheType)
                  }
                >
                  <option value="">{t("settings.ai.envoyLocal.cacheTypeDefault")}</option>
                  <option value="f16">f16</option>
                  <option value="bf16">bf16</option>
                  <option value="q8_0">q8_0</option>
                  <option value="q5_0">q5_0</option>
                  <option value="q4_0">q4_0</option>
                  <option value="q4_1">q4_1</option>
                </select>
                <div className="settings-hint">{t("settings.ai.envoyLocal.cacheTypeHint")}</div>
              </dd>
              <dt>{t("settings.ai.envoyLocal.loraPath")}</dt>
              <dd>
                <input
                  type="text"
                  className="settings-input"
                  placeholder={t("settings.ai.envoyLocal.loraPathPlaceholder")}
                  value={loraPath}
                  onChange={(e) => setLoraPath(e.target.value)}
                />
                <div className="settings-hint">{t("settings.ai.envoyLocal.loraPathHint")}</div>
              </dd>
              <dt>{t("settings.ai.envoyLocal.startupTimeout")}</dt>
              <dd>
                <input
                  type="number"
                  className="settings-input"
                  min={30}
                  max={3600}
                  step={30}
                  placeholder={t("settings.ai.envoyLocal.startupTimeoutAuto")}
                  value={startupTimeoutSec}
                  onChange={(e) => setStartupTimeoutSec(e.target.value)}
                />
                <div className="settings-hint">
                  {t("settings.ai.envoyLocal.startupTimeoutHint")}
                </div>
              </dd>
            </dl>
          </div>
        ) : null}

        <div className="settings-buttons envoy-local-params-actions">
          <button
            type="button"
            className="settings-save-btn"
            disabled={inFlight}
            onClick={async () => {
              setBusy(true);
              try {
                const nGpuLayers =
                  nglMode === "off" ? 0 : nglMode === "custom" ? nglCustom : "auto";
                const threadsNum = threads.trim() ? Number(threads) : undefined;
                const batchNum = batchSize.trim() ? Number(batchSize) : undefined;
                const ubatchNum = ubatchSize.trim() ? Number(ubatchSize) : undefined;
                const startupSec = startupTimeoutSec.trim()
                  ? Number(startupTimeoutSec)
                  : undefined;
                const loraTrim = loraPath.trim();
                setStatus(
                  await nodeService.updateEnvoyLocalServerParams({
                    serverParams: {
                      ctxSize,
                      nGpuLayers,
                      parallel,
                      flashAttn,
                      fit,
                      ...(threadsNum && Number.isFinite(threadsNum)
                        ? { threads: threadsNum }
                        : { threads: undefined }),
                      ...(batchNum && Number.isFinite(batchNum) && batchNum > 0
                        ? { batchSize: batchNum }
                        : { batchSize: undefined }),
                      ...(ubatchNum && Number.isFinite(ubatchNum) && ubatchNum > 0
                        ? { ubatchSize: ubatchNum }
                        : { ubatchSize: undefined }),
                      ...(cacheTypeK ? { cacheTypeK } : { cacheTypeK: undefined }),
                      ...(cacheTypeV ? { cacheTypeV } : { cacheTypeV: undefined }),
                      ...(loraTrim ? { loraPath: loraTrim } : { loraPath: undefined }),
                      ...(startupSec && Number.isFinite(startupSec) && startupSec > 0
                        ? { startupTimeoutMs: Math.round(startupSec * 1000) }
                        : { startupTimeoutMs: undefined }),
                    },
                  }),
                );
              } finally {
                setBusy(false);
                await refresh();
              }
            }}
          >
            {t("settings.ai.envoyLocal.saveParams")}
          </button>
          <button
            type="button"
            className="settings-cancel-btn"
            disabled={inFlight}
            onClick={async () => {
              setBusy(true);
              try {
                setStatus(await nodeService.resetEnvoyLocalServerParams());
              } finally {
                setBusy(false);
                await refresh();
              }
            }}
          >
            {t("settings.ai.envoyLocal.resetParams")}
          </button>
        </div>
      </div>
    </div>
  );
}

export function SettingsAITab() {
  const t = useT();
  const nodeService = useNodeService();
  const { showToast } = useToast();
  const isMobileNode = useIsInProcessMobileNode();
  const { nodeConfig, refreshNodeConfig, bridgeStatus } = useNodeState();
  const aiSettings = resolveAiSettings(nodeConfig?.aiSettings);
  const documentAutonomy = aiSettings.documentAutonomy!;
  const profileMedia = aiSettings.profileMedia!;
  const disclosure = aiSettings.disclosure!;

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
    const newRules = (aiSettings.rules ?? []).filter(r => r.id !== ruleId);
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
    lastError?: string | null;
    lastErrorAt?: string | null;
    consecutiveRestartFailures?: number;
  } | null>(null);
  const [restartingOpenClaw, setRestartingOpenClaw] = useState(false);

  const refreshOpenClawStatus = useCallback(async () => {
    try {
      const oc = await nodeService.getOpenClawStatus();
      setOpenClawStatus({
        enabled: oc.enabled,
        running: oc.running,
        url: oc.url,
        childPid: oc.childPid,
        lastError: oc.lastError ?? null,
        lastErrorAt: oc.lastErrorAt ?? null,
        consecutiveRestartFailures: oc.consecutiveRestartFailures ?? 0,
      });
    } catch (e) {
      console.warn("[SettingsAITab] failed to fetch OpenClaw status", e);
    }
  }, [nodeService]);

  useEffect(() => { void refreshOpenClawStatus(); }, [refreshOpenClawStatus]);

  // While the runtime is in a Stopped state, auto-poll every 5s so the
  // operator can sit on the settings page and watch the watchdog (or their
  // own manual restart) recover — without manually reloading. The moment
  // `running` flips to true we stop polling, so this is free in the
  // common case where the runtime is healthy.
  useEffect(() => {
    if (!openClawStatus || openClawStatus.running) return;
    const id = window.setInterval(() => { void refreshOpenClawStatus(); }, 5_000);
    return () => window.clearInterval(id);
  }, [openClawStatus?.running, openClawStatus != null, refreshOpenClawStatus]);

  const handleRestartOpenClaw = useCallback(async () => {
    setRestartingOpenClaw(true);
    try {
      // Use the dedicated restart RPC — kills the child, waits for the
      // webhook port to release, spawns a fresh gateway, and returns the
      // post-restart status. We seed our state from that so the operator
      // sees the new state immediately, then follow with a full refresh.
      const oc = await nodeService.restartOpenClaw();
      setOpenClawStatus({
        enabled: oc.enabled,
        running: oc.running,
        url: oc.url,
        childPid: oc.childPid,
        lastError: oc.lastError ?? null,
        lastErrorAt: oc.lastErrorAt ?? null,
        consecutiveRestartFailures: oc.consecutiveRestartFailures ?? 0,
      });
      await refreshOpenClawStatus();
    } finally {
      setRestartingOpenClaw(false);
    }
  }, [nodeService, refreshOpenClawStatus]);

  // Refetch OpenClaw live status when persisted AI-engine flags change.
  const lastEngineFlagsRef = useRef<string>("");
  useEffect(() => {
    const key = `${nodeConfig?.bridgeEnabled !== false}:${nodeConfig?.openclawEnabled ?? true}:${nodeConfig?.activeExtAgentId ?? ""}`;
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
      lastError: openClawStatus?.lastError ?? null,
      lastErrorAt: openClawStatus?.lastErrorAt ?? null,
      consecutiveRestartFailures: openClawStatus?.consecutiveRestartFailures ?? 0,
    }),
    [nodeConfig?.openclawEnabled, openClawStatus],
  );

  // ---- Phase 49 — Pi (built-in local coding agent) ----
  // Mirrors the OpenClaw status pattern above. Pi is writable in the UI
  // (unlike OpenClaw which is read-only), so toggling piEnabled also calls
  // restartPi() to apply the change immediately.
  const [piStatus, setPiStatus] = useState<PiStatus | null>(null);
  const [restartingPi, setRestartingPi] = useState(false);

  const refreshPiStatus = useCallback(async () => {
    try {
      setPiStatus(await nodeService.getPiStatus());
    } catch (e) {
      console.warn("[SettingsAITab] failed to fetch Pi status", e);
    }
  }, [nodeService]);

  useEffect(() => { void refreshPiStatus(); }, [refreshPiStatus]);

  // Poll while Pi isn't ready — same rationale as OpenClaw.
  useEffect(() => {
    if (!piStatus || piStatus.state === "ready" || piStatus.state === "disabled") return;
    const id = window.setInterval(() => { void refreshPiStatus(); }, 5_000);
    return () => window.clearInterval(id);
  }, [piStatus?.state, piStatus != null, refreshPiStatus]);

  const handleRestartPi = useCallback(async () => {
    setRestartingPi(true);
    try {
      const s = await nodeService.restartPi();
      setPiStatus(s);
      await refreshPiStatus();
    } finally {
      setRestartingPi(false);
    }
  }, [nodeService, refreshPiStatus]);

  // Refetch Pi status when piEnabled changes in nodeConfig.
  const lastPiFlagRef = useRef<string>("");
  useEffect(() => {
    const key = `piEnabled=${nodeConfig?.piEnabled ?? true}`;
    if (lastPiFlagRef.current === key) return;
    lastPiFlagRef.current = key;
    void refreshPiStatus();
  }, [nodeConfig?.piEnabled, refreshPiStatus]);

  /**
   * Toggle Pi on/off. Persists the flag AND calls restartPi() so the change
   * takes effect immediately — updateNodeConfig alone does NOT restart the
   * runtime (see Phase 49D review notes).
   */
  const handleTogglePi = useCallback(async (enabled: boolean) => {
    try {
      await updateNodeConfigPartial({ piEnabled: enabled });
      // restartPi() reads the now-current config and either starts or stops.
      const s = await nodeService.restartPi();
      setPiStatus(s);
    } catch (e) {
      console.warn("[SettingsAITab] failed to toggle Pi", e);
    }
  }, [nodeService, updateNodeConfigPartial]);

  /**
   * Update piSettings.autoRunPolicy (the permission policy for Pi tool calls).
   * Persists only — no restart needed (the next tool-call request reads the
   * fresh policy at request time).
   */
  const handleChangePiAutoRunPolicy = useCallback(async (policy: TerminalAutoRunPolicy) => {
    try {
      await updateNodeConfigPartial({
        piSettings: { ...(nodeConfig?.piSettings ?? {}), autoRunPolicy: policy },
      });
    } catch (e) {
      console.warn("[SettingsAITab] failed to update Pi auto-run policy", e);
    }
  }, [nodeService, updateNodeConfigPartial, nodeConfig?.piSettings]);

  // ---- AI Character Bots ----
  const [botDraft, setBotDraft] = useState({ name: "", systemPrompt: "", description: "", avatarColor: "#6366f1" });
  const [botSaving, setBotSaving] = useState(false);
  const [botError, setBotError] = useState<string | null>(null);
  const [botSaved, setBotSaved] = useState(false);
  const [showBotForm, setShowBotForm] = useState(false);

  const handleAddBot = useCallback(async () => {
    const name = botDraft.name.trim();
    const systemPrompt = botDraft.systemPrompt.trim();
    if (!name || !systemPrompt) return;
    setBotSaving(true);
    setBotError(null);
    setBotSaved(false);
    try {
      const existing = nodeConfig?.aiBots ?? [];
      if (existing.some((b) => b.name.trim().toLowerCase() === name.toLowerCase())) {
        setBotError(t("settings.ai.aiBots.nameTaken", "A bot named “{name}” already exists.", { name }));
        setBotSaving(false);
        return;
      }
      const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `bot-${Date.now()}`;
      let uniqueId = id;
      let counter = 1;
      while (existing.some((b) => b.id === uniqueId)) {
        uniqueId = `${id}-${counter++}`;
      }
      const newBots = [
        ...existing,
        normalizeAiBotDefinition({
          id: uniqueId,
          name,
          systemPrompt,
          description: botDraft.description.trim() || undefined,
          avatarColor: botDraft.avatarColor,
          enabled: true,
        }),
      ];
      await updateNodeConfigPartial({ aiBots: newBots });
      setBotDraft({ name: "", systemPrompt: "", description: "", avatarColor: "#6366f1" });
      setShowBotForm(false);
      setBotSaved(true);
      setTimeout(() => setBotSaved(false), 2000);
    } catch (err) {
      setBotError(err instanceof Error ? err.message : String(err));
    } finally {
      setBotSaving(false);
    }
  }, [botDraft, nodeConfig?.aiBots, updateNodeConfigPartial, t]);

  const handleDeleteBot = useCallback(async (botId: string) => {
    try {
      const existing = nodeConfig?.aiBots ?? [];
      const newBots = existing.filter((b) => b.id !== botId);
      await updateNodeConfigPartial({ aiBots: newBots });
    } catch (err) {
      setBotError(err instanceof Error ? err.message : String(err));
    }
  }, [nodeConfig?.aiBots, updateNodeConfigPartial]);

  // Pi-only model override (does not affect OpenClaw / Hermes / OpenHuman).
  const piOverride = nodeConfig?.piSettings?.modelOverride;
  const [piUseCustomModel, setPiUseCustomModel] = useState(Boolean(piOverride));
  const initialPiProvider =
    piOverride?.provider?.trim() ||
    piProviderFromEnvoyMode(piOverride?.mode, piOverride?.endpoint);
  const [piProvider, setPiProvider] = useState(initialPiProvider);
  const [piModelEndpoint, setPiModelEndpoint] = useState(piOverride?.endpoint ?? "");
  const [piModelName, setPiModelName] = useState(piOverride?.model ?? "");
  const [piModelApiKey, setPiModelApiKey] = useState(piOverride?.apiKey ?? "");
  const [piModelSaveStatus, setPiModelSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const piModelDirtyRef = useRef(false);
  const piProviderInfo = useMemo(() => getPiNativeProvider(piProvider), [piProvider]);

  useEffect(() => {
    if (piModelSaveStatus === "saving" || piModelDirtyRef.current) return;
    const o = nodeConfig?.piSettings?.modelOverride;
    setPiUseCustomModel(Boolean(o));
    setPiProvider(o?.provider?.trim() || piProviderFromEnvoyMode(o?.mode, o?.endpoint));
    setPiModelEndpoint(o?.endpoint ?? "");
    setPiModelName(o?.model ?? "");
    setPiModelApiKey(o?.apiKey ?? "");
  }, [nodeConfig?.piSettings?.modelOverride, piModelSaveStatus]);

  const handleSavePiModelOverride = useCallback(async () => {
    setPiModelSaveStatus("saving");
    try {
      const nextSettings = { ...(nodeConfig?.piSettings ?? {}) };
      if (piUseCustomModel) {
        if (!piModelName.trim() || !piProvider.trim()) {
          setPiModelSaveStatus("error");
          return;
        }
        nextSettings.modelOverride = {
          provider: piProvider.trim(),
          model: piModelName.trim(),
          ...(piModelEndpoint.trim() ? { endpoint: piModelEndpoint.trim() } : {}),
          ...(piModelApiKey.trim() ? { apiKey: piModelApiKey.trim() } : {}),
        };
      } else {
        delete nextSettings.modelOverride;
      }
      await updateNodeConfigPartial({
        piSettings: nextSettings,
      });
      piModelDirtyRef.current = false;
      // Restart so Ext Agent RPC + next TUI spawn pick up the model.
      const s = await nodeService.restartPi();
      setPiStatus(s);
      setPiModelSaveStatus("saved");
      window.setTimeout(() => setPiModelSaveStatus("idle"), 2_000);
    } catch (e) {
      console.warn("[SettingsAITab] failed to save Pi model override", e);
      setPiModelSaveStatus("error");
    }
  }, [
    nodeService,
    updateNodeConfigPartial,
    nodeConfig?.piSettings,
    piUseCustomModel,
    piProvider,
    piModelName,
    piModelEndpoint,
    piModelApiKey,
  ]);

  const extAgentConfig = useMemo(
    () => ({
      enabled: nodeConfig?.bridgeEnabled !== false,
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

      {!isMobileNode ? (
        <section className="settings-section">
          <h4>{t("settings.ai.envoyLocal.heading")}</h4>
          <EnvoyLocalSettings refreshNodeConfig={refreshNodeConfig} />
        </section>
      ) : null}

      <section className="settings-section">
        <h4>{t("settings.ai.aiEngine.heading")}</h4>
        <p className="section-desc">{t("settings.ai.aiEngine.desc")}</p>
        {openClawStatus ? (
          <AgentSettings
            envoyAI={envoyAIInfo}
            extAgent={extAgentConfig}
            onExtAgentSave={handleExtAgentSave}
            onRestartOpenClaw={handleRestartOpenClaw}
            restartingOpenClaw={restartingOpenClaw}
          />
        ) : (
          <p className="settings-hint">{t("settings.ai.aiEngine.loading")}</p>
        )}
      </section>

      {/* Phase 49 — Pi (built-in local coding agent).
          A separate engine alongside Built-in OpenClaw. Writable in the UI
          (toggle + auto-run policy); restart-on-toggle applies immediately.
          See docs/pi-integration-design.md. */}
      <section className="settings-section">
        <h4>{t("settings.ai.aiEngine.piAgent")}</h4>
        <p className="section-desc">{t("settings.ai.aiEngine.piAgentDesc")}</p>

        <div className={`agent-block${piStatus?.state === "disabled" ? " agent-block--readonly" : ""}`}>
          <div className="agent-block-header">
            <div className="agent-block-titlerow">
              <span className="agent-block-icon agent-block-icon--pi">
                {t("settings.ai.aiEngine.iconPi")}
              </span>
              <div className="agent-block-titlewrap">
                <span className="agent-block-title">{t("settings.ai.aiEngine.piAgent")}</span>
                {piStatus?.piVersion ? (
                  <span className="agent-block-subtitle">v{piStatus.piVersion}</span>
                ) : null}
              </div>
            </div>
            {piStatus ? (
              <span
                className={`agent-block-status agent-block-status--${
                  piStatus.state === "ready" ? "on"
                  : piStatus.state === "disabled" || piStatus.state === "not-installed" ? "off"
                  : "warn"
                }`}
              >
                {t(`settings.ai.aiEngine.piStatus${piStatus.state === "not-installed" ? "NotInstalled" : piStatus.state.charAt(0).toUpperCase() + piStatus.state.slice(1)}`)}
              </span>
            ) : null}
          </div>

          {piStatus?.state === "not-installed" ? (
            <p className="settings-hint">{t("settings.ai.aiEngine.piAgentNotInstalled")}</p>
          ) : null}

          {piStatus?.error ? (
            <p className="settings-hint pi-error">
              {t("settings.ai.aiEngine.piModelError", { error: piStatus.error })}
            </p>
          ) : null}

          <div className="agent-block-fields">
            <div className="agent-field agent-field--checkbox">
              <label className="agent-field-label agent-field-label--inline">
                <input
                  type="checkbox"
                  checked={nodeConfig?.piEnabled ?? true}
                  disabled={restartingPi}
                  onChange={(e) => { void handleTogglePi(e.target.checked); }}
                />
                <span>{t("settings.ai.aiEngine.enablePi")}</span>
              </label>
            </div>

            <div className="agent-field">
              <label className="agent-field-label">
                {t("settings.ai.aiEngine.piAutoRunPolicy")}
              </label>
              <select
                className="agent-field-input"
                value={nodeConfig?.piSettings?.autoRunPolicy ?? "always-confirm"}
                disabled={restartingPi || !(nodeConfig?.piEnabled ?? true)}
                onChange={(e) => {
                  void handleChangePiAutoRunPolicy(e.target.value as TerminalAutoRunPolicy);
                }}
              >
                <option value="always-confirm">
                  {t("settings.ai.aiEngine.piAutoRunAlwaysConfirm")}
                </option>
                <option value="safe-only">
                  {t("settings.ai.aiEngine.piAutoRunSafeOnly")}
                </option>
                <option value="off">
                  {t("settings.ai.aiEngine.piAutoRunTrust")}
                </option>
              </select>
              <p className="agent-field-hint">
                {(nodeConfig?.piSettings?.autoRunPolicy ?? "always-confirm") === "always-confirm"
                  ? t("settings.ai.aiEngine.piAutoRunAlwaysConfirmDesc")
                  : (nodeConfig?.piSettings?.autoRunPolicy) === "safe-only"
                    ? t("settings.ai.aiEngine.piAutoRunSafeOnlyDesc")
                    : t("settings.ai.aiEngine.piAutoRunTrustDesc")}
              </p>
            </div>

            <div className="agent-field agent-field--checkbox">
              <label className="agent-field-label agent-field-label--inline">
                <input
                  type="checkbox"
                  checked={piUseCustomModel}
                  disabled={restartingPi || !(nodeConfig?.piEnabled ?? true) || piModelSaveStatus === "saving"}
                  onChange={(e) => {
                    piModelDirtyRef.current = true;
                    const on = e.target.checked;
                    setPiUseCustomModel(on);
                    // First enable with empty form → seed from Settings → AI
                    // so Pi starts from the shared model and the user only
                    // tweaks what differs.
                    if (on && !piOverride && !piModelName.trim()) {
                      const mp = nodeConfig?.modelProviders;
                      const seededProvider = piProviderFromEnvoyMode(mp?.mode, mp?.endpoint);
                      const info = getPiNativeProvider(seededProvider);
                      setPiProvider(seededProvider);
                      setPiModelName(
                        mp?.modelName?.trim() || info?.models[0] || "",
                      );
                      setPiModelEndpoint(mp?.endpoint ?? "");
                      setPiModelApiKey(mp?.apiKey ?? "");
                    }
                  }}
                />
                <span>{t("settings.ai.aiEngine.piCustomModel")}</span>
              </label>
              <p className="agent-field-hint">{t("settings.ai.aiEngine.piCustomModelDesc")}</p>
            </div>

            {piUseCustomModel ? (
              <>
                <div className="agent-field">
                  <label className="agent-field-label">{t("settings.ai.aiEngine.piProvider")}</label>
                  <select
                    className="agent-field-input"
                    value={piProvider}
                    disabled={restartingPi || piModelSaveStatus === "saving"}
                    onChange={(e) => {
                      piModelDirtyRef.current = true;
                      const next = e.target.value;
                      setPiProvider(next);
                      const info = getPiNativeProvider(next);
                      if (info?.models.length && !info.models.includes(piModelName)) {
                        setPiModelName(info.models[0] ?? "");
                      }
                      if (!info?.supportsEndpoint) setPiModelEndpoint("");
                    }}
                  >
                    {PI_NATIVE_PROVIDERS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="agent-field">
                  <label className="agent-field-label">{t("settings.ai.model.modelName")}</label>
                  {piProviderInfo && piProviderInfo.models.length > 0 ? (
                    <select
                      className="agent-field-input"
                      value={
                        piProviderInfo.models.includes(piModelName)
                          ? piModelName
                          : "__custom__"
                      }
                      disabled={restartingPi || piModelSaveStatus === "saving"}
                      onChange={(e) => {
                        piModelDirtyRef.current = true;
                        if (e.target.value === "__custom__") {
                          setPiModelName("");
                          return;
                        }
                        setPiModelName(e.target.value);
                      }}
                    >
                      {piProviderInfo.models.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                      <option value="__custom__">{t("settings.ai.aiEngine.piModelCustomId")}</option>
                    </select>
                  ) : null}
                  {(!piProviderInfo?.models.length ||
                    !piProviderInfo.models.includes(piModelName)) && (
                    <input
                      type="text"
                      className="agent-field-input"
                      style={{ marginTop: piProviderInfo?.models.length ? "6px" : undefined }}
                      value={piModelName}
                      placeholder={piProviderInfo?.models[0] ?? "model-id"}
                      disabled={restartingPi || piModelSaveStatus === "saving"}
                      onChange={(e) => {
                        piModelDirtyRef.current = true;
                        setPiModelName(e.target.value);
                      }}
                    />
                  )}
                </div>
                {piProviderInfo?.supportsEndpoint ? (
                  <div className="agent-field">
                    <label className="agent-field-label">{t("settings.ai.model.endpointUrl")}</label>
                    <input
                      type="text"
                      className="agent-field-input"
                      value={piModelEndpoint}
                      placeholder={piProviderInfo.endpointPlaceholder}
                      disabled={restartingPi || piModelSaveStatus === "saving"}
                      onChange={(e) => {
                        piModelDirtyRef.current = true;
                        setPiModelEndpoint(e.target.value);
                      }}
                    />
                  </div>
                ) : null}
                <div className="agent-field">
                  <label className="agent-field-label">{t("settings.ai.model.apiKey")}</label>
                  <input
                    type="password"
                    className="agent-field-input"
                    value={piModelApiKey}
                    autoComplete="off"
                    placeholder={piProviderInfo?.apiKeyEnv}
                    disabled={restartingPi || piModelSaveStatus === "saving"}
                    onChange={(e) => {
                      piModelDirtyRef.current = true;
                      setPiModelApiKey(e.target.value);
                    }}
                  />
                  <p className="agent-field-hint">{t("settings.ai.aiEngine.piModelApiKeyHint")}</p>
                </div>
                <div className="settings-buttons">
                  <button
                    type="button"
                    className="settings-save-btn"
                    onClick={() => { void handleSavePiModelOverride(); }}
                    disabled={restartingPi || piModelSaveStatus === "saving"}
                  >
                    {piModelSaveStatus === "saving"
                      ? t("settings.ai.aiEngine.piModelSaving")
                      : piModelSaveStatus === "saved"
                        ? t("settings.ai.aiEngine.piModelSaved")
                        : t("settings.ai.aiEngine.piModelSave")}
                  </button>
                  <button
                    type="button"
                    className="settings-cancel-btn"
                    disabled={restartingPi || piModelSaveStatus === "saving"}
                    onClick={() => {
                      piModelDirtyRef.current = false;
                      const o = nodeConfig?.piSettings?.modelOverride;
                      setPiUseCustomModel(Boolean(o));
                      setPiProvider(
                        o?.provider?.trim() || piProviderFromEnvoyMode(o?.mode, o?.endpoint),
                      );
                      setPiModelEndpoint(o?.endpoint ?? "");
                      setPiModelName(o?.model ?? "");
                      setPiModelApiKey(o?.apiKey ?? "");
                      setPiModelSaveStatus("idle");
                    }}
                  >
                    {t("settings.ai.aiEngine.piModelReset")}
                  </button>
                  {piModelSaveStatus === "error" ? (
                    <span className="settings-save-error">{t("settings.ai.aiEngine.piModelSaveError")}</span>
                  ) : null}
                </div>
              </>
            ) : (
              <div className="settings-buttons">
                {Boolean(nodeConfig?.piSettings?.modelOverride) ? (
                  <button
                    type="button"
                    className="settings-save-btn"
                    onClick={() => { void handleSavePiModelOverride(); }}
                    disabled={restartingPi || piModelSaveStatus === "saving"}
                  >
                    {piModelSaveStatus === "saving"
                      ? t("settings.ai.aiEngine.piModelSaving")
                      : t("settings.ai.aiEngine.piModelClearOverride")}
                  </button>
                ) : null}
              </div>
            )}

            {piStatus?.modelSpec ? (
              <div className="agent-field agent-field--readonly">
                <span className="agent-field-label">{t("settings.ai.aiEngine.model")}</span>
                <span className="agent-field-value">
                  {piStatus.modelSpec}
                  {piStatus.modelInherited === false
                    ? ` (${t("settings.ai.aiEngine.piModelOverrideBadge")})`
                    : ` (${t("settings.ai.aiEngine.piModelInheritedBadge")})`}
                </span>
              </div>
            ) : null}
          </div>

          {/* Restart button — shown when Pi is in a state restart can fix. */}
          {piStatus && (piStatus.state === "error" || piStatus.state === "stopped" || piStatus.state === "starting") ? (
            <div className="settings-buttons">
              <button
                type="button"
                className="settings-save-btn"
                onClick={() => { void handleRestartPi(); }}
                disabled={restartingPi}
              >
                {restartingPi ? t("settings.ai.aiEngine.restarting") : t("settings.ai.aiEngine.restartNow")}
              </button>
            </div>
          ) : null}
        </div>
      </section>

      {/* AI Character Bots — user-created bots with personality, synced
          to all clients (EnvoyGo, Social UI) via config broadcast. */}
      <section className="settings-section">
        <h4>{t("settings.ai.aiBots.heading", "AI Character Bots")}</h4>
        <p className="section-desc">
          {t("settings.ai.aiBots.desc", "Create custom AI characters with unique personalities. They appear in your chat list and sync to all your devices automatically.")}
        </p>

        <div className="agent-block">
          {/* Existing bots list */}
          {(nodeConfig?.aiBots ?? []).length > 0 ? (
            <div className="agent-block-fields">
              {(nodeConfig?.aiBots ?? []).map((bot) => (
                <div key={bot.id} className="agent-field agent-field--readonly">
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", width: "100%" }}>
                    <span
                      style={{
                        background: bot.avatarColor ?? "#6366f1",
                        width: "2rem",
                        height: "2rem",
                        borderRadius: "0.5rem",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#fff",
                        fontSize: "0.8rem",
                        fontWeight: 600,
                        flexShrink: 0,
                      }}
                    >
                      {(bot.name ?? bot.id).charAt(0).toUpperCase()}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 500, fontSize: "0.85rem" }}>
                        {bot.name} {bot.enabled === false ? "(disabled)" : ""}
                      </div>
                      {bot.description ? (
                        <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted, #64748b)" }}>
                          {bot.description}
                        </div>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      className="settings-action-btn"
                      onClick={() => { void handleDeleteBot(bot.id) }}
                      style={{ color: "var(--color-danger, #ef4444)", border: "1px solid var(--color-border, #e2e8f0)" }}
                    >
                      {t("settings.ai.aiBots.delete", "Delete")}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="settings-hint">
              {t("settings.ai.aiBots.empty", "No bots yet. Click \"Add Bot\" to create one.")}
            </p>
          )}

          {botSaved ? (
            <p className="settings-hint" style={{ color: "#10b981" }}>
              {t("settings.ai.aiBots.saved", "Bot added! It will appear in your chat list.")}
            </p>
          ) : null}

          {/* Add Bot form — collapsible */}
          {showBotForm ? (
            <div className="agent-block-fields" style={{ marginTop: "0.75rem" }}>
              <div className="agent-field">
                <label className="agent-field-label">
                  {t("settings.ai.aiBots.name", "Bot name")}
                </label>
                <input
                  type="text"
                  className="agent-field-input"
                  value={botDraft.name}
                  onChange={(e) => setBotDraft({ ...botDraft, name: e.target.value })}
                  placeholder={t("settings.ai.aiBots.namePlaceholder", "e.g. Luna the Librarian")}
                  autoFocus
                />
              </div>
              <div className="agent-field">
                <label className="agent-field-label">
                  {t("settings.ai.aiBots.personality", "Personality / System prompt")}
                </label>
                <textarea
                  className="agent-field-input"
                  value={botDraft.systemPrompt}
                  onChange={(e) => setBotDraft({ ...botDraft, systemPrompt: e.target.value })}
                  placeholder={t(
                    "settings.ai.aiBots.personalityPlaceholder",
                    "You are Luna, my girlfriend. You love music, movies, and travelling. Speak warmly and affectionately.",
                  )}
                  rows={3}
                  style={{ fontFamily: "inherit", fontSize: "0.85rem", resize: "vertical" }}
                />
                <p className="settings-hint">
                  {t(
                    "settings.ai.aiBots.personalityHint",
                    "Write as the character in first person (“You are …”). Avoid third person (“Luna is …”) or assistant wording (“I am an AI that helps…”). We reshape this on save.",
                  )}
                </p>
              </div>
              <div className="agent-field">
                <label className="agent-field-label">
                  {t("settings.ai.aiBots.description", "Short description (optional)")}
                </label>
                <input
                  type="text"
                  className="agent-field-input"
                  value={botDraft.description}
                  onChange={(e) => setBotDraft({ ...botDraft, description: e.target.value })}
                  placeholder={t(
                    "settings.ai.aiBots.descPlaceholder",
                    "My girlfriend · music & travel",
                  )}
                />
                <p className="settings-hint">
                  {t(
                    "settings.ai.aiBots.descHint",
                    "One short line for the chat list. Leave blank to auto-fill from the personality.",
                  )}
                </p>
              </div>
              <div className="agent-field">
                <label className="agent-field-label">
                  {t("settings.ai.aiBots.avatarColor", "Avatar color")}
                </label>
                <input
                  type="color"
                  value={botDraft.avatarColor ?? "#6366f1"}
                  onChange={(e) => setBotDraft({ ...botDraft, avatarColor: e.target.value })}
                  style={{ width: "3rem", height: "2rem", border: "1px solid var(--color-border, #e2e8f0)", borderRadius: "0.375rem", cursor: "pointer" }}
                />
              </div>
              {botError ? (
                <p className="pi-error">{botError}</p>
              ) : null}
            </div>
          ) : null}

          {/* Action buttons */}
          <div className="agent-block-actions">
            {showBotForm ? (
              <>
                <button
                  type="button"
                  className="settings-save-btn"
                  onClick={() => { void handleAddBot() }}
                  disabled={!botDraft.name.trim() || !botDraft.systemPrompt.trim() || botSaving}
                >
                  {botSaving
                    ? t("settings.ai.aiBots.saving", "Saving…")
                    : t("settings.ai.aiBots.create", "Create Bot")}
                </button>
                <button
                  type="button"
                  className="settings-action-btn"
                  onClick={() => { setShowBotForm(false); setBotError(null); }}
                  disabled={botSaving}
                >
                  {t("settings.ai.aiBots.cancel", "Cancel")}
                </button>
              </>
            ) : (
              <button
                type="button"
                className="settings-action-btn"
                onClick={() => { setShowBotForm(true); setBotError(null); }}
              >
                + {t("settings.ai.aiBots.add", "Add Bot")}
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Per-call model cost dashboard. Reads from the rollup store so it
          stays fast for a year of history. Renders nothing on a fresh
          install (no recorded calls) or on mobile (stubbed to empty). */}
      <section className="settings-section">
        <CostDashboardPanel />
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
          modelProviders={nodeConfig?.modelProviders}
        />
      </section>

      <section className="settings-section">
        <h4>{t("kbPlugins.heading")}</h4>
        <p className="section-desc">{t("kbPlugins.sectionDesc")}</p>
        <KbPluginSettings />
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
