import { useEffect, useState } from "react";
import { useNodeState } from "../../context/NodeStateContext.js";
import { useNodeService } from "../../hooks/useNodeService.js";
import { useOptimisticToggle } from "../../hooks/useOptimisticToggle.js";
import type {
  AiIdentityMode,
  AiKnowledgeBaseSettings,
  AiRagMode,
  AiRule,
  AiRuleActionType,
  AiRuleCategory,
  AiSettings,
  DocumentAutonomyPolicy,
  RagIndexStatus,
} from "@envoymesh/api";
import {
  DEFAULT_AI_KNOWLEDGE_BASE,
  DEFAULT_AI_KNOWLEDGE_BASE_MAX_FILE_BYTES,
  DEFAULT_AI_KNOWLEDGE_BASE_CHUNK_OVERLAP_CHARS,
  DEFAULT_AI_KNOWLEDGE_BASE_CHUNK_SIZE_CHARS,
  DEFAULT_DOCUMENT_AUTONOMY_POLICY,
  DEFAULT_PROFILE_MEDIA_POLICY,
  DEFAULT_ENVOY_DISCLOSURE_SETTINGS,
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
      <label>Vector index status</label>
      <div className="settings-status-panel">
        <div className="settings-progress-bar" aria-hidden="true">
          <div className="settings-progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <p className="field-desc">
          {status.isIndexing
            ? `Indexing ${progress.phase}: ${progress.processed}/${progress.total} files`
            : progress.phase === "done"
              ? `Up to date — indexed ${progress.indexed}, skipped ${progress.skipped}, removed ${progress.removed}`
              : progress.phase === "error"
                ? `Index error: ${progress.message ?? "unknown"}`
                : "Idle"}
          {status.lastCompletedAt ? ` · Last run ${new Date(status.lastCompletedAt).toLocaleString()}` : ""}
          {status.trackedDocuments > 0 ? ` · ${status.trackedDocuments} tracked file(s)` : ""}
        </p>
      </div>
    </div>
  );
}

function KnowledgeBaseSettings(props: {
  value: AiKnowledgeBaseSettings;
  onChange: (next: AiKnowledgeBaseSettings) => Promise<void>;
}) {
  const kb = props.value;
  const patch = async (partial: Partial<AiKnowledgeBaseSettings>) => {
    await props.onChange({ ...kb, ...partial });
  };

  return (
    <>
      <div className="settings-toggle-row">
        <div className="toggle-info">
          <strong>Enable vault knowledge base</strong>
          <span className="toggle-desc">Inject matching vault snippets into AI prompts</span>
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
          <label>Retrieval mode</label>
          <select
            value={kb.ragMode ?? DEFAULT_AI_KNOWLEDGE_BASE.ragMode}
            onChange={async (e) => {
              await patch({ ragMode: e.target.value as AiRagMode });
            }}
          >
            <option value="vector">Vector (embeddings, recommended)</option>
            <option value="hybrid">Hybrid (vector + keyword fallback)</option>
            <option value="lexical">Lexical (keywords only)</option>
          </select>
        </div>
        <div className="form-group">
          <label>Embedding model</label>
          <input
            type="text"
            placeholder="inherit from chat model or e.g. nomic-embed-text"
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

      <div className="settings-toggle-row">
        <div className="toggle-info">
          <strong>Purge RAG when deleting chat</strong>
          <span className="toggle-desc">
            Off (default): deleted messages stay in the vector index for AI context. On: delete/clear also removes chat RAG vectors.
          </span>
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
          <label>Recent messages in context</label>
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
          <label>RAG history messages</label>
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
          <label>Vault snippets per prompt</label>
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
          <label>Max file size (MB)</label>
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
          <label>Chunk size (chars)</label>
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
          <label>Chunk overlap (chars)</label>
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
        <label>Public knowledge paths (comma-separated)</label>
        <input
          type="text"
          placeholder="knowledge/public/"
          value={(kb.publicVaultPaths ?? kb.vaultPaths ?? DEFAULT_AI_KNOWLEDGE_BASE.publicVaultPaths).join(", ")}
          onChange={async (e) => {
            const publicVaultPaths = e.target.value
              .split(",")
              .map((p) => p.trim())
              .filter(Boolean);
            await patch({ publicVaultPaths, vaultPaths: undefined });
          }}
        />
        <p className="field-desc">Used for auto-reply and contact-facing AI only.</p>
      </div>

      <div className="form-group">
        <label>Private knowledge paths (comma-separated)</label>
        <input
          type="text"
          placeholder="knowledge/private/"
          value={(kb.privateVaultPaths ?? DEFAULT_AI_KNOWLEDGE_BASE.privateVaultPaths).join(", ")}
          onChange={async (e) => {
            const privateVaultPaths = e.target.value
              .split(",")
              .map((p) => p.trim())
              .filter(Boolean);
            await patch({ privateVaultPaths });
          }}
        />
        <p className="field-desc">Owner-only: Envoy AI tab and local knowledge queries.</p>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label>External provider</label>
          <select
            value={kb.externalProvider ?? "none"}
            onChange={async (e) => {
              await patch({
                externalProvider: e.target.value as "none" | "mcp",
              });
            }}
          >
            <option value="none">None (local vault only)</option>
            <option value="mcp">MCP server (e.g. Memex)</option>
          </select>
        </div>
        <div className="form-group">
          <label>MCP server URL</label>
          <input
            type="text"
            placeholder="http://127.0.0.1:PORT/mcp"
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
            <label>MCP search tool</label>
            <input
              type="text"
              placeholder="memex_search"
              value={kb.mcpSearchTool ?? ""}
              onChange={async (e) => {
                await patch({ mcpSearchTool: e.target.value.trim() || undefined });
              }}
            />
          </div>
          <div className="form-group">
            <label>MCP API key (optional)</label>
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
      setSaveMessage("Saved");
    } catch (err) {
      setSaveMessage(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <h4>Agent Operating Instructions</h4>
      <p className="field-desc">
        Private markdown injected into every AI prompt (Envoy AI chat, draft replies, knowledge answers).
        Separate from your public Profile and from vault RAG files. Stored as agent-identity.md in your profile directory.
      </p>
      {loading ? (
        <p className="field-desc">Loading…</p>
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
              {saving ? "Saving…" : "Save agent identity"}
            </button>
            {updatedAt && updatedAt !== new Date(0).toISOString() ? (
              <span className="field-desc">Last saved {new Date(updatedAt).toLocaleString()}</span>
            ) : null}
            {saveMessage ? <span className="field-desc">{saveMessage}</span> : null}
          </div>
        </>
      )}
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
  };
}

export function SettingsAITab() {
  const nodeService = useNodeService();
  const { nodeConfig, refreshNodeConfig } = useNodeState();
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
      alert("Please enter a rule name");
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

  return (
    <section className="settings-section">
      <h3>AI Assistant Settings</h3>
      <p className="section-desc">Configure how the AI responds on your behalf.</p>

      <h4>Status</h4>
      <div className="settings-toggle-row">
        <div className="toggle-info">
          <strong>Online Assistant</strong>
          <span className="toggle-desc">Suggest drafts when you are online</span>
        </div>
        <label className="toggle-switch">
          <input type="checkbox" checked={onlineAssistantToggle.checked}
            onChange={onlineAssistantToggle.onCheckboxChange} />
          <span className="slider" />
        </label>
      </div>

      <div className="settings-toggle-row">
        <div className="toggle-info">
          <strong>Offline Agent</strong>
          <span className="toggle-desc">Handle chats when you are away</span>
        </div>
        <label className="toggle-switch">
          <input type="checkbox" checked={offlineAgentToggle.checked}
            onChange={offlineAgentToggle.onCheckboxChange} />
          <span className="slider" />
        </label>
      </div>

      <h4>Status Detection</h4>
      <p className="field-desc">Choose how your online status is determined.</p>
      <div className="settings-radio-group">
        {(["automatic", "manual"] as const).map((mode) => (
          <label key={mode} className={`settings-radio-option ${currentStatus.statusMode === mode ? "active" : ""}`}>
            <input type="radio" name="status-mode" value={mode}
              checked={currentStatus.statusMode === mode}
              onChange={async () => {
                await updateAiSettings({ status: { ...currentStatus, statusMode: mode } });
              }} />
            <div className="radio-content">
              <strong>{mode === "automatic" ? "Automatic" : "Manual"}</strong>
              <span>{mode === "automatic" ? "Detect based on activity (typing, mouse movement)" : "Set your status manually below"}</span>
            </div>
          </label>
        ))}
      </div>

      {currentStatus.statusMode === "manual" && (
        <div className="settings-toggle-row" style={{ marginTop: "0.75rem" }}>
          <div className="toggle-info">
            <strong>Current Status</strong>
            <span className="toggle-desc">Set whether you appear online or away</span>
          </div>
          <label className="toggle-switch">
            <input type="checkbox" checked={manualStatusToggle.checked}
              onChange={manualStatusToggle.onCheckboxChange} />
            <span className="slider" />
          </label>
        </div>
      )}

      <h4>AI Identity</h4>
      <p className="field-desc">
        Controls assistant tone in drafts. Human vs agent is always tracked by message role (not shown as inline
        <code> [AI Agent] </code> in chat unless debug below).
      </p>
      <div className="identity-mode-options">
        {(Object.entries({
          invisible: {
            title: "Invisible",
            desc: "Drafts sound like you; agent role still applies on send",
            example: `Example: "Yeah, I can do that."`,
          },
          transparent: {
            title: "Transparent",
            desc: "Drafts as an open AI assistant (no inline label in chat UI)",
            example: `Example: "I'm checking that for you."`,
          },
          defensive: {
            title: "Defensive (Gatekeep)",
            desc: "Gatekeeper tone when you are away",
            example: `Example: "I've received your message and will notify them when back."`,
          },
        }) as [AiIdentityMode, { title: string; desc: string; example: string }][]).map(([mode, info]) => (
          <label key={mode} className={`identity-mode-option ${aiSettings.identity.mode === mode ? "active" : ""}`}>
            <input type="radio" name="ai-identity" value={mode}
              checked={aiSettings.identity.mode === mode}
              onChange={async () => {
                await updateAiSettings({ identity: { ...aiSettings.identity, mode } });
              }} />
            <div className="identity-mode-content">
              <strong>{info.title}</strong>
              <span>{info.desc}</span>
              <small>{info.example}</small>
            </div>
          </label>
        ))}
      </div>

      <h4>Chat disclosure</h4>
      <p className="field-desc">
        Wire messages always use honest agent roles. These settings affect contact-thread presentation only;
        Activity and audit always show the true actor.
      </p>
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
          <span>Show agent badges in contact chat</span>
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
          <span>Show verified peer agents like normal contact chat</span>
        </label>
      </div>

      <h4>EnvoyAI postures</h4>
      <p className="field-desc">
        Standing delegation within EMP. Social proxy requires Trust mode enabled in Settings → Trust.
      </p>
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
          <span>Social proxy</span>
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
          <span>Document acquisition agent</span>
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
          <span>Capability provider agent</span>
        </label>
      </div>

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
            <strong>Debug: embed prefix in message text</strong>
            <span className="field-desc block">
              When enabled, adds your configurable prefix (default <code>[AI Agent]</code>) to outbound message
              bytes for logs and wire inspection. Never shown in the Social chat UI.
            </span>
          </span>
        </label>
      </div>

      <div className="settings-field">
        <label htmlFor="ai-debug-prefix">Debug prefix string</label>
        <input
          id="ai-debug-prefix"
          type="text"
          className="settings-input"
          placeholder="[AI Agent]"
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

      <AgentIdentityEditor />

      <h4>Default Mode for New Contacts</h4>
      <p className="field-desc">
        Default AI mode when you open a chat with someone who has no per-contact override.
        To change mode for an existing contact, use the Manual / Assistant / Auto buttons in that chat&apos;s header.
      </p>
      <select className="settings-select" value={aiSettings.defaultModeForNewContacts}
        onChange={async (e) => {
          await updateAiSettings({ defaultModeForNewContacts: e.target.value as "manual" | "assistant" | "auto" });
        }}>
        <option value="manual">Manual (safest — you type everything)</option>
        <option value="assistant">Assistant (AI suggests drafts)</option>
        <option value="auto">Auto-Reply (AI responds automatically, requires trust)</option>
      </select>

      <h4>Knowledge Base</h4>
      <p className="field-desc">
        Local vault files are split into public (auto-reply) and private (Envoy AI) partitions,
        indexed in SQLite with an HNSW ANN index.
      </p>
      <KnowledgeBaseSettings
        value={aiSettings.knowledgeBase ?? { ...DEFAULT_AI_KNOWLEDGE_BASE }}
        onChange={async (knowledgeBase) => {
          await updateAiSettings({ knowledgeBase });
        }}
      />

      <h4>Profile gallery photos</h4>
      <p className="field-desc">
        Your public thumbnail is always visible on your signed profile. These settings apply only to extra gallery photos in Profile → Photos.
      </p>
      <div className="settings-toggle-row">
        <div className="toggle-info">
          <strong>Allow agent to share gallery photos</strong>
          <span className="toggle-desc">When off, gallery photos are never sent by Envoy AI</span>
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
        <label>Gallery share autonomy tier</label>
        <select
          className="settings-select"
          value={profileMedia.maxAutonomousShareTier}
          disabled={!profileMedia.allowAgentShareGalleryPhotos}
          onChange={async (e) => {
            const tier = Number(e.target.value) as ProfileMediaPolicy["maxAutonomousShareTier"];
            await updateAiSettings({
              profileMedia: { ...profileMedia, maxAutonomousShareTier: tier },
            });
          }}
        >
          <option value={0}>Tier 0 — propose in Inbox only</option>
          <option value={2}>Tier 2 — auto-share when bond and visibility allow</option>
        </select>
      </div>
      <div className="form-group">
        <label>Minimum gallery visibility for agent share</label>
        <select
          className="settings-select"
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
          <option value="public">Public-labelled photos</option>
          <option value="referred">Public + referred-labelled</option>
          <option value="direct">Direct-only photos</option>
        </select>
      </div>

      <h4>Document Autonomy</h4>
      <p className="field-desc">
        Controls how Envoy AI handles library publish and file share workflows. Default is proposals-only (Inbox).
      </p>
      <div className="form-group">
        <label>Share autonomy tier</label>
        <select
          className="settings-select"
          value={documentAutonomy.maxAutonomousShareTier}
          onChange={async (e) => {
            const tier = Number(e.target.value) as DocumentAutonomyPolicy["maxAutonomousShareTier"];
            await updateAiSettings({
              documentAutonomy: { ...documentAutonomy, maxAutonomousShareTier: tier },
            });
          }}
        >
          <option value={0}>Tier 0 — proposals only (Inbox approval)</option>
          <option value={1}>Tier 1 — delegated (publish helpers; share still proposed)</option>
          <option value={2}>Tier 2 — auto-share to direct bonds (≤ friends sensitivity)</option>
        </select>
      </div>
      <div className="settings-toggle-row">
        <div className="toggle-info">
          <strong>Autonomous publish metadata</strong>
          <span className="toggle-desc">Allow agent to publish public library metadata without extra prompts</span>
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

      <h4>AI Rules</h4>
      <p className="field-desc">Rules define how the AI responds to specific triggers.</p>

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
                {rule.trigger.isGreeting && "Greetings "}
                {rule.trigger.keywords && rule.trigger.keywords.length > 0 && `Keywords: ${rule.trigger.keywords.join(", ")} `}
                {rule.trigger.messageContains && `Regex: ${rule.trigger.messageContains}`}
                {rule.trigger.contactAiAccessLevel && rule.trigger.contactAiAccessLevel.length > 0 && ` Access: ${rule.trigger.contactAiAccessLevel.join(", ")}`}
                {!rule.trigger.isGreeting && (!rule.trigger.keywords || rule.trigger.keywords.length === 0) && !rule.trigger.messageContains && "No triggers (catch-all)"}
              </div>
              <div className="rule-item-actions">
                Action: {rule.action.type}
                {rule.action.template && ` — "${rule.action.template.slice(0, 50)}${rule.action.template.length > 50 ? "..." : ""}"`}
                {rule.action.aiIdentityOverride && ` | Identity: ${rule.action.aiIdentityOverride}`}
              </div>
              <div className="rule-item-controls">
                <button className="delete" onClick={() => handleDeleteRule(rule.id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="field-desc" style={{ marginBottom: "1rem" }}>No rules configured. Add a rule below.</p>
      )}

      {/* Add Rule Form — fully controlled */}
      <div className="add-rule-form">
        <h5>Add New Rule</h5>
        <div className="form-group">
          <label>Rule Name</label>
          <input type="text" placeholder="e.g., Greeting Response"
            value={ruleForm.name}
            onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })} />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Category</label>
            <select value={ruleForm.category}
              onChange={(e) => setRuleForm({ ...ruleForm, category: e.target.value as AiRuleCategory })}>
              <option value="availability">Availability</option>
              <option value="capability">Capability</option>
              <option value="catch_all">Catch-all</option>
            </select>
          </div>
          <div className="form-group">
            <label>Priority (lower = first)</label>
            <input type="number" value={ruleForm.priority} min={1} max={100}
              onChange={(e) => setRuleForm({ ...ruleForm, priority: parseInt(e.target.value) || 1 })} />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Trigger: Keywords (comma-separated)</label>
            <input type="text" placeholder="e.g., help, question, support"
              value={ruleForm.keywords}
              onChange={(e) => setRuleForm({ ...ruleForm, keywords: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Trigger: Message Regex</label>
            <input type="text" placeholder="e.g., \\b(help|support)\\b"
              value={ruleForm.regex}
              onChange={(e) => setRuleForm({ ...ruleForm, regex: e.target.value })} />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Trigger: Greeting?</label>
            <select value={ruleForm.isGreeting ? "true" : ""}
              onChange={(e) => setRuleForm({ ...ruleForm, isGreeting: e.target.value === "true" })}>
              <option value="">Any</option>
              <option value="true">Yes (match greetings)</option>
            </select>
          </div>
          <div className="form-group">
            <label>Trigger: AI Access Level</label>
            <select value={ruleForm.accessLevel}
              onChange={(e) => setRuleForm({ ...ruleForm, accessLevel: e.target.value as "" | "full" | "assistant_only" })}>
              <option value="">Any</option>
              <option value="full">Full access only</option>
              <option value="assistant_only">Assistant only</option>
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Action Type</label>
            <select value={ruleForm.actionType}
              onChange={(e) => setRuleForm({ ...ruleForm, actionType: e.target.value as AiRuleActionType })}>
              <option value="draft">Draft (suggest reply)</option>
              <option value="auto_send">Auto-send (send directly)</option>
              <option value="gatekeep">Gatekeep (polite refusal)</option>
              <option value="defer">Defer (ask owner)</option>
            </select>
          </div>
          <div className="form-group">
            <label>Identity Override</label>
            <select value={ruleForm.identityOverride}
              onChange={(e) => setRuleForm({ ...ruleForm, identityOverride: e.target.value as "" | AiIdentityMode })}>
              <option value="">Use default</option>
              <option value="invisible">Invisible (as owner)</option>
              <option value="transparent">Transparent ([AI])</option>
              <option value="defensive">Defensive (gatekeep)</option>
            </select>
          </div>
        </div>
        <div className="form-group">
          <label>Response Template (optional, use {"{ownerName}"} for owner's name)</label>
          <textarea placeholder="e.g., Hi {ownerName} is currently away. I'll let them know you reached out!"
            value={ruleForm.template}
            onChange={(e) => setRuleForm({ ...ruleForm, template: e.target.value })} />
        </div>
        <div className="form-actions">
          <button className="btn-primary" onClick={handleAddRule}>Add Rule</button>
        </div>
      </div>
    </section>
  );
}
