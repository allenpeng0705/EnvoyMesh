/**
 * Phase 69B — owner-visible social proxy session summary (Settings → AI postures).
 */
import { useCallback, useEffect, useState } from "react";
import type { SocialProxySession, SocialProxySessionStatus } from "@envoymesh/api";
import { isSocialProxyTerminal } from "@envoymesh/api";
import { useT } from "../../../context/I18nContext.js";
import { useNodeService } from "../../../hooks/useNodeService.js";

function statusLabelKey(status: SocialProxySessionStatus): string {
  switch (status) {
    case "discovered":
      return "settings.ai.postures.proxyStatus.discovered";
    case "syncing":
      return "settings.ai.postures.proxyStatus.syncing";
    case "intro_proposed":
      return "settings.ai.postures.proxyStatus.introProposed";
    case "awaiting_peer":
    case "commitment_ready":
      return "settings.ai.postures.proxyStatus.waitingOnThem";
    case "hello_pending":
      return "settings.ai.postures.proxyStatus.helloNeedsYou";
    case "hello_sent":
      return "settings.ai.postures.proxyStatus.helloSent";
    case "chatting":
      return "settings.ai.postures.proxyStatus.chatting";
    case "owner_review":
      return "settings.ai.postures.proxyStatus.needsReview";
    case "bonded":
      return "settings.ai.postures.proxyStatus.bonded";
    case "declined":
    case "expired":
    case "cancelled":
      return "settings.ai.postures.proxyStatus.ended";
    default:
      return "settings.ai.postures.proxyStatus.unknown";
  }
}

function shortId(ownerId?: string): string {
  if (!ownerId) return "—";
  const parts = ownerId.split(":");
  const hash = parts[parts.length - 1] ?? ownerId;
  return hash.length > 10 ? `${hash.slice(0, 8)}…` : hash;
}

export function SocialProxySessionsPanel(props: { enabled: boolean }) {
  const t = useT();
  const nodeService = useNodeService();
  const [sessions, setSessions] = useState<SocialProxySession[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!props.enabled || !nodeService.isConnected) {
      setSessions([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const rows = await nodeService.listSocialProxySessions();
      const sorted = [...rows].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      setSessions(sorted.slice(0, 8));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, [props.enabled, nodeService]);

  useEffect(() => {
    void refresh();
    if (!props.enabled) return;
    const id = window.setInterval(() => void refresh(), 30_000);
    return () => window.clearInterval(id);
  }, [props.enabled, refresh]);

  if (!props.enabled) return null;

  const open = sessions.filter((s) => !isSocialProxyTerminal(s.status));
  const recentClosed = sessions.filter((s) => isSocialProxyTerminal(s.status)).slice(0, 3);

  return (
    <div className="settings-field social-proxy-sessions" style={{ marginTop: "0.5rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.35rem" }}>
        <span className="section-desc" style={{ margin: 0 }}>
          {t("settings.ai.postures.proxySessionsHeading")}
        </span>
        <button type="button" className="settings-btn settings-btn-sm" onClick={() => void refresh()} disabled={loading}>
          {loading ? t("settings.ai.postures.proxySessionsLoading") : t("settings.ai.postures.proxySessionsRefresh")}
        </button>
      </div>
      {error ? (
        <p className="section-desc" role="alert">
          {error}
        </p>
      ) : null}
      {open.length === 0 && recentClosed.length === 0 && !loading ? (
        <p className="section-desc">{t("settings.ai.postures.proxySessionsEmpty")}</p>
      ) : null}
      {open.length > 0 ? (
        <ul className="settings-list" style={{ margin: "0.25rem 0", paddingLeft: "1.1rem" }}>
          {open.map((s) => (
            <li key={s.sessionId}>
              <strong>{t(statusLabelKey(s.status))}</strong>
              {" · "}
              {shortId(s.candidateOwnerId)}
              {s.trustPathSummary ? ` — ${s.trustPathSummary}` : ""}
            </li>
          ))}
        </ul>
      ) : null}
      {recentClosed.length > 0 ? (
        <>
          <p className="section-desc" style={{ marginBottom: "0.15rem" }}>
            {t("settings.ai.postures.proxySessionsRecent")}
          </p>
          <ul className="settings-list" style={{ margin: 0, paddingLeft: "1.1rem" }}>
            {recentClosed.map((s) => (
              <li key={s.sessionId}>
                {t(statusLabelKey(s.status))} · {shortId(s.candidateOwnerId)}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <p className="section-desc" style={{ marginTop: "0.35rem" }}>
        {t("settings.ai.postures.proxySessionsHint")}
      </p>
    </div>
  );
}
