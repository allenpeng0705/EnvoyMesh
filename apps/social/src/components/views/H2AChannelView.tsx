import { useEffect, useState } from "react";
import { useT } from "../../context/I18nContext.js";
import { AIChatPanel } from "./AIChatPanel.js";
import { useNodeService } from "../../hooks/useNodeService.js";
import { BackIcon } from "../../icons.js";
import type { AgentActivityRecord, PendingApprovalSummary } from "@envoymesh/api";

export interface H2AChannelViewProps {
  onBackToChats?: () => void;
  onOpenActivity?: () => void;
  onOpenInbox?: () => void;
}

export function H2AChannelView({ onBackToChats, onOpenActivity, onOpenInbox }: H2AChannelViewProps) {
  const t = useT();
  const nodeService = useNodeService();
  const [activity, setActivity] = useState<AgentActivityRecord[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApprovalSummary[]>([]);

  useEffect(() => {
    void nodeService
      .listAgentActivity({ limit: 8, domain: "knowledge" })
      .then(setActivity)
      .catch(() => setActivity([]));
    void nodeService
      .listPendingApprovals()
      .then(setPendingApprovals)
      .catch(() => setPendingApprovals([]));
  }, [nodeService]);

  return (
    <div className="h2a-channel-view">
      <header className="h2a-channel-toolbar">
        {onBackToChats && (
          <button
            type="button"
            className="h2a-channel-back"
            onClick={onBackToChats}
            aria-label={t("h2a.backToChatsAria")}
          >
            <BackIcon size={18} />
            <span>{t("h2a.chats")}</span>
          </button>
        )}
        <div className="h2a-channel-toolbar__title">
          <span className="h2a-channel-toolbar__avatar" aria-hidden>
            AI
          </span>
          <div>
            <h2 className="h2a-channel-toolbar__heading">{t("h2a.assistant")}</h2>
            <p className="h2a-channel-toolbar__subtitle">{t("h2a.subtitle")}</p>
          </div>
        </div>
      </header>
      <div className="h2a-channel-body">
      <aside className="h2a-channel-rail" aria-label={t("h2a.contextAria")}>
        <h3>{t("h2a.railTitle")}</h3>
        <p className="section-desc">{t("h2a.railDesc")}</p>

        {pendingApprovals.length > 0 && (
          <div className="h2a-rail-block">
            <h4>{t("h2a.pendingApprovals", { count: pendingApprovals.length })}</h4>
            <ul className="h2a-rail-list">
              {pendingApprovals.slice(0, 4).map((item) => (
                <li key={item.id}>
                  <button type="button" className="linkish" onClick={() => onOpenInbox?.()}>
                    {item.actionType}: {item.title.slice(0, 64)}
                  </button>
                </li>
              ))}
            </ul>
            {onOpenInbox && (
              <button type="button" className="secondary" onClick={onOpenInbox}>
                {t("h2a.openInbox")}
              </button>
            )}
          </div>
        )}

        <div className="h2a-rail-block">
          <h4>{t("h2a.recentActivity")}</h4>
          {activity.length === 0 ? (
            <p className="library-view-hint">{t("h2a.activityEmpty")}</p>
          ) : (
            <ul className="h2a-rail-list">
              {activity.map((row) => (
                <li key={row.activityId}>
                  <span className="h2a-activity-kind">{row.kind}</span>
                  <span className="h2a-activity-summary">{row.summary.slice(0, 72)}</span>
                  <time className="h2a-activity-time">{new Date(row.createdAt).toLocaleString()}</time>
                </li>
              ))}
            </ul>
          )}
          {onOpenActivity && (
            <button type="button" className="secondary" onClick={onOpenActivity}>
              {t("h2a.viewAllActivity")}
            </button>
          )}
        </div>
      </aside>

      <section className="h2a-channel-main chat-area">
        <AIChatPanel />
      </section>
      </div>
    </div>
  );
}
