import { useState } from "react";
import { useNodeState } from "../../context/NodeStateContext.js";
import { useNodeService } from "../../hooks/useNodeService.js";
import type {
  AiIdentityMode,
  AiRule,
  AiRuleActionType,
  AiRuleCategory,
  AiSettings,
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

function defaultAiSettings(): AiSettings {
  return {
    status: { onlineAssistantEnabled: true, offlineAgentEnabled: false, statusMode: "automatic" },
    identity: { mode: "transparent" },
    defaultModeForNewContacts: "manual",
    rules: [],
  };
}

export function SettingsAITab() {
  const nodeService = useNodeService();
  const { nodeConfig, refreshNodeConfig } = useNodeState();
  const aiSettings = nodeConfig?.aiSettings ?? defaultAiSettings();

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
          <input type="checkbox" checked={currentStatus.onlineAssistantEnabled}
            onChange={async (e) => {
              await updateAiSettings({
                status: { ...currentStatus, onlineAssistantEnabled: e.target.checked },
              });
            }} />
          <span className="toggle-slider" />
        </label>
      </div>

      <div className="settings-toggle-row">
        <div className="toggle-info">
          <strong>Offline Agent</strong>
          <span className="toggle-desc">Handle chats when you are away</span>
        </div>
        <label className="toggle-switch">
          <input type="checkbox" checked={currentStatus.offlineAgentEnabled}
            onChange={async (e) => {
              await updateAiSettings({
                status: { ...currentStatus, offlineAgentEnabled: e.target.checked },
              });
            }} />
          <span className="toggle-slider" />
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
            <input type="checkbox" checked={currentStatus.isOnlineManual ?? true}
              onChange={async (e) => {
                await updateAiSettings({ status: { ...currentStatus, isOnlineManual: e.target.checked } });
              }} />
            <span className="toggle-slider" />
          </label>
        </div>
      )}

      <h4>AI Identity</h4>
      <p className="field-desc">How the AI presents itself in responses.</p>
      <div className="identity-mode-options">
        {(Object.entries({
          invisible: { title: "Invisible", desc: "Responds as if it were you", example: `Example: "Yeah, I can do that."` },
          transparent: { title: "Transparent", desc: "Prefix messages with [AI Agent]", example: `Example: "[AI Agent]: I'm checking..."` },
          defensive: { title: "Defensive (Gatekeep)", desc: "Acts as gatekeeper when you are away", example: `Example: "I've received your message and will notify them when back."` },
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

      <h4>Default Mode for New Contacts</h4>
      <p className="field-desc">The default AI mode when you start a chat with a new contact.</p>
      <select className="settings-select" value={aiSettings.defaultModeForNewContacts}
        onChange={async (e) => {
          await updateAiSettings({ defaultModeForNewContacts: e.target.value as "manual" | "assistant" | "auto" });
        }}>
        <option value="manual">Manual (safest — you type everything)</option>
        <option value="assistant">Assistant (AI suggests drafts)</option>
        <option value="auto">Auto-Reply (AI responds automatically, requires trust)</option>
      </select>

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
