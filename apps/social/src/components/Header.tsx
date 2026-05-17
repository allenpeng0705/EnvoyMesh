import { useTheme } from "../context/ThemeContext.js";
import { DarkModeIcon, LightModeIcon } from "../icons.js";
import type {
  ConnectionStatus,
  HumanProfile,
  NodeStatus,
} from "@envoymesh/api";
import type { ViewName } from "../App.js";

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
}: HeaderProps) {
  const { resolved, setTheme } = useTheme();

  const displayLabel =
    humanProfile?.displayName ||
    humanProfile?.username ||
    (peerId && !peerId.startsWith("envoy_") ? `${peerId.slice(0, 8)}\u2026` : "Peer");

  function shortId(id: string): string {
    if (!id) return "";
    return id.length > 12 ? id.slice(0, 6) + "..." + id.slice(-4) : id;
  }

  const online = connectionStatus?.online ?? false;

  return (
    <header className="header">
      <div className="header-left">
        <div className="header-logo">E</div>
        <span className="header-logo-text">EnvoyMesh</span>
      </div>

      <nav className="header-nav">
        <button
          className={`header-nav-btn${currentView === "chat" ? " active" : ""}`}
          onClick={() => onNavigate("chat")}
        >
          Chat
          {inboxCount > 0 && <span className="nav-badge">{inboxCount > 99 ? "99+" : inboxCount}</span>}
        </button>
        <button
          className={`header-nav-btn${currentView === "contacts" ? " active" : ""}`}
          onClick={() => onNavigate("contacts")}
        >
          Contacts ({bondsCount})
        </button>
        <button
          className={`header-nav-btn${currentView === "search" ? " active" : ""}`}
          onClick={() => onNavigate("search")}
        >
          Search
        </button>
        <button
          className={`header-nav-btn${currentView === "profile" ? " active" : ""}`}
          onClick={() => onNavigate("profile")}
        >
          Profile
        </button>
        <button
          className={`header-nav-btn${currentView === "settings" ? " active" : ""}`}
          onClick={() => onNavigate("settings")}
        >
          Settings
        </button>
      </nav>

      <div className="header-right">
        <button
          className="theme-btn"
          aria-label={resolved === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          title={resolved === "dark" ? "Light mode" : "Dark mode"}
          onClick={() => setTheme(resolved === "dark" ? "light" : "dark")}
        >
          {resolved === "dark" ? <LightModeIcon size={18} /> : <DarkModeIcon size={18} />}
        </button>

        <div className="header-status">
          <span className={`header-status-dot ${online ? "online" : isPublicNetwork ? "connecting" : "offline"}`} />
          <span>{isPublicNetwork ? (online ? "Public" : "Connecting") : "Private"}</span>
        </div>

        <span className="node-status">{nodeStatus}</span>
        <span className="node-name" title={peerId}>
          {displayLabel}
        </span>
        <span className="header-peer-id">{shortId(peerId)}</span>

        {connectionStatus && connectionStatus.bondedPeers > 0 && (
          <span className="peer-count">{connectionStatus.bondedPeers} peers</span>
        )}
      </div>
    </header>
  );
}
