import { useEffect, useState } from "react";
import { useT } from "../../context/I18nContext.js";
import { useNodeService } from "../../hooks/useNodeService.js";
import { PluginIcon, PendingIcon } from "../../icons.js";
import type { PendingApprovalSummary } from "@envoymesh/api";
import { SkillManagerModal } from "../SkillManagerModal.js";

export interface AssistantTopBarProps {
  onOpenActivity?: () => void;
  onOpenInbox?: () => void;
  onOpenChains?: () => void;
  onOpenDiscover?: () => void;
  onOpenSettingsAi?: () => void;
}

export function AssistantTopBar({
  onOpenInbox,
}: AssistantTopBarProps) {
  const t = useT();
  const nodeService = useNodeService();
  const [pendingApprovals, setPendingApprovals] = useState<PendingApprovalSummary[]>([]);
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [showApprovals, setShowApprovals] = useState(false);

  useEffect(() => {
    void nodeService
      .listPendingApprovals()
      .then(setPendingApprovals)
      .catch(() => setPendingApprovals([]));
    // EnvoyAI always keeps built-in web search on (no UI toggle).
    void (nodeService as { saveWebSearchEnabled?: (enabled: boolean) => Promise<unknown> })
      .saveWebSearchEnabled?.(true)
      .catch(() => {});
  }, [nodeService]);

  return (
    <>
      <div className="assistant-top-bar">
        <div className="assistant-top-bar__actions">
          {pendingApprovals.length > 0 && (
            <button
              type="button"
              className="assistant-top-bar__link assistant-top-bar__link--badge"
              onClick={() => setShowApprovals(true)}
            >
              <PendingIcon size={14} />
              <span>{t("h2a.pendingApprovals", { count: pendingApprovals.length })}</span>
            </button>
          )}

          <button
            type="button"
            className="assistant-top-bar__link"
            onClick={() => setSkillsOpen(true)}
          >
            <PluginIcon size={14} />
            <span>{t("h2a.skillsTitle")}</span>
          </button>
        </div>
      </div>

      {skillsOpen && <SkillManagerModal onClose={() => setSkillsOpen(false)} />}

      {showApprovals && (
        <div className="modal-overlay" role="presentation" onClick={() => setShowApprovals(false)}>
          <div
            className="modal-panel"
            role="dialog"
            aria-modal="true"
            aria-label={t("h2a.pendingApprovals", { count: pendingApprovals.length })}
            onClick={(e) => e.stopPropagation()}
          >
            <h2>{t("h2a.pendingApprovals", { count: pendingApprovals.length })}</h2>
            <ul className="h2a-rail-list">
              {pendingApprovals.map((item) => (
                <li key={item.id}>
                  <strong>{item.title.slice(0, 64)}</strong>
                  <span className="assistant-top-bar__approval-type">{item.actionType}</span>
                </li>
              ))}
            </ul>
            <div className="modal-actions">
              {onOpenInbox && (
                <button type="button" className="secondary" onClick={() => { setShowApprovals(false); onOpenInbox(); }}>
                  {t("h2a.openInbox")}
                </button>
              )}
              <button type="button" className="primary" onClick={() => setShowApprovals(false)}>
                {t("common.close", "Close")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
