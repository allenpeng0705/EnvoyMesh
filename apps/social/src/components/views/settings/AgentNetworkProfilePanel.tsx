/**
 * Settings editor for owner-attested Agent Network worker profile.
 *
 * Rendered inside Team jobs → "Your worker profile" inline section (via
 * WorkerMembershipSection). The profile is advertised on the Agent Card
 * only when Join Agent Network (Join Agent Network) is enabled.
 *
 * UX: role presets one-click fill + auto-save every field; the technical
 * sliders (freshness / spend / context / throughput) live in a collapsed
 * "Fine-tune" section with a live summary so casual users never need to
 * touch them.
 */

import { useCallback, useEffect, useState } from "react";
import type {
  AgentNetworkContextWindow,
  AgentNetworkProfile,
  AgentNetworkRoleId,
  AgentNetworkSpendPosture,
} from "@envoymesh/protocol";
import {
  AGENT_NETWORK_WELL_KNOWN_ROLES,
  DEFAULT_AGENT_NETWORK_PROFILE,
  agentNetworkPrimaryRole,
  agentNetworkRoleIds,
  agentNetworkSkillIds,
  createAgentNetworkProfile,
  createOwnerDomainSkill,
} from "@envoymesh/protocol";
import { useT } from "../../../context/I18nContext.js";
import { useNodeService } from "../../../hooks/useNodeService.js";
import { useToast } from "../../../hooks/useToast.js";
import {
  agentNetworkRoleLabel,
  draftToAgentNetworkRoleId,
} from "../../../lib/agent-network-role-label.js";

/** Skill taxonomy — grouped so the menu reads as a sensible taxonomy
 * (Analytical → STEM → Language → Creative) rather than an arbitrary
 * grab-bag. Skills are stored as owner domain entries; the
 * localized label is looked up at render time. Custom skills the user
 * types in are kept as-is (raw lowercase). */
interface SkillGroup {
  id: "analytical" | "stem" | "language" | "creative";
  skills: string[];
}

const SKILL_GROUPS: SkillGroup[] = [
  { id: "analytical", skills: ["research", "analysis", "reasoning"] },
  { id: "stem", skills: ["mathematics", "physics", "coding", "engineering"] },
  { id: "language", skills: ["writing", "summarization", "translation"] },
  { id: "creative", skills: ["creative", "design"] },
];

/** Every known skill id — used to recognize preset tags in the summary
 * line so they render with their localized label instead of the raw id. */
const KNOWN_SKILLS = new Set(SKILL_GROUPS.flatMap((g) => g.skills));

/** i18n prefix — Settings → Agent Network → membership. */
const K = "settings.agentNetwork.membership";

interface ProfilePreset {
  id: string;
  emoji: string;
  modelFreshness: number;
  spendPosture: AgentNetworkSpendPosture;
  contextWindow: AgentNetworkContextWindow;
  skills: string[];
}

/** One-click skill/profile presets (not collaboration roles). */
const PROFILE_PRESETS: ProfilePreset[] = [
  { id: "researcher", emoji: "🔬", modelFreshness: 8, spendPosture: "subscription", contextWindow: "256k", skills: ["research", "summarization", "writing"] },
  { id: "coder", emoji: "💻", modelFreshness: 9, spendPosture: "subscription", contextWindow: "256k", skills: ["coding"] },
  { id: "writer", emoji: "✍️", modelFreshness: 6, spendPosture: "unknown", contextWindow: "128k", skills: ["writing", "translation"] },
  { id: "general", emoji: "🧰", modelFreshness: 5, spendPosture: "unknown", contextWindow: "128k", skills: [] },
  { id: "budget", emoji: "💰", modelFreshness: 4, spendPosture: "metered", contextWindow: "128k", skills: [] },
];

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

/** Returns the id of the preset whose fields exactly match the profile, or null. */
function matchingPreset(profile: AgentNetworkProfile): string | null {
  const ids = agentNetworkSkillIds(profile.skills);
  for (const p of PROFILE_PRESETS) {
    if (
      profile.modelFreshness === p.modelFreshness &&
      profile.spendPosture === p.spendPosture &&
      profile.contextWindow === p.contextWindow &&
      arraysEqual(ids, p.skills)
    ) {
      return p.id;
    }
  }
  return null;
}

function toggleOwnerSkill(profile: AgentNetworkProfile, tag: string, on: boolean): AgentNetworkProfile {
  const ids = agentNetworkSkillIds(profile.skills);
  const nextIds = on ? ids.filter((s) => s !== tag) : [...ids, tag].slice(0, 16);
  return {
    ...profile,
    skills: nextIds.map((id) => createOwnerDomainSkill(id)),
  };
}

export function AgentNetworkProfilePanel({ enabled }: { enabled: boolean }) {
  const t = useT();
  const nodeService = useNodeService();
  const { showToast } = useToast();
  const [profile, setProfile] = useState<AgentNetworkProfile>({ ...DEFAULT_AGENT_NETWORK_PROFILE });
  const [skillDraft, setSkillDraft] = useState("");
  const [roleDraft, setRoleDraft] = useState("");
  const [roleDraftError, setRoleDraftError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showFineTune, setShowFineTune] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void nodeService.getNodeConfig().then((cfg) => {
      if (cancelled) return;
      if (cfg.agentNetworkProfile) {
        setProfile(createAgentNetworkProfile(cfg.agentNetworkProfile));
      }
    }).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [nodeService]);

  const persist = useCallback(
    async (next: AgentNetworkProfile, successMsg?: string) => {
      setSaving(true);
      try {
        await nodeService.updateNodeConfig({ agentNetworkProfile: next });
        showToast(successMsg ?? t(`${K}.saved`), "success");
      } catch (err) {
        showToast(err instanceof Error ? err.message : String(err), "error");
      } finally {
        setSaving(false);
      }
    },
    [nodeService, showToast, t],
  );

  const save = useCallback(() => void persist(profile), [persist, profile]);

  /** One-click: fill skill/profile fields from a preset and auto-save (keeps role). */
  const applyPreset = useCallback(
    (preset: ProfilePreset) => {
      const next = createAgentNetworkProfile({
        modelFreshness: preset.modelFreshness,
        spendPosture: preset.spendPosture,
        contextWindow: preset.contextWindow,
        skills: preset.skills.map((id) => createOwnerDomainSkill(id)),
        roles: profile.roles,
        throughputTokensPerSec: profile.throughputTokensPerSec,
      });
      setProfile(next);
      void persist(next, t(`${K}.presetApplied`, { name: t(`${K}.preset_${preset.id}`) }));
    },
    [persist, profile.roles, profile.throughputTokensPerSec, t],
  );

  const setPrimaryRole = useCallback(
    (role: AgentNetworkRoleId | "") => {
      const next = createAgentNetworkProfile({
        ...profile,
        roles: role ? [role] : [],
      });
      setProfile(next);
      void persist(next, t(`${K}.roleSaved`));
    },
    [persist, profile, t],
  );

  const commitRoleDraft = useCallback(() => {
    const role = draftToAgentNetworkRoleId(roleDraft);
    if (!role) {
      setRoleDraftError(t(`${K}.roleCustomInvalid`));
      return;
    }
    setRoleDraftError(null);
    setRoleDraft("");
    setPrimaryRole(role);
  }, [roleDraft, setPrimaryRole, t]);

  if (!enabled) {
    return (
      <p className="field-desc" data-testid="agent-network-profile-disabled">
        {t(`${K}.enableFirst`)}
      </p>
    );
  }

  const activePresetId = matchingPreset(profile);
  const primaryRole = agentNetworkPrimaryRole(profile.roles) ?? "";
  const customRolesInProfile = agentNetworkRoleIds(profile.roles).filter((r) =>
    r.startsWith("custom:"),
  );

  return (
    <div className="agent-network-profile-panel" data-testid="agent-network-profile-panel">
      <p className="field-desc">{t(`${K}.profileDesc`)}</p>

      {/* ---- Collaboration role (Team job seats) ---- */}
      <div className="form-group" data-testid="agent-network-primary-role">
        <label htmlFor="anp-primary-role">{t(`${K}.primaryRole`)}</label>
        <select
          id="anp-primary-role"
          className="settings-input"
          value={primaryRole}
          disabled={saving}
          onChange={(e) => {
            const v = e.target.value;
            setPrimaryRole(v === "" ? "" : (v as AgentNetworkRoleId));
          }}
        >
          <option value="">{t(`${K}.roleNone`)}</option>
          {AGENT_NETWORK_WELL_KNOWN_ROLES.map((role) => (
            <option key={role} value={role}>
              {t(`${K}.role_${role}`)}
            </option>
          ))}
          {customRolesInProfile.map((role) => (
            <option key={role} value={role}>
              {agentNetworkRoleLabel(role, t)}
            </option>
          ))}
        </select>
        <div className="agent-network-role-add">
          <input
            type="text"
            id="anp-custom-role"
            className="settings-input"
            data-testid="agent-network-custom-role-input"
            value={roleDraft}
            disabled={saving}
            placeholder={t(`${K}.roleCustomPlaceholder`)}
            onChange={(e) => {
              setRoleDraft(e.target.value);
              if (roleDraftError) setRoleDraftError(null);
            }}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              commitRoleDraft();
            }}
          />
        </div>
        {roleDraftError ? (
          <small className="field-desc" data-testid="agent-network-custom-role-error">
            {roleDraftError}
          </small>
        ) : (
          <small className="field-desc">{t(`${K}.primaryRoleHint`)}</small>
        )}
      </div>

      {/* ---- Quick setup: skill presets ---- */}
      <div className="an-profile__presets">
        <p className="an-profile__presets-label">{t(`${K}.presetTitle`)}</p>
        <div className="an-profile__preset-row">
          {PROFILE_PRESETS.map((preset) => {
            const on = activePresetId === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                className={`an-profile__preset ${on ? "an-profile__preset--active" : ""}`}
                disabled={saving}
                onClick={() => applyPreset(preset)}
                aria-pressed={on}
              >
                <span className="an-profile__preset-emoji">{preset.emoji}</span>
                <span className="an-profile__preset-label">{t(`${K}.preset_${preset.id}`)}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ---- Strengths (intuitive — always visible) ---- */}
      <div className="form-group">
        <label>{t(`${K}.skills`)}</label>
        <div className="agent-network-skills">
          {SKILL_GROUPS.map((group) => (
            <div key={group.id} className="an-skill-group">
              <span className="an-skill-group__label">
                {t(`${K}.skillGroup_${group.id}`)}
              </span>
              <div className="an-skill-group__chips">
                {group.skills.map((tag) => {
                  const ids = agentNetworkSkillIds(profile.skills);
                  const on = ids.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      className={
                        on ? "an-skill-chip an-skill-chip--on" : "an-skill-chip"
                      }
                      aria-pressed={on}
                      onClick={() => setProfile((p) => toggleOwnerSkill(p, tag, on))}
                    >
                      {t(`${K}.skill_${tag}`)}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="agent-network-skill-add">
          <input
            type="text"
            className="settings-input"
            value={skillDraft}
            placeholder={t(`${K}.skillPlaceholder`)}
            onChange={(e) => setSkillDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              const tag = skillDraft.trim().toLowerCase();
              if (!tag) return;
              setProfile((p) => {
                const ids = agentNetworkSkillIds(p.skills);
                if (ids.includes(tag)) return p;
                return toggleOwnerSkill(p, tag, false);
              });
              setSkillDraft("");
            }}
          />
        </div>
        {agentNetworkSkillIds(profile.skills).length > 0 ? (
          <p className="field-desc">
            {agentNetworkSkillIds(profile.skills)
              .map((s) => (KNOWN_SKILLS.has(s) ? t(`${K}.skill_${s}`) : s))
              .join(", ")}
          </p>
        ) : null}
      </div>

      {/* ---- Fine-tune (collapsed by default) ---- */}
      <div className="an-profile__fine-tune">
        <button
          type="button"
          className="an-profile__fine-tune-toggle"
          aria-expanded={showFineTune}
          onClick={() => setShowFineTune((v) => !v)}
        >
          <span className="an-profile__fine-tune-chevron">{showFineTune ? "▾" : "▸"}</span>
          <span>{t(`${K}.llmProvider`)}</span>
          <span className="an-profile__fine-tune-summary">
            {profile.modelFreshness}/10 · {profile.spendPosture} · {profile.contextWindow}
            {profile.throughputTokensPerSec ? ` · ${profile.throughputTokensPerSec} tok/s` : ""}
          </span>
        </button>
        {showFineTune ? (
          <div className="an-profile__fine-tune-body">
            <p className="field-desc">{t(`${K}.llmProviderHint`)}</p>
            <div className="form-group">
              <label htmlFor="anp-freshness">{t(`${K}.freshness`)}</label>
              <input
                id="anp-freshness"
                type="range"
                min={1}
                max={10}
                value={profile.modelFreshness}
                onChange={(e) =>
                  setProfile((p) => ({ ...p, modelFreshness: Number(e.target.value) }))
                }
              />
              <span className="field-desc">
                {profile.modelFreshness}/10 — {t(`${K}.freshnessHint`)}
              </span>
            </div>

            <div className="form-group">
              <label htmlFor="anp-spend">{t(`${K}.spendPosture`)}</label>
              <select
                id="anp-spend"
                className="settings-input"
                value={profile.spendPosture}
                onChange={(e) =>
                  setProfile((p) => ({
                    ...p,
                    spendPosture: e.target.value as AgentNetworkSpendPosture,
                  }))
                }
              >
                <option value="subscription">{t(`${K}.spendSubscription`)}</option>
                <option value="metered">{t(`${K}.spendMetered`)}</option>
                <option value="unknown">{t(`${K}.spendUnknown`)}</option>
              </select>
              <small className="field-desc">{t(`${K}.spendHint`)}</small>
            </div>

            <div className="form-group">
              <label htmlFor="anp-ctx">{t(`${K}.contextWindow`)}</label>
              <select
                id="anp-ctx"
                className="settings-input"
                value={profile.contextWindow}
                onChange={(e) =>
                  setProfile((p) => ({
                    ...p,
                    contextWindow: e.target.value as AgentNetworkContextWindow,
                  }))
                }
              >
                <option value="128k">128k</option>
                <option value="256k">256k</option>
                <option value="512k">512k</option>
                <option value="1M+">1M+</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="anp-throughput">{t(`${K}.throughput`)}</label>
              <input
                id="anp-throughput"
                type="number"
                className="settings-input"
                min={0}
                max={1000000}
                step={1}
                value={profile.throughputTokensPerSec ?? ""}
                placeholder={t(`${K}.throughputPlaceholder`)}
                onChange={(e) => {
                  const raw = e.target.value;
                  setProfile((p) => ({
                    ...p,
                    throughputTokensPerSec: raw === "" ? undefined : Number(raw),
                  }));
                }}
              />
              <small className="field-desc">{t(`${K}.throughputHint`)}</small>
            </div>
          </div>
        ) : null}
      </div>

      <div className="an-profile__footer">
        <button
          type="button"
          className="btn-primary an-profile__save"
          disabled={saving}
          onClick={save}
        >
          {saving ? t(`${K}.saving`) : t(`${K}.save`)}
        </button>
      </div>
    </div>
  );
}
