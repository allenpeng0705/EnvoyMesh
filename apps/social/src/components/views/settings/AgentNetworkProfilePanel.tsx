/**
 * Settings editor for owner-attested Agent Network worker profile.
 * Lives under Settings → Agent Network.
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

const STRENGTH_PRESETS = ["research", "coding", "summarization", "translation", "writing"];

/** i18n prefix — Settings → Agent Network → membership. */
const K = "settings.agentNetwork.membership";

export function AgentNetworkProfilePanel({ enabled }: { enabled: boolean }) {
  const t = useT();
  const nodeService = useNodeService();
  const { showToast } = useToast();
  const [profile, setProfile] = useState<AgentNetworkProfile>({ ...DEFAULT_AGENT_NETWORK_PROFILE });
  const [strengthDraft, setStrengthDraft] = useState("");
  const [saving, setSaving] = useState(false);

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

  const save = useCallback(async () => {
    setSaving(true);
    try {
      await nodeService.updateNodeConfig({ agentNetworkProfile: profile });
      showToast(t(`${K}.saved`), "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setSaving(false);
    }
  }, [nodeService, profile, showToast, t]);

  if (!enabled) {
    return (
      <p className="field-desc" data-testid="agent-network-profile-disabled">
        {t(`${K}.enableFirst`)}
      </p>
    );
  }

  return (
    <div className="agent-network-profile-panel" data-testid="agent-network-profile-panel">
      <p className="field-desc">{t(`${K}.profileDesc`)}</p>

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

      <div className="form-group">
        <label>{t(`${K}.strengths`)}</label>
        <div className="agent-network-strengths">
          {STRENGTH_PRESETS.map((tag) => {
            const on = profile.strengths.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                className={on ? "btn-sm btn-primary" : "btn-sm"}
                onClick={() =>
                  setProfile((p) => ({
                    ...p,
                    strengths: on
                      ? p.strengths.filter((s) => s !== tag)
                      : [...p.strengths, tag].slice(0, 16),
                  }))
                }
              >
                {tag}
              </button>
            );
          })}
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
          <p className="field-desc">{profile.strengths.join(", ")}</p>
        ) : null}
      </div>

      <button type="button" className="btn-sm btn-primary" disabled={saving} onClick={() => void save()}>
        {saving ? t(`${K}.saving`) : t(`${K}.save`)}
      </button>
    </div>
  );
}
