import { useEffect, useState } from "react";
import { useT } from "../../context/I18nContext.js";
import { AIChatPanel } from "./AIChatPanel.js";
import { useNodeService } from "../../hooks/useNodeService.js";
import { BackIcon, PluginIcon } from "../../icons.js";
import type { AgentActivityRecord, PendingApprovalSummary } from "@envoymesh/api";
import { SkillManagerModal } from "../SkillManagerModal.js";

export interface H2AChannelViewProps {
  onBackToChats?: () => void;
  onOpenActivity?: () => void;
  onOpenInbox?: () => void;
  onOpenChains?: () => void;
  onOpenDiscover?: () => void;
}

export function H2AChannelView({ onBackToChats, onOpenActivity, onOpenInbox, onOpenChains, onOpenDiscover }: H2AChannelViewProps) {
  const t = useT();
  const nodeService = useNodeService();
  const [activity, setActivity] = useState<AgentActivityRecord[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApprovalSummary[]>([]);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportText, setReportText] = useState<string | null>(null);
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [webSearchOn, setWebSearchOn] = useState(true);

  useEffect(() => {
    void nodeService
      .listAgentActivity({ limit: 8, domain: "knowledge" })
      .then(setActivity)
      .catch(() => setActivity([]));
    void nodeService
      .listPendingApprovals()
      .then(setPendingApprovals)
      .catch(() => setPendingApprovals([]));
    void nodeService.getNodeConfig?.().then((cfg: any) => {
      if (typeof cfg?.webSearchEnabled === "boolean") setWebSearchOn(cfg.webSearchEnabled);
    }).catch(() => {});
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
          <button type="button" className="h2a-header-btn" onClick={() => setSkillsOpen(true)} title="Skills & Plugins">
            <PluginIcon size={18} />
          </button>
        </div>
      </header>
      {skillsOpen && <SkillManagerModal onClose={() => setSkillsOpen(false)} />}
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

        <div className="h2a-rail-block">
          <h4>{t("h2a.quickActions", "Quick Actions")}</h4>
          <button
            type="button"
            className="primary"
            style={{ width: "100%", marginTop: "4px" }}
            disabled={reportLoading}
            onClick={() => {
              setReportLoading(true);
              setReportText(null);
              nodeService.generateMeshIntelligenceReport?.()
                ?.then((report) => {
                  if (typeof report === "string") {
                    setReportText(report);
                  }
                  setReportLoading(false);
                })
                ?.catch(() => setReportLoading(false));
            }}
          >
            {reportLoading
              ? t("h2a.generatingReport", "Generating...")
              : t("h2a.meshIntelligenceReport", "Mesh Intelligence Report")}
          </button>
          <p className="field-desc" style={{ marginTop: "4px" }}>
            {t("h2a.reportDesc", "AI analysis of your entire mesh — health, trends, dormant bonds, reputation.")}
          </p>
          {reportText ? (
            <pre
              className="h2a-report-output"
              style={{
                whiteSpace: "pre-wrap",
                background: "var(--color-surface-elevated, #f4f4f4)",
                padding: "0.6rem",
                marginTop: "0.5rem",
                maxHeight: "20rem",
                overflowY: "auto",
                fontSize: "0.8rem",
                lineHeight: 1.5,
              }}
            >
              {reportText}
            </pre>
          ) : null}
        </div>

        <div className="h2a-rail-block">
          <h4>{t("h2a.webSearchTitle")}</h4>
          <label className="toggle-row" style={{ marginTop: "4px" }}>
            <span>{t("h2a.webSearchLabel")}</span>
            <input
              type="checkbox"
              checked={webSearchOn}
              onChange={async (e) => {
                const on = e.target.checked;
                setWebSearchOn(on);
                await (nodeService as any).saveWebSearchEnabled?.(on);
              }}
            />
          </label>
          <p className="field-desc" style={{ marginTop: "4px" }}>
            {t("h2a.webSearchDesc")}
          </p>
        </div>

        <div className="h2a-rail-block">
          <h4>{t("h2a.skillsTitle")}</h4>
          <button
            type="button"
            className="secondary"
            style={{ width: "100%", marginTop: "4px" }}
            onClick={() => setSkillsOpen(true)}
          >
            {t("h2a.manageSkills")}
          </button>
          <p className="field-desc" style={{ marginTop: "4px" }}>
            {t("h2a.skillsDesc")}
          </p>
        </div>
      </aside>

      <section className="h2a-channel-main chat-area">
        <AIChatPanel onOpenActivity={onOpenActivity} onOpenInbox={onOpenInbox} onOpenChains={onOpenChains} onOpenDiscover={onOpenDiscover} />
      </section>
      </div>
    </div>
  );
}
