import type {
  ConnectionStatus,
  HumanProfile,
  NodeStatus,
} from "@envoymesh/api";
import type { ViewName } from "../App.js";
import { useTheme } from "../context/ThemeContext.js";
import { DarkModeIcon, LightModeIcon } from "../icons.js";
import { ProfilePhotoAvatar } from "./ProfilePhotoAvatar.js";

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

  const nodeStatusClass =
    nodeStatus === "running"
      ? "running"
      : nodeStatus === "starting" || nodeStatus === "stopping"
        ? "transitional"
        : "offline";

  return (
    <header className="header app-header">
      <div className="header-left">
        <img src="/assets/logo.svg" alt="Envoy" className="logo" />
        <span className="logo-text">Envoy</span>
      </div>
      <nav className="header-nav app-header__nav" aria-label="Primary">
        <button
          type="button"
          className={`${currentView === "chat" || currentView === "assistant" ? "active" : ""} ${inboxActivityCount > 0 ? "has-inbox" : ""}`}
          onClick={() => onNavigate("chat")}
          aria-current={currentView === "chat" || currentView === "assistant" ? "page" : undefined}
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
      <div className="header-right app-header__meta">
        <div className="header-status-strip" role="group" aria-label="Node connectivity">
          {relayUnreachable && isPublicNetwork && (
            <button
              type="button"
              className="relay-warning mesh-status-chip mesh-status-chip--warn"
              onClick={onRetryConnect}
              title="Relay unreachable — tap to retry"
            >
              <span className="mesh-status-chip__dot" aria-hidden />
              <span className="mesh-status-chip__label">Relay down</span>
            </button>
          )}
          {isPublicNetwork ? (
            <div
              className={`mesh-status-chip network-status ${publicConnectivityReady ? "public mesh-status-chip--ok" : "checking mesh-status-chip--pending"}`}
              title={publicStatusTitle}
            >
              <span className="mesh-status-chip__dot status-indicator" aria-hidden />
              <span className="mesh-status-chip__label">{publicConnectivityLabel}</span>
            </div>
          ) : (
            <div className="mesh-status-chip network-status private mesh-status-chip--private">
              <span className="mesh-status-chip__dot status-indicator" aria-hidden />
              <span className="mesh-status-chip__label">Private mesh</span>
            </div>
          )}
          <span className={`mesh-status-chip node-status mesh-status-chip--node mesh-status-chip--${nodeStatusClass}`}>
            <span className="mesh-status-chip__dot" aria-hidden />
            <span className="mesh-status-chip__label">{nodeStatus}</span>
          </span>
          {connectionStatus && connectionStatus.bondedPeers > 0 && (
            <span className="mesh-status-chip peer-count mesh-status-chip--peers">
              <span className="mesh-status-chip__label">{connectionStatus.bondedPeers} bonded</span>
            </span>
          )}
        </div>
        <button
          type="button"
          className="theme-toggle-btn"
          onClick={cycleTheme}
          title={`Theme: ${themeLabel}`}
          aria-label={`Theme: ${themeLabel}. Click to change.`}
        >
          {resolved === "dark" ? <LightModeIcon size={16} /> : <DarkModeIcon size={16} />}
        </button>
        <button
          type="button"
          className={`header-profile-btn${currentView === "profile" ? " active" : ""}`}
          onClick={() => onNavigate("profile")}
          aria-current={currentView === "profile" ? "page" : undefined}
          title={profileButtonTitle}
        >
          <ProfilePhotoAvatar
            photo={humanProfile?.publicThumbnail}
            fallbackLabel={profileButtonLabel}
            className="header-profile-avatar"
          />
          <span className="header-profile-btn__label">{profileButtonLabel}</span>
        </button>
      </div>
    </header>
  );
}
