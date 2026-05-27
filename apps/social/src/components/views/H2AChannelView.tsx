import { useEffect, useState } from "react";
import { AIChatPanel } from "./AIChatPanel.js";
import { useNodeService } from "../../hooks/useNodeService.js";
import type { AgentActivityRecord, PendingApprovalSummary } from "@envoymesh/api";

export interface H2AChannelViewProps {
  onOpenActivity?: () => void;
  onOpenInbox?: () => void;
}

export function H2AChannelView({ onOpenActivity, onOpenInbox }: H2AChannelViewProps) {
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
      <aside className="h2a-channel-rail" aria-label="Assistant context">
        <h3>Owner ↔ home agent</h3>
        <p className="section-desc">
          Vault-backed assist, document workflows, and approvals — separate from contact chat threads.
        </p>

        {pendingApprovals.length > 0 && (
          <div className="h2a-rail-block">
            <h4>Pending approvals ({pendingApprovals.length})</h4>
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
                Open inbox
              </button>
            )}
          </div>
        )}

        <div className="h2a-rail-block">
          <h4>Recent activity</h4>
          {activity.length === 0 ? (
            <p className="library-view-hint">Activity from vault assist and agent tools appears here.</p>
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
              View all activity
            </button>
          )}
        </div>
      </aside>

      <section className="h2a-channel-main chat-area">
        <AIChatPanel />
      </section>
    </div>
  );
}
