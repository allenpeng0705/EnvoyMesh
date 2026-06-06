import { useCallback, useEffect, useState } from "react";

import type { TerminalSessionSummary } from "@envoymesh/api";

import { useNodeService } from "../../hooks/useNodeService.js";
import { useT } from "../../context/I18nContext.js";

interface TerminalSidebarProps {
  selectedSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  onSessionsChange: (sessions: TerminalSessionSummary[]) => void;
  disabled?: boolean;
}

export function TerminalSidebar({
  selectedSessionId,
  onSelectSession,
  onSessionsChange,
  disabled = false,
}: TerminalSidebarProps) {
  const nodeService = useNodeService();
  const t = useT();
  const [sessions, setSessions] = useState<TerminalSessionSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const running = sessions.filter((s) => s.state === "running");

  return (
    <aside className="terminal-sidebar">
      <div className="terminal-sidebar-header">
        <h3>{t("terminals.sessions")}</h3>
        <button type="button" className="primary" disabled={busy || disabled} onClick={() => void handleNew()}>
          {t("terminals.new")}
        </button>
      </div>
      {error ? <p className="terminal-sidebar-error">{error}</p> : null}
      <ul className="terminal-session-list">
        {sessions.length === 0 ? (
          <li className="terminal-session-empty">{t("terminals.empty")}</li>
        ) : (
          sessions.map((session) => (
            <li key={session.sessionId}>
              <button
                type="button"
                className={`terminal-session-row${selectedSessionId === session.sessionId ? " active" : ""}`}
                onClick={() => onSelectSession(session.sessionId)}
              >
                <span className="terminal-session-title">{session.title}</span>
                <span className={`terminal-session-state terminal-session-state--${session.state}`}>
                  {session.state === "running" ? t("terminals.running") : t("terminals.exited")}
                </span>
              </button>
              {session.state === "running" ? (
                <button
                  type="button"
                  className="terminal-session-close"
                  aria-label={t("terminals.close")}
                  disabled={busy}
                  onClick={() => void handleClose(session.sessionId)}
                >
                  ×
                </button>
              ) : null}
            </li>
          ))
        )}
      </ul>
      <p className="terminal-sidebar-meta">
        {t("terminals.runningCount", { count: running.length, max: 8 })}
      </p>
    </aside>
  );
}
