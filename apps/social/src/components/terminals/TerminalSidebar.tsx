import { useCallback, useEffect, useRef, useState } from "react";

import type { TerminalActivityBadge, TerminalSessionSummary } from "@envoymesh/api";

import { useNodeService, usePendingApprovals } from "../../hooks/useNodeService.js";
import { saveAssistantLinkedTerminalSessionId } from "../../lib/storage.js";
import { useT } from "../../context/I18nContext.js";

interface TerminalSidebarProps {
  selectedSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  onSessionsChange: (sessions: TerminalSessionSummary[]) => void;
  disabled?: boolean;
  onOpenAssistant?: () => void;
}

function activityBadgeLabel(t: ReturnType<typeof useT>, badge: TerminalActivityBadge | undefined): string {
  switch (badge) {
    case "working":
      return t("terminals.badgeWorking");
    case "blocked":
      return t("terminals.badgeBlocked");
    case "done":
      return t("terminals.badgeDone");
    case "idle":
    default:
      return t("terminals.badgeIdle");
  }
}

export function TerminalSidebar({
  selectedSessionId,
  onSelectSession,
  onSessionsChange,
  disabled = false,
  onOpenAssistant,
}: TerminalSidebarProps) {
  const nodeService = useNodeService();
  const t = useT();
  const { items: pendingApprovals } = usePendingApprovals();
  const [sessions, setSessions] = useState<TerminalSessionSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cleanedStaleRef = useRef(false);

  const runningSessions = sessions.filter((s) => s.state === "running");

  const refresh = useCallback(async () => {
    if (disabled) return;
    try {
      const list = await nodeService.listTerminalSessions();
      setSessions(list);
      onSessionsChange(list);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [disabled, nodeService, onSessionsChange]);

  useEffect(() => {
    if (disabled) return;
    void refresh();
    const unsub = nodeService.on("terminal:session-updated", (payload) => {
      setSessions(payload.sessions);
      onSessionsChange(payload.sessions);
    });
    return unsub;
  }, [disabled, nodeService, onSessionsChange, refresh]);

  useEffect(() => {
    if (disabled || cleanedStaleRef.current) return;
    cleanedStaleRef.current = true;
    void (async () => {
      try {
        const list = await nodeService.listTerminalSessions();
        const stale = list.filter((s) => s.state !== "running");
        if (stale.length === 0) return;
        for (const row of stale) {
          await nodeService.closeTerminalSession({ sessionId: row.sessionId });
        }
        await refresh();
      } catch {
        //
      }
    })();
  }, [disabled, nodeService, refresh]);

  useEffect(() => {
    if (disabled) return;
    void refresh();
  }, [disabled, pendingApprovals.length, refresh]);

  const handleNew = async () => {
    if (disabled) return;
    setBusy(true);
    try {
      const created = await nodeService.createTerminalSession({});
      await refresh();
      onSelectSession(created.sessionId);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleClose = async (sessionId: string) => {
    setBusy(true);
    try {
      await nodeService.closeTerminalSession({ sessionId });
      await refresh();
      if (selectedSessionId === sessionId) {
        onSelectSession("");
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const running = runningSessions;
  const showFocusAssistant =
    onOpenAssistant &&
    (pendingApprovals.length > 0 || sessions.some((s) => s.activityBadge === "blocked"));

  return (
    <aside className="terminal-sidebar">
      <div className="terminal-sidebar-header">
        <h3>{t("terminals.sessions")}</h3>
        <button type="button" className="primary" disabled={busy || disabled} onClick={() => void handleNew()}>
          {t("terminals.new")}
        </button>
      </div>
      {showFocusAssistant ? (
        <div className="terminal-sidebar-focus">
          <button
            type="button"
            className="secondary"
            onClick={() => {
              if (selectedSessionId) saveAssistantLinkedTerminalSessionId(selectedSessionId);
              onOpenAssistant?.();
            }}
          >
            {t("terminals.focusEnvoyAi")}
          </button>
        </div>
      ) : null}
      {error ? <p className="terminal-sidebar-error">{error}</p> : null}
      <ul className="terminal-session-list">
        {runningSessions.length === 0 ? (
          <li className="terminal-session-empty">{t("terminals.empty")}</li>
        ) : (
          runningSessions.map((session) => (
            <li key={session.sessionId}>
              <button
                type="button"
                className={`terminal-session-row${selectedSessionId === session.sessionId ? " active" : ""}`}
                onClick={() => onSelectSession(session.sessionId)}
              >
                <span className="terminal-session-title">{session.title}</span>
                <span className="terminal-session-meta">
                  {session.activityBadge ? (
                    <span
                      className={`terminal-activity-badge terminal-activity-badge--${session.activityBadge}`}
                      title={session.foregroundHint ?? activityBadgeLabel(t, session.activityBadge)}
                    >
                      {activityBadgeLabel(t, session.activityBadge)}
                    </span>
                  ) : null}
                  <span className={`terminal-session-state terminal-session-state--${session.state}`}>
                    {t("terminals.running")}
                  </span>
                </span>
              </button>
              <button
                type="button"
                className="terminal-session-close"
                aria-label={t("terminals.close")}
                disabled={busy}
                onClick={() => void handleClose(session.sessionId)}
              >
                ×
              </button>
            </li>
          ))
        )}
      </ul>
      <p className="terminal-sidebar-meta">
        {t("terminals.runningCount", { count: runningSessions.length, max: 8 })}
      </p>
    </aside>
  );
}
