import type {
  ConnectionStatus,
  HumanProfile,
  NodeStatus,
} from "@envoymesh/api";
import type { ViewName } from "../App.js";
import { useTheme } from "../context/ThemeContext.js";
import { useT } from "../context/I18nContext.js";
import { DarkModeIcon, LightModeIcon, ChevronDownIcon } from "../icons.js";
import { LocaleSwitcher } from "./LocaleSwitcher.js";
import { ProfilePhotoAvatar } from "./ProfilePhotoAvatar.js";
import { useState } from "react";

interface HeaderProps {
  currentView: ViewName;
  onNavigate: (view: ViewName) => void;
  /** Hello requests + stranger chat pings — badge on Chat */
  inboxActivityCount: number;
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
  isPublicNetwork,
  connectionStatus,
  nodeStatus,
  humanProfile,
  peerId,
  relayUnreachable,
  onRetryConnect,
}: HeaderProps) {
  const t = useT();
  const { theme, resolved, setTheme } = useTheme();
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);

  const cycleTheme = () => {
    if (theme === "system") setTheme("dark");
    else if (theme === "dark") setTheme("light");
    else setTheme("system");
  };

  const themeLabel =
    theme === "system"
      ? t("header.themeAuto")
      : theme === "dark"
        ? t("header.themeDark")
        : t("header.themeLight");

  const publicConnectivityReady = nodeStatus === "running" || Boolean(connectionStatus?.online);
  const publicConnectivityLabel = publicConnectivityReady
    ? t("header.publicNetwork")
    : nodeStatus === "starting" || nodeStatus === "stopping"
      ? t("header.starting")
      : t("header.connecting");
  const publicStatusTitle =
    isPublicNetwork && !publicConnectivityReady && connectionStatus?.lastError?.trim()
      ? connectionStatus.lastError
      : undefined;
  const displayNameTrimmed = humanProfile?.displayName?.trim();
  const profileButtonLabel = displayNameTrimmed && displayNameTrimmed.length > 0 ? displayNameTrimmed : t("nav.profile");
  const profileButtonTitle =
    peerId && !peerId.startsWith("envoy_")
      ? t("nav.openProfileWithPeer", { peerId })
      : t("nav.openProfile");

  const nodeStatusClass =
    nodeStatus === "running"
      ? "running"
      : nodeStatus === "starting" || nodeStatus === "stopping"
        ? "transitional"
        : "offline";

  const chatAriaLabel =
    inboxActivityCount > 0
      ? inboxActivityCount === 1
        ? t("nav.chatInboxOne", { count: inboxActivityCount })
        : t("nav.chatInboxMany", { count: inboxActivityCount })
      : t("nav.chat");

  return (
    <header className="header app-header">
      <div className="header-left">
        <img src="/assets/logo.svg" alt="Envoy" className="logo" />
        <span className="logo-text">Envoy</span>
      </div>
      <nav className="header-nav app-header__nav" aria-label={t("nav.primary")}>
        <button
          type="button"
          className={`${currentView === "chat" || currentView === "assistant" ? "active" : ""} ${inboxActivityCount > 0 ? "has-inbox" : ""}`}
          onClick={() => onNavigate("chat")}
          aria-current={currentView === "chat" || currentView === "assistant" ? "page" : undefined}
          aria-label={chatAriaLabel}
        >
          {t("nav.chat")}
          {inboxActivityCount > 0 && (
            <span className="inbox-badge" aria-hidden>
              {inboxActivityCount > 99 ? "99+" : inboxActivityCount}
            </span>
          )}
        </button>
        <button
          type="button"
          className={currentView === "discover" ? "active" : ""}
          onClick={() => onNavigate("discover")}
          aria-current={currentView === "discover" ? "page" : undefined}
        >
          {t("nav.discover")}
        </button>
        <button
          type="button"
          className={currentView === "library" ? "active" : ""}
          onClick={() => onNavigate("library")}
          aria-current={currentView === "library" ? "page" : undefined}
        >
          {t("nav.library")}
        </button>
        <button
          type="button"
          className={currentView === "settings" ? "active" : ""}
          onClick={() => onNavigate("settings")}
          aria-current={currentView === "settings" ? "page" : undefined}
        >
          {t("nav.settings")}
        </button>
      </nav>
      <div className="header-right app-header__meta">
        <button
          type="button"
          className="status-dropdown-toggle"
          onClick={() => setStatusDropdownOpen(!statusDropdownOpen)}
          aria-expanded={statusDropdownOpen}
          aria-label={t("header.statusToggle")}
        >
          <span className={`status-indicator status-indicator--${nodeStatusClass}`} />
          <ChevronDownIcon size={14} className={`status-dropdown-toggle__chevron ${statusDropdownOpen ? "rotated" : ""}`} />
        </button>
        <div className={`header-status-strip ${statusDropdownOpen ? "open" : ""}`} role="group" aria-label={t("header.nodeConnectivity")}>
          {relayUnreachable && isPublicNetwork && (
            <button
              type="button"
              className="relay-warning mesh-status-chip mesh-status-chip--warn"
              onClick={onRetryConnect}
              title={t("header.relayUnreachable")}
            >
              <span className="mesh-status-chip__dot" aria-hidden />
              <span className="mesh-status-chip__label">{t("header.relayDown")}</span>
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
              <span className="mesh-status-chip__label">{t("header.privateMesh")}</span>
            </div>
          )}
          <span className={`mesh-status-chip node-status mesh-status-chip--node mesh-status-chip--${nodeStatusClass}`}>
            <span className="mesh-status-chip__dot" aria-hidden />
            <span className="mesh-status-chip__label">{nodeStatus}</span>
          </span>
          {connectionStatus && connectionStatus.bondedPeers > 0 && (
            <span className="mesh-status-chip peer-count mesh-status-chip--peers">
              <span className="mesh-status-chip__label">
                {t("header.bonded", { count: connectionStatus.bondedPeers })}
              </span>
            </span>
          )}
        </div>
        <LocaleSwitcher />
        <button
          type="button"
          className="theme-toggle-btn"
          onClick={cycleTheme}
          title={t("header.theme", { mode: themeLabel })}
          aria-label={t("header.themeClick", { mode: themeLabel })}
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
