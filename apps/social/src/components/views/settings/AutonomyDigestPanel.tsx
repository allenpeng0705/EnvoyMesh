/**
 * Phase 69D1 — owner-visible autonomy digest under Settings → Account.
 */
import { useCallback, useEffect, useState } from "react";
import type { AutonomyDigestResult } from "@envoymesh/api";
import { useT } from "../../../context/I18nContext.js";
import { useNodeService } from "../../../hooks/useNodeService.js";

export function AutonomyDigestPanel() {
  const t = useT();
  const nodeService = useNodeService();
  const [result, setResult] = useState<AutonomyDigestResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!nodeService.isConnected) {
      setResult(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const next = await nodeService.getAutonomyDigest("daily");
      setResult(next);
      if (!next.ok) {
        setError(next.error ?? t("settings.account.privacy.autonomy.digestUnavailable"));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [nodeService, t]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const headlines = result?.headlines?.filter(Boolean).slice(0, 8) ?? [];
  const summary = result?.summaryText?.trim();

  return (
    <div className="settings-field autonomy-digest-panel" style={{ marginTop: "0.75rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.35rem" }}>
        <span className="section-desc" style={{ margin: 0 }}>
          {t("settings.account.privacy.autonomy.digestHeading")}
        </span>
        <button
          type="button"
          className="settings-btn settings-btn-sm"
          onClick={() => void refresh()}
          disabled={loading}
        >
          {loading
            ? t("settings.account.privacy.autonomy.digestLoading")
            : t("settings.account.privacy.autonomy.digestRefresh")}
        </button>
      </div>
      {error ? (
        <p className="section-desc" role="alert">
          {error}
        </p>
      ) : null}
      {!error && !loading && headlines.length === 0 && !summary ? (
        <p className="section-desc">{t("settings.account.privacy.autonomy.digestEmpty")}</p>
      ) : null}
      {summary ? <p className="section-desc">{summary}</p> : null}
      {headlines.length > 0 ? (
        <ul className="settings-list" style={{ margin: "0.25rem 0", paddingLeft: "1.1rem" }}>
          {headlines.map((line, i) => (
            <li key={`${i}-${line.slice(0, 24)}`}>{line}</li>
          ))}
        </ul>
      ) : null}
      <p className="section-desc" style={{ marginTop: "0.35rem" }}>
        {t("settings.account.privacy.autonomy.digestHint")}
      </p>
    </div>
  );
}
