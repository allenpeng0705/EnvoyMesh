/**
 * Settings — AI Agent section with two distinct subsections:
 *   1. EnvoyAI — built-in OpenClaw engine
 *   2. Ext Agent — external agent bridge (HomeClaw, etc.)
 */

import React, { useState, useEffect, useCallback } from "react";

interface EnvoyAIInfo {
  running: boolean;
  url: string;
  modelProvider?: string;
  modelName?: string;
}

interface ExtAgentConfig {
  enabled: boolean;
  configured: boolean;
  name?: string;
  url?: string;
  listenPort?: number;
}

interface Props {
  envoyAI: EnvoyAIInfo;
  extAgent: ExtAgentConfig;
  onExtAgentSave: (config: ExtAgentConfig) => Promise<void>;
}

export function AgentSettings({ envoyAI, extAgent, onExtAgentSave }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ExtAgentConfig>(extAgent);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { setDraft(extAgent); }, [extAgent]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try { await onExtAgentSave(draft); setSaved(true); setTimeout(() => setSaved(false), 2000); }
    catch (e) { console.error(e); }
    finally { setSaving(false); setEditing(false); }
  }, [draft, onExtAgentSave]);

  return (
    <div className="settings-agent">
      {/* ======== EnvoyAI — Built-in ======== */}
      <div className="settings-section">
        <div className="settings-section-header">
          <span className="settings-section-title">
            EnvoyAI
            <span className="settings-section-subtitle"> — OpenClaw</span>
          </span>
          <span className={`status-badge ${envoyAI.running ? "status-on" : "status-off"}`}>
            {envoyAI.running ? "Running" : "Stopped"}
          </span>
        </div>
        <p className="settings-section-desc">
          Built-in AI engine that handles all EnvoyMesh requests — chat, knowledge queries,
          agent tasks, and mesh intelligence.
        </p>
        <div className="settings-field readonly">
          <label>Provider</label>
          <input type="text" value="OpenClaw" readOnly disabled />
        </div>
        <div className="settings-field readonly">
          <label>Webhook</label>
          <input type="text" value={envoyAI.url} readOnly disabled />
        </div>
        {envoyAI.modelProvider && (
          <div className="settings-field readonly">
            <label>Model</label>
            <input type="text" value={`${envoyAI.modelProvider} / ${envoyAI.modelName || "default"}`} readOnly disabled />
          </div>
        )}
      </div>

      {/* ======== Ext Agent — External Bridge ======== */}
      <div className="settings-section">
        <div className="settings-section-header">
          <span className="settings-section-title">
            Ext Agent
            {extAgent.configured && extAgent.name ? (
              <span className="settings-section-subtitle"> — {extAgent.name}</span>
            ) : (
              <span className="settings-section-subtitle dim"> — Not configured</span>
            )}
          </span>
          {extAgent.configured && (
            <span className="status-badge status-on">Active</span>
          )}
        </div>
        <p className="settings-section-desc">
          Bridge messages to an external agent (HomeClaw, custom GPT, etc.).
          EnvoyMesh acts as a secure channel — the external agent receives chat messages
          and replies through the bridge.
        </p>

        {!editing ? (
          <>
            <div className="settings-field readonly">
              <label>Agent Label</label>
              <input type="text" value={extAgent.name || "—"} readOnly disabled />
            </div>
            <div className="settings-field readonly">
              <label>Webhook URL</label>
              <input type="text" value={extAgent.url || "—"} readOnly disabled />
            </div>
            <div className="settings-field readonly">
              <label>Listen Port</label>
              <input type="text" value={extAgent.listenPort?.toString() || "3031"} readOnly disabled />
            </div>
            <button className="btn btn-secondary" onClick={() => { setDraft(extAgent); setEditing(true); }}>
              Configure
            </button>
          </>
        ) : (
          <>
            <div className="settings-field">
              <label>Agent Label</label>
              <input
                type="text"
                value={draft.name || ""}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="e.g. HomeClaw"
              />
            </div>
            <div className="settings-field">
              <label>Webhook URL</label>
              <input
                type="text"
                value={draft.url || ""}
                onChange={(e) => setDraft({ ...draft, url: e.target.value })}
                placeholder="http://host.docker.internal:18790/message"
              />
            </div>
            <div className="settings-field">
              <label>Listen Port</label>
              <input
                type="number"
                value={draft.listenPort ?? 3031}
                onChange={(e) => setDraft({ ...draft, listenPort: parseInt(e.target.value) || 3031 })}
              />
            </div>
            <div className="settings-field checkbox">
              <label>
                <input
                  type="checkbox"
                  checked={draft.enabled}
                  onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
                />
                Enable external agent bridge
              </label>
            </div>
            <div className="settings-actions">
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : saved ? "✓ Saved" : "Save"}
              </button>
              <button className="btn btn-secondary" onClick={() => setEditing(false)}>
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
