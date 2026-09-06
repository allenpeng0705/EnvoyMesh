import { useCallback, useEffect, useState } from "react";

import type { TerminalSessionSummary } from "@envoymesh/api";

import {
  useNodeService,
  usePendingApprovals,
  useTerminalSessions,
} from "../../hooks/useNodeService.js";
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
  /** Start the Envoy Harness TUI (always pick a project folder). */
  onStartEnvoy?: () => void;
  /** Open the Pi RPC chat panel (reuse PiChatPanel). */
  onOpenPiChat?: () => void;
  /** Change project folder for a specific Pi TUI session. */
  onChangePiProject?: (sessionId: string) => void;
  /** Change project folder for a specific Envoy TUI session. */
  onChangeEnvoyProject?: (sessionId: string) => void;
}

export function TerminalSidebar({
  selectedSessionId,
  onSelectSession,
  onSessionsChange,
  disabled = false,
  onOpenAssistant,
  onStartPi,
  onStartEnvoy,
  onOpenPiChat,
  onChangePiProject,
  onChangeEnvoyProject,
}: TerminalSidebarProps) {
  const nodeService = useNodeService();
  const t = useT();
  const { items: pendingApprovals } = usePendingApprovals();
  const { sessions, refresh: refreshTerminalSessions } = useTerminalSessions();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingClose, setPendingClose] = useState<TerminalSessionSummary | null>(null);

  const runningSessions = sessions.filter((s) => s.state === "running");

  const refresh = useCallback(async () => {
    if (disabled) return;
    try {
      await refreshTerminalSessions();
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [disabled, refreshTerminalSessions]);

  useEffect(() => {
    onSessionsChange(sessions);
  }, [onSessionsChange, sessions]);

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
        <div className="terminal-sidebar-header-actions">
          {onStartEnvoy ? (
            <button
              type="button"
              className="primary terminal-sidebar-mode-btn"
              disabled={busy || disabled}
              onClick={() => onStartEnvoy()}
              title={t("eh.startEnvoyTitle", "Start the Envoy TUI (choose project folder)")}
            >
              {t("eh.startEnvoy", "Envoy")}
            </button>
          ) : null}
          {onStartPi ? (
            <button
              type="button"
              className="primary terminal-sidebar-mode-btn"
              disabled={busy || disabled}
              onClick={() => onStartPi()}
              title={t("pi.startPiTitle", "Start a Pi coding terminal (choose project folder)")}
            >
              {t("pi.startPi", "π Pi")}
            </button>
          ) : null}
          <button
            type="button"
            className="primary terminal-sidebar-new"
            disabled={busy || disabled}
            onClick={() => void handleNew()}
            aria-label={t("terminals.newAria", t("terminals.new"))}
            title={t("terminals.newAria", t("terminals.new"))}
            data-testid="terminals-new"
          >
            +
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
                    session.role === "pi" || session.role === "envoy-harness"
                      ? " terminal-session-main--pi"
                      : ""
                  }`}
                >
                  <button
                    type="button"
                    className="terminal-session-row"
                    onClick={() => onSelectSession(session.sessionId)}
                  >
                    <span className="terminal-session-title">
                      {session.role === "pi"
                        ? `π ${session.title}`
                        : session.role === "envoy-harness"
                          ? `EH ${session.title}`
                          : session.title}
                    </span>
                    {(session.role === "pi" || session.role === "envoy-harness") &&
                    folderLabel ? (
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
                  {session.role === "envoy-harness" && onChangeEnvoyProject ? (
                    <button
                      type="button"
                      className="terminal-session-project"
                      aria-label={t("eh.changeProjectTitle", "Change Envoy project folder")}
                      title={
                        session.cwd ||
                        t("eh.changeProjectTitle", "Change Envoy project folder")
                      }
                      disabled={busy}
                      onClick={() => onChangeEnvoyProject(session.sessionId)}
                    >
                      {t("eh.changeProjectShort", "Path")}
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
