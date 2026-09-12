import { useEffect, useState, type ReactNode } from "react";
import { useT } from "../../context/I18nContext.js";

export type CodingWorkspaceTab = "chat" | "shell";

export type CodingWorkspaceShellProps = {
  title: string;
  cwd?: string | null;
  statusLabel: string;
  /** Prefer Chat on select; remount resets via key from parent. */
  defaultTab?: CodingWorkspaceTab;
  chatBody: ReactNode;
  /**
   * Shell tab body. Omit for Chat-only workspaces (e.g. Pi stream) —
   * Shell tab is hidden and the body stays on Chat.
   */
  shellBody?: ReactNode;
  onClose?: () => void;
  changesOpen?: boolean;
  onToggleChanges?: () => void;
};

/**
 * Center Coding chrome: workspace header + Chat/Shell tabs.
 * Chat = agent timeline; Shell = PTY / placeholder when provided.
 * Workspace ≈ one agent session; tabs are UI surfaces on that session.
 */
export function CodingWorkspaceShell({
  title,
  cwd,
  statusLabel,
  defaultTab = "chat",
  chatBody,
  shellBody,
  onClose,
  changesOpen = false,
  onToggleChanges,
}: CodingWorkspaceShellProps) {
  const t = useT();
  const showShellTab = shellBody != null;
  const [tab, setTab] = useState<CodingWorkspaceTab>(
    showShellTab ? defaultTab : "chat",
  );

  useEffect(() => {
    setTab(showShellTab ? defaultTab : "chat");
  }, [defaultTab, title, cwd, showShellTab]);

  const activeTab = showShellTab ? tab : "chat";

  return (
    <div className="coding-workspace-shell" data-testid="coding-workspace-shell">
      <header className="coding-workspace-shell__header">
        <div className="coding-workspace-shell__main">
          <div className="coding-workspace-shell__title-row">
            <h2 className="coding-workspace-shell__title">{title}</h2>
            {statusLabel.trim() ? (
              <span
                className="coding-workspace-shell__status"
                data-testid="coding-workspace-status"
              >
                {statusLabel}
              </span>
            ) : null}
          </div>
          {cwd ? (
            <p className="coding-workspace-shell__cwd" title={cwd}>
              {cwd}
            </p>
          ) : null}
        </div>
        <div className="coding-workspace-shell__header-actions">
          {onToggleChanges ? (
            <button
              type="button"
              className="coding-workspace-shell__changes-btn"
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
              className="coding-workspace-shell__close"
              onClick={onClose}
              aria-label={t("codingView.closeWorkspace", "Close workspace")}
              data-testid="coding-workspace-close"
            >
              ×
            </button>
          ) : null}
        </div>
      </header>

      {showShellTab ? (
        <div
          className="coding-workspace-shell__tabs"
          role="tablist"
          aria-label={t("codingView.workspaceTabs", "Workspace tabs")}
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "chat"}
            className={
              activeTab === "chat"
                ? "coding-workspace-shell__tab active"
                : "coding-workspace-shell__tab"
            }
            onClick={() => setTab("chat")}
            data-testid="coding-workspace-tab-chat"
          >
            {t("codingView.tabChat", "Chat")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "shell"}
            className={
              activeTab === "shell"
                ? "coding-workspace-shell__tab active"
                : "coding-workspace-shell__tab"
            }
            onClick={() => setTab("shell")}
            data-testid="coding-workspace-tab-shell"
          >
            {t("codingView.tabShell", "Shell")}
          </button>
        </div>
      ) : null}

      <div
        className="coding-workspace-shell__body"
        role="tabpanel"
        data-testid={
          activeTab === "chat"
            ? "coding-workspace-panel-chat"
            : "coding-workspace-panel-shell"
        }
      >
        {activeTab === "chat" ? chatBody : shellBody}
      </div>
    </div>
  );
}
