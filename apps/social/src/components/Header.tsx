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
  inboxCount: number;
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
  inboxCount,
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
  const displayLabel =
    humanProfile?.displayName ||
    humanProfile?.username ||
    (peerId && !peerId.startsWith("envoy_") ? `${peerId.slice(0, 8)}\u2026` : "Peer");

  return (
    <header className="header">
      <div className="header-left">
        <img src="/assets/logo.svg" alt="Envoy" className="logo" />
        <span className="logo-text">Envoy</span>
      </div>
      <nav className="header-nav">
        <button
          className={`${currentView === "chat" ? "active" : ""} ${inboxCount > 0 ? "has-inbox" : ""}`}
          onClick={() => onNavigate("chat")}
        >
          Chat {inboxCount > 0 && <span className="inbox-badge">{inboxCount}</span>}
        </button>
        <button
          className={currentView === "contacts" ? "active" : ""}
          onClick={() => onNavigate("contacts")}
        >
          Contacts ({bondsCount})
        </button>
        <button
          className={currentView === "search" ? "active" : ""}
          onClick={() => onNavigate("search")}
        >
          Search
        </button>
        <button
          className={currentView === "profile" ? "active" : ""}
          onClick={() => onNavigate("profile")}
        >
          Profile
        </button>
        <button
          className={currentView === "settings" ? "active" : ""}
          onClick={() => onNavigate("settings")}
        >
          Settings
        </button>
      </nav>
      <div className="header-right">
        {relayUnreachable && isPublicNetwork && (
          <button className="relay-warning" onClick={onRetryConnect} title="Relay unreachable — tap to retry">
            <span className="relay-warning-dot" />
            Relay unreachable
          </button>
        )}
        {isPublicNetwork ? (
          <div className={`network-status ${connectionStatus?.online ? 'public' : 'checking'}`}>
            <span className="status-indicator" />
            <span>{connectionStatus?.online ? 'Public Network' : 'Connecting...'}</span>
          </div>
        ) : (
          <div className="network-status private">
            <span className="status-indicator" />
            <span>Private</span>
          </div>
        )}
        <button
          className="theme-toggle-btn"
          onClick={cycleTheme}
          title={`Theme: ${themeLabel}`}
          aria-label={`Theme: ${themeLabel}. Click to change.`}
        >
          {resolved === "dark" ? <LightModeIcon size={16} /> : <DarkModeIcon size={16} />}
        </button>
        <span className="node-status">{nodeStatus}</span>
        <span className="node-name" title={peerId && !peerId.startsWith("envoy_") ? peerId : ""}>
          {displayLabel}
        </span>
        {connectionStatus && connectionStatus.bondedPeers > 0 && (
          <span className="peer-count">{connectionStatus.bondedPeers} peers</span>
        )}
      </div>
    </header>
  );
}
