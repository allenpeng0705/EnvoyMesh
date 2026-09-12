import { useCallback, useEffect, useState } from "react";

import type { TerminalSessionSummary } from "@envoymesh/api";

import {
  useNodeService,
  usePendingApprovals,
  useTerminalSessions,
} from "../../hooks/useNodeService.js";
import { saveAssistantLinkedTerminalSessionId } from "../../lib/storage.js";
import { openCoding } from "../../lib/open-coding-nav.js";
import { useT } from "../../context/I18nContext.js";
import { ConfirmDialog } from "../ConfirmDialog.js";

function isShellSession(s: TerminalSessionSummary): boolean {
  return s.role !== "pi" && s.role !== "envoy-harness";
}

interface TerminalSidebarProps {
  selectedSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  onSessionsChange: (sessions: TerminalSessionSummary[]) => void;
  disabled?: boolean;
  onOpenAssistant?: () => void;
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
  const { sessions, refresh: refreshTerminalSessions } = useTerminalSessions();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingClose, setPendingClose] = useState<TerminalSessionSummary | null>(null);

  // Shell PTYs only — Pi / EH live under Coding.
  const runningSessions = sessions.filter(
    (s) => s.state === "running" && isShellSession(s),
  );

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

  return (
    <aside className="terminal-sidebar" data-testid="terminal-sidebar">
      <div className="terminal-sidebar-header">
        <div className="terminal-sidebar-header-actions">
          <button
            type="button"
            className="secondary terminal-sidebar-mode-btn"
            disabled={disabled}
            onClick={() => openCoding({ startNew: true })}
            title={t(
              "terminals.openCodingTitle",
              "Open Coding for Pi, Envoy Harness, and other coding agents",
            )}
            data-testid="terminals-open-coding"
          >
            {t("terminals.openCoding", "Coding")}
          </button>
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
          <li className="terminal-session-empty">{t("terminals.empty")}</li>
        ) : (
          runningSessions.map((session) => {
            const selected = selectedSessionId === session.sessionId;
            return (
              <li key={session.sessionId}>
                <div className={`terminal-session-main${selected ? " active" : ""}`}>
                  <button
                    type="button"
                    className="terminal-session-row"
                    onClick={() => onSelectSession(session.sessionId)}
                  >
                    <span className="terminal-session-title">{session.title}</span>
                  </button>
                </div>
                <div className="terminal-session-actions">
                  <button
                    type="button"
                    className="terminal-session-close"
                    aria-label={t("terminals.close")}
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
        {t("terminals.runningCount", {
          count: runningSessions.length,
          max: 8,
        })}
      </p>
      {pendingClose ? (
        <ConfirmDialog
          title={t("terminals.closeConfirmTitle", "Close terminal?")}
          message={t(
            "terminals.closeConfirmMessage",
            "This ends the shell session. Any running commands will be stopped.",
          )}
          variant="destructive"
          confirmLabel={t("terminals.closeConfirmAction", "Close")}
          onConfirm={() => void handleClose(pendingClose.sessionId)}
          onCancel={() => setPendingClose(null)}
        />
      ) : null}
    </aside>
  );
}
