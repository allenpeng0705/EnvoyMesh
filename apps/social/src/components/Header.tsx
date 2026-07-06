import type {
  ConnectionStatus,
  HumanProfile,
  NodeStatus,
} from "@envoymesh/api";
import type { ViewName } from "../App.js";
import { useTheme } from "../context/ThemeContext.js";
import { useT } from "../context/I18nContext.js";
import { DarkModeIcon, LightModeIcon, QRCodeIcon, InfoIcon } from "../icons.js";
import { LocaleSwitcher } from "./LocaleSwitcher.js";
import { ProfilePhotoAvatar } from "./ProfilePhotoAvatar.js";
import { isEffectiveNodeRunning } from "../lib/effective-node-status.js";
import logoUrl from "../assets/logo.svg";

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
  onOpenPairing?: () => void;
  /** Open the getting-started guide modal (Header Help "?" button). */
  onOpenGuide?: () => void;
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
  onOpenPairing,
  onOpenGuide,
}: HeaderProps) {
  const t = useT();
  const { theme, resolved, setTheme } = useTheme();

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

  const publicConnectivityReady = isEffectiveNodeRunning(nodeStatus, connectionStatus);
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

  const isNodeTransitional = nodeStatus === "starting" || nodeStatus === "stopping";
  const nodeStatusClass =
    isEffectiveNodeRunning(nodeStatus, connectionStatus)
      ? "running"
      : isNodeTransitional
        ? "transitional"
        : "offline";
  const isNodeOffline =
    !isEffectiveNodeRunning(nodeStatus, connectionStatus) && !isNodeTransitional;
  const isNetworkError =
    isPublicNetwork && isEffectiveNodeRunning(nodeStatus, connectionStatus) && !connectionStatus?.online;

  const chatAriaLabel =
    inboxActivityCount > 0
      ? inboxActivityCount === 1
        ? t("nav.chatInboxOne", { count: inboxActivityCount })
        : t("nav.chatInboxMany", { count: inboxActivityCount })
      : t("nav.chat");

  return (
    <header className="header app-header">
      <div className="header-left">
        <img src={logoUrl} alt="Envoy" className="logo" />
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
          className={currentView === "chains" ? "active" : ""}
          onClick={() => onNavigate("chains")}
          aria-current={currentView === "chains" ? "page" : undefined}
        >
          {t("nav.chains")}
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
        {/* Failure-only status chips: the top bar is silent when everything is healthy.
            Showing a green "running" / "12 bonded" / "Public Network" trio is noise. */}
        {(isNodeOffline || isNodeTransitional || isNetworkError || (relayUnreachable && isPublicNetwork)) && (
          <div className="header-status-strip" role="group" aria-label={t("header.nodeConnectivity")}>
            {isNodeOffline && (
              <button
                type="button"
                className="mesh-status-chip mesh-status-chip--error"
                onClick={onRetryConnect}
                title={t("header.nodeOfflineRetry")}
              >
                <span className={`mesh-status-chip__dot status-indicator status-indicator--offline`} aria-hidden />
                <span className="mesh-status-chip__label">{t("header.nodeOffline")}</span>
              </button>
            )}
            {isNodeTransitional && (
              <span
                className="mesh-status-chip mesh-status-chip--pending"
                title={nodeStatus === "stopping" ? t("header.stopping") : t("header.starting")}
              >
                <span className={`mesh-status-chip__dot status-indicator status-indicator--${nodeStatusClass}`} aria-hidden />
                <span className="mesh-status-chip__label">{t("header.starting")}</span>
              </span>
            )}
            {isNetworkError && (
              <button
                type="button"
                className="mesh-status-chip mesh-status-chip--warn"
                onClick={onRetryConnect}
                title={publicStatusTitle}
              >
                <span className="mesh-status-chip__dot" aria-hidden />
                <span className="mesh-status-chip__label">{t("header.networkUnreachable")}</span>
              </button>
            )}
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
          </div>
        )}
        <LocaleSwitcher />
        {onOpenGuide && (
          <button
            type="button"
            className="header-guide-btn"
            onClick={onOpenGuide}
            title={t("header.guideClick")}
            aria-label={t("header.guideClick")}
          >
            <InfoIcon size={16} />
          </button>
        )}
        <button
          type="button"
          className="theme-toggle-btn"
          onClick={cycleTheme}
          title={t("header.theme", { mode: themeLabel })}
          aria-label={t("header.themeClick", { mode: themeLabel })}
        >
          {resolved === "dark" ? <LightModeIcon size={16} /> : <DarkModeIcon size={16} />}
        </button>
        {onOpenPairing && (
          <button
            type="button"
            className="header-pairing-btn"
            onClick={onOpenPairing}
            title={t("header.pairingTitle")}
            aria-label={t("header.pairingClick")}
          >
            <QRCodeIcon size={16} />
            <span className="header-pairing-btn__label">{t("header.pairingLabel")}</span>
          </button>
        )}
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
