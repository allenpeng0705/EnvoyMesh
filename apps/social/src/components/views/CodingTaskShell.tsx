import { useEffect, useState, type ReactNode } from "react";
import { useT } from "../../context/I18nContext.js";

export type CodingTaskTab = "chat" | "shell";

export type CodingTaskShellProps = {
  title: string;
  cwd?: string | null;
  statusLabel: string;
  /** Prefer Chat on select; remount resets via key from parent. */
  defaultTab?: CodingTaskTab;
  chatBody: ReactNode;
  /**
   * Shell tab body. Omit for Chat-only tasks (e.g. Pi stream) —
   * Shell tab is hidden and the body stays on Chat.
   */
  shellBody?: ReactNode;
  onClose?: () => void;
  changesOpen?: boolean;
  onToggleChanges?: () => void;
};

/**
 * Center Coding chrome: task header + Chat/Shell tabs.
 * Chat = agent timeline; Shell = PTY / placeholder when provided.
 * Task ≈ one agent session; tabs are UI surfaces on that session.
 */
export function CodingTaskShell({
  title,
  cwd,
  statusLabel,
  defaultTab = "chat",
  chatBody,
  shellBody,
  onClose,
  changesOpen = false,
  onToggleChanges,
}: CodingTaskShellProps) {
  const t = useT();
  const showShellTab = shellBody != null;
  const [tab, setTab] = useState<CodingTaskTab>(
    showShellTab ? defaultTab : "chat",
  );

  useEffect(() => {
    setTab(showShellTab ? defaultTab : "chat");
  }, [defaultTab, title, cwd, showShellTab]);

  const activeTab = showShellTab ? tab : "chat";

  return (
    <div className="coding-task-shell" data-testid="coding-task-shell">
      <header className="coding-task-shell__header">
        <div className="coding-task-shell__main">
          <div className="coding-task-shell__title-row">
            <h2 className="coding-task-shell__title">{title}</h2>
            {statusLabel.trim() ? (
              <span
                className="coding-task-shell__status"
                data-testid="coding-task-status"
              >
                {statusLabel}
              </span>
            ) : null}
          </div>
          {cwd ? (
            <p className="coding-task-shell__cwd" title={cwd}>
              {cwd}
            </p>
          ) : null}
        </div>
        <div className="coding-task-shell__header-actions">
          {onToggleChanges ? (
            <button
              type="button"
              className="coding-task-shell__changes-btn"
              onClick={onToggleChanges}
              aria-pressed={changesOpen}
              aria-label={t("codingView.toggleChanges", "Show or hide Changes")}
              data-testid="coding-changes-toggle"
            >
              {t("codingView.changesTitle", "Changes")}
            </button>
          ) : null}
          {onClose ? (
            <button
              type="button"
              className="coding-task-shell__close"
              onClick={onClose}
              aria-label={t("codingView.closeTask", "Close task")}
              data-testid="coding-task-close"
            >
              ×
            </button>
          ) : null}
        </div>
      </header>

      {showShellTab ? (
        <div
          className="coding-task-shell__tabs"
          role="tablist"
          aria-label={t("codingView.taskTabs", "Task tabs")}
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "chat"}
            className={
              activeTab === "chat"
                ? "coding-task-shell__tab active"
                : "coding-task-shell__tab"
            }
            onClick={() => setTab("chat")}
            data-testid="coding-task-tab-chat"
          >
            {t("codingView.tabChat", "Chat")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "shell"}
            className={
              activeTab === "shell"
                ? "coding-task-shell__tab active"
                : "coding-task-shell__tab"
            }
            onClick={() => setTab("shell")}
            data-testid="coding-task-tab-shell"
          >
            {t("codingView.tabShell", "Shell")}
          </button>
        </div>
      ) : null}

      <div
        className="coding-task-shell__body"
        role="tabpanel"
        data-testid={
          activeTab === "chat"
            ? "coding-task-panel-chat"
            : "coding-task-panel-shell"
        }
      >
        {activeTab === "chat" ? chatBody : shellBody}
      </div>
    </div>
  );
}
