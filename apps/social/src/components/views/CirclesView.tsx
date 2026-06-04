/**
 * CirclesView — Phase 23A Social UI component.
 * Displays agent-proposed circles with accept/reject actions.
 */
import { useEffect, useState } from "react";
import { useNodeService } from "../../hooks/useNodeService.js";
import { useT } from "../../context/I18nContext.js";

interface CircleItem {
  circleId: string;
  label: string;
  memberOwnerIds: string[];
  topicTags: string[];
  createdAt: string;
}

export function CirclesView() {
  const t = useT();
  const nodeService = useNodeService();
  const [circles, setCircles] = useState<CircleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadCircles() {
      try {
        const fetched = await nodeService.listAgentCircles();
        if (!cancelled) {
          setCircles(fetched);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadCircles();
    return () => { cancelled = true; };
  }, [nodeService]);

  const handleDelete = async (circleId: string) => {
    try {
      await nodeService.deleteAgentCircle(circleId);
      setCircles((prev) => prev.filter((c) => c.circleId !== circleId));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  if (loading) {
    return (
      <div className="view circles-view">
        <div className="loading-spinner" />
        <p>{t("common.loading")}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="view circles-view">
        <p className="error-message">{error}</p>
      </div>
    );
  }

  if (circles.length === 0) {
    return (
      <div className="view circles-view">
        <div className="empty-state">
          <h2>{t("circles.emptyTitle", "No circles yet")}</h2>
          <p>{t("circles.emptyHint", "Your AI agent can propose circles based on shared interests with your contacts.")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="view circles-view">
      <h2>{t("circles.title", "Agent Circles")}</h2>
      <div className="circles-list">
        {circles.map((circle) => (
          <div key={circle.circleId} className="circle-card">
            <div className="circle-header">
              <h3>{circle.label}</h3>
              <button
                type="button"
                className="circle-delete-btn"
                onClick={() => void handleDelete(circle.circleId)}
                title={t("circles.delete", "Delete circle")}
              >
                ✕
              </button>
            </div>
            <p className="circle-members">
              {t("circles.members", "Members")}: {circle.memberOwnerIds.length}
            </p>
            {circle.topicTags.length > 0 && (
              <div className="circle-tags">
                {circle.topicTags.map((tag) => (
                  <span key={tag} className="circle-tag">{tag}</span>
                ))}
              </div>
            )}
            <p className="circle-date">
              {new Date(circle.createdAt).toLocaleDateString()}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

export { CirclesView as default };
