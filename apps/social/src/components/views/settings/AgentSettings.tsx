/**
 * Settings → AI → AI Engine (Phase 32 + Phase 44 multi-agent registry).
 */

import React, { useState, useEffect, useCallback } from "react";
import { useT, type TFunction } from "../../../context/I18nContext.js";
import {
  computeAiEngineMode,
  type AiEngineMode,
  type ExtAgentReachability,
  type ExtAgentRegistryEntry,
} from "@envoymesh/api";
import { ExtAgentSetupGuides } from "./ExtAgentSetupGuides.js";
import {
  getExtAgentPreset,
  resolveExtAgentEntry,
  applyExtAgentPresetToDraft,
  applyCustomAgentSelectToDraft,
  finalizeExtAgentDraft,
  inferExtAgentIdFromDraft,
  listEditAgentSelectOptions,
  isCustomExtAgentSelection,
  slugifyExtAgentId,
  CUSTOM_EXT_AGENT_NEW_ID,
} from "../../../lib/ext-agent-defaults.js";

interface EnvoyAIInfo {
  enabled: boolean;
  running: boolean;
  url: string;
  childPid?: number;
}

export interface ExtAgentConfig {
  enabled: boolean;
  configured: boolean;
  name?: string;
  url?: string;
  listenPort?: number;
  activeExtAgent?: string;
  extAgents?: ExtAgentRegistryEntry[];
  adapter?: string;
  activeExtAgentId?: string | null;
  /** Health of the active backend (HTTP /status probe). */
  healthy?: boolean;
}

interface Props {
  envoyAI: EnvoyAIInfo;
  extAgent: ExtAgentConfig;
  onExtAgentSave: (config: ExtAgentConfig) => Promise<void>;
  /** Switch active backend without entering edit mode. */
  onQuickSwitch?: (activeExtAgentId: string) => Promise<void>;
  onRefreshHealth?: () => Promise<void>;
  refreshingHealth?: boolean;
  /** Node profile directory (for setup guide paths). */
  profileDir?: string;
}

const MODE_LABEL_KEY: Record<AiEngineMode, string> = {
  "both": "settings.ai.aiEngine.modeBoth",
  "openclaw-only": "settings.ai.aiEngine.modeOpenclawOnly",
  "ext-only": "settings.ai.aiEngine.modeExtOnly",
  "off": "settings.ai.aiEngine.modeOff",
};

function reachabilityLabelKey(r: ExtAgentReachability | undefined): string {
  switch (r) {
    case "running":
      return "settings.ai.aiEngine.statusRunning";
    case "stopped":
      return "settings.ai.aiEngine.statusStopped";
    case "disabled":
      return "settings.ai.aiEngine.statusDisabled";
    default:
      return "settings.ai.aiEngine.statusUnknown";
  }
}

function reachabilityClass(r: ExtAgentReachability | undefined): string {
  switch (r) {
    case "running":
      return "status-on";
    case "stopped":
      return "status-warn";
    case "disabled":
      return "status-off";
    default:
      return "status-warn";
  }
}

function backendOptionLabel(entry: ExtAgentRegistryEntry, t: TFunction): string {
  const suffix =
    entry.reachability === "running"
      ? t("settings.ai.aiEngine.setupGuides.optionRunning")
      : entry.reachability === "stopped"
        ? t("settings.ai.aiEngine.setupGuides.optionStopped")
        : "";
  return `${entry.name}${suffix}`;
}

export function AgentSettings({
  envoyAI,
  extAgent,
  onExtAgentSave,
  onQuickSwitch,
  onRefreshHealth,
  refreshingHealth = false,
  profileDir,
}: Props) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ExtAgentConfig>(extAgent);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [customAgentId, setCustomAgentId] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!editing) {
      setDraft(extAgent);
    }
  }, [extAgent, editing]);

  const mode = computeAiEngineMode(extAgent.enabled, envoyAI.enabled);
  const hasRegistry = (extAgent.extAgents?.length ?? 0) > 0;
  const enabledAgents = (extAgent.extAgents ?? []).filter((e) => e.enabled);
  const activeId = extAgent.activeExtAgentId ?? extAgent.activeExtAgent ?? "";
  const activeRegistryEntry = (extAgent.extAgents ?? []).find((e) => e.id === activeId);
  const resolvedActive = activeRegistryEntry
    ? resolveExtAgentEntry(activeRegistryEntry)
    : undefined;
  const activePreset = getExtAgentPreset(activeId);
  const activeHintKey = activePreset
    ? `settings.ai.aiEngine.${activePreset.hintKey}`
    : activeId
      ? "settings.ai.aiEngine.agentHintCustom"
      : "settings.ai.aiEngine.agentHintGeneric";

  const handleExtSave = useCallback(async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const draftActiveId = draft.activeExtAgentId ?? draft.activeExtAgent ?? "";
      if (draftActiveId === CUSTOM_EXT_AGENT_NEW_ID) {
        const id = slugifyExtAgentId(customAgentId || draft.name || "");
        if (!id || !(draft.url ?? "").trim() || !(draft.name ?? "").trim()) {
          setSaveError("settings.ai.aiEngine.customAgentSaveError");
          return;
        }
      }
      const toSave = finalizeExtAgentDraft(draft, customAgentId);
      await onExtAgentSave(toSave);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      setEditing(false);
      setCustomAgentId("");
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  }, [customAgentId, draft, onExtAgentSave]);

  const openConfigure = useCallback(() => {
    setDraft(extAgent);
    const currentId = extAgent.activeExtAgentId ?? extAgent.activeExtAgent ?? "";
    if (currentId && isCustomExtAgentSelection(currentId)) {
      setCustomAgentId(currentId);
    } else {
      setCustomAgentId("");
    }
    setSaveError(null);
    setEditing(true);
  }, [extAgent]);

  const handleQuickSwitch = useCallback(async (nextId: string) => {
    if (!onQuickSwitch || nextId === activeId || switching) return;
    setSwitching(true);
    try {
      await onQuickSwitch(nextId);
    } catch (e) {
      console.error("[AgentSettings] quick switch failed", e);
    } finally {
      setSwitching(false);
    }
  }, [activeId, onQuickSwitch, switching]);

  const handleEditAgentSelect = useCallback((nextId: string) => {
    setSaveError(null);
    if (nextId === CUSTOM_EXT_AGENT_NEW_ID || isCustomExtAgentSelection(nextId)) {
      if (nextId === CUSTOM_EXT_AGENT_NEW_ID) {
        setCustomAgentId("");
      } else {
        setCustomAgentId(nextId);
      }
      setDraft((prev) => applyCustomAgentSelectToDraft(
        prev,
        nextId,
        prev.extAgents ?? extAgent.extAgents ?? [],
      ));
      return;
    }
    setCustomAgentId("");
    setDraft((prev) => applyExtAgentPresetToDraft(prev, nextId));
  }, [extAgent.extAgents]);

  const draftActiveId = draft.activeExtAgentId
    ?? draft.activeExtAgent
    ?? (editing ? inferExtAgentIdFromDraft(draft) : activeId);
  const draftActivePreset = getExtAgentPreset(
    draftActiveId === CUSTOM_EXT_AGENT_NEW_ID ? undefined : draftActiveId,
  );
  const editAgentSelectOptions = listEditAgentSelectOptions(
    draft.extAgents ?? extAgent.extAgents ?? [],
  );
  const editingCustom = isCustomExtAgentSelection(draftActiveId);
  const editingNewCustom = draftActiveId === CUSTOM_EXT_AGENT_NEW_ID;

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

  const extReachable = extAgent.configured && extAgent.healthy === true;
  const extStatusKey = !extAgent.configured
    ? "settings.ai.aiEngine.notConfigured"
    : extAgent.healthy === undefined
      ? "settings.ai.aiEngine.statusUnknown"
      : extReachable
        ? "settings.ai.aiEngine.reachable"
        : "settings.ai.aiEngine.unreachable";
  const extStatusClass = !extAgent.configured
    ? "status-off"
    : extReachable
      ? "status-on"
      : "status-warn";

  return (
    <div className="settings-agent">
      <div className="settings-agent-mode" data-mode={mode}>
        <span className={`status-badge status-${mode === "off" ? "off" : "on"}`}>
          {t(MODE_LABEL_KEY[mode])}
        </span>
        <p className="settings-hint">{t("settings.ai.aiEngine.restartHint")}</p>
      </div>

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

      <div className="settings-section">
        <div className="settings-section-header">
          <span className="settings-section-title">
            {t("settings.ai.aiEngine.extAgent")}
            {!hasRegistry && extAgent.configured && extAgent.name ? (
              <span className="settings-section-subtitle"> — {extAgent.name}</span>
            ) : !hasRegistry && !extAgent.configured ? (
              <span className="settings-section-subtitle dim"> — {t("settings.ai.aiEngine.notConfigured")}</span>
            ) : null}
          </span>
          {extAgent.configured && (
            <span className={`status-badge ${extStatusClass}`}>
              {t(extStatusKey)}
            </span>
          )}
        </div>
        <p className="settings-section-desc">{t("settings.ai.aiEngine.extAgentDesc")}</p>

        {hasRegistry && !editing && (
          <div className="ext-agent-quick-start" aria-label={t("settings.ai.aiEngine.quickStartTitle")}>
            <p className="ext-agent-quick-start-title">{t("settings.ai.aiEngine.quickStartTitle")}</p>
            <ol className="ext-agent-quick-start-steps">
              <li>{hasRegistry && activeId ? t(activeHintKey) : t("settings.ai.aiEngine.quickStart1")}</li>
              <li>{t("settings.ai.aiEngine.quickStart2")}</li>
              <li>{t("settings.ai.aiEngine.quickStart3")}</li>
            </ol>
          </div>
        )}

        {!editing ? (
          <>
            {hasRegistry && onQuickSwitch && enabledAgents.length > 0 && (
              <div className="settings-field">
                <label>{t("settings.ai.aiEngine.activeAgent")}</label>
                <select
                  aria-label={t("settings.ai.aiEngine.activeAgent")}
                  value={activeId}
                  disabled={switching}
                  onChange={(e) => void handleQuickSwitch(e.target.value)}
                >
                  {enabledAgents.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {backendOptionLabel(entry, t)}
                    </option>
                  ))}
                </select>
                {switching && (
                  <p className="settings-hint">{t("settings.ai.aiEngine.switching")}</p>
                )}
              </div>
            )}
            {hasRegistry && !onQuickSwitch && (
              <div className="settings-field readonly">
                <label>{t("settings.ai.aiEngine.activeAgent")}</label>
                <input
                  type="text"
                  value={
                    enabledAgents.find((e) => e.id === activeId)?.name
                    ?? extAgent.name
                    ?? "—"
                  }
                  readOnly
                  disabled
                />
              </div>
            )}
            {hasRegistry && resolvedActive && (
              <div className="ext-agent-active-card">
                <div className="ext-agent-active-card-header">
                  <strong>{resolvedActive.name}</strong>
                  <span className={`status-badge ${reachabilityClass(activeRegistryEntry?.reachability)}`}>
                    {t(reachabilityLabelKey(activeRegistryEntry?.reachability))}
                  </span>
                </div>
                <p className="settings-hint">{t(activeHintKey)}</p>
                <div className="settings-field readonly">
                  <label>{t("settings.ai.aiEngine.agentConnectionUrl")}</label>
                  <input type="text" value={resolvedActive.url || "—"} readOnly disabled />
                </div>
                {activePreset && (
                  <div className="settings-field readonly">
                    <label>{t("settings.ai.aiEngine.agentLocalPort")}</label>
                    <input type="text" value={String(activePreset.port)} readOnly disabled />
                  </div>
                )}
              </div>
            )}
            {!hasRegistry && extAgent.adapter && (
              <div className="settings-field readonly">
                <label>{t("settings.ai.aiEngine.adapterProfile")}</label>
                <input type="text" value={extAgent.adapter} readOnly disabled />
              </div>
            )}
            {!hasRegistry && (
              <>
                <div className="settings-field readonly">
                  <label>{t("settings.ai.aiEngine.webhookUrl")}</label>
                  <input type="text" value={extAgent.url || "—"} readOnly disabled />
                </div>
                <div className="settings-field readonly">
                  <label>{t("settings.ai.aiEngine.listenPort")}</label>
                  <input type="text" value={extAgent.listenPort?.toString() || "3031"} readOnly disabled />
                </div>
              </>
            )}
            {hasRegistry && (
              <div className="settings-bridge-registry">
                <div className="settings-section-header">
                  <p className="settings-hint">{t("settings.ai.aiEngine.registryHint")}</p>
                  {onRefreshHealth && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={refreshingHealth}
                      onClick={() => void onRefreshHealth()}
                    >
                      {refreshingHealth
                        ? t("settings.ai.aiEngine.refreshingHealth")
                        : t("settings.ai.aiEngine.refreshHealth")}
                    </button>
                  )}
                </div>
                <table className="settings-table">
                  <thead>
                    <tr>
                      <th>{t("settings.ai.aiEngine.agentLabel")}</th>
                      <th>{t("settings.ai.aiEngine.status")}</th>
                      <th>{t("settings.ai.aiEngine.adapterProfile")}</th>
                      <th>{t("settings.ai.aiEngine.enabled")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(extAgent.extAgents ?? []).map((entry) => (
                      <tr key={entry.id} data-active={entry.id === activeId}>
                        <td>{entry.name}</td>
                        <td>
                          <span className={`status-badge ${reachabilityClass(entry.reachability)}`}>
                            {t(reachabilityLabelKey(entry.reachability))}
                          </span>
                        </td>
                        <td><code>{entry.adapter}</code></td>
                        <td>{entry.enabled ? t("settings.ai.aiEngine.yes") : t("settings.ai.aiEngine.no")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <button className="btn btn-secondary" onClick={openConfigure}>
              {t("settings.ai.aiEngine.configure")}
            </button>
            <ExtAgentSetupGuides
              registryAgentIds={(extAgent.extAgents ?? []).map((e) => e.id)}
              profileDir={profileDir}
            />
          </>
        ) : (
          <>
            <div className="settings-field">
              <label>{t("settings.ai.aiEngine.activeAgent")}</label>
              <select
                aria-label={t("settings.ai.aiEngine.activeAgent")}
                value={draftActiveId}
                onChange={(e) => handleEditAgentSelect(e.target.value)}
              >
                <optgroup label={t("settings.ai.aiEngine.bundledAgentsGroup")}>
                  {editAgentSelectOptions.bundled.map((entry) => (
                    <option key={entry.id} value={entry.id}>{entry.name}</option>
                  ))}
                </optgroup>
                {editAgentSelectOptions.custom.length > 0 && (
                  <optgroup label={t("settings.ai.aiEngine.customAgentsGroup")}>
                    {editAgentSelectOptions.custom.map((entry) => (
                      <option key={entry.id} value={entry.id}>{entry.name}</option>
                    ))}
                  </optgroup>
                )}
                <option value={CUSTOM_EXT_AGENT_NEW_ID}>
                  {t("settings.ai.aiEngine.addCustomAgent")}
                </option>
              </select>
            </div>
            {draftActivePreset && (
              <p className="settings-hint">
                {t(`settings.ai.aiEngine.${draftActivePreset.hintKey}`)}
              </p>
            )}
            {editingCustom && (
              <p className="settings-hint">{t("settings.ai.aiEngine.agentHintCustom")}</p>
            )}
            {editingCustom && (
              <div className="settings-field">
                <label>{t("settings.ai.aiEngine.customAgentId")}</label>
                <input
                  type="text"
                  value={customAgentId}
                  readOnly={!editingNewCustom}
                  disabled={!editingNewCustom}
                  onChange={(e) => setCustomAgentId(e.target.value)}
                  placeholder={t("settings.ai.aiEngine.customAgentIdPlaceholder")}
                />
                <p className="settings-hint">{t("settings.ai.aiEngine.customAgentIdHint")}</p>
              </div>
            )}
            <div className="settings-field">
              <label>{t("settings.ai.aiEngine.agentLabel")}</label>
              <input
                type="text"
                value={draft.name || ""}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder={draftActivePreset?.name ?? "e.g. HomeClaw"}
              />
            </div>
            <div className="settings-field">
              <label>{t("settings.ai.aiEngine.agentConnectionUrl")}</label>
              <input
                type="text"
                value={draft.url || ""}
                onChange={(e) => setDraft({ ...draft, url: e.target.value })}
                placeholder={draftActivePreset?.url ?? "http://127.0.0.1:8010/message"}
              />
            </div>
            {(draft.adapter || draftActivePreset) && (
              <div className="settings-field readonly">
                <label>{t("settings.ai.aiEngine.adapterProfile")}</label>
                <input
                  type="text"
                  value={draft.adapter || draftActivePreset?.adapter || "envoymesh-message"}
                  readOnly
                  disabled
                />
              </div>
            )}
            {!hasRegistry && (
              <div className="settings-field">
                <label>{t("settings.ai.aiEngine.listenPort")}</label>
                <input
                  type="number"
                  value={draft.listenPort ?? 3031}
                  onChange={(e) => setDraft({ ...draft, listenPort: parseInt(e.target.value) || 3031 })}
                />
              </div>
            )}
            {saveError && (
              <p className="settings-hint settings-error" role="alert">{t(saveError)}</p>
            )}
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
