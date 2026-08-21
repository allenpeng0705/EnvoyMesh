import { useCallback, useEffect, useRef, useState } from "react";

import type { TerminalSessionSummary } from "@envoymesh/api";

import { useNodeService, usePendingApprovals } from "../../hooks/useNodeService.js";
import { saveAssistantLinkedTerminalSessionId } from "../../lib/storage.js";
import { useT } from "../../context/I18nContext.js";
import { ConfirmDialog } from "../ConfirmDialog.js";

interface TerminalSidebarProps {
  selectedSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  onSessionsChange: (sessions: TerminalSessionSummary[]) => void;
  disabled?: boolean;
  onOpenAssistant?: () => void;
  /** Start another Pi coding TUI (always pick a project folder). */
  onStartPi?: () => void;
  /** Open the Pi / envoy-harness RPC chat panel (reuse PiChatPanel). */
  onOpenPiChat?: () => void;
  /** Change project folder for a specific Pi TUI session. */
  onChangePiProject?: (sessionId: string) => void;
}

export function TerminalSidebar({
  selectedSessionId,
  onSelectSession,
  onSessionsChange,
  disabled = false,
  onOpenAssistant,
  onStartPi,
  onOpenPiChat,
  onChangePiProject,
}: TerminalSidebarProps) {
  const nodeService = useNodeService();
  const t = useT();
  const { items: pendingApprovals } = usePendingApprovals();
  const [sessions, setSessions] = useState<TerminalSessionSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingClose, setPendingClose] = useState<TerminalSessionSummary | null>(null);
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
    setPendingClose(null);
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

  const showFocusAssistant =
    onOpenAssistant &&
    (pendingApprovals.length > 0 || sessions.some((s) => s.activityBadge === "blocked"));

  const pendingIsPi = pendingClose?.role === "pi";

  return (
    <aside className="terminal-sidebar">
      <div className="terminal-sidebar-header">
        <h3>{t("terminals.sessions")}</h3>
        <div className="terminal-sidebar-header-actions">
          {onStartPi ? (
            <button
              type="button"
              className="primary"
              disabled={busy || disabled}
              onClick={() => onStartPi()}
              title={t("pi.startPiTitle", "Start a Pi coding terminal (choose project folder)")}
            >
              {t("pi.startPi", "π Pi")}
            </button>
          ) : null}
          {onOpenPiChat ? (
            <button
              type="button"
              className="secondary"
              disabled={busy || disabled}
              onClick={() => onOpenPiChat()}
              title={t("pi.openChatTitle", "Open Pi / envoy-harness chat (approvals)")}
            >
              {t("pi.openChat", "Chat")}
            </button>
          ) : null}
          <button type="button" className="primary" disabled={busy || disabled} onClick={() => void handleNew()}>
            {t("terminals.new")}
          </button>
        </div>
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
          <li className="terminal-session-empty">
            {t("terminals.empty")}
          </li>
        ) : (
          runningSessions.map((session) => {
            const selected = selectedSessionId === session.sessionId;
            const folderLabel = session.cwd
              ? session.cwd.replace(/[/\\]+$/, "").split(/[/\\]/).pop() ||
                t("pi.changeProjectShort", "Path")
              : null;
            return (
              <li key={session.sessionId}>
                <div
                  className={`terminal-session-main${selected ? " active" : ""}${
                    session.role === "pi" ? " terminal-session-main--pi" : ""
                  }`}
                >
                  <button
                    type="button"
                    className="terminal-session-row"
                    onClick={() => onSelectSession(session.sessionId)}
                  >
                    <span className="terminal-session-title">
                      {session.role === "pi" ? `π ${session.title}` : session.title}
                    </span>
                    {session.role === "pi" && folderLabel ? (
                      <span className="terminal-session-cwd" title={session.cwd}>
                        {folderLabel}
                      </span>
                    ) : null}
                  </button>
                  {session.role === "pi" && onChangePiProject ? (
                    <button
                      type="button"
                      className="terminal-session-project"
                      aria-label={t("pi.changeProjectTitle", "Change Pi project folder")}
                      title={session.cwd || t("pi.changeProjectTitle", "Change Pi project folder")}
                      disabled={busy}
                      onClick={() => onChangePiProject(session.sessionId)}
                    >
                      {t("pi.changeProjectShort", "Path")}
                    </button>
                  ) : null}
                </div>
                <div className="terminal-session-actions">
                  <button
                    type="button"
                    className="terminal-session-close"
                    aria-label={session.role === "pi" ? t("pi.stopHint", "Stop Pi") : t("terminals.close")}
                    title={session.role === "pi" ? t("pi.stopHint", "Stop Pi (does not auto-restart)") : undefined}
                    disabled={busy}
                    onClick={() => setPendingClose(session)}
                  >
                    ×
                  </button>
                </div>
              </li>
            );
          })
        )}
      </ul>
      <p className="terminal-sidebar-meta">
        {t("terminals.runningCount", { count: runningSessions.length, max: 8 })}
      </p>
      {pendingClose ? (
        <ConfirmDialog
          title={
            pendingIsPi
              ? t("pi.closeConfirmTitle", "Stop Pi?")
              : t("terminals.closeConfirmTitle", "Close terminal?")
          }
          message={
            pendingIsPi
              ? t(
                  "pi.closeConfirmMessage",
                  "This stops the Pi coding terminal for this project. It will not auto-restart.",
                )
              : t(
                  "terminals.closeConfirmMessage",
                  "This ends the shell session. Any running commands will be stopped.",
                )
          }
          variant="destructive"
          confirmLabel={
            pendingIsPi
              ? t("pi.closeConfirmAction", "Stop Pi")
              : t("terminals.closeConfirmAction", "Close")
          }
          onConfirm={() => void handleClose(pendingClose.sessionId)}
          onCancel={() => setPendingClose(null)}
        />
      ) : null}
    </aside>
  );
}
