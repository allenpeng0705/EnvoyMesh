/**
 * Settings editor for owner-attested Agent Network worker profile.
 *
 * Rendered inside Team jobs → "Your worker profile" inline section (via
 * WorkerMembershipSection). The profile is advertised on the Agent Card
 * only when Join Agent Network (Capability Provider) is enabled.
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
  AgentNetworkSpendPosture,
} from "@envoymesh/protocol";
import { DEFAULT_AGENT_NETWORK_PROFILE } from "@envoymesh/protocol";
import { useT } from "../../../context/I18nContext.js";
import { useNodeService } from "../../../hooks/useNodeService.js";
import { useToast } from "../../../hooks/useToast.js";

/** Strength taxonomy — grouped so the menu reads as a sensible taxonomy
 * (Analytical → STEM → Language → Creative) rather than an arbitrary
 * grab-bag. Strengths are stored as their id in the profile; the
 * localized label is looked up at render time. Custom strengths the user
 * types in are kept as-is (raw lowercase). */
interface StrengthGroup {
  id: "analytical" | "stem" | "language" | "creative";
  strengths: string[];
}

const STRENGTH_GROUPS: StrengthGroup[] = [
  { id: "analytical", strengths: ["research", "analysis", "reasoning"] },
  { id: "stem", strengths: ["mathematics", "physics", "coding", "engineering"] },
  { id: "language", strengths: ["writing", "summarization", "translation"] },
  { id: "creative", strengths: ["creative", "design"] },
];

/** Every known strength id — used to recognize preset tags in the summary
 * line so they render with their localized label instead of the raw id. */
const KNOWN_STRENGTHS = new Set(STRENGTH_GROUPS.flatMap((g) => g.strengths));

/** i18n prefix — Settings → Agent Network → membership. */
const K = "settings.agentNetwork.membership";

interface ProfilePreset {
  id: string;
  emoji: string;
  modelFreshness: number;
  spendPosture: AgentNetworkSpendPosture;
  contextWindow: AgentNetworkContextWindow;
  strengths: string[];
}

/** One-click role presets. Each fills every profile field. */
const PROFILE_PRESETS: ProfilePreset[] = [
  { id: "researcher", emoji: "🔬", modelFreshness: 8, spendPosture: "subscription", contextWindow: "256k", strengths: ["research", "summarization", "writing"] },
  { id: "coder", emoji: "💻", modelFreshness: 9, spendPosture: "subscription", contextWindow: "256k", strengths: ["coding"] },
  { id: "writer", emoji: "✍️", modelFreshness: 6, spendPosture: "unknown", contextWindow: "128k", strengths: ["writing", "translation"] },
  { id: "general", emoji: "🧰", modelFreshness: 5, spendPosture: "unknown", contextWindow: "128k", strengths: [] },
  { id: "budget", emoji: "💰", modelFreshness: 4, spendPosture: "metered", contextWindow: "128k", strengths: [] },
];

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

/** Returns the id of the preset whose fields exactly match the profile, or null. */
function matchingPreset(profile: AgentNetworkProfile): string | null {
  for (const p of PROFILE_PRESETS) {
    if (
      profile.modelFreshness === p.modelFreshness &&
      profile.spendPosture === p.spendPosture &&
      profile.contextWindow === p.contextWindow &&
      arraysEqual(profile.strengths, p.strengths)
    ) {
      return p.id;
    }
  }
  return null;
}

export function AgentNetworkProfilePanel({ enabled }: { enabled: boolean }) {
  const t = useT();
  const nodeService = useNodeService();
  const { showToast } = useToast();
  const [profile, setProfile] = useState<AgentNetworkProfile>({ ...DEFAULT_AGENT_NETWORK_PROFILE });
  const [strengthDraft, setStrengthDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [showFineTune, setShowFineTune] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void nodeService.getNodeConfig().then((cfg) => {
      if (cancelled) return;
      if (cfg.agentNetworkProfile) {
        setProfile({ ...DEFAULT_AGENT_NETWORK_PROFILE, ...cfg.agentNetworkProfile });
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

  /** One-click: fill every field from a preset and auto-save. */
  const applyPreset = useCallback(
    (preset: ProfilePreset) => {
      const next: AgentNetworkProfile = {
        modelFreshness: preset.modelFreshness,
        spendPosture: preset.spendPosture,
        contextWindow: preset.contextWindow,
        strengths: [...preset.strengths],
        throughputTokensPerSec: profile.throughputTokensPerSec,
      };
      setProfile(next);
      void persist(next, t(`${K}.presetApplied`, { name: t(`${K}.preset_${preset.id}`) }));
    },
    [persist, profile.throughputTokensPerSec, t],
  );

  if (!enabled) {
    return (
      <p className="field-desc" data-testid="agent-network-profile-disabled">
        {t(`${K}.enableFirst`)}
      </p>
    );
  }

  const activePresetId = matchingPreset(profile);

  return (
    <div className="agent-network-profile-panel" data-testid="agent-network-profile-panel">
      <p className="field-desc">{t(`${K}.profileDesc`)}</p>

      {/* ---- Quick setup: role presets ---- */}
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
        <label>{t(`${K}.strengths`)}</label>
        <div className="agent-network-strengths">
          {STRENGTH_GROUPS.map((group) => (
            <div key={group.id} className="an-strength-group">
              <span className="an-strength-group__label">
                {t(`${K}.strengthGroup_${group.id}`)}
              </span>
              <div className="an-strength-group__chips">
                {group.strengths.map((tag) => {
                  const on = profile.strengths.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      className={
                        on ? "an-strength-chip an-strength-chip--on" : "an-strength-chip"
                      }
                      aria-pressed={on}
                      onClick={() =>
                        setProfile((p) => ({
                          ...p,
                          strengths: on
                            ? p.strengths.filter((s) => s !== tag)
                            : [...p.strengths, tag].slice(0, 16),
                        }))
                      }
                    >
                      {t(`${K}.strength_${tag}`)}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="agent-network-strength-add">
          <input
            type="text"
            className="settings-input"
            value={strengthDraft}
            placeholder={t(`${K}.strengthPlaceholder`)}
            onChange={(e) => setStrengthDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              const tag = strengthDraft.trim().toLowerCase();
              if (!tag) return;
              setProfile((p) => ({
                ...p,
                strengths: p.strengths.includes(tag)
                  ? p.strengths
                  : [...p.strengths, tag].slice(0, 16),
              }));
              setStrengthDraft("");
            }}
          />
        </div>
        {profile.strengths.length > 0 ? (
          <p className="field-desc">
            {profile.strengths
              .map((s) => (KNOWN_STRENGTHS.has(s) ? t(`${K}.strength_${s}`) : s))
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
