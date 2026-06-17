/**
 * Settings → AI → AI Engine (Phase 32).
 *
 * "AI Engine" is the block within the AI tab that picks *which* agent
 * surfaces the AI on this home node. (The separate "Agent Network" tab in
 * the Settings sidebar is for onboarding other nodes — pairing, fleet
 * manifest, company invites — not the AI engine.)
 *
 * Renders a single section that lists the available engines with a derived
 * `AiEngineMode` chip on top:
 *
 *   1. **EnvoyAI** — built-in OpenClaw engine. **Read-only here.** The
 *      configured state is shown; live state is shown in a 3-state status
 *      badge ("Disabled" / "Running" / "Stopped"). The owner edits
 *      `node-config.json` and restarts the home node to change it.
 *   2. **Ext Agent** — external agent bridge (HomeClaw, etc.). **Writable.**
 *      Toggling the checkbox persists `bridgeEnabled` via the home node.
 *
 * Previously this file was orphaned (defined but never imported). Phase 32
 * wires it into `SettingsAITab.tsx`, adds a 3-state status badge to the
 * Built-in block, and makes the Ext Agent block actually persist.
 */

import React, { useState, useEffect, useCallback } from "react";
import { useT } from "../../../context/I18nContext.js";
import {
  computeAiEngineMode,
  type AiEngineMode,
} from "@envoymesh/api";

interface EnvoyAIInfo {
  /** Persisted `openclawEnabled` flag from the home node. */
  enabled: boolean;
  /** Live status — is the gateway child process + webhook reachable? */
  running: boolean;
  /** Resolved webhook URL (e.g. http://127.0.0.1:18789/webhook/envoymesh). */
  url: string;
  /** Gateway child PID, when running. */
  childPid?: number;
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
  /** Persists the Ext Agent `enabled` flag (and other fields) to the home node. */
  onExtAgentSave: (config: ExtAgentConfig) => Promise<void>;
}

const MODE_LABEL_KEY: Record<AiEngineMode, string> = {
  "both": "settings.ai.aiEngine.modeBoth",
  "openclaw-only": "settings.ai.aiEngine.modeOpenclawOnly",
  "ext-only": "settings.ai.aiEngine.modeExtOnly",
  "off": "settings.ai.aiEngine.modeOff",
};

export function AgentSettings({ envoyAI, extAgent, onExtAgentSave }: Props) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ExtAgentConfig>(extAgent);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { setDraft(extAgent); }, [extAgent]);

  const mode = computeAiEngineMode(extAgent.enabled, envoyAI.enabled);

  const handleExtSave = useCallback(async () => {
    setSaving(true);
    try { await onExtAgentSave(draft); setSaved(true); setTimeout(() => setSaved(false), 2000); }
    catch (e) { console.error(e); }
    finally { setSaving(false); setEditing(false); }
  }, [draft, onExtAgentSave]);

  // 3-state status badge for the built-in block.
  const envoyStatusKey = !envoyAI.enabled
    ? "settings.ai.aiEngine.disabled"
    : envoyAI.running
      ? "settings.ai.aiEngine.running"
      : "settings.ai.aiEngine.stopped";
  const envoyStatusClass = !envoyAI.enabled
    ? "status-off"
    : envoyAI.running
      ? "status-on"
      : "status-warn";

  return (
    <div className="settings-agent">
      {/* ======== AI Engine Mode chip (derived from the two flags) ======== */}
      <div className="settings-agent-mode" data-mode={mode}>
        <span className={`status-badge status-${mode === "off" ? "off" : "on"}`}>
          {t(MODE_LABEL_KEY[mode])}
        </span>
        <p className="settings-hint">{t("settings.ai.aiEngine.restartHint")}</p>
      </div>

      {/* ======== EnvoyAI — Built-in (read-only) ======== */}
      <div className="settings-section">
        <div className="settings-section-header">
          <span className="settings-section-title">
            {t("settings.ai.aiEngine.envoyai")}
            <span className="settings-section-subtitle"> — OpenClaw</span>
          </span>
          <span className={`status-badge ${envoyStatusClass}`}>
            {t(envoyStatusKey)}
          </span>
        </div>
        <p className="settings-section-desc">{t("settings.ai.aiEngine.envoyaiDesc")}</p>
        <div className="settings-field readonly">
          <label>{t("settings.ai.aiEngine.provider")}</label>
          <input type="text" value="OpenClaw" readOnly disabled />
        </div>
        <div className="settings-field readonly">
          <label>{t("settings.ai.aiEngine.webhook")}</label>
          <input type="text" value={envoyAI.url || "—"} readOnly disabled />
        </div>
        {envoyAI.childPid != null && (
          <div className="settings-field readonly">
            <label>{"PID"}</label>
            <input type="text" value={String(envoyAI.childPid)} readOnly disabled />
          </div>
        )}
      </div>

      {/* ======== Ext Agent — External Bridge (writable) ======== */}
      <div className="settings-section">
        <div className="settings-section-header">
          <span className="settings-section-title">
            {t("settings.ai.aiEngine.extAgent")}
            {extAgent.configured && extAgent.name ? (
              <span className="settings-section-subtitle"> — {extAgent.name}</span>
            ) : (
              <span className="settings-section-subtitle dim"> — {t("settings.ai.aiEngine.notConfigured")}</span>
            )}
          </span>
          {extAgent.configured && (
            <span className="status-badge status-on">{t("settings.ai.aiEngine.active")}</span>
          )}
        </div>
        <p className="settings-section-desc">{t("settings.ai.aiEngine.extAgentDesc")}</p>

        {!editing ? (
          <>
            <div className="settings-field readonly">
              <label>{t("settings.ai.aiEngine.agentLabel")}</label>
              <input type="text" value={extAgent.name || "—"} readOnly disabled />
            </div>
            <div className="settings-field readonly">
              <label>{t("settings.ai.aiEngine.webhookUrl")}</label>
              <input type="text" value={extAgent.url || "—"} readOnly disabled />
            </div>
            <div className="settings-field readonly">
              <label>{t("settings.ai.aiEngine.listenPort")}</label>
              <input type="text" value={extAgent.listenPort?.toString() || "3031"} readOnly disabled />
            </div>
            <button className="btn btn-secondary" onClick={() => { setDraft(extAgent); setEditing(true); }}>
              {t("settings.ai.aiEngine.configure")}
            </button>
          </>
        ) : (
          <>
            <div className="settings-field">
              <label>{t("settings.ai.aiEngine.agentLabel")}</label>
              <input
                type="text"
                value={draft.name || ""}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="e.g. HomeClaw"
              />
            </div>
            <div className="settings-field">
              <label>{t("settings.ai.aiEngine.webhookUrl")}</label>
              <input
                type="text"
                value={draft.url || ""}
                onChange={(e) => setDraft({ ...draft, url: e.target.value })}
                placeholder="http://host.docker.internal:18790/message"
              />
            </div>
            <div className="settings-field">
              <label>{t("settings.ai.aiEngine.listenPort")}</label>
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
                {t("settings.ai.aiEngine.enableExtAgent")}
              </label>
            </div>
            <div className="settings-actions">
              <button className="btn btn-primary" onClick={() => void handleExtSave()} disabled={saving}>
                {saving ? t("settings.ai.aiEngine.saving") : saved ? t("settings.ai.aiEngine.saved") : t("settings.ai.aiEngine.save")}
              </button>
              <button className="btn btn-secondary" onClick={() => setEditing(false)}>
                {t("settings.ai.aiEngine.cancel")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
