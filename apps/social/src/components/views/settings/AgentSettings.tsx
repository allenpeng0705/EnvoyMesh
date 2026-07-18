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

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useT } from "../../../context/I18nContext.js";
import {
  computeAiEngineMode,
  DEFAULT_EXT_AGENTS,
  mergeExtAgentPresets,
  type AiEngineMode,
  type ExtAgentDefinition,
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
  /** Last stop/failure reason recorded by the runtime. Null when healthy. */
  lastError?: string | null;
  /** ISO timestamp of `lastError`. Null when `lastError` is null. */
  lastErrorAt?: string | null;
  /**
   * Number of consecutive restart attempts since the last successful start.
   * 0 when running cleanly. Lets the UI show the watchdog is in a fail loop.
   */
  consecutiveRestartFailures?: number;
}

interface ExtAgentConfig {
  enabled: boolean;
  configured: boolean;
  name?: string;
  url?: string;
  listenPort?: number;
  activeExtAgentId?: string;
  extAgents?: ExtAgentDefinition[];
}

interface Props {
  envoyAI: EnvoyAIInfo;
  extAgent: ExtAgentConfig;
  /** Persists Ext Agent settings to the home node (synced to mobile). */
  onExtAgentSave: (config: ExtAgentConfig) => Promise<void>;
  /**
   * Force-restart the built-in OpenClaw gateway. Wired to the "Restart now"
   * button that appears next to the error block when the runtime has a
   * recorded failure. Returns the post-restart status; the parent updates
   * its state from that and re-renders.
   */
  onRestartOpenClaw?: () => Promise<void>;
  /** True while a `onRestartOpenClaw` call is in flight. Disables the button. */
  restartingOpenClaw?: boolean;
}

const MODE_LABEL_KEY: Record<AiEngineMode, string> = {
  "both": "settings.ai.aiEngine.modeBoth",
  "openclaw-only": "settings.ai.aiEngine.modeOpenclawOnly",
  "ext-only": "settings.ai.aiEngine.modeExtOnly",
  "off": "settings.ai.aiEngine.modeOff",
};

const MODE_DESC_KEY: Record<AiEngineMode, string> = {
  "both": "settings.ai.aiEngine.modeDescBoth",
  "openclaw-only": "settings.ai.aiEngine.modeDescOpenclawOnly",
  "ext-only": "settings.ai.aiEngine.modeDescExtOnly",
  "off": "settings.ai.aiEngine.modeDescOff",
};

function withMergedAgents(config: ExtAgentConfig): ExtAgentConfig {
  const extAgents = mergeExtAgentPresets(config.extAgents);
  const activeExtAgentId =
    config.activeExtAgentId?.trim() ||
    extAgents.find((a) => a.enabled)?.id ||
    DEFAULT_EXT_AGENTS[0]?.id;
  const active = extAgents.find((a) => a.id === activeExtAgentId) ?? extAgents[0];
  return {
    ...config,
    extAgents,
    activeExtAgentId: active?.id,
    name: config.name ?? active?.name,
    url: config.url ?? active?.url,
  };
}

export function AgentSettings({ envoyAI, extAgent, onExtAgentSave, onRestartOpenClaw, restartingOpenClaw }: Props) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ExtAgentConfig>(() => withMergedAgents(extAgent));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [restartError, setRestartError] = useState<string | null>(null);

  const handleRestart = useCallback(async () => {
    if (!onRestartOpenClaw) return;
    setRestartError(null);
    try {
      await onRestartOpenClaw();
    } catch (e) {
      setRestartError(e instanceof Error ? e.message : String(e));
    }
  }, [onRestartOpenClaw]);

  useEffect(() => {
    if (editing) return;
    setDraft(withMergedAgents(extAgent));
  }, [
    editing,
    extAgent.enabled,
    extAgent.configured,
    extAgent.name,
    extAgent.url,
    extAgent.listenPort,
    extAgent.activeExtAgentId,
    extAgent.extAgents,
  ]);

  const selectableAgents = useMemo(
    () => mergeExtAgentPresets(draft.extAgents),
    [draft.extAgents],
  );

  const mode = computeAiEngineMode(extAgent.enabled, envoyAI.enabled);

  const selectAgent = useCallback((agentId: string) => {
    setDraft((prev) => {
      const extAgents = mergeExtAgentPresets(prev.extAgents);
      const selected = extAgents.find((a) => a.id === agentId);
      if (!selected) return prev;
      return {
        ...prev,
        extAgents,
        activeExtAgentId: selected.id,
        name: selected.name,
        url: selected.url,
      };
    });
  }, []);

  const updateActiveAgentUrl = useCallback((url: string) => {
    setDraft((prev) => {
      const activeId = prev.activeExtAgentId;
      const extAgents = mergeExtAgentPresets(prev.extAgents).map((agent) =>
        agent.id === activeId ? { ...agent, url } : agent,
      );
      const active = extAgents.find((a) => a.id === activeId);
      return {
        ...prev,
        extAgents,
        url,
        name: active?.name ?? prev.name,
      };
    });
  }, []);

  const handleExtSave = useCallback(async () => {
    setSaving(true);
    try {
      await onExtAgentSave(withMergedAgents(draft));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
      setEditing(false);
    }
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

  const activeAgentLabel =
    selectableAgents.find((a) => a.id === extAgent.activeExtAgentId)?.name ||
    extAgent.name ||
    "—";

  return (
    <div className="settings-agent" data-mode={mode}>
      {/* ======== Top-of-section mode summary (one row, not a card) ========
          Replaces the old "settings-agent-mode" card which added visual
          weight to a derived status indicator. Now: a single quiet row
          with the mode label + one-line description. No bordered box. */}
      <div className="agent-mode-summary">
        <span className="agent-mode-label">{t("settings.ai.aiEngine.modeLabel")}</span>
        <span className={`agent-mode-chip agent-mode-chip--${mode}`}>
          {t(MODE_LABEL_KEY[mode])}
        </span>
        <span className="agent-mode-desc">{t(MODE_DESC_KEY[mode])}</span>
      </div>

      {/* ======== Built-in OpenClaw — read-only block ======== */}
      <div className="agent-block agent-block--readonly">
        <div className="agent-block-header">
          <div className="agent-block-titlerow">
            <span className="agent-block-icon agent-block-icon--ai">
              {t("settings.ai.aiEngine.iconBuiltIn")}
            </span>
            <div className="agent-block-titlewrap">
              <span className="agent-block-title">
                {t("settings.ai.aiEngine.envoyai")}
              </span>
              <span className="agent-block-subtitle">OpenClaw</span>
            </div>
          </div>
          <span className={`agent-block-status agent-block-status--${envoyStatusClass.replace("status-", "")}`}>
            {t(envoyStatusKey)}
          </span>
        </div>
        <p className="agent-block-desc">{t("settings.ai.aiEngine.envoyaiDesc")}</p>
        <dl className="agent-block-fields">
          <div className="agent-field agent-field--readonly">
            <dt>{t("settings.ai.aiEngine.provider")}</dt>
            <dd>OpenClaw</dd>
          </div>
          <div className="agent-field agent-field--readonly">
            <dt>{t("settings.ai.aiEngine.webhook")}</dt>
            <dd className="agent-field-value--mono">{envoyAI.url || "—"}</dd>
          </div>
          {envoyAI.childPid != null && (
            <div className="agent-field agent-field--readonly">
              <dt>PID</dt>
              <dd className="agent-field-value--mono">{envoyAI.childPid}</dd>
            </div>
          )}
        </dl>
        {/*
          Surface "why is it stopped" alongside the status badge. Only shown
          when there's a recorded failure (lastError) — a clean stop with no
          cause isn't a problem worth a red banner for.
        */}
        {envoyAI.lastError && (
          <div className="openclaw-error">
            <div className="openclaw-error-header">
              <span className="openclaw-error-label">
                {t("settings.ai.aiEngine.lastError")}
              </span>
              <div className="openclaw-error-meta">
                {envoyAI.lastErrorAt && (
                  <span className="openclaw-error-time">
                    {t("settings.ai.aiEngine.lastErrorAt", {
                      time: new Date(envoyAI.lastErrorAt).toLocaleString(),
                    })}
                  </span>
                )}
                {(envoyAI.consecutiveRestartFailures ?? 0) > 0 && (
                  <span className="openclaw-error-restarts">
                    {t("settings.ai.aiEngine.restartAttempts", {
                      count: envoyAI.consecutiveRestartFailures ?? 0,
                    })}
                  </span>
                )}
              </div>
            </div>
            <div className="openclaw-error-message">{envoyAI.lastError}</div>
            <div className="openclaw-error-hint">
              {t("settings.ai.aiEngine.lastErrorHint")}
            </div>
            {onRestartOpenClaw && (
              <div className="openclaw-error-actions">
                <button
                  className="btn btn-primary"
                  onClick={() => void handleRestart()}
                  disabled={restartingOpenClaw}
                >
                  {restartingOpenClaw
                    ? t("settings.ai.aiEngine.restarting")
                    : t("settings.ai.aiEngine.restartNow")}
                </button>
                {restartError && (
                  <span className="openclaw-error-restart-fail">{restartError}</span>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ======== Ext Agent — External Bridge (writable) ======== */}
      <div className="agent-block">
        <div className="agent-block-header">
          <div className="agent-block-titlerow">
            <span className="agent-block-icon agent-block-icon--ext">
              {t("settings.ai.aiEngine.iconExtAgent")}
            </span>
            <div className="agent-block-titlewrap">
              <span className="agent-block-title">
                {t("settings.ai.aiEngine.extAgent")}
              </span>
              {extAgent.configured && activeAgentLabel !== "—" ? (
                <span className="agent-block-subtitle">{activeAgentLabel}</span>
              ) : (
                <span className="agent-block-subtitle agent-block-subtitle--dim">
                  {t("settings.ai.aiEngine.notConfigured")}
                </span>
              )}
            </div>
          </div>
          {extAgent.configured && (
            <span className="agent-block-status agent-block-status--on">
              {t("settings.ai.aiEngine.active")}
            </span>
          )}
        </div>
        <p className="agent-block-desc">{t("settings.ai.aiEngine.extAgentDesc")}</p>

        {!editing ? (
          <>
            <dl className="agent-block-fields">
              <div className="agent-field agent-field--readonly">
                <dt>{t("settings.ai.aiEngine.selectAgent")}</dt>
                <dd>{activeAgentLabel}</dd>
              </div>
              <div className="agent-field agent-field--readonly">
                <dt>{t("settings.ai.aiEngine.webhookUrl")}</dt>
                <dd className="agent-field-value--mono">{extAgent.url || "—"}</dd>
              </div>
              <div className="agent-field agent-field--readonly">
                <dt>{t("settings.ai.aiEngine.listenPort")}</dt>
                <dd className="agent-field-value--mono">{extAgent.listenPort ?? 3031}</dd>
              </div>
            </dl>
            <div className="agent-block-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => { setDraft(withMergedAgents(extAgent)); setEditing(true); }}
              >
                {t("settings.ai.aiEngine.configure")}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="agent-block-fields">
              <div className="agent-field">
                <label className="agent-field-label">
                  {t("settings.ai.aiEngine.selectAgent")}
                </label>
                <select
                  className="agent-field-input"
                  value={draft.activeExtAgentId ?? ""}
                  onChange={(e) => selectAgent(e.target.value)}
                >
                  {selectableAgents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="agent-field">
                <label className="agent-field-label">
                  {t("settings.ai.aiEngine.webhookUrl")}
                </label>
                <input
                  type="text"
                  className="agent-field-input agent-field-input--mono"
                  value={draft.url || ""}
                  onChange={(e) => updateActiveAgentUrl(e.target.value)}
                  placeholder="http://127.0.0.1:8010/message"
                />
              </div>
              <div className="agent-field">
                <label className="agent-field-label">
                  {t("settings.ai.aiEngine.listenPort")}
                </label>
                <input
                  type="number"
                  className="agent-field-input agent-field-input--mono"
                  value={draft.listenPort ?? 3031}
                  onChange={(e) => setDraft({ ...draft, listenPort: parseInt(e.target.value, 10) || 3031 })}
                />
              </div>
            </div>
            <div className="agent-field agent-field--checkbox">
              <label className="agent-field-label agent-field-label--inline">
                <input
                  type="checkbox"
                  checked={draft.enabled}
                  onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
                />
                <span>{t("settings.ai.aiEngine.enableExtAgent")}</span>
              </label>
            </div>
            <div className="agent-block-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void handleExtSave()}
                disabled={saving}
              >
                {saving
                  ? t("settings.ai.aiEngine.saving")
                  : saved
                    ? t("settings.ai.aiEngine.saved")
                    : t("settings.ai.aiEngine.save")}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setEditing(false)}
              >
                {t("settings.ai.aiEngine.cancel")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
