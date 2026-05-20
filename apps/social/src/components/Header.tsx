import { useEffect, useRef, useState } from "react";
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
  /** Hello requests + stranger chat pings — shown on Inbox only */
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
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!moreOpen) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (moreRef.current?.contains(e.target as Node)) return;
      setMoreOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMoreOpen(false);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [moreOpen]);

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

  const openMoreNav = (view: ViewName) => {
    onNavigate(view);
    setMoreOpen(false);
  };

  return (
    <header className="header">
      <div className="header-left">
        <img src="/assets/logo.svg" alt="Envoy" className="logo" />
        <span className="logo-text">Envoy</span>
      </div>
      <nav className="header-nav" aria-label="Primary">
        <button
          type="button"
          className={currentView === "chat" ? "active" : ""}
          onClick={() => onNavigate("chat")}
          aria-current={currentView === "chat" ? "page" : undefined}
        >
          Chat
        </button>
        <button
          type="button"
          className={`${currentView === "inbox" ? "active" : ""} ${inboxActivityCount > 0 ? "has-inbox" : ""}`}
          onClick={() => onNavigate("inbox")}
          aria-current={currentView === "inbox" ? "page" : undefined}
        >
          Inbox
          {inboxActivityCount > 0 && (
            <span className="inbox-badge">{inboxActivityCount > 99 ? "99+" : inboxActivityCount}</span>
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
          className={currentView === "search" ? "active" : ""}
          onClick={() => onNavigate("search")}
          aria-current={currentView === "search" ? "page" : undefined}
        >
          Search
        </button>
        <button
          type="button"
          className={currentView === "library" ? "active" : ""}
          onClick={() => onNavigate("library")}
          aria-current={currentView === "library" ? "page" : undefined}
        >
          Library
        </button>
        <div className="header-nav-more" ref={moreRef}>
          <button
            type="button"
            className={`header-nav-more-trigger${moreOpen ? " open" : ""}${currentView === "profile" || currentView === "settings" ? " related-active" : ""}`}
            aria-expanded={moreOpen}
            aria-haspopup="menu"
            aria-controls="header-more-menu"
            id="header-more-button"
            onClick={() => setMoreOpen((o) => !o)}
          >
            More
          </button>
          {moreOpen && (
            <div
              className="header-nav-more-menu"
              id="header-more-menu"
              role="menu"
              aria-labelledby="header-more-button"
            >
              <button type="button" role="menuitem" className={currentView === "profile" ? "active" : ""} onClick={() => openMoreNav("profile")}>
                Profile
              </button>
              <button type="button" role="menuitem" className={currentView === "settings" ? "active" : ""} onClick={() => openMoreNav("settings")}>
                Settings
              </button>
            </div>
          )}
        </div>
      </nav>
      <div className="header-right">
        {relayUnreachable && isPublicNetwork && (
          <button type="button" className="relay-warning" onClick={onRetryConnect} title="Relay unreachable — tap to retry">
            <span className="relay-warning-dot" />
            Relay unreachable
          </button>
        )}
        {isPublicNetwork ? (
          <div className={`network-status ${connectionStatus?.online ? "public" : "checking"}`}>
            <span className="status-indicator" />
            <span>{connectionStatus?.online ? "Public Network" : "Connecting..."}</span>
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
