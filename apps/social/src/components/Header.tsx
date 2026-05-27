import type {
  ConnectionStatus,
  HumanProfile,
  NodeStatus,
} from "@envoymesh/api";
import type { ViewName } from "../App.js";
import { useTheme } from "../context/ThemeContext.js";
import { DarkModeIcon, LightModeIcon } from "../icons.js";

interface HeaderProps {
  currentView: ViewName;
  onNavigate: (view: ViewName) => void;
  /** Hello requests + stranger chat pings — badge on Chat */
  inboxActivityCount: number;
  bondsCount: number;
  isPublicNetwork: boolean;
  connectionStatus: ConnectionStatus | null;
  nodeStatus: NodeStatus;
  humanProfile: HumanProfile | null;
  peerId: string;
  relayUnreachable?: boolean;
  onRetryConnect?: () => void;
}

export function Header({
  currentView,
  onNavigate,
  inboxActivityCount,
  bondsCount,
  isPublicNetwork,
  connectionStatus,
  nodeStatus,
  humanProfile,
  peerId,
  relayUnreachable,
  onRetryConnect,
}: HeaderProps) {
  const { theme, resolved, setTheme } = useTheme();

  const cycleTheme = () => {
    if (theme === "system") setTheme("dark");
    else if (theme === "dark") setTheme("light");
    else setTheme("system");
  };

  const themeLabel = theme === "system" ? "Auto" : theme === "dark" ? "Dark" : "Light";

  /** Mesh exists only after successful start — avoid stuck "Connecting" when snapshot lags behind node:status. */
  const publicConnectivityReady =
    nodeStatus === "running" ||
    Boolean(connectionStatus?.online);
  const publicConnectivityLabel =
    publicConnectivityReady
      ? "Public Network"
      : nodeStatus === "starting" || nodeStatus === "stopping"
        ? "Starting…"
        : "Connecting…";
  const publicStatusTitle =
    isPublicNetwork && !publicConnectivityReady && connectionStatus?.lastError?.trim()
      ? connectionStatus.lastError
      : undefined;
  const displayNameTrimmed = humanProfile?.displayName?.trim();
  const profileButtonLabel =
    displayNameTrimmed && displayNameTrimmed.length > 0 ? displayNameTrimmed : "Profile";
  const profileButtonTitle =
    peerId && !peerId.startsWith("envoy_")
      ? `Open profile (${peerId})`
      : "Open profile";

  return (
    <header className="header">
      <div className="header-left">
        <img src="/assets/logo.svg" alt="Envoy" className="logo" />
        <span className="logo-text">Envoy</span>
      </div>
      <nav className="header-nav" aria-label="Primary">
        <button
          type="button"
          className={currentView === "assistant" ? "active" : ""}
          onClick={() => onNavigate("assistant")}
          aria-current={currentView === "assistant" ? "page" : undefined}
        >
          Assistant
        </button>
        <button
          type="button"
          className={`${currentView === "chat" ? "active" : ""} ${inboxActivityCount > 0 ? "has-inbox" : ""}`}
          onClick={() => onNavigate("chat")}
          aria-current={currentView === "chat" ? "page" : undefined}
          aria-label={
            inboxActivityCount > 0
              ? `Chat — ${inboxActivityCount} item${inboxActivityCount === 1 ? "" : "s"} in inbox`
              : "Chat"
          }
        >
          Chat
          {inboxActivityCount > 0 && (
            <span className="inbox-badge" aria-hidden>
              {inboxActivityCount > 99 ? "99+" : inboxActivityCount}
            </span>
          )}
        </button>
        <button
          type="button"
          className={currentView === "contacts" ? "active" : ""}
          onClick={() => onNavigate("contacts")}
          aria-current={currentView === "contacts" ? "page" : undefined}
        >
          Contacts ({bondsCount})
        </button>
        <button
          type="button"
          className={currentView === "library" ? "active" : ""}
          onClick={() => onNavigate("library")}
          aria-current={currentView === "library" ? "page" : undefined}
        >
          Library
        </button>
        <button
          type="button"
          className={currentView === "activity" ? "active" : ""}
          onClick={() => onNavigate("activity")}
          aria-current={currentView === "activity" ? "page" : undefined}
        >
          Activity
        </button>
        <button
          type="button"
          className={currentView === "settings" ? "active" : ""}
          onClick={() => onNavigate("settings")}
          aria-current={currentView === "settings" ? "page" : undefined}
        >
          Settings
        </button>
      </nav>
      <div className="header-right">
        {relayUnreachable && isPublicNetwork && (
          <button type="button" className="relay-warning" onClick={onRetryConnect} title="Relay unreachable — tap to retry">
            <span className="relay-warning-dot" />
            Relay unreachable
          </button>
        )}
        {isPublicNetwork ? (
          <div
            className={`network-status ${publicConnectivityReady ? "public" : "checking"}`}
            title={publicStatusTitle}
          >
            <span className="status-indicator" />
            <span>{publicConnectivityLabel}</span>
          </div>
        ) : (
          <div className="network-status private">
            <span className="status-indicator" />
            <span>Private</span>
          </div>
        )}
        <button
          type="button"
          className="theme-toggle-btn"
          onClick={cycleTheme}
          title={`Theme: ${themeLabel}`}
          aria-label={`Theme: ${themeLabel}. Click to change.`}
        >
          {resolved === "dark" ? <LightModeIcon size={16} /> : <DarkModeIcon size={16} />}
        </button>
        <span className="node-status">{nodeStatus}</span>
        {connectionStatus && connectionStatus.bondedPeers > 0 && (
          <span className="peer-count">{connectionStatus.bondedPeers} peers</span>
        )}
        <button
          type="button"
          className={`header-profile-btn${currentView === "profile" ? " active" : ""}`}
          onClick={() => onNavigate("profile")}
          aria-current={currentView === "profile" ? "page" : undefined}
          title={profileButtonTitle}
        >
          {profileButtonLabel}
        </button>
      </div>
    </header>
  );
}
